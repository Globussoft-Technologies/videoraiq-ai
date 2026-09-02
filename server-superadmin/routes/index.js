import express from "express";
import v1 from "./v1/v1.js";
import sessionRoutes from "../core/v1/sessions/sessions.routes.js";
import verifySessionAccess from "../core/v1/sessions/sessions.auth.js";

const router = express.Router();

// API versioning
router.use("/v1", v1);
router.use("/sessions", verifySessionAccess, sessionRoutes);

export default router;
