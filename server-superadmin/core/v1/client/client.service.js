import config from "config";
import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import mongoose from "mongoose";
import adminModel from "../admin/admin.model.js";
import NVRModel from "../NVR/nvr.model.js";
import channelModel from "../channels/channels.model.js";
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

      const filter = {};
      if (search) {
        const rx = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
        filter.$or = [{ name_f: rx }, { name_l: rx }, { email: rx }, { login: rx }];
      }

      const [admins, totalCount] = await Promise.all([
        adminModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
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

  // GET /client/:adminId/cameras
  // The client's added cameras (isAdded: true) with their NVR and per-detection
  // enabled state — powers the Client Configuration "Cameras" tab.
  async getClientCameras(req, res) {
    try {
      const { adminId } = req.params;
      if (!mongoose.isValidObjectId(adminId)) {
        return res.status(400).send(Response.userFailResp("Invalid adminId"));
      }

      const admin = await adminModel.findById(adminId).lean();
      if (!admin) {
        return res.status(404).send(Response.notFoundResp("Client not found"));
      }

      const cameras = await channelModel
        .find({ userId: admin.user_id, isAdded: true })
        .setOptions({ includeInactive: true }) // we filter isAdded ourselves
        .populate("nvrId", "nvrName")
        .lean();

      const rows = cameras.map((cam) => ({
        cameraId: cam._id,
        name: cam.customName || cam.name,
        channelId: cam.localChannelId || cam.channelId,
        nvrId: cam.nvrId?._id || cam.nvrId,
        nvrName: cam.nvrId?.nvrName || null,
        control: cam.control, // 1 = running, 0 = stopped
        // { settingType: enabled } for every detection linked to this camera.
        detections: Object.fromEntries(
          Object.entries(cam.detections || {})
            .filter(([, d]) => d && d.id) // only linked detections
            .map(([settingType, d]) => [settingType, !!d.enabled])
        ),
      }));

      return res.send(
        Response.SuccessResp("Client cameras fetched", { totalCount: rows.length, cameras: rows })
      );
    } catch (err) {
      logger.error(`client getClientCameras: ${err.message}`);
      return res.send(Response.userFailResp("Failed to fetch client cameras", err.message));
    }
  }
}

export default new ClientService();
