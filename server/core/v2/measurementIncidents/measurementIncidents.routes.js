import express from "express";
import controller from "./measurementIncidents.controller.js";

const router = express.Router();

router.post("/", controller.createFromQr.bind(controller));
router.post("/process", controller.process.bind(controller));
router.patch("/by-sku/:sku/measurement", controller.updateMeasurementBySku.bind(controller));
router.get("/by-sku/:sku", controller.findLatestBySku.bind(controller));
router.get("/", controller.list.bind(controller));
router.get("/:id", controller.findOne.bind(controller));
router.patch("/:id/measurement", controller.updateMeasurement.bind(controller));
router.patch("/:id/status", controller.updateStatus.bind(controller));
router.delete("/:id", controller.reset.bind(controller));

export default router;
