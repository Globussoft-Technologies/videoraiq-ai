import express from "express";
import DetectionSettingsController from "./detectionSettings.controller.js";
import { viewAccessCheck, editAccessCheck, createAccessCheck, deleteAccessCheck } from '../../../middlewares/permissionMiddleware.js';


const router = express.Router();

router.get("/", viewAccessCheck,DetectionSettingsController.getAllDetectionSettings);
router.post("/",createAccessCheck, DetectionSettingsController.createDetectionSettings);
router.get("/examples",viewAccessCheck, DetectionSettingsController.getDetectionExamples);
router.get("/types",viewAccessCheck, DetectionSettingsController.getDetectionTypes);
router.get("/:id/schedule", viewAccessCheck, DetectionSettingsController.getDetectionSchedule);
router.get("/:id/schedule/:channelId", viewAccessCheck, DetectionSettingsController.getCameraDetectionSchedule);
router.put("/:id/schedule/:channelId", editAccessCheck, DetectionSettingsController.updateCameraDetectionSchedule);
router.delete("/:id/schedule/:channelId", editAccessCheck, DetectionSettingsController.resetCameraDetectionSchedule);
router.put("/reset-thresholds/batch", editAccessCheck, DetectionSettingsController.resetCameraDetectionThresholds);
router.get("/:id",viewAccessCheck, DetectionSettingsController.getDetectionSettings);
router.put("/:id",editAccessCheck, DetectionSettingsController.updateDetectionSettings);
router.put("/:id/reset-thresholds",editAccessCheck, DetectionSettingsController.resetDetectionThresholds);
router.delete("/:id",deleteAccessCheck, DetectionSettingsController.deleteDetectionSettings);

router.post("/attach",viewAccessCheck, DetectionSettingsController.attachDetectionSetting);
router.post("/detach",viewAccessCheck, DetectionSettingsController.detachDetectionSetting);

export default router;
