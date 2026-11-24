import express from "express";
import { requireMeasurementLogsAccess } from "../../../middlewares/floMattressAccess.js";
import controller from "./measurementLog.controller.js";

const router = express.Router();
router.use(requireMeasurementLogsAccess());

/* #swagger.tags = ['Measurement Logs']
   #swagger.description = 'List mattress QC measurement records with filters and KPI stats.' */
router.get("/", controller.list);

/* #swagger.tags = ['Measurement Logs']
   #swagger.description = 'KPI row + analytics cards for the Measurement Logs page.' */
router.get("/analytics", controller.analytics);

/* #swagger.tags = ['Measurement Logs']
   #swagger.description = 'Search the Mismatch Rate by SKU list (q = SKU / model text).' */
router.get("/mismatch-by-sku", controller.mismatchBySku);

export default router;
