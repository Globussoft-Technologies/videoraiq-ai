import express from "express";
import controller from "./raspberryPi.controller.js";
const router = express.Router();

router.post("/register", controller.register);
router.post("/heartbeat", controller.heartbeat);

export default router;
