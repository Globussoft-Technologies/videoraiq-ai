import { Router } from "express";
import { verifyTelegramWebhook, webhook, webhookReady } from "./telegram.controller.js";

const router = Router();
// Telegram uses its webhook secret; browser APIs retain verifySuperAdmin separately.
router.get("/webhook", verifyTelegramWebhook, webhookReady);
router.post("/webhook", verifyTelegramWebhook, webhook);
export default router;
