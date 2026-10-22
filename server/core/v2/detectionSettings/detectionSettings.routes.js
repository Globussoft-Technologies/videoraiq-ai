import express from "express";
import DetectionSettingsController from "./detectionSettings.controller.js";
import { viewAccessCheck, editAccessCheck, createAccessCheck, deleteAccessCheck } from '../../../middlewares/permissionMiddleware.js';


import rateLimit from 'express-rate-limit';
import { verifyResetPassword, consumeResetApproval, bulkDetectionControl, getBulkDetectionState } from '../../../services/detectionBulkControl.js';

const router = express.Router();
const passwordLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
router.post('/verify-reset-password', editAccessCheck, passwordLimit, verifyResetPassword);
router.get('/bulk-control', viewAccessCheck, getBulkDetectionState);
router.post('/bulk-control', editAccessCheck, bulkDetectionControl);

router.get("/", viewAccessCheck,DetectionSettingsController.getAllDetectionSettings);
router.post("/",createAccessCheck, DetectionSettingsController.createDetectionSettings);
router.get("/examples",viewAccessCheck, DetectionSettingsController.getDetectionExamples);
router.get("/types",viewAccessCheck, DetectionSettingsController.getDetectionTypes);
router.post("/reset-all", editAccessCheck, consumeResetApproval, DetectionSettingsController.resetAllDetections);
router.post("/reset-camera-types", editAccessCheck, consumeResetApproval, DetectionSettingsController.resetAllCameraTypes);
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
