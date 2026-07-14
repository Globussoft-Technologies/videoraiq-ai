import express from "express";
import accessLogsController from "./accesslogs.controller.js";
import verifyToken from "../../../middlewares/verifyToken.js";
import { viewAccessCheck, editAccessCheck, createAccessCheck, deleteAccessCheck } from '../../../middlewares/permissionMiddleware.js';


const router = express.Router();

router.post("/createAccessLog",accessLogsController.createAccessLog);
router.post("/getAccessLogs",viewAccessCheck,accessLogsController.getAccessLogs);

router.post("/create",verifyToken,accessLogsController.createAccessLogRecord);
router.post("/get",verifyToken,viewAccessCheck,accessLogsController.getLogs);

router.post("/getUserSessionReport",verifyToken,viewAccessCheck,accessLogsController.getUserSessionReport);




export default router;