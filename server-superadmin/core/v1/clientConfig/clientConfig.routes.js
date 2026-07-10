import Router from "express";
const router = Router();
import clientConfigController from "./clientConfig.controller.js";
import verifySuperAdmin from "../../../middlewares/verifySuperAdmin.js";

router.get("/:adminId", verifySuperAdmin, clientConfigController.getConfig);
router.put("/:adminId/purchased-cameras", verifySuperAdmin, clientConfigController.updatePurchasedCameras);
router.put("/:adminId/detections/:settingType", verifySuperAdmin, clientConfigController.updateDetectionAllocation);

export default router;
