import Router from "express";
import { login, loginLimiter, requireEmailAuth } from "./emailAuth.js";
import emailMonitoringController from "./emailMonitoring.controller.js";

const router = Router();

router.post("/auth/login", loginLimiter, login);

// Public provider callback. Configure SendGrid Event Webhook to POST here so
// sent messages can move to delivered/opened/clicked/bounced/etc.
router.post("/webhook/sendgrid", emailMonitoringController.sendGridWebhook);

// Everything below this line requires the 1-day dashboard token.
router.use(requireEmailAuth);

// Lets the frontend decide on page load whether the stored token is still
// valid, instead of waiting for the first data call to 401.
router.get("/auth/me", (req, res) => res.json({ username: req.emailUser }));

// Admin/organization options for the page filter. Use `adminId=all` or omit
// `adminId` on dashboard calls to view every admin's email data.
router.get("/organizations", emailMonitoringController.organizations);

// Full payload for the Email Monitoring page: KPI cards, charts, alerts,
// top senders, performance cards, and the first page of recent activity.
router.get("/dashboard", emailMonitoringController.dashboard);

// Paginated table endpoint for search/status filters without reloading every
// chart on the page.
router.get("/activity", emailMonitoringController.activity);

export default router;
