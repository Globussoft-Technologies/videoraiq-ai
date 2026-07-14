import express from "express";
import v1 from "./v1/v1.js";
import v2 from "./v2/v2.js";

const router = express.Router();

// API versioning
router.use("/v1", v1);
router.use("/v2", v2);

export default router;
