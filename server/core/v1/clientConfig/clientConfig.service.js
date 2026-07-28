import config from "config";
import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import adminModel from "../admin/admin.model.js";
import channelModel from "../channels/channels.model.js";
import NVRModel from "../NVR/nvr.model.js";
import allocationModel from "./clientDetectionAllocation.model.js";
import cameraDetectionModel from "./clientCameraDetection.model.js";
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

/**
 * Self-service, read-only view of the Client Configuration data that the
 * superadmin dashboard manages: how many cameras the client has purchased and
 * configured, which detections are allocated to them, and the per-camera
 * detection toggles.
 *
 * Ported from server-superadmin's clientConfig/client modules with two
 * deliberate differences:
 *
 *   1. The tenant is taken from the caller's token, never from the URL. The
 *      superadmin versions read `req.params.adminId`, which is safe only behind
 *      verifySuperAdmin — exposed to an admin token it would let any client read
 *      any other client's configuration by editing the id in the path.
 *
 *   2. No writes. The superadmin cameras endpoint lazily upserts
 *      ClientCameraDetection rows so its toggles have something to update. The
 *      response is identical without them (a missing row already reads as
 *      false), so a read endpoint has no reason to write.
 *
 * Everything here is allocation and licensing state owned by the superadmin.
 * Clients can see it; only the superadmin backend changes it.
 */
class ClientConfigService {
  // Latest invoice's product title from aMember (best-effort — null on any failure).
  async _getLatestInvoiceName(userId) {
    try {
      const res = await fetch(`${baseUrl}/users?_key=${apiKey}&_filter[user_id]=${userId}&_nested[]=invoices`);
      const data = await res.json();
      const invoices = data?.[0]?.nested?.invoices || [];
      if (!invoices.length) return null;
      const latest = [...invoices].reverse()[0]; // aMember returns oldest-first
      if (!latest?.invoice_id) return null;

      const invRes = await fetch(`${baseUrl}/invoices/${latest.invoice_id}?_key=${apiKey}`);
      const invData = await invRes.json();
      const item = invData?.[0]?.nested?.["invoice-items"]?.[0];
      return item?.item_title || item?.name || null;
    } catch (err) {
      logger.error(`clientConfig _getLatestInvoiceName(${userId}): ${err.message}`);
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
      logger.error(`clientConfig _getSubscriptionStatus(${userId}): ${err.message}`);
      return { expireDate: null, status: "unknown" };
    }
  }

  // GET /client-config/account
  // The caller's own row from the superadmin's client list: plan, camera count,
  // expiry and status.
  //
  // The superadmin version (client.service.js listAdmins) pages over *every*
  // admin on the platform and returns each one's name, email and billing state.
  // That listing has no tenant-safe form — one client enumerating every other
  // client's contact details and subscription status is a data leak, not a
  // permissions question — so this returns exactly one row: the caller's.
  async getAccount(req, res) {
    try {
      const adminId = req.verified?.userData?.adminId;
      if (!adminId) {
        return res.status(400).send(Response.errorResp("Missing adminId"));
      }

      const admin = await adminModel.findById(adminId).lean();
      if (!admin) {
        return res.status(404).send(Response.notFoundResp("Client not found"));
      }

      const [cameraAgg, plan, sub] = await Promise.all([
        NVRModel.aggregate([
          { $match: { userId: admin.user_id } },
          { $group: { _id: "$userId", cameras: { $sum: "$cameraCount" } } },
        ]),
        this._getLatestInvoiceName(admin.user_id),
        this._getSubscriptionStatus(admin.user_id),
      ]);

      return res.send(
        Response.SuccessResp("Account fetched successfully", {
          adminId: admin._id,
          userId: admin.user_id,
          name: `${admin.name_f || ""} ${admin.name_l || ""}`.trim() || admin.login,
          email: admin.email,
          plan,
          cameras: cameraAgg[0]?.cameras || 0,
          expireDate: sub.expireDate,
          status: sub.status,
        })
      );
    } catch (err) {
      logger.error(`clientConfig getAccount: ${err.message}`);
      return res.send(Response.userFailResp("Failed to fetch account", err.message));
    }
  }

