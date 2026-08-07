import express from "express";
import attendanceController from "./attendance.controller.js";
const router = express.Router();
import { viewAccessCheck, editAccessCheck, createAccessCheck, deleteAccessCheck } from '../../../middlewares/permissionMiddleware.js';

// GET attendance
router.post("/get",viewAccessCheck,attendanceController.getAttendance);
router.get("/export",viewAccessCheck,attendanceController.exportAttendance);
// POST attendance (log attendance)
router.post("/", attendanceController.logAttendance);

// POST get user logs (break logs etc.)
router.post("/user-logs", viewAccessCheck, attendanceController.getUserLogs);

// Per-org attendance rules (full-day / half-day hour thresholds)
router.get("/settings", viewAccessCheck, attendanceController.getAttendanceSettings);
router.put("/settings", editAccessCheck, attendanceController.updateAttendanceSettings);


export default router;
