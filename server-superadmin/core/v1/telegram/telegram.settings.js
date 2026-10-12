import config from "config";
import { createHmac } from "node:crypto";
import { telegramBotToken } from "../streamMonitoring/telegramChannels.js";

export function telegramWebhookSecret() {
  if (!telegramBotToken()) return "";
  // Derive a purpose-specific secret so existing development.json needs no edits.
  return config.has("Telegram.webhookSecret") ? String(config.get("Telegram.webhookSecret"))
    : createHmac("sha256", telegramBotToken()).update("videoraiq-superadmin-telegram-webhook").digest("hex");
}

export function telegramWebhookUrl() {
  const configured = config.has("Telegram.webhookUrl") ? config.get("Telegram.webhookUrl") : config.get("backendDomain");
  const url = new URL(configured);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
    throw new Error("Telegram webhook requires a public HTTPS backend URL");
  return config.has("Telegram.webhookUrl") ? url.href : new URL("/api/v1/superAdmin/telegram/webhook", url).href;
}