  // GET /client-config
  // Stat cards + the Detection Assignment table for the calling client.
  async getConfig(req, res) {
    try {
      const adminId = req.verified?.userData?.adminId;
      if (!adminId) {
        return res.status(400).send(Response.errorResp("Missing adminId"));
      }

      const admin = await adminModel.findById(adminId).lean();
      if (!admin) {
        return res.status(404).send(Response.notFoundResp("Client not found"));
      }

      const [existing, configuredCount, totalChannels] = await Promise.all([
        allocationModel.find({ adminId }).lean(),
        // A camera counts as configured once any detection is enabled on it —
        // the channel pre-save sets control=1 in that case.
        channelModel.countDocuments({ userId: admin.user_id, control: 1 }),
        channelModel.countDocuments({ userId: admin.user_id }),
      ]);

      const byType = Object.fromEntries(existing.map((a) => [a.settingType, a]));

      // One row per known detection type; default 0 / disabled if never saved.
      const detections = Object.entries(DETECTION_TYPES).map(([settingType, name]) => {
        const a = byType[settingType];
        return {
          settingType,
          name,
          cameraAllocation: a?.cameraAllocation || 0,
          enabled: a?.enabled || false,
        };
      });

      const stats = {
        totalCameras: admin.purchasedCameras || 0,
        configured: configuredCount,
        nonConfigured: Math.max(totalChannels - configuredCount, 0),
        detectionsEnabled: detections.filter((d) => d.enabled).length,
      };

      return res.send(
        Response.SuccessResp("Client config fetched", { stats, detections })
      );
    } catch (err) {
      logger.error(`clientConfig getConfig: ${err.message}`);
      return res.send(Response.userFailResp("Failed to fetch client config", err.message));
    }
  }

  // GET /client-config/cameras?search=
  // The calling client's cameras, each with the detections the superadmin has
  // allocated to them and whether each is on for that camera.
  async getCameras(req, res) {
    try {
      const adminId = req.verified?.userData?.adminId;
      if (!adminId) {
        return res.status(400).send(Response.errorResp("Missing adminId"));
      }

      const admin = await adminModel.findById(adminId).lean();
      if (!admin) {
        return res.status(404).send(Response.notFoundResp("Client not found"));
      }

      const search = (req.query.search || "").trim();
      const cameraFilter = { userId: admin.user_id, isAdded: true };
      if (search) {
        const rx = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
        cameraFilter.$or = [{ name: rx }, { customName: rx }];
      }

      const [cameras, allocations] = await Promise.all([
        channelModel.find(cameraFilter).populate("nvrId", "nvrName").lean(),
        // Detection types this client has enabled at the allocation level.
        allocationModel.find({ adminId, enabled: true }).select("settingType").lean(),
      ]);

      const allowedDetections = allocations.map((a) => a.settingType);

      const savedRows = cameras.length
        ? await cameraDetectionModel
            .find({ adminId, cameraId: { $in: cameras.map((c) => c._id) } })
            .select("cameraId settingType enabled")
            .lean()
        : [];

      // cameraId -> { settingType: enabled }
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
          // Every client-enabled detection with its saved boolean; a camera with
          // no row for a detection reads as false.
          detections: Object.fromEntries(
            allowedDetections.map((settingType) => [settingType, saved[settingType] === true])
          ),
        };
      });

      return res.send(
        Response.SuccessResp("Client cameras fetched", { totalCount: rows.length, cameras: rows })
      );
    } catch (err) {
      logger.error(`clientConfig getCameras: ${err.message}`);
      return res.send(Response.userFailResp("Failed to fetch client cameras", err.message));
    }
  }
}

export default new ClientConfigService();
