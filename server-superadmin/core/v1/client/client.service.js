import config from "config";
import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import mongoose from "mongoose";
import adminModel from "../admin/admin.model.js";
import NVRModel from "../NVR/nvr.model.js";
import channelModel from "../channels/channels.model.js";
import clientDetectionAllocationModel from "../clientConfig/clientDetectionAllocation.model.js";
import clientCameraDetectionModel from "../clientConfig/clientCameraDetection.model.js";
import { Incident } from "../incidents/incidents.model.js";
import { DETECTION_TYPES } from "../../../constants/detectionTypes.js";
import AUTHService from "../Auth/auth.service.js";

const baseUrl = config.get("aMember.baseUrl");
const apiKey = config.get("aMember.apiKey");

// Latest expiry date across all of a user's subscribed products. Pure helper.
export const pickLatestExpiry = (subscriptions = {}) => {
  const times = Object.values(subscriptions)
    .filter(Boolean)
    .map((d) => new Date(d).getTime())
    .filter((t) => !isNaN(t));
  return times.length ? new Date(Math.max(...times)) : null;
};

class ClientService {
  // Latest invoice's product title from aMember (best-effort — returns null on any failure).
  async _getLatestInvoiceName(userId) {
    try {
      const res = await fetch(`${baseUrl}/users?_key=${apiKey}&_filter[user_id]=${userId}&_nested[]=invoices`);
      const data = await res.json();
      let invoices = data?.[0]?.nested?.invoices || [];
      if (!invoices.length) return null;
      const latest = [...invoices].reverse()[0]; // aMember returns oldest-first
      if (!latest?.invoice_id) return null;

      const invRes = await fetch(`${baseUrl}/invoices/${latest.invoice_id}?_key=${apiKey}`);
      const invData = await invRes.json();
      const item = invData?.[0]?.nested?.["invoice-items"]?.[0];
      return item?.item_title || item?.name || null;
    } catch (err) {
      logger.error(`client _getLatestInvoiceName(${userId}): ${err.message}`);
      return null;
    }
  }

  // Expiry date + status derived from the aMember access (subscriptions) API.
  async _getSubscriptionStatus(userId) {
    try {
      const access = await AUTHService.getAmemberAccessByUserId(userId);
      const subscriptions = AUTHService.extractSubscriptions(access); // { product_id: expire_date }
      const expireDate = pickLatestExpiry(subscriptions);
      if (!expireDate) return { expireDate: null, status: "inactive" };
      const active = AUTHService.isPlanActive({ subscriptions });
      return { expireDate, status: active ? "active" : "expired" };
    } catch (err) {
      logger.error(`client _getSubscriptionStatus(${userId}): ${err.message}`);
      return { expireDate: null, status: "unknown" };
    }
  }

  async listAdmins(req, res) {
    try {
      const skip = Math.max(parseInt(req.query.skip) || 0, 0);
      const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
      const search = (req.query.search || "").trim();

      // ponytail: only DB fields are sortable; plan/cameras/status are enriched post-query
      const SORTABLE = { name: "name_f", email: "email", login: "login", createdAt: "createdAt" };
      const sortField = SORTABLE[req.query.sortBy] || "createdAt";
      const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

      const filter = {};
      if (search) {
        const rx = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
        filter.$or = [{ name_f: rx }, { name_l: rx }, { email: rx }, { login: rx }];
      }

      const [admins, totalCount] = await Promise.all([
        adminModel.find(filter).sort({ [sortField]: sortOrder, _id: 1 }).skip(skip).limit(limit),
        adminModel.countDocuments(filter),
      ]);

      // One aggregation for camera counts across the whole page (NVR.userId = admin.user_id).
      // aggregate() bypasses the NVR find-hook, so no memberId access-control applies here.
      const userIds = admins.map((a) => a.user_id);
      const cameraAgg = await NVRModel.aggregate([
        { $match: { userId: { $in: userIds } } },
        { $group: { _id: "$userId", cameras: { $sum: "$cameraCount" } } },
      ]);
      const cameraByUser = Object.fromEntries(cameraAgg.map((c) => [c._id, c.cameras]));

      // Enrich each admin from aMember. One admin's failure never fails the page.
      const rows = await Promise.all(
        admins.map(async (admin) => {
          const [plan, sub] = await Promise.all([
            this._getLatestInvoiceName(admin.user_id),
            this._getSubscriptionStatus(admin.user_id),
          ]);
          return {
            adminId: admin._id,
            userId: admin.user_id,
            name: `${admin.name_f || ""} ${admin.name_l || ""}`.trim() || admin.login,
            email: admin.email,
            plan,
            cameras: cameraByUser[admin.user_id] || 0,
            expireDate: sub.expireDate,
            status: sub.status,
          };
        })
      );

      return res.send(Response.SuccessResp("Admins fetched successfully", { totalCount, skip, limit, admins: rows }));
    } catch (err) {
      logger.error(`client listAdmins: ${err.message}`);
      return res.send(Response.userFailResp("Failed to fetch admins", err.message));
    }
  }

