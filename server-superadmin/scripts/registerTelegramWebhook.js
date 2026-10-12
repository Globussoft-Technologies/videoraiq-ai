import axios from "axios";
import { telegramBotToken } from "../core/v1/streamMonitoring/telegramChannels.js";
import { telegramWebhookSecret, telegramWebhookUrl } from "../core/v1/telegram/telegram.settings.js";

// Run from server-superadmin. No configuration files or database records are written.
// The default --check mode makes read-only requests; --activate changes the bot's URL.
export async function registerTelegramWebhook(mode = "--check") {
  if (!["--check", "--activate"].includes(mode)) throw new Error("Use --check or --activate");
  const token = telegramBotToken();
  const secret = telegramWebhookSecret();
  const url = telegramWebhookUrl();
  if (!token || !/^[A-Za-z0-9_-]{1,256}$/.test(secret))
    throw new Error("Telegram bot or webhook secret is not configured");
  const options = { timeout: 8000, maxRedirects: 0, maxContentLength: 1_000_000 };

  // Both existing configs currently name the same host. Prove that its route
  // reaches server-superadmin before changing the shared bot's live webhook.
  const ready = await axios.get(url, { ...options,
    headers: { "X-Telegram-Bot-Api-Secret-Token": secret } });
  if (ready.data?.ok !== true || ready.data?.service !== "videoraiq-superadmin-telegram")
    throw new Error("Configured webhook URL does not reach the superadmin Telegram handler");
  const endpoint = `https://api.telegram.org/bot${token}`;
  const info = await axios.get(`${endpoint}/getWebhookInfo`, options);
  if (info.data?.ok !== true) throw new Error("Unable to inspect the current Telegram webhook");
  if (mode === "--check") {
    console.log(`Superadmin webhook is ready: ${url}. No webhook change made.`);
    return;
  }
  const previous = info.data.result;
  const allowed = previous?.allowed_updates;
  const response = await axios.post(`${endpoint}/setWebhook`, {
    url, secret_token: secret, drop_pending_updates: false,
    ...(allowed?.length ? { allowed_updates: [...new Set([
      ...allowed, "message", "edited_message", "channel_post", "edited_channel_post",
    ])] } : {}),
  }, options);
  if (response.data?.ok !== true) throw new Error("Telegram rejected the webhook registration");
  const verified = await axios.get(`${endpoint}/getWebhookInfo`, options);
  if (verified.data?.ok !== true || verified.data.result?.url !== url)
    throw new Error("Webhook registration could not be verified; inspect Telegram webhook status");
  console.log(`Telegram webhook now points to server-superadmin: ${url}`);
}

// Importable for stubbed verification without contacting Telegram.
if (process.argv[1]?.replace(/\\/g, "/").endsWith("/registerTelegramWebhook.js")) {
  registerTelegramWebhook(process.argv[2]).catch(error => {
    const code = error.response?.data?.error_code || error.response?.status;
    // Axios errors include token-bearing URLs; never print the raw exception.
    console.error(error.response || error.request
      ? `Webhook setup failed (${code || "network error"}). Check deployment and configuration.`
      : error.message);
    process.exitCode = 1;
  });
}
