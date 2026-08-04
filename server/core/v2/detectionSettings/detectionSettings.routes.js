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
router.get("/:id",viewAccessCheck, DetectionSettingsController.getDetectionSettings);
router.put("/:id",editAccessCheck, DetectionSettingsController.updateDetectionSettings);
router.delete("/:id",deleteAccessCheck, DetectionSettingsController.deleteDetectionSettings);

router.post("/attach",viewAccessCheck, DetectionSettingsController.attachDetectionSetting);
router.post("/detach",viewAccessCheck, DetectionSettingsController.detachDetectionSetting);

export default router;
