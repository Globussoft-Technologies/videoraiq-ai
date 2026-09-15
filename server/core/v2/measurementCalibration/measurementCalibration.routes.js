import express from "express";
import verifyToken from "../../../middlewares/verifyToken.js";
import controller from "./measurementCalibration.controller.js";

const router = express.Router();

router.use(verifyToken);
router.get("/:deviceId/status", controller.status.bind(controller));
router.post("/:deviceId/frame", controller.capture.bind(controller));
router.get("/:deviceId/frame", controller.frame.bind(controller));
router.post("/:deviceId/run", controller.run.bind(controller));
router.get("/:deviceId/zone", controller.zone.bind(controller));
router.put("/:deviceId/zone", controller.saveZone.bind(controller));

export default router;
