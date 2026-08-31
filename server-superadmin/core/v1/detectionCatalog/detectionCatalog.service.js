import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import allocationModel from "../clientConfig/clientDetectionAllocation.model.js";
import { resolveDetectionTypes } from "./detectionTypes.resolver.js";
import { redis } from "../../../utils/database.js";

class DetectionCatalogService {
  // GET /detection-catalog
  // Lists every platform detection type + how many clients have opted for it
  // (an allocation row with enabled: true). Plan tier is intentionally omitted.
  async list(req, res) {
    try {
      // One pass: count enabled clients per detection type.
      const grouped = await allocationModel.aggregate([
        { $match: { enabled: true } },
        { $group: { _id: "$settingType", clients: { $addToSet: "$adminId" } } },
      ]);

      const byType = Object.fromEntries(
        grouped.map((g) => [g._id, g.clients])
      );

      // The platform's detection list, read from the shared catalog the client
      // backend publishes — not from this service's own constants copy, which
      // drifts.
      const catalog = await resolveDetectionTypes();

      // One row per known detection type; 0 clients if none opted in.
      const detections = catalog.detections.map(({ settingType, name, description }) => {
        const clients = byType[settingType] || [];
        return {
          settingType,                 // raw internal key, e.g. "loiteringDetectionSettings"
          name,                        // display label, e.g. "Loitering Detection"
          description,
          clientCount: clients.length,
          clientIds: clients,
        };
      });

      return res.send(
        Response.SuccessResp("Detection catalog fetched", {
          detections,
          // stale === true means the client backend has not published yet and
          // these came from this service's local fallback list.
          stale: catalog.stale,
          syncedAt: catalog.syncedAt,
        })
      );
    } catch (err) {
      logger.error(`detectionCatalog list: ${err.message}`);
      return res.send(Response.userFailResp("Failed to fetch detection catalog", err.message));
    }
  }

  // POST /detection-catalog/sync
  // The Refresh button. Re-reads the shared catalog the client backend
  // publishes from its DETECTION_TYPES and reports what the superadmin now
  // sees, so a detection added on the client side can be picked up without
  // redeploying this service.
  async sync(req, res) {
    try {
      // Ask the client backend to re-publish first. It owns both the constants
      // and the DS connection, so a resync there is what actually refreshes the
      // shared catalog and its DS-support flags; re-reading here alone would
      // just return the same rows. Fire-and-forget over Redis, then read back.
      await redis
        .publish("detectionCatalog:sync", JSON.stringify({ requestedAt: new Date() }))
        .catch((e) => logger.error(`detectionCatalog sync publish failed: ${e.message}`));

      // Give the publisher a moment to land before reading. The read is correct
      // either way — worst case it returns the previous snapshot and the next
      // press shows the new one.
      await new Promise((resolve) => setTimeout(resolve, 750));

      const catalog = await resolveDetectionTypes();

      return res.send(
        Response.SuccessResp(
          catalog.stale
            ? "Detection list refreshed from the local fallback — the client backend has not published its catalog yet."
            : `Detection list synced — ${catalog.detections.length} detections available.`,
          {
            total: catalog.detections.length,
            stale: catalog.stale,
            syncedAt: catalog.syncedAt,
            detections: catalog.detections,
          }
        )
      );
    } catch (err) {
      logger.error(`detectionCatalog sync: ${err.message}`);
      return res.send(Response.userFailResp("Failed to sync detections", err.message));
    }
  }
}

export default new DetectionCatalogService();
