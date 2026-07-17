import Router from "express";
import verifyToken from "../../../middlewares/verifyToken.js";
import telegramController from "./telegram.controller.js";

const router = Router();

// Client-facing (authed): fetch the verification code and unlink.
router.get("/link-code", verifyToken, telegramController.getLinkCode);
router.post("/unlink", verifyToken, telegramController.unlink);

// Telegram calls this (public, no auth) whenever the bot receives an update.
// Set it with: https://api.telegram.org/bot<TOKEN>/setWebhook?url=<host>/api/v1/telegram/webhook
router.post("/webhook", telegramController.webhook);

export default router;
