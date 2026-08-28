import mongoose from "mongoose";
import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import adminModel from "../admin/admin.model.js";
import channelModel from "../channels/channels.model.js";
import NVRModel from "../NVR/nvr.model.js";
import allocationModel from "./clientDetectionAllocation.model.js";
import { DETECTION_TYPES } from "../../../constants/detectionTypes.js";
import { redis } from "../../../utils/database.js";

class ClientConfigService {
  // GET /client/config/:adminId
  // Returns the Client Configuration screen: stat cards + Detection Assignment table.
  async getConfig(req, res) {
    try {
      const { adminId } = req.params;
      if (!mongoose.isValidObjectId(adminId)) {
        return res.status(400).send(Response.userFailResp("Invalid adminId"));
      }

      const admin = await adminModel.findById(adminId).lean();
      if (!admin) {
        return res.status(404).send(Response.notFoundResp("Client not found"));
      }

      const [existing, configuredCount, totalChannels] = await Promise.all([
        allocationModel.find({ adminId }).lean(),
        // A camera is "configured" once any detection is enabled on it — the
        // channel pre-save sets control=1 in that case.
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

  // PUT /client/config/:adminId/purchased-cameras   body: { purchasedCameras }
  async updatePurchasedCameras(req, res) {
    try {
      const { adminId } = req.params;
      const count = Number(req.body?.purchasedCameras);
      if (!mongoose.isValidObjectId(adminId)) {
        return res.status(400).send(Response.userFailResp("Invalid adminId"));
      }
      if (!Number.isInteger(count) || count < 0) {
        return res.status(400).send(Response.userFailResp("purchasedCameras must be a non-negative integer"));
      }

      const admin = await adminModel.findById(adminId).lean();
      if (!admin) {
        return res.status(404).send(Response.notFoundResp("Client not found"));
      }

      // Can't purchase more than the client's available cameras — cameras that
      // belong to an NVR the client STILL has. Channels from deleted NVRs are
      // not cleaned up (Camera.deleteMany on NVR delete is disabled), so a plain
      // per-user channel count would include orphans and over-report. Scope the
      // count to the admin's current NVR ids. includeInactive counts un-added
      // channels too (they're still available to allot).
      const nvrs = await NVRModel.find({ userId: admin.user_id }).select("_id").lean();
      const nvrIds = nvrs.map((n) => n._id);
      const availableCameras = nvrIds.length
        ? await channelModel
            .countDocuments({ userId: admin.user_id, nvrId: { $in: nvrIds } })
            .setOptions({ includeInactive: true })
        : 0;
      if (count > availableCameras) {
        return res
          .status(400)
          .send(Response.userFailResp(`purchasedCameras exceeds available cameras (${availableCameras})`));
      }

      await adminModel.updateOne({ _id: adminId }, { purchasedCameras: count });

      // Notify the client app (separate process) so connected users see the new
      // limit live. Fire-and-forget over Redis pub/sub — never blocks/fails the
      // response if Redis is unavailable.
      redis
        .publish(
          "purchasedCameras:update",
          JSON.stringify({ adminId, userId: admin.user_id, purchasedCameras: count }),
        )
        .catch((e) => logger.error(`purchasedCameras publish failed: ${e.message}`));

      return res.send(
        Response.SuccessResp("Purchased cameras updated", { purchasedCameras: count, availableCameras })
      );
    } catch (err) {
      logger.error(`clientConfig updatePurchasedCameras: ${err.message}`);
      return res.send(Response.userFailResp("Failed to update purchased cameras", err.message));
    }
  }

  // PUT /client/config/:adminId/detections/:settingType   body: { cameraAllocation, enabled }
  async updateDetectionAllocation(req, res) {
    try {
      const { adminId, settingType } = req.params;
      if (!mongoose.isValidObjectId(adminId)) {
        return res.status(400).send(Response.userFailResp("Invalid adminId"));
      }
      if (!DETECTION_TYPES[settingType]) {
        return res.status(400).send(Response.userFailResp(`Unknown detection type: ${settingType}`));
      }

      const admin = await adminModel.findById(adminId).lean();
      if (!admin) {
        return res.status(404).send(Response.notFoundResp("Client not found"));
      }

      const update = {};
      if (req.body?.cameraAllocation !== undefined) {
        const alloc = Number(req.body.cameraAllocation);
        if (!Number.isInteger(alloc) || alloc < 0) {
          return res.status(400).send(Response.userFailResp("cameraAllocation must be a non-negative integer"));
        }
        // Can't allocate more cameras than the client purchased.
        if (alloc > (admin.purchasedCameras || 0)) {
          return res
            .status(400)
            .send(Response.userFailResp(`cameraAllocation exceeds purchased cameras (${admin.purchasedCameras || 0})`));
        }
        update.cameraAllocation = alloc;
      }
      if (req.body?.enabled !== undefined) {
        update.enabled = Boolean(req.body.enabled);
      }
      if (Object.keys(update).length === 0) {
        return res.status(400).send(Response.userFailResp("Provide cameraAllocation and/or enabled"));
      }

      const doc = await allocationModel.findOneAndUpdate(
        { adminId, settingType },
        { $set: update },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      ).lean();

      return res.send(
        Response.SuccessResp("Detection allocation updated", {
          settingType,
          name: DETECTION_TYPES[settingType],
          cameraAllocation: doc.cameraAllocation,
          enabled: doc.enabled,
        })
      );
    } catch (err) {
      logger.error(`clientConfig updateDetectionAllocation: ${err.message}`);
      return res.send(Response.userFailResp("Failed to update detection allocation", err.message));
    }
  }
}

export default new ClientConfigService();
