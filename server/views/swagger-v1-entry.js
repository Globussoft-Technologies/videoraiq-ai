/**
 * Swagger autogen entry point — V1 routes only.
 * swagger.config.js scans this file instead of server.js
 * so only /api/v1/* paths appear in the v1 swagger doc.
 */
import express from "express";
import v1 from "../routes/v1/v1.js";

const app = express();
app.use("/api/v1", v1);
