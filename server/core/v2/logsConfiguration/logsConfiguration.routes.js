import Router from "express";
import logsConfigController from "./logsConfiguration.controller.js";
import verifyToken from "../../../middlewares/verifyToken.js";
import { viewAccessCheck, editAccessCheck } from "../../../middlewares/permissionMiddleware.js";

const router = Router();

router.get(
  "/",
  verifyToken,
  viewAccessCheck,
  logsConfigController.getLogsConfiguration
);

router.patch(
  "/",
  verifyToken,
  editAccessCheck,
  logsConfigController.updateLogsConfiguration
);

export default router;
