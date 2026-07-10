import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import allocationModel from "../clientConfig/clientDetectionAllocation.model.js";
import { DETECTION_TYPES2, DETECTION_DESCRIPTIONS } from "../../../constants/detectionTypes.js";

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

      // One row per known detection type; 0 clients if none opted in.
      const detections = Object.entries(DETECTION_TYPES2).map(([settingType, name]) => {
        const clients = byType[settingType] || [];
        return {
          settingType,                 // raw internal key, e.g. "loiteringDetectionSettings"
          name,                        // display label, e.g. "Loitering Detection"
          description: DETECTION_DESCRIPTIONS[settingType] || "",
          clientCount: clients.length,
          clientIds: clients,
        };
      });

      return res.send(Response.SuccessResp("Detection catalog fetched", { detections }));
    } catch (err) {
      logger.error(`detectionCatalog list: ${err.message}`);
      return res.send(Response.userFailResp("Failed to fetch detection catalog", err.message));
    }
  }
}

export default new DetectionCatalogService();
