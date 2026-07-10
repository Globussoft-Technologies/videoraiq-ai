import express from "express";
import ChannelControllerontroller from "./channels.controller.js";
import { viewAccessCheck, editAccessCheck, createAccessCheck, deleteAccessCheck } from '../../../middlewares/permissionMiddleware.js';


const router = express.Router();

router.get("/", viewAccessCheck,ChannelControllerontroller.getAllChannels);
router.get("/nvr/:nvrId",viewAccessCheck, ChannelControllerontroller.getAllChannelsByNvrId);
router.put("/detection/toggle", editAccessCheck, ChannelControllerontroller.toggleDetection);
router.put("/:id",editAccessCheck,ChannelControllerontroller.updateChannel) 
router.delete("/:id",deleteAccessCheck,ChannelControllerontroller.deleteChannel);
router.put("/channels/bulk-update",editAccessCheck, ChannelControllerontroller.bulkUpdateChannels);
router.put("/updateConfiguration",editAccessCheck,ChannelControllerontroller.updateChannelConfiguration);

router.post("/playback-url",viewAccessCheck, ChannelControllerontroller.getPlaybackUrl);
router.post("/playback-timeline",viewAccessCheck, ChannelControllerontroller.getPlaybackTimeline);
router.post("/playBackFilters",viewAccessCheck, ChannelControllerontroller.getPlaybackWithFilters);
router.get("/all-channels",viewAccessCheck, ChannelControllerontroller.getFilterAllChannels);
router.get("/:id",viewAccessCheck, ChannelControllerontroller.getChannelById);

export default router;
