import { timingSafeEqual } from "node:crypto";
import TelegramService from "../../../services/telegram.service.js";
import { telegramWebhookSecret } from "./telegram.settings.js";
import { telegramBotIdentity } from "../streamMonitoring/telegramChannels.js";

export function verifyTelegramWebhook(req, res, next) {
  const expected = telegramWebhookSecret();
  if (!expected) return res.status(503).json({ ok: false });
  const supplied = req.get("X-Telegram-Bot-Api-Secret-Token");
  if (typeof supplied !== "string") return res.status(401).json({ ok: false });
  const actual = Buffer.from(supplied);
  const secret = Buffer.from(expected);
  if (actual.length !== secret.length || !timingSafeEqual(actual, secret))
    return res.status(401).json({ ok: false });
  return next();
}

export const webhookReady = async (_req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const identity = await telegramBotIdentity();
    return res.json({ ok: true, service: "videoraiq-superadmin-telegram", botId: identity.id, botUsername: identity.username });
  } catch {
    return res.status(503).json({ ok: false });
  }
};

export async function webhook(req, res) {
  try {
    await telegramBotIdentity();
    await TelegramService.handleUpdate(req.body);
    return res.json({ ok: true });
  } catch {
    // A failed database/network request must be retried, rather than silently lost.
    return res.status(503).json({ ok: false });
  }
}
