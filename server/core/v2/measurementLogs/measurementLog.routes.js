import express from "express";
import controller from "./measurementLog.controller.js";
import { viewAccessCheck } from "../../../middlewares/permissionMiddleware.js";

const router = express.Router();

/* #swagger.tags = ['Measurement Logs']
   #swagger.description = 'List mattress QC measurement records with filters and KPI stats.' */
router.get("/", viewAccessCheck, controller.list);

/* #swagger.tags = ['Measurement Logs']
   #swagger.description = 'KPI row + analytics cards for the Measurement Logs page.' */
router.get("/analytics", viewAccessCheck, controller.analytics);

/* #swagger.tags = ['Measurement Logs']
   #swagger.description = 'Search the Mismatch Rate by SKU list (q = SKU / model text).' */
router.get("/mismatch-by-sku", viewAccessCheck, controller.mismatchBySku);

export default router;
