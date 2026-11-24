import express from "express";
import { requireMeasurementLogsAccess } from "../../../middlewares/floMattressAccess.js";
import controller from "./measurementAutoEmailReport.controller.js";

const router = express.Router();
router.use(requireMeasurementLogsAccess());

/* #swagger.tags = ['Measurement Auto Email Reports'] */
router.get("/", controller.list);
/* #swagger.tags = ['Measurement Auto Email Reports'] */
router.post("/", requireMeasurementLogsAccess("create"), controller.create);
/* #swagger.tags = ['Measurement Auto Email Reports']
   #swagger.description = 'Verified recipient emails + known stations for the schedule form.' */
router.get("/form-options", controller.formOptions);
/* #swagger.tags = ['Measurement Auto Email Reports'] */
router.get("/:id", controller.getById);
/* #swagger.tags = ['Measurement Auto Email Reports'] */
router.put("/:id", requireMeasurementLogsAccess("edit"), controller.update);
/* #swagger.tags = ['Measurement Auto Email Reports'] */
router.delete("/:id", requireMeasurementLogsAccess("delete"), controller.remove);
/* #swagger.tags = ['Measurement Auto Email Reports'] */
router.post("/:id/send-now", requireMeasurementLogsAccess("edit"), controller.sendNow);

export default router;
