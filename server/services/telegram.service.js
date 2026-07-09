import config from "config";
import axios from "axios";
import logger from "../utils/logger.js";
import adminModel from "../core/v1/admin/admin.model.js";
import { buildIncidentTelegramMessage, buildIncidentImageUrl } from "../messagingService/message.helper.js";
const botToken = config.get("domainPoint.botToken");
const chatId = config.get("domainPoint.chatId");

class TelegramService {
  constructor() {
    // Per-chat send queues to respect Telegram's ~1 msg/sec/chat rate limit.
    this._queues = new Map(); // chat_id -> { jobs: [], running: bool }
    this._MIN_GAP_MS = 1100; // ~1 msg/sec per chat (a little headroom)
    this._MAX_QUEUE = 100; // cap per-chat backlog to bound memory during bursts
  }

  async sendMessage(message) {
    try {
      await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown",
      });
    } catch (error) {
      console.error("❌ Telegram sendMessage error:", error.message);
    }
  }

  // Resolve the incident Telegram bot+channel for an admin. Admin-specific
  // only: BOTH the admin's telegramBotToken and telegramChatId must be set,
  // otherwise returns empty (this admin gets no Telegram alert — no global
  // fallback). Pass the admin's _id or user_id.
  async _resolveIncidentTelegram(adminId) {
    if (!adminId) return { token: "", chat: "" };
    try {
      const isObjectId = /^[a-f\d]{24}$/i.test(String(adminId));
      const query = isObjectId ? { _id: adminId } : { user_id: String(adminId) };
      const admin = await adminModel.findOne(query).select("telegramBotToken telegramChatId").lean();
      return {
        token: admin?.telegramBotToken || "",
        chat: admin?.telegramChatId || "",
      };
    } catch (err) {
      logger.error(`[TELEGRAM] Failed to resolve admin telegram for ${adminId}`, err.message);
      return { token: "", chat: "" };
    }
  }

  // Enqueue an incident alert for the admin's own Telegram channel. Only sends
  // if the admin has BOTH telegramBotToken and telegramChatId configured;
  // otherwise silently skips (no global fallback). Fire-and-forget: the alert
  // flow is never blocked or crashed by Telegram — sends are queued per chat and
  // rate-limited to respect Telegram's ~1 msg/sec/chat limit (avoids 429 storms).
  async sendIncident(incident, nvrData = {}, channelData = {}, adminId = null) {
    try {
      const { token, chat } = await this._resolveIncidentTelegram(adminId);
      if (!token || !chat) return; // admin has no bot/channel configured
      const message = buildIncidentTelegramMessage(incident, nvrData, channelData);
      const imageUrl = buildIncidentImageUrl(incident);
      this._enqueue(chat, { token, chat, message, imageUrl });
    } catch (err) {
      logger.error(`[TELEGRAM] sendIncident enqueue error: ${err?.message || err}`);
    }
  }

  // Add a job to the per-chat queue and start the worker if idle. Caps the queue
  // so a burst of incidents can't grow memory unbounded (drops oldest).
  _enqueue(chat, job) {
    let q = this._queues.get(chat);
    if (!q) {
      q = { jobs: [], running: false };
      this._queues.set(chat, q);
    }
    if (q.jobs.length >= this._MAX_QUEUE) {
      q.jobs.shift(); // drop oldest to bound memory
      logger.warn(`[TELEGRAM] queue full for ${chat} — dropped oldest alert`);
    }
    q.jobs.push(job);
    if (!q.running) this._drain(chat, q);
  }

  // Process one chat's queue serially, pacing sends and honoring retry_after.
  async _drain(chat, q) {
    q.running = true;
    while (q.jobs.length) {
      const job = q.jobs.shift();
      await this._deliver(job);
      // Pace to stay under Telegram's ~1 msg/sec per-chat limit.
      await new Promise((r) => setTimeout(r, this._MIN_GAP_MS));
    }
    q.running = false;
  }

  // Deliver one job: sendPhoto (with caption) or sendMessage. Retries once on a
  // 429 after retry_after. Falls back to text only on a non-429 photo error.
  async _deliver(job, isRetry = false) {
    const { token, chat, message, imageUrl } = job;
    try {
      if (imageUrl) {
        // Caption capped at 1024; drop a trailing lone backslash so we never cut
        // mid-escape (would break MarkdownV2).
        let caption = message.slice(0, 1024);
        const trailing = caption.length - caption.replace(/\\+$/, "").length;
        if (trailing % 2 === 1) caption = caption.slice(0, -1);
        await axios.post(`https://api.telegram.org/bot${token}/sendPhoto`, {
          chat_id: chat,
          photo: imageUrl,
          caption,
          parse_mode: "MarkdownV2",
        });
      } else {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
          chat_id: chat,
          text: message,
          parse_mode: "MarkdownV2",
          disable_web_page_preview: false,
        });
      }
    } catch (error) {
      const data = error?.response?.data;
      // 429: wait the requested time and retry ONCE (don't also fire fallback —
      // that doubles the request rate and worsens throttling).
      if (data?.error_code === 429 && !isRetry) {
        const wait = ((data?.parameters?.retry_after || 1) + 1) * 1000;
        logger.warn(`[TELEGRAM] 429 for ${chat} — retrying after ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
        return this._deliver(job, true);
      }
      const reason = data ? JSON.stringify(data) : error?.message || String(error);
      logger.error(`[TELEGRAM] Failed to send incident: ${reason}`);
      // Fall back to plain text only if the PHOTO failed for a non-429 reason
      // (e.g. Telegram couldn't fetch the image URL).
      if (imageUrl && data?.error_code !== 429) {
        try {
          await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chat,
            text: message,
            parse_mode: "MarkdownV2",
            disable_web_page_preview: false,
          });
        } catch (fbErr) {
          const fbReason = fbErr?.response?.data
            ? JSON.stringify(fbErr.response.data)
            : fbErr?.message || String(fbErr);
          logger.error(`[TELEGRAM] Fallback text also failed: ${fbReason}`);
        }
      }
    }
  }

  async sendDomainRegistration(domainName, ip, port) {
    const message = `
        🌐 *New Domain Registration*
        Domain: ${domainName}
        IP: ${ip}
        Port: ${port}
        Date: ${new Date().toLocaleString()}
    `;
    await this.sendMessage(message);
  }
}

export default new TelegramService();
