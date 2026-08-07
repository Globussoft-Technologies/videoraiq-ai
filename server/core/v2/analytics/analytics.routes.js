import Router from 'express';
import analyticsController from "./analytics.controller.js";
import { viewAccessCheck } from '../../../middlewares/permissionMiddleware.js';

const router = Router();

router.get("/attendance-summary", viewAccessCheck, analyticsController.attendanceSummary);
router.get("/attendance-presence", viewAccessCheck, analyticsController.attendancePresence);
router.get("/detection-volume", viewAccessCheck, analyticsController.detectionVolume);
router.get("/engine-share", viewAccessCheck, analyticsController.engineShare);
router.get("/top-cameras", viewAccessCheck, analyticsController.topCameras);
router.get("/activity-heatmap", viewAccessCheck, analyticsController.activityHeatmap);
router.get("/detections-by-hour", viewAccessCheck, analyticsController.detectionsByHour);
router.get("/site-performance", viewAccessCheck, analyticsController.sitePerformance);
router.get("/response-funnel", viewAccessCheck, analyticsController.responseFunnel);
router.get("/overview", viewAccessCheck, analyticsController.overview);
router.get("/peak-activity", viewAccessCheck, analyticsController.peakActivity);

export default router;
