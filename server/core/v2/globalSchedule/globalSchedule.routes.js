import express from "express";
import GlobalScheduleController from "./globalSchedule.controller.js";
import {
  viewAccessCheck,
  editAccessCheck,
  createAccessCheck,
  deleteAccessCheck,
} from "../../../middlewares/permissionMiddleware.js";

const router = express.Router();

// Tab 1 of the UI — declared before /:id so "nvr" is never read as an id.
router.get("/nvr/:nvrId/cameras", viewAccessCheck, GlobalScheduleController.getNvrCameras);

router.get("/", viewAccessCheck, GlobalScheduleController.getAllGlobalSchedules);
router.post("/", createAccessCheck, GlobalScheduleController.createGlobalSchedule);
router.get("/:id", viewAccessCheck, GlobalScheduleController.getGlobalSchedule);
router.put("/:id", editAccessCheck, GlobalScheduleController.updateGlobalSchedule);
router.delete("/:id", deleteAccessCheck, GlobalScheduleController.deleteGlobalSchedule);

export default router;
