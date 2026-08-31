import express from "express";
import verifyToken from "../../middlewares/verifyToken.js";

// ─────────────────────────────────────────────────────────────────────────────
// All modules are physically copied into core/v2/ — edit them freely without
// affecting v1. Each file is independent.
// ─────────────────────────────────────────────────────────────────────────────
import nvrRoutes from "../../core/v2/NVR/nvr.routes.js";
import channelRoutes from "../../core/v2/channels/channels.routes.js";
import authRoutes from "../../core/v2/Auth/auth.routes.js";
import incidentsRoutes from "../../core/v2/incidents/incidents.routes.js";
import alertRoutes from "../../core/v2/alerts/alerts.routes.js";
import recipientsRoutes from "../../core/v2/verifyRecipients/recipients.routes.js";
import adminRoutes from "../../core/v2/admin/admin.routes.js";
import dashboardRoutes from "../../core/v2/dashboard/dashboard.routes.js";
import authorizedUsersRoutes from "../../core/v2/authorizedUsers/authorizedUsers.routes.js";
import detectionSettingsRoutes from "../../core/v2/detectionSettings/detectionSettings.routes.js";
import globalScheduleRoutes from "../../core/v2/globalSchedule/globalSchedule.routes.js";
import uploadRoutes from "../../core/v2/Uploads/uploads.routes.js";
import storageRoutes from "../../core/v2/storage/storage.routes.js";
import rolesRoutes from "../../core/v2/roles/roles.routes.js";
import departmentRoutes from "../../core/v2/departments/departments.routes.js";
import profilesRoutes from "../../core/v2/profiles/profiles.routes.js";
import attendanceRoutes from "../../core/v2/attendance/attendance.routes.js";
import accessLogsRoutes from "../../core/v2/accesslogs/accesslogs.routes.js";
import authorizedObjectsRoutes from "../../core/v2/authorizedObjects/authorizedObjects.routes.js";
import permissionsRoutes from "../../core/v2/permission/permissions.route.js";
import usersRoutes from "../../core/v2/users/users.routes.js";
import analyticsRoutes from "../../core/v2/analytics/analytics.routes.js";
import emailMonitoringRoutes from "../../core/v2/emailMonitoring/emailMonitoring.routes.js";
import authorizedChannels from "../../core/v2/cameraRestrictions/authorizedChannels.routes.js";
import domainRoutes from "../../core/v2/domain/domain.routes.js";
import detectionObjectsRoutes from "../../core/v2/detectionObjects/objects.routes.js";
import shiftRoutes from "../../core/v2/shifts/shifts.routes.js";
import autoEmailReportRoutes from "../../core/v2/autoEmailReport/autoEmailReport.routes.js";
import attendanceAutoEmailReportRoutes from "../../core/v2/attendanceAutoEmailReport/attendanceAutoEmailReport.routes.js";
import jobsRoutes from "../../core/v2/jobs/jobs.routes.js";
import entryRoutes from "../../core/v2/entry/entry.routes.js";
import vehicleRoutes from "../../core/v2/vehicle/vehicle.routes.js";
import locationRoutes from "../../core/v2/locations/location.routes.js";
import faceImagesRoutes from "../../core/v2/faceImages/faceImages.routes.js";
import telegramRoutes from "../../core/v2/telegram/telegram.routes.js";
import clientConfigRoutes from "../../core/v2/clientConfig/clientConfig.routes.js";
import logsConfigurationRoutes from "../../core/v2/logsConfiguration/logsConfiguration.routes.js";
import videoRecordsRoutes from "../../core/v2/videoRecords/videoRecords.routes.js";

const router = express.Router();

// Health-check — confirms v2 prefix is alive
router.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    version: "v2",
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Routes — identical to v1 by default.
// Swap any import above to a core/v2/<module> file when that module needs
// v2-specific behaviour.
// ─────────────────────────────────────────────────────────────────────────────
router.use("/auth", authRoutes);
router.use("/uploads", uploadRoutes);
router.use("/admin", adminRoutes);
router.use("/authorizedUsers", authorizedUsersRoutes);
router.use("/authorizedChannels", authorizedChannels);
router.use("/users", usersRoutes);
router.use("/nvr", verifyToken, nvrRoutes);
router.use("/channel", verifyToken, channelRoutes);
router.use("/incidents", verifyToken, incidentsRoutes);
router.use("/alert", verifyToken, alertRoutes);
router.use("/recipients", recipientsRoutes);
router.use("/dashboard", verifyToken, dashboardRoutes);
router.use("/authorizedUsers", verifyToken, authorizedUsersRoutes);
router.use("/authorizedObjects", verifyToken, authorizedObjectsRoutes);
router.use("/detection-settings", verifyToken, detectionSettingsRoutes);
router.use("/global-schedules", verifyToken, globalScheduleRoutes);
router.use("/storage", storageRoutes);
router.use("/profiles", verifyToken, profilesRoutes);
router.use("/attendance", verifyToken, attendanceRoutes);
router.use("/roles", verifyToken, rolesRoutes);
router.use("/departments", verifyToken, departmentRoutes);
router.use("/accessLogs", verifyToken, accessLogsRoutes);
router.use("/permissions", verifyToken, permissionsRoutes);
router.use("/auto-email-report", verifyToken, autoEmailReportRoutes);
router.use("/attendance-auto-email-reports", verifyToken, attendanceAutoEmailReportRoutes);
router.use("/domain", domainRoutes);
router.use("/detection-objects", verifyToken, detectionObjectsRoutes);
router.use("/shifts", verifyToken, shiftRoutes);
router.use("/jobs", verifyToken, jobsRoutes);
router.use("/entry", verifyToken, entryRoutes);
router.use("/vehicle", verifyToken, vehicleRoutes);
router.use("/locations", verifyToken, locationRoutes);
router.use("/analytics", verifyToken, analyticsRoutes);
// faceImages.routes.js applies verifyToken per-route, so mount plain (like v1).
router.use("/faceImages", faceImagesRoutes);
// Telegram: /link-code + /unlink are authed inside the router; /webhook is
// public (Telegram calls it), so mount WITHOUT a router-level verifyToken.
router.use("/telegram", telegramRoutes);
// clientConfig.routes.js applies verifyToken per-route, so mount plain.
router.use("/client-config", clientConfigRoutes);
// Email Monitoring dashboard has its own config-credential login and its own
// secret — mount WITHOUT verifyToken, the router guards itself.
router.use("/email-monitoring", emailMonitoringRoutes);
router.use("/logs-configuration", verifyToken, logsConfigurationRoutes);
router.use("/video-records", verifyToken, videoRecordsRoutes);

export default router;

