import express from "express";
import verifyToken from "../../../middlewares/verifyToken.js";
import clientConfigController from "../../v1/clientConfig/clientConfig.controller.js";
import clientLicenseService from "./clientLicense.service.js";

const router = express.Router();

// The three read-only endpoints are unchanged from v1 — the controller is
// imported rather than re-declared so both versions stay in step. See
// core/v1/clientConfig/clientConfig.routes.js for why there is no
// viewAccessCheck here.
router.get("/account", verifyToken, clientConfigController.getAccount);
router.get("/cameras", verifyToken, clientConfigController.getCameras);

// v2 only: the live licensing snapshot the admin UI checks before enabling a
// detection, and reads back to list the cameras currently holding a slot.
router.get("/license", verifyToken, (req, res, next) =>
  clientLicenseService.getLicense(req, res, next),
);

router.get("/", verifyToken, clientConfigController.getConfig);

export default router;
