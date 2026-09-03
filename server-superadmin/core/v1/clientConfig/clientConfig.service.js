import mongoose from "mongoose";
import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import adminModel from "../admin/admin.model.js";
import channelModel from "../channels/channels.model.js";
import NVRModel from "../NVR/nvr.model.js";
import allocationModel from "./clientDetectionAllocation.model.js";
import { DETECTION_TYPES } from "../../../constants/detectionTypes.js";
import { resolveDetectionTypes } from "../detectionCatalog/detectionTypes.resolver.js";
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

      const [existing, configuredCount, totalChannels, liveChannels] = await Promise.all([
        allocationModel.find({ adminId }).lean(),
        // A camera is "configured" once any detection is enabled on it — the
        // channel pre-save sets control=1 in that case.
        channelModel.countDocuments({ userId: admin.user_id, control: 1 }),
        channelModel.countDocuments({ userId: admin.user_id }),
        // Live per-detection usage, read straight off the client's cameras.
        // The allocation numbers below are a cap; this is what the client is
        // actually running against it, so the screen can show "3 of 5 in use"
        // and warn when an allocation is set below what is already deployed.
        channelModel.find({ userId: admin.user_id }).select("detections").lean(),
      ]);

      const byType = Object.fromEntries(existing.map((a) => [a.settingType, a]));

      // settingType -> number of cameras currently running it.
      const usageByType = {};
      let licenseInUse = 0;
      for (const channel of liveChannels) {
        let consumes = false;
        for (const [settingType, detection] of Object.entries(channel.detections || {})) {
          if (detection?.enabled !== true) continue;
          consumes = true;
          usageByType[settingType] = (usageByType[settingType] || 0) + 1;
        }
        if (consumes) licenseInUse += 1;
      }

      // The detection list comes from the shared catalog the client backend
      // publishes, NOT this service's own DETECTION_TYPES copy — that copy had
      // drifted and was silently hiding detections (Car Model Detection existed
      // in the client backend but not here, so it could never be licensed).
      const catalog = await resolveDetectionTypes();

      // One row per known detection type; default 0 / disabled if never saved.
      const detections = catalog.detections.map(({ settingType, name, dsSupported }) => {
        const a = byType[settingType];
        return {
          settingType,
          name,
          cameraAllocation: a?.cameraAllocation || 0,
          enabled: a?.enabled || false,
          camerasInUse: usageByType[settingType] || 0,
          // false = the detection engine does not exist in DS, so licensing it
          // here would never result in anything running.
          dsSupported: dsSupported ?? null,
        };
      });

      const stats = {
        totalCameras: admin.purchasedCameras || 0,
        configured: configuredCount,
        nonConfigured: Math.max(totalChannels - configuredCount, 0),
        detectionsEnabled: detections.filter((d) => d.enabled).length,
        // Cameras holding a camera-license slot right now (any detection on).
        licenseInUse,
        // true when the client backend has not published its catalog yet, so
        // the list above came from this service's local fallback.
        detectionsStale: catalog.stale,
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

      // planCamerasGranted: true marks this as an EXPLICIT superadmin decision
      // — including count === 0 to deliberately block a client. Without it, a
      // client this screen has never touched before looks identical to one
      // just set to 0 on purpose (both are bare purchasedCameras: 0), and
      // server's own default-camera grant would silently overwrite the block
      // on that client's next login. See detectionLicense.service.js
      // grantPlanDefaultCameras.
      await adminModel.updateOne(
        { _id: adminId },
        { purchasedCameras: count, planCamerasGranted: true },
      );

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
      // Validate against the shared catalog for the same reason: a detection the
      // client backend supports must be settable here even if this service's
      // local constants have not caught up.
      const catalog = await resolveDetectionTypes();
      const catalogEntry = catalog.detections.find((d) => d.settingType === settingType);
      if (!catalogEntry && !DETECTION_TYPES[settingType]) {
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

      // Notify the client app (separate process) so connected users see the new
      // allocation live, exactly as purchased-cameras changes already do.
      // Without this a detection granted or revoked here stays invisible until
      // the user reloads. Fire-and-forget over Redis pub/sub — never blocks or
      // fails the response if Redis is unavailable.
      redis
        .publish(
          "detectionAllocation:update",
          JSON.stringify({
            adminId,
            userId: admin.user_id,
            settingType,
            cameraAllocation: doc.cameraAllocation,
            enabled: doc.enabled,
          }),
        )
        .catch((e) => logger.error(`detectionAllocation publish failed: ${e.message}`));

      return res.send(
        Response.SuccessResp("Detection allocation updated", {
          settingType,
          name: catalogEntry?.name || DETECTION_TYPES[settingType],
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
