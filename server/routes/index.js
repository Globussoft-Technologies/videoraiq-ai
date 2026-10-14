import express from "express";
import v1 from "./v1/v1.js";
import v2 from "./v2/v2.js";
import apiKeyAuth from '../core/v2/apiKeys/apiKey.middleware.js';

const router = express.Router();
router.use(apiKeyAuth);

// API versioning
router.use("/v1", v1);
router.use("/v2", v2);

export default router;
