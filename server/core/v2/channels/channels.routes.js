import { cacheReads } from "../../../services/apiCache.service.js";
import express from "express";
import ChannelControllerontroller from "./channels.controller.js";
import { viewAccessCheck, editAccessCheck, createAccessCheck, deleteAccessCheck } from '../../../middlewares/permissionMiddleware.js';
import { getCameraDetails, listCameraDetails } from './cameraDetails.service.js';
import Response from '../../../utils/response.js';
import logger from '../../../utils/logger.js';


const router = express.Router();

router.get("/", viewAccessCheck,ChannelControllerontroller.getAllChannels);
router.get("/details", viewAccessCheck, async (req, res) => {
  try {
    const result = await listCameraDetails(req.verified?.userData,
      req.verified?.authorizedChannel?.channels || [], req.query);
    if (result.code !== 200) return res.status(result.code).json(
      result.code === 403 ? Response.accessDeniedResp(result.message) : Response.userFailResp(result.message));
    return res.status(200).json(Response.userSuccessResp("Camera details retrieved successfully", result.data));
  } catch (error) {
    logger.error(error);
    return res.status(500).json(Response.errorResp("Failed to retrieve camera details"));
  }
});
router.get("/:id/details", viewAccessCheck, async (req, res) => {
  try {
    const result = await getCameraDetails(req.params.id, req.verified?.userData,
      req.verified?.authorizedChannel?.channels || []);
    if (result.code !== 200) return res.status(result.code).json(
      result.code === 404 ? Response.notFoundResp(result.message) :
      result.code === 403 ? Response.accessDeniedResp(result.message) : Response.userFailResp(result.message));
    return res.status(200).json(Response.userSuccessResp("Camera details retrieved successfully", result.data));
  } catch (error) {
    logger.error(error);
    return res.status(500).json(Response.errorResp("Failed to retrieve camera details"));
  }
});
router.get("/nvr-camera-detections", viewAccessCheck, ChannelControllerontroller.getNvrCameraDetections);
router.get("/nvr-camera-detections/:adminId", viewAccessCheck, ChannelControllerontroller.getNvrCameraDetections);
router.get("/nvr/:nvrId",viewAccessCheck, ChannelControllerontroller.getAllChannelsByNvrId);
router.put("/detection/toggle", editAccessCheck, ChannelControllerontroller.toggleDetection);
router.put("/:id",editAccessCheck,ChannelControllerontroller.updateChannel) 
router.delete("/:id",deleteAccessCheck,ChannelControllerontroller.deleteChannel);
router.put("/channels/bulk-update",editAccessCheck, ChannelControllerontroller.bulkUpdateChannels);
router.put("/updateConfiguration",editAccessCheck,ChannelControllerontroller.updateChannelConfiguration);

router.post("/playback-url",viewAccessCheck, ChannelControllerontroller.getPlaybackUrl);
router.post("/playback-timeline",viewAccessCheck, ChannelControllerontroller.getPlaybackTimeline);
router.post("/playback-thumbnail",viewAccessCheck, ChannelControllerontroller.getPlaybackPreview);
router.post("/playBackFilters",viewAccessCheck, ChannelControllerontroller.getPlaybackWithFilters);
router.get("/all-channels",viewAccessCheck, cacheReads.channels, ChannelControllerontroller.getFilterAllChannels);
// Honeywell DASH playback proxy — a <video>/dash.js player fetches these
// directly (manifest, then repeated init.mp4/seg.m4s), so it's under
// viewAccessCheck like the other playback reads, not editAccessCheck.
router.get("/honeywell-playback/:proxyId/stream.mpd", viewAccessCheck, ChannelControllerontroller.getHoneywellPlaybackManifest);
router.get("/honeywell-playback/:proxyId/:track/:file", viewAccessCheck, ChannelControllerontroller.getHoneywellPlaybackSegment);
router.get("/securus-playback/:sessionId/:file", viewAccessCheck, ChannelControllerontroller.getSecurusPlaybackFile);
router.get("/:id",viewAccessCheck, ChannelControllerontroller.getChannelById);

export default router;
