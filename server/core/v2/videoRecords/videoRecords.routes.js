import express from "express";
import videoRecordsController from "./videoRecords.controller.js";
import { createAccessCheck, editAccessCheck, viewAccessCheck } from "../../../middlewares/permissionMiddleware.js";

const router = express.Router();

router.get("/", viewAccessCheck, videoRecordsController.getVideoRecords);
router.get("/:id/analytics", viewAccessCheck, videoRecordsController.getSessionAnalytics);
router.post("/", createAccessCheck, videoRecordsController.createVideoRecord);
router.post("/:id/process", createAccessCheck, videoRecordsController.processVideo);
router.get("/:id/videos", viewAccessCheck, videoRecordsController.getVideos);
router.patch("/:id", editAccessCheck, videoRecordsController.updateVideoRecord);
router.patch("/videos/:videoId", videoRecordsController.updateVideoByVideoId);

export default router;
