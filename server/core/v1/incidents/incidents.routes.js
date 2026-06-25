import express from "express";
import incidentsController from "./incidents.controller.js";
import {
  viewAccessCheck,
  editAccessCheck,
  createAccessCheck,
  deleteAccessCheck,
} from "../../../middlewares/permissionMiddleware.js";
import multer from "multer";
const upload = multer();

const router = express.Router();

router.post("/create", createAccessCheck, incidentsController.createIncidents);
router.post("/", viewAccessCheck, incidentsController.getAllIncidents);
router.get(
  "/getIncident",
  viewAccessCheck,
  incidentsController.getAllIncidentsById,
);
router.put("/:id", editAccessCheck, incidentsController.updateIncident);
router.delete(
  "/delete-by-incidentIds",
  upload.single("file"),
  incidentsController.deleteIncidentsByIds,
);
router.delete(
  "/:id",
  deleteAccessCheck,
  upload.single("file"),
  incidentsController.deleteIncident,
);

router.post(
  "/getIncidentsDetails",
  viewAccessCheck,
  incidentsController.getIncidentsDetails,
);
router.post(
  "/update-report-status",
  editAccessCheck,
  incidentsController.updateReportStatus,
);

router.get(
  "/getIncidentLists",
  viewAccessCheck,
  incidentsController.getIncidentLists,
);

router.post("/deskAbsenceData",viewAccessCheck,incidentsController.deskAbsenceData);

router.post("/guardAbsenceData",viewAccessCheck,incidentsController.guardAbsenceData);

router.get(
  "/logs/vehicle-detection",
  viewAccessCheck,
  incidentsController.getVehicleDetectionLogs,
);
router.get(
  "/logs/vehicle-detection/numbers",
  viewAccessCheck,
  incidentsController.getVehicleNumbers,
);
router.get(
  "/logs/conveyor-detection",
  viewAccessCheck,
  incidentsController.getConveyorDetectionLogs,
);
router.get(
  "/logs/crusher-detection",
  viewAccessCheck,
  incidentsController.getCrusherDetectionLogs,
);
router.get(
  "/logs/water-spillage-detection",
  viewAccessCheck,
  incidentsController.getWaterSpillageDetectionLogs,
);
router.get(
  "/logs/vehicle-count",
  viewAccessCheck,
  incidentsController.getVehicleCountLogs,
);
router.get(
  "/logs/person-count",
  viewAccessCheck,
  incidentsController.getPersonCountLogs,
);
router.get(
  "/logs/line-crossing",
  viewAccessCheck,
  incidentsController.getLineCrossingLogs,
);
router.get(
  "/logs/desk-absence",
  viewAccessCheck,
  incidentsController.getDeskAbsenceLogs,
);

router.get(
  "/logs/desk-absence/filter/zone-names",
  viewAccessCheck,
  incidentsController.getDeskAbsenceZoneNames,
);

export default router;
