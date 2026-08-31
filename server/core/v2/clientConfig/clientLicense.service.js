import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import { DETECTION_TYPES } from "../../../constants/detectionTypes.js";
import { getLicenseState } from "./detectionLicense.service.js";

/**
 * Read-only licensing snapshot for the calling client, used by the admin UI to
 * show remaining headroom before a toggle is attempted and to power the
 * "deselect an existing camera to continue" dialog after one is refused.
 *
 * The tenant comes from the caller's own token — never from a path parameter —
 * exactly like the sibling /client-config endpoints. Nothing here is writable:
 * purchasedCameras and the per-detection allocations are owned by the
 * superadmin backend.
 */
class ClientLicenseService {
  // GET /client-config/license
  async getLicense(req, res) {
    try {
      const state = await getLicenseState({
        adminId: req.verified?.userData?.adminId,
        userId: req.verified?.userData?.user_id,
      });

      if (!state.resolved) {
        return res.status(404).send(Response.notFoundResp("Client not found"));
      }

      // One row per licensed detection: how many cameras it may run on, how
      // many it is running on now, and which cameras those are — the list the
      // UI offers for deselection when the limit is hit.
      const detections = [...state.allocations.entries()].map(
        ([settingType, cameraAllocation]) => {
          const cameras = state.byType.get(settingType) || [];
          return {
            settingType,
            name: DETECTION_TYPES[settingType] || settingType,
            cameraAllocation,
            camerasInUse: cameras.length,
            remaining: Math.max(cameraAllocation - cameras.length, 0),
            cameras,
          };
        },
      );

      return res.send(
        Response.SuccessResp("License fetched", {
          purchasedCameras: state.purchasedCameras,
          camerasInUse: state.licenseCameras.length,
          remaining: Math.max(state.purchasedCameras - state.licenseCameras.length, 0),
          licensedCameras: state.licenseCameras,
          allowedDetections: [...state.allocations.keys()],
          detections,
        }),
      );
    } catch (err) {
      logger.error(`clientLicense getLicense: ${err.message}`);
      return res.send(Response.userFailResp("Failed to fetch license", err.message));
    }
  }
}

export default new ClientLicenseService();