  // GET /client/overview
  // Fleet Overview header tiles + panels, from local data plus aMember
  // (plan name + subscription status per client, via the existing helpers).
  async fleetOverview(req, res) {
    try {
      const since24h = new Date(Date.now() - 24 * 3600000);

      const [admins, nvrAgg, detectionAgg, controlAgg, alerts24h] = await Promise.all([
        adminModel.find().select("user_id name_f name_l login purchasedCameras").lean(),
        NVRModel.aggregate([{ $group: { _id: "$userId", cameras: { $sum: "$cameraCount" } } }]),
        clientCameraDetectionModel.aggregate([
          { $match: { enabled: true } },
          { $group: { _id: "$settingType", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ]),
        // aggregate() bypasses the channel find-hook, so match isAdded explicitly.
        channelModel.aggregate([
          { $match: { isAdded: true } },
          { $group: { _id: "$control", count: { $sum: 1 } } },
        ]),
        Incident.countDocuments({ timeOfIncident: { $gte: since24h } }),
      ]);

      // ponytail: one aMember status+invoice lookup per client — fine at this
      // fleet size, cache the responses if clients grow into the hundreds.
      const enriched = await Promise.all(
        admins.map(async (a) => {
          const [plan, sub] = await Promise.all([
            this._getLatestInvoiceName(a.user_id),
            this._getSubscriptionStatus(a.user_id),
          ]);
          return { ...a, plan, status: sub.status };
        })
      );

      const provisionedByUser = Object.fromEntries(nvrAgg.map((n) => [n._id, n.cameras]));
      const camerasLicensed = admins.reduce((s, a) => s + (a.purchasedCameras || 0), 0);
      const camerasProvisioned = nvrAgg.reduce((s, n) => s + n.cameras, 0);
      const detectionsRunning = detectionAgg.reduce((s, d) => s + d.count, 0);
      const controls = Object.fromEntries(controlAgg.map((c) => [c._id, c.count]));

      const cameraUtilisation = enriched.map((a) => ({
        adminId: a._id,
        name: `${a.name_f || ""} ${a.name_l || ""}`.trim() || a.login,
        provisioned: provisionedByUser[a.user_id] || 0,
        licensed: a.purchasedCameras || 0,
      }));

      const planCounts = {};
      for (const a of enriched) {
        const plan = a.plan || "No plan";
        planCounts[plan] = (planCounts[plan] || 0) + 1;
      }

      return res.send(
        Response.SuccessResp("Fleet overview fetched", {
          totals: {
            clients: admins.length,
            activeClients: enriched.filter((a) => a.status === "active").length,
            camerasLicensed,
            camerasProvisioned,
            detectionsRunning,
            alerts24h,
          },
          cameraUtilisation,
          clientsByPlan: Object.entries(planCounts).map(([plan, clients]) => ({ plan, clients })),
          detectionsByType: detectionAgg.map((d) => ({
            settingType: d._id,
            name: DETECTION_TYPES[d._id] || d._id,
            count: d.count,
          })),
          // No true stream-health data exists: running/stopped is the camera's
          // detection control state; idleCapacity = licensed - provisioned.
          cameraHealth: {
            running: controls[1] || 0,
            stopped: controls[0] || 0,
            idleCapacity: Math.max(camerasLicensed - camerasProvisioned, 0),
          },
        })
      );
    } catch (err) {
      logger.error(`client fleetOverview: ${err.message}`);
      return res.send(Response.userFailResp("Failed to fetch fleet overview", err.message));
    }
  }

  // GET /client/top-alerts?hours=24&limit=5
  // Clients ranked by incident count in the window (Incident.userId = admin.user_id).
  // Powers the "Top Clients by Alert Volume" panel on Fleet Overview.
  async topClientsByAlertVolume(req, res) {
    try {
      const hours = Math.min(Math.max(parseInt(req.query.hours) || 24, 1), 720);
      const limit = Math.min(Math.max(parseInt(req.query.limit) || 5, 1), 50);
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);

      const agg = await Incident.aggregate([
        { $match: { timeOfIncident: { $gte: since } } },
        { $group: { _id: "$userId", alerts: { $sum: 1 } } },
        { $sort: { alerts: -1 } },
        { $limit: limit },
      ]);

      const admins = await adminModel
        .find({ user_id: { $in: agg.map((a) => a._id) } })
        .select("user_id name_f name_l login email")
        .lean();
      const byUser = Object.fromEntries(admins.map((a) => [a.user_id, a]));

      const clients = agg.map((row, i) => {
        const admin = byUser[row._id];
        return {
          rank: i + 1,
          adminId: admin?._id || null,
          userId: row._id,
          name: admin ? `${admin.name_f || ""} ${admin.name_l || ""}`.trim() || admin.login : row._id,
          email: admin?.email || null,
          alerts: row.alerts,
        };
      });

      return res.send(Response.SuccessResp("Top clients by alert volume fetched", { hours, clients }));
    } catch (err) {
      logger.error(`client topClientsByAlertVolume: ${err.message}`);
      return res.send(Response.userFailResp("Failed to fetch top clients by alert volume", err.message));
    }
  }

  // GET /client/alerts-graph?hours=24
  // Fleet-wide hourly incident counts for the "Alerts - last 24h" bar chart.
  // Buckets are UTC hour starts, zero-filled, oldest first; the last bucket is
  // the current (partial) hour.
  async alertsGraph(req, res) {
    try {
      const hours = Math.min(Math.max(parseInt(req.query.hours) || 24, 1), 168);
      const start = new Date();
      start.setUTCMinutes(0, 0, 0);
      start.setUTCHours(start.getUTCHours() - (hours - 1));

      const agg = await Incident.aggregate([
        { $match: { timeOfIncident: { $gte: start } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%dT%H:00:00Z", date: "$timeOfIncident" } },
            count: { $sum: 1 },
          },
        },
      ]);
      const byHour = Object.fromEntries(agg.map((b) => [b._id, b.count]));

      let total = 0;
      const buckets = [];
      for (let i = 0; i < hours; i++) {
        const key = new Date(start.getTime() + i * 3600000).toISOString().slice(0, 13) + ":00:00Z";
        const count = byHour[key] || 0;
        total += count;
        buckets.push({ hour: key, count });
      }

      return res.send(Response.SuccessResp("Alerts graph fetched", { hours, total, buckets }));
    } catch (err) {
      logger.error(`client alertsGraph: ${err.message}`);
      return res.send(Response.userFailResp("Failed to fetch alerts graph", err.message));
    }
  }

  // GET /client/:adminId/cameras?search=
  // The client's added cameras with a uniform grid of the admin's enabled
  // detections and each camera's on/off boolean (from ClientCameraDetection).
  // Rows are lazily created (default false) so newly-added cameras auto-sync
  // with all admin-enabled detections as false. Powers the "Cameras" tab.
  async getClientCameras(req, res) {
    try {
      const { adminId } = req.params;
      const search = (req.query.search || "").trim();
      if (!mongoose.isValidObjectId(adminId)) {
        return res.status(400).send(Response.userFailResp("Invalid adminId"));
      }

      const admin = await adminModel.findById(adminId).lean();
      if (!admin) {
        return res.status(404).send(Response.notFoundResp("Client not found"));
      }

      const cameraFilter = { userId: admin.user_id, isAdded: true };
      if (search) {
        const rx = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
        cameraFilter.$or = [{ name: rx }, { customName: rx }];
      }

      const [cameras, allocations] = await Promise.all([
        channelModel.find(cameraFilter).populate("nvrId", "nvrName").lean(),
        // Detection types this admin has enabled at the allocation level.
        clientDetectionAllocationModel
          .find({ adminId, enabled: true })
          .select("settingType")
          .lean(),
      ]);

      const allowedDetections = allocations.map((a) => a.settingType);

      // Lazily ensure a ClientCameraDetection row exists for every
      // (camera × allowed detection). Upsert with $setOnInsert so existing
      // toggles are never overwritten — only missing ones are seeded to false.
      if (cameras.length && allowedDetections.length) {
        const ops = [];
        for (const cam of cameras) {
          for (const settingType of allowedDetections) {
            ops.push({
              updateOne: {
                filter: { adminId, cameraId: cam._id, settingType },
                update: { $setOnInsert: { enabled: false } },
                upsert: true,
              },
            });
          }
        }
        if (ops.length) await clientCameraDetectionModel.bulkWrite(ops, { ordered: false });
      }

      // Read back the saved booleans for these cameras.
      const cameraIds = cameras.map((c) => c._id);
      const savedRows = await clientCameraDetectionModel
        .find({ adminId, cameraId: { $in: cameraIds } })
        .select("cameraId settingType enabled")
        .lean();

      // Index by cameraId -> { settingType: enabled }
      const byCamera = new Map();
      for (const r of savedRows) {
        const key = String(r.cameraId);
        if (!byCamera.has(key)) byCamera.set(key, {});
        byCamera.get(key)[r.settingType] = !!r.enabled;
      }

      const rows = cameras.map((cam) => {
        const saved = byCamera.get(String(cam._id)) || {};
        return {
          cameraId: cam._id,
          name: cam.customName || cam.name,
          channelId: cam.localChannelId || cam.channelId,
          nvrId: cam.nvrId?._id || cam.nvrId,
          nvrName: cam.nvrId?.nvrName || null,
          control: cam.control, // 1 = running, 0 = stopped
          // Uniform: every admin-enabled detection with its saved boolean
          // (false if a row was just seeded).
          detections: Object.fromEntries(
            allowedDetections.map((settingType) => [settingType, saved[settingType] === true])
          ),
        };
      });

      return res.send(
        Response.SuccessResp("Client cameras fetched", { totalCount: rows.length, cameras: rows })
      );
    } catch (err) {
      logger.error(`client getClientCameras: ${err.message}`);
      return res.send(Response.userFailResp("Failed to fetch client cameras", err.message));
    }
  }

  // PATCH /client/:adminId/cameras/:cameraId/detections
  // Body: { settingType, enabled }. Toggles one detection's boolean for one
  // camera in ClientCameraDetection (upsert). settingType must be one the admin
  // has enabled at the allocation level.
  async updateCameraDetection(req, res) {
    try {
      const { adminId, cameraId } = req.params;
      const { settingType, enabled } = req.body || {};

      if (!mongoose.isValidObjectId(adminId) || !mongoose.isValidObjectId(cameraId)) {
        return res.status(400).send(Response.userFailResp("Invalid adminId or cameraId"));
      }
      if (!settingType || typeof enabled !== "boolean") {
        return res
          .status(400)
          .send(Response.userFailResp("settingType (string) and enabled (boolean) are required"));
      }

      // The detection must be enabled for this admin at the allocation level.
      const allowed = await clientDetectionAllocationModel
        .findOne({ adminId, settingType, enabled: true })
        .select("cameraAllocation")
        .lean();
      if (!allowed) {
        return res
          .status(400)
          .send(Response.userFailResp("This detection is not enabled for this client"));
      }

      // Enforce the allocation cap: this detection may be enabled on at most
      // `cameraAllocation` cameras for the admin. Only checked when enabling;
      // exclude the current camera so re-enabling an already-on camera doesn't
      // consume an extra slot.
      if (enabled) {
        const alreadyEnabled = await clientCameraDetectionModel.countDocuments({
          adminId,
          settingType,
          enabled: true,
          cameraId: { $ne: cameraId },
        });
        if (alreadyEnabled + 1 > (allowed.cameraAllocation || 0)) {
          return res
            .status(400)
            .send(
              Response.userFailResp(
                `Camera allocation limit reached for this detection (${allowed.cameraAllocation || 0} allowed, ${alreadyEnabled} already enabled).`,
              ),
            );
        }
      }

      const updated = await clientCameraDetectionModel.findOneAndUpdate(
        { adminId, cameraId, settingType },
        { $set: { enabled } },
        { new: true, upsert: true }
      );

      return res.send(
        Response.SuccessResp("Detection updated", {
          cameraId: updated.cameraId,
          settingType: updated.settingType,
          enabled: updated.enabled,
        })
      );
    } catch (err) {
      logger.error(`client updateCameraDetection: ${err.message}`);
      return res.send(Response.userFailResp("Failed to update detection", err.message));
    }
  }
}

export default new ClientService();
