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
import { resolveDetectionTypes } from "../detectionCatalog/detectionTypes.resolver.js";
import { redis } from "../../../utils/database.js";

const baseUrl = config.get("aMember.baseUrl");
const apiKey = config.get("aMember.apiKey");

// Keep every Fleet alert panel on the same window and alert definition.
const fleetAlertWindow = (req, maxHours = 168) => {
  const hours = Math.min(Math.max(parseInt(req.query?.hours, 10) || 24, 1), maxHours);
  const asOf = req.query?.asOf ? new Date(req.query.asOf) : new Date();
  if (Number.isNaN(asOf.getTime())) throw new Error("Invalid asOf timestamp");
  return { hours, asOf, since: new Date(asOf.getTime() - hours * 3600000) };
};

const fleetAlertStatus = (req) => req.query?.status === "all" ? "all" : "active";

const fleetAlertFilter = (userIds, since, asOf, status = "active") => {
  const filter = {
    userId: { $in: userIds },
    timeOfIncident: { $gte: since, $lte: asOf },
    incidentType: { $nin: ["countPersons", "lineCrossing", "countVehicles", "genderAgeCount"] },
    liveDemoData: { $ne: true },
    incidentName: { $not: /Guard Present/i },
  };
  const image = { $exists: true, $nin: [null, "", "https://"] };
  if (status === "all") {
    // Match the client's Alerts & Events feed: box-packing sensor events can
    // have no snapshot, and All includes new, reported, and resolved alerts.
    filter.$and = [
      { $or: [{ incidentType: "boxPackingDetection" }, { Image: image }] },
      { $or: [
        { resolved: false, "report.status": { $ne: true } },
        { resolved: true },
        { "report.status": true, resolved: { $ne: true } },
      ] },
    ];
  } else {
    // Preserve the existing default for every caller without status=all.
    filter.Image = image;
    filter.resolved = false;
    filter["report.status"] = { $ne: true };
  }
  return filter;
};

const fleetSearch = (req) => String(req.query?.search || "").trim().slice(0, 120).toLowerCase();

const matchesFleetSearch = (admin, search) => {
  if (!search) return true;
  const fullName = `${admin.name_f || ""} ${admin.name_l || ""}`.trim();
  return [fullName, admin.name_f, admin.name_l, admin.login, admin.email, admin.user_id]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(search));
};

// Latest expiry date across all of a user's subscribed products. Pure helper.
export const pickLatestExpiry = (subscriptions = {}) => {
  const times = Object.values(subscriptions)
    .filter(Boolean)
    .map((d) => new Date(d).getTime())
    .filter((t) => !isNaN(t));
  return times.length ? new Date(Math.max(...times)) : null;
};

