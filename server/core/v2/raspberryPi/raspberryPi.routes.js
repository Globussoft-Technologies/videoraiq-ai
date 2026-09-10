import express from "express";
import controller from "./raspberryPi.controller.js";
import verifyToken from "../../../middlewares/verifyToken.js";
import allowCrossOriginResource from "../../../middlewares/allowCrossOriginResource.js";
const router = express.Router();

router.post("/register", allowCrossOriginResource, controller.register);
router.get("/status/:code", allowCrossOriginResource, controller.registrationStatus);
router.post("/heartbeat", controller.heartbeat);
router.get("/registrations", verifyToken, controller.adminRegistrations);
router.patch("/registrations/:code/status", verifyToken, controller.updateApproval);
router.delete("/registrations/:code", verifyToken, controller.deleteRegistration);

export default router;
