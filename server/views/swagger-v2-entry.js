/**
 * Swagger autogen entry point — V2 routes only.
 * swagger-v2.config.js scans this file so only /api/v2/* paths
 * appear in the v2 swagger doc.
 */
import express from "express";
import v2 from "../routes/v2/v2.js";

const app = express();
app.use("/api/v2", v2);
