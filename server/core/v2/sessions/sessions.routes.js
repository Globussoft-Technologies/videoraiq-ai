import Router from "express";
import sessionsController from "./sessions.controller.js";

const router = Router();

router.get("/user", sessionsController.getUserSessions);
router.get("/admin", sessionsController.getAdminSessions);
router.get("/blocked-devices", sessionsController.getBlockedDevices);
router.get("/summary", sessionsController.getSessionSummary);
router.patch("/devices/:deviceId/unblock", sessionsController.unblockDevice);
router.delete("/bulk/delete", sessionsController.bulkDeleteSessions);
router.get("/:sessionId", sessionsController.getSessionDetails);
router.delete("/:sessionId/delete", sessionsController.deleteSession);
router.delete("/:sessionId", sessionsController.logoutSession);
router.patch("/:sessionId/block-session", sessionsController.blockSession);
router.patch("/:sessionId/unblock-session", sessionsController.unblockSession);
router.patch("/:sessionId/block-device", sessionsController.blockDevice);

export default router;