class ClientService {
  async _getAmemberUsers() {
    const users = new Map();
    const pageSize = 100;
    for (let page = 0; ; page += 1) {
      const query = new URLSearchParams({
        _count: String(pageSize),
        _page: String(page),
        _sort: "user_id",
        "_nested[]": "access",
      });
      const response = await fetch(`${baseUrl}/users?${query}`, {
        headers: { Accept: "application/json", "X-API-Key": apiKey },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`aMember users API returned HTTP ${response.status}`);

      const data = await response.json();
      const total = Number(data?._total);
      if (data?._total == null || !Number.isSafeInteger(total) || total < 0) {
        throw new Error("aMember users API returned an invalid total");
      }

      const previousSize = users.size;
      for (const user of Object.values(data)) {
        if (user?.user_id != null) users.set(String(user.user_id), user);
      }
      if (users.size >= total) return [...users.values()];
      if (users.size === previousSize) throw new Error("aMember users API returned an incomplete roster");
    }
  }

  async _getClientRoster() {
    const [users, admins] = await Promise.all([
      this._getAmemberUsers(),
      adminModel.find().select("user_id purchasedCameras subscriptionSnapshot createdAt").lean(),
    ]);
    const adminsByUserId = new Map(admins.map((admin) => [String(admin.user_id), admin]));
    const statusByCode = { 0: "inactive", 1: "active", 2: "expired" };

    return users.map((user) => {
      const userId = String(user.user_id);
      const admin = adminsByUserId.get(userId);
      const access = Object.values(user.nested?.access || {});
      return {
        _id: admin?._id ?? null,
        user_id: userId,
        name_f: user.name_f,
        name_l: user.name_l,
        login: user.login,
        email: user.email,
        createdAt: admin?.createdAt || user.added,
        purchasedCameras: admin?.purchasedCameras || 0,
        subscriptionSnapshot: admin?.subscriptionSnapshot,
        expireDate: pickLatestExpiry(access.map((record) => record?.expire_date)),
        status: Object.hasOwn(statusByCode, user.status) ? statusByCode[user.status] : "unknown",
      };
    });
  }

  // Latest invoice's product title from aMember (best-effort — returns null on any failure).
  async _getLatestInvoiceName(userId) {
    try {
      const options = () => ({
        headers: { Accept: "application/json", "X-API-Key": apiKey },
        signal: AbortSignal.timeout(8000),
      });
      const query = new URLSearchParams({ "_filter[user_id]": userId, "_nested[]": "invoices" });
      const res = await fetch(`${baseUrl}/users?${query}`, options());
      if (!res.ok) return null;
      const data = await res.json();
      let invoices = data?.[0]?.nested?.invoices || [];
      if (!invoices.length) return null;
      const latest = [...invoices].reverse()[0]; // aMember returns oldest-first
      if (!latest?.invoice_id) return null;

      const invRes = await fetch(`${baseUrl}/invoices/${encodeURIComponent(latest.invoice_id)}`, options());
      if (!invRes.ok) return null;
      const invData = await invRes.json();
      const item = invData?.[0]?.nested?.["invoice-items"]?.[0];
      return item?.item_title || item?.name || null;
    } catch (err) {
      logger.error(`client _getLatestInvoiceName(${userId}): ${err.message}`);
      return null;
    }
  }

  async listAdmins(req, res) {
    try {
      const skip = Math.max(parseInt(req.query.skip) || 0, 0);
      const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
      const search = (req.query.search || "").trim();
      const statusFilter = String(req.query.status || "").trim().toLowerCase();
      const planFilter = String(req.query.plan || "").trim().toLowerCase();
      const allowedStatuses = new Set(["active", "inactive", "expired", "unknown"]);
      const effectiveStatusFilter = allowedStatuses.has(statusFilter) ? statusFilter : "";

      // Plan and status are subscription-enriched fields, so filtering and the
      // active-first ordering must happen before pagination. Paginating the DB
      // records first would put active clients on later pages and make filter
      // totals depend on whichever page happened to be loaded.
      const SORTABLE = { name: "name_f", email: "email", login: "login", createdAt: "createdAt" };
      const sortField = SORTABLE[req.query.sortBy] || "createdAt";
      const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

      const roster = await this._getClientRoster();
      const needle = search.toLowerCase();
      const admins = roster.filter((admin) => !needle ||
        [`${admin.name_f || ""} ${admin.name_l || ""}`, admin.email, admin.login]
          .some((value) => String(value || "").toLowerCase().includes(needle)));

      // Resolve plans before filtering and pagination.
      const enriched = await Promise.all(
        admins.map(async (admin) => {
          const snapshot = admin.subscriptionSnapshot;
          const plan = snapshot?.planName || await this._getLatestInvoiceName(admin.user_id);
          return { admin, plan };
        }),
      );

      const availablePlans = [...new Set(
        enriched.map(({ plan }) => String(plan || "").trim()).filter(Boolean),
      )].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

      const filtered = enriched.filter(({ plan, admin }) => {
        if (effectiveStatusFilter && admin.status !== effectiveStatusFilter) return false;
        if (planFilter && String(plan || "").trim().toLowerCase() !== planFilter) return false;
        return true;
      });

      const statusRank = { active: 0, expired: 1, inactive: 2, unknown: 3 };
      const compareValues = (left, right) => {
        if (sortField === "createdAt") {
          return (new Date(left || 0).getTime() - new Date(right || 0).getTime()) * sortOrder;
        }
        return String(left || "").localeCompare(String(right || ""), undefined, {
          sensitivity: "base",
        }) * sortOrder;
      };
      filtered.sort((left, right) => {
        const rankDifference = (statusRank[left.admin.status] ?? 4) - (statusRank[right.admin.status] ?? 4);
        if (rankDifference) return rankDifference;
        const valueDifference = compareValues(left.admin[sortField], right.admin[sortField]);
        if (valueDifference) return valueDifference;
        return left.admin.user_id.localeCompare(right.admin.user_id);
      });

      const totalCount = filtered.length;
      const pageRows = filtered.slice(skip, skip + limit);

      // One aggregation for camera counts across the whole page (NVR.userId = admin.user_id).
      // aggregate() bypasses the NVR find-hook, so no memberId access-control applies here.
      const userIds = pageRows.map(({ admin }) => admin.user_id);
      const cameraAgg = await NVRModel.aggregate([
        { $match: { userId: { $in: userIds } } },
        { $group: { _id: "$userId", cameras: { $sum: "$cameraCount" } } },
      ]);
      const cameraByUser = Object.fromEntries(cameraAgg.map((c) => [c._id, c.cameras]));

      const rows = pageRows.map(({ admin, plan }) => ({
            adminId: admin._id,
            userId: admin.user_id,
            name: `${admin.name_f || ""} ${admin.name_l || ""}`.trim() || admin.login,
            email: admin.email,
            plan,
            cameras: cameraByUser[admin.user_id] || 0,
            expireDate: admin.expireDate,
            status: admin.status,
          }));

      return res.send(Response.SuccessResp("Admins fetched successfully", {
        totalCount,
        skip,
        limit,
        admins: rows,
        filterOptions: {
          plans: availablePlans,
          statuses: ["active", "inactive", "expired", "unknown"],
        },
      }));
    } catch (err) {
      logger.error(`client listAdmins: ${err.message}`);
      return res.status(500).send(Response.errorResp("Failed to fetch clients"));
    }
  }

  // GET /client/overview
  // Fleet Overview header tiles + panels, from local data plus aMember
  // (plan name + subscription status per client, via the existing helpers).
  async fleetOverview(req, res) {
    try {
      // This field is always a 24-hour count, even if another query parameter
      // is supplied alongside the camera-utilisation search.
      const { asOf, since } = fleetAlertWindow({ query: { asOf: req.query?.asOf } });
      const alertStatus = fleetAlertStatus(req);
      // Search scopes every Fleet panel to the same clients. A literal,
      // case-insensitive substring cannot execute as a regular expression.
      const search = fleetSearch(req);

      const allAdmins = await this._getClientRoster();
      const admins = allAdmins.filter((admin) => matchesFleetSearch(admin, search));
      const userIds = admins.map((admin) => admin.user_id);
      const [channels, catalog, alerts24h, nvrAgg, controlAgg] = await Promise.all([
        channelModel.find({ userId: { $in: userIds }, isAdded: true })
          .select("userId detections").lean(),
        resolveDetectionTypes(),
        Incident.countDocuments(fleetAlertFilter(userIds, since, asOf, alertStatus)),
        // Preserve the existing health formula; scope its inputs when searching.
        NVRModel.aggregate([
          { $match: { userId: { $in: userIds } } },
          { $group: { _id: "$userId", cameras: { $sum: "$cameraCount" } } },
        ]),
        channelModel.aggregate([
          { $match: { isAdded: true, userId: { $in: userIds } } },
          { $group: { _id: "$control", count: { $sum: 1 } } },
        ]),
      ]);

      const enriched = await Promise.all(
        admins.map(async (a) => {
          const plan = a.subscriptionSnapshot?.planName || await this._getLatestInvoiceName(a.user_id);
          return { ...a, plan };
        })
      );

      const provisionedByUser = {};
      const detectionCounts = {};
      for (const camera of channels) {
        provisionedByUser[camera.userId] = (provisionedByUser[camera.userId] || 0) + 1;
        for (const [settingType, detection] of Object.entries(camera.detections || {})) {
          if (detection?.enabled !== true) continue;
          detectionCounts[settingType] = (detectionCounts[settingType] || 0) + 1;
        }
      }
      const names = Object.fromEntries(catalog.detections.map((row) => [row.settingType, row.name]));
      const detectionAgg = Object.entries(detectionCounts)
        .map(([settingType, count]) => ({ settingType, count }))
        .sort((a, b) => b.count - a.count);
      const camerasLicensed = admins.reduce((s, a) => s + (a.purchasedCameras || 0), 0);
      const camerasProvisioned = channels.length;
      const detectionsEnabled = detectionAgg.reduce((s, d) => s + d.count, 0);
      const legacyProvisioned = nvrAgg.reduce((sum, nvr) => sum + nvr.cameras, 0);
      const controls = Object.fromEntries(controlAgg.map((row) => [row._id, row.count]));

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
            detectionsEnabled,
            alerts24h,
          },
          cameraUtilisation,
          clientsByPlan: Object.entries(planCounts).map(([plan, clients]) => ({ plan, clients })),
          detectionsByType: detectionAgg.map((d) => ({
            settingType: d.settingType,
            name: names[d.settingType] || DETECTION_TYPES[d.settingType] || d.settingType,
            count: d.count,
          })),
          cameraHealth: {
            running: controls[1] || 0,
            stopped: controls[0] || 0,
            idleCapacity: Math.max(camerasLicensed - legacyProvisioned, 0),
          },
        })
      );
    } catch (err) {
      logger.error(`client fleetOverview: ${err.message}`);
      return res.status(500).send(Response.errorResp("Failed to fetch fleet overview"));
    }
  }

  // GET /client/top-alerts?hours=24&limit=5
  // Clients ranked by incident count in the window (Incident.userId = admin.user_id).
  // Powers the "Top Clients by Alert Volume" panel on Fleet Overview.
  async topClientsByAlertVolume(req, res) {
    try {
      const { hours, asOf, since } = fleetAlertWindow(req, 720);
      const alertStatus = fleetAlertStatus(req);
      const limit = Math.min(Math.max(parseInt(req.query.limit) || 5, 1), 50);
      const allAdmins = await this._getClientRoster();
      const admins = allAdmins.filter((admin) => matchesFleetSearch(admin, fleetSearch(req)));
      const byUser = Object.fromEntries(admins.map((a) => [a.user_id, a]));

      const agg = await Incident.aggregate([
        { $match: fleetAlertFilter(admins.map((a) => a.user_id), since, asOf, alertStatus) },
        { $group: { _id: "$userId", alerts: { $sum: 1 } } },
        { $sort: { alerts: -1 } },
        { $limit: limit },
      ]);

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

      return res.send(Response.SuccessResp("Top clients by alert volume fetched", { hours, status: alertStatus, clients }));
    } catch (err) {
      logger.error(`client topClientsByAlertVolume: ${err.message}`);
      return res.send(Response.userFailResp("Failed to fetch top clients by alert volume", err.message));
    }
  }

  // GET /client/alerts-graph?hours=24
  // Exactly `hours` consecutive one-hour buckets, anchored to the same
  // rolling window used by the Fleet alert card and client ranking.
  async alertsGraph(req, res) {
    try {
      const { hours, asOf, since } = fleetAlertWindow(req);
      const alertStatus = fleetAlertStatus(req);
      const allAdmins = await this._getClientRoster();
      const admins = allAdmins.filter((admin) => matchesFleetSearch(admin, fleetSearch(req)));
      const boundaries = Array.from(
        { length: hours + 1 },
        (_, index) => new Date(since.getTime() + index * 3600000),
      );
      // $bucket excludes its final upper boundary; include an incident exactly
      // at asOf while still reporting the exact requested end time to the UI.
      boundaries[hours] = new Date(asOf.getTime() + 1);

      const agg = await Incident.aggregate([
        { $match: fleetAlertFilter(admins.map((a) => a.user_id), since, asOf, alertStatus) },
        {
          $bucket: {
            groupBy: "$timeOfIncident",
            boundaries,
            output: { count: { $sum: 1 } },
          },
        },
      ]);
      const byHour = Object.fromEntries(agg.map((b) => [new Date(b._id).toISOString(), b.count]));

      let total = 0;
      const buckets = [];
      for (let i = 0; i < hours; i++) {
        const from = boundaries[i].toISOString();
        const to = i === hours - 1 ? asOf.toISOString() : boundaries[i + 1].toISOString();
        const count = byHour[from] || 0;
        total += count;
        buckets.push({ from, to, count });
      }

      return res.send(Response.SuccessResp("Alerts graph fetched", {
        hours, status: alertStatus, from: since.toISOString(), to: asOf.toISOString(), total, buckets,
      }));
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
          .select("settingType cameraAllocation")
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
        Response.SuccessResp("Client cameras fetched", {
          totalCount: rows.length,
          cameras: rows,
          detectionAllocations: Object.fromEntries(
            allocations.map((allocation) => [
              allocation.settingType,
              Number(allocation.cameraAllocation) || 0,
            ]),
          ),
        })
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

      const admin = await adminModel.findById(adminId).select("user_id").lean();
      if (!admin) {
        return res.status(404).send(Response.notFoundResp("Client not found"));
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

      // Never allow a row to be created for a camera owned by another client,
      // or for a camera that is no longer part of this client's active list.
      const camera = await channelModel
        .findOne({ _id: cameraId, userId: admin.user_id, isAdded: true })
        .select("_id")
        .lean();
      if (!camera) {
        return res
          .status(404)
          .send(Response.notFoundResp("Camera not found for this client"));
      }

      // Opt in to exact camera enforcement only after an administrator makes
      // a choice. Merely opening the grid seeds false rows and must not alter
      // an existing client's count-based licensing behaviour.
      await clientDetectionAllocationModel.updateOne(
        { _id: allowed._id },
        { $set: { cameraSelectionConfigured: true } },
      );

      // Enforce the allocation cap: this detection may be enabled on at most
      // `cameraAllocation` cameras for the admin. Only checked when enabling;
      // exclude the current camera so re-enabling an already-on camera doesn't
      // consume an extra slot.
      if (enabled) {
        // Stale rows for removed/un-added cameras must not consume the current
        // allowance. This used to make the grid look empty while still
        // rejecting the first visible selections as "already full".
        const activeCameraIds = await channelModel.distinct("_id", {
          userId: admin.user_id,
          isAdded: true,
        });
        const alreadyEnabled = await clientCameraDetectionModel.countDocuments({
          adminId,
          settingType,
          enabled: true,
          cameraId: { $in: activeCameraIds, $ne: cameraId },
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

      // Reuse the existing licence Redis bridge so connected V2 clients see
      // camera-specific changes immediately. The client backend consumes this
      // scope without treating it as a whole-detection revoke. Removing a
      // reservation makes that slot flexible again; it must not stop a
      // detection that is already running on the same camera.
      redis
        .publish(
          "detectionAllocation:update",
          JSON.stringify({
            scope: "camera",
            adminId,
            userId: admin.user_id,
            cameraId,
            settingType,
            enabled: updated.enabled,
            revokeRunningDetection: false,
          }),
        )
        .catch((error) =>
          logger.error(`camera detection assignment publish failed: ${error.message}`),
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
