import config from "config";
import axios from "axios";
import crypto from "crypto";
import logger from "../utils/logger.js";
import adminModel from "../core/v1/admin/admin.model.js";
import { buildIncidentTelegramMessage, buildIncidentImageUrl } from "../messagingService/message.helper.js";
const botToken = config.get("domainPoint.botToken");
const chatId = config.get("domainPoint.chatId");

// Shared platform bot used for the one-bot linking flow (Option A). Falls back
// to domainPoint.botToken if a dedicated Telegram.botToken isn't configured.
const platformBotToken = config.has("Telegram.botToken")
  ? config.get("Telegram.botToken")
  : botToken;

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

  // Resolve the incident Telegram bot+channel for an admin. Uses the shared
  // platform bot by default (one-bot model) and the admin's own bot token only
  // if they set one (override, backward compatible). telegramChatId must be set
  // (bound via the linking flow) or this admin gets no Telegram alert. Pass the
  // admin's _id or user_id.
  async _resolveIncidentTelegram(adminId) {
    if (!adminId) return { token: "", chat: "" };
    try {
      const isObjectId = /^[a-f\d]{24}$/i.test(String(adminId));
      const query = isObjectId ? { _id: adminId } : { user_id: String(adminId) };
      const admin = await adminModel.findOne(query).select("telegramChatId").lean();
      // One-bot model: the platform bot token comes from config/env and is the
      // single source of truth. Changing Telegram.botToken in env applies to
      // every admin immediately — no stale per-admin token can override it.
      return {
        token: platformBotToken || "",
        chat: admin?.telegramChatId || "",
      };
    } catch (err) {
      logger.error(`[TELEGRAM] Failed to resolve admin telegram for ${adminId}`, err.message);
      return { token: "", chat: "" };
    }
  }

  // --- One-bot linking (Option A) -----------------------------------------

  // Return (creating if needed) the stable verification code for an admin. The
  // client posts this in their channel after adding the platform bot as admin.
  async getLinkCode(adminId) {
    const isObjectId = /^[a-f\d]{24}$/i.test(String(adminId));
    const query = isObjectId ? { _id: adminId } : { user_id: String(adminId) };
    const admin = await adminModel.findOne(query).select("telegramLinkCode telegramChatId").lean();
    if (!admin) return null;
    if (admin.telegramLinkCode) {
      return { code: admin.telegramLinkCode, linked: !!admin.telegramChatId, chatId: admin.telegramChatId || null };
    }
    // No active code (never generated, or consumed after a successful link).
    // Generate a fresh single-use code, but report the real link status —
    // telegramChatId may already be set from a prior link.
    const code = `VRIQ-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    await adminModel.updateOne({ _id: admin._id }, { $set: { telegramLinkCode: code } });
    return { code, linked: !!admin.telegramChatId, chatId: admin.telegramChatId || null };
  }

  // Unlink: clear the bound channel + rotate the code, and make the bot leave
  // the channel so it no longer sits there with admin rights. Reading the old
  // chatId BEFORE nulling it lets us call leaveChat. The leaveChat is
  // fire-and-forget — a Telegram failure must never fail the unlink.
  async unlink(adminId) {
    const isObjectId = /^[a-f\d]{24}$/i.test(String(adminId));
    const query = isObjectId ? { _id: adminId } : { user_id: String(adminId) };

    const admin = await adminModel
      .findOne(query)
      .select("telegramChatId")
      .lean();

    const res = await adminModel.updateOne(query, {
      $set: { telegramChatId: null, telegramLinkCode: null },
    });

    // Ask Telegram to remove the bot from the channel (best-effort). Always the
    // env platform bot (single source of truth).
    const oldChatId = admin?.telegramChatId;
    if (oldChatId) {
      axios
        .post(`https://api.telegram.org/bot${platformBotToken}/leaveChat`, { chat_id: oldChatId })
        .catch((err) =>
          logger.error(
            `[TELEGRAM] leaveChat failed for ${oldChatId}: ${err?.response?.data ? JSON.stringify(err.response.data) : err.message}`,
          ),
        );
    }

    return res.modifiedCount > 0;
  }

  // Return the code ONLY if the message is exactly "VRIQ-XXXXXXXX" (8 hex,
  // case-insensitive), ignoring surrounding whitespace. The whole message must
  // be the code — anything else (extra chars like "VRIQ-9961072B222", or a code
  // buried in a sentence) is rejected, so only the exact generated key links.
  _extractLinkCode(text) {
    if (!text) return null;
    const m = String(text).trim().toUpperCase().match(/^VRIQ-[0-9A-F]{8}$/);
    return m ? m[0] : null;
  }

  // Webhook handler. When the client posts their code in the channel (or DMs the
  // bot), Telegram delivers the update here: it carries the code (-> which admin)
  // AND the chat_id (-> which channel). Bind them. Best-effort, never throws.
  async handleUpdate(update) {
    try {
      // Accept channel_post, group message, or a private message to the bot.
      const msg = update?.channel_post || update?.message || update?.edited_channel_post || update?.edited_message;
      if (!msg) return { ok: true, matched: false };

      const code = this._extractLinkCode(msg.text || msg.caption);
      if (!code) return { ok: true, matched: false };

      const chat = msg.chat;
      if (!chat?.id) return { ok: true, matched: false };
      const boundChatId = String(chat.id);

      // The code must belong to an admin before anything is sent to the chat.
      const candidate = await adminModel.findOne({ telegramLinkCode: code }).select("_id").lean();
      if (!candidate) {
        logger.warn(`[TELEGRAM] link code not found or already used: ${code}`);
        return { ok: true, matched: false };
      }

      // Prove the bot can actually post here BEFORE binding — if its post
      // rights were revoked, alerts would silently go nowhere while the
      // dashboard shows "connected". The confirmation message doubles as the
      // probe; on failure the code stays active so the client can fix the
      // bot's permissions and post it again.
      try {
        await axios.post(`https://api.telegram.org/bot${platformBotToken}/sendMessage`, {
          chat_id: boundChatId,
          text: "✅ This channel is now linked\\. Incident alerts will arrive here\\.",
          parse_mode: "MarkdownV2",
        });
      } catch (sendErr) {
        const reason = sendErr?.response?.data
          ? JSON.stringify(sendErr.response.data)
          : sendErr?.message || String(sendErr);
        logger.warn(`[TELEGRAM] link rejected for chat ${boundChatId} — bot cannot post: ${reason}`);
        return { ok: true, matched: false };
      }

      // Match AND consume the code atomically: only bind if this exact code is
      // still active, and clear it in the same write so it becomes single-use.
      // Prevents a leaked/re-posted code from re-binding another channel later.
      const admin = await adminModel.findOneAndUpdate(
        { telegramLinkCode: code },
        { $set: { telegramChatId: boundChatId, telegramLinkCode: null } },
        { new: false },
      ).select("_id").lean();
      if (!admin) {
        logger.warn(`[TELEGRAM] link code not found or already used: ${code}`);
        return { ok: true, matched: false };
      }

      logger.info(`[TELEGRAM] linked admin ${admin._id} -> chat ${boundChatId}`);

      return { ok: true, matched: true, adminId: String(admin._id), chatId: boundChatId };
    } catch (err) {
      logger.error(`[TELEGRAM] handleUpdate error: ${err?.message || err}`);
      return { ok: true, matched: false };
    }
  }

  // Enqueue an incident alert for the admin's own Telegram channel. Only sends
  // if the admin has BOTH telegramBotToken and telegramChatId configured;
  // otherwise silently skips (no global fallback). Fire-and-forget: the alert
  // flow is never blocked or crashed by Telegram — sends are queued per chat and
  // rate-limited to respect Telegram's ~1 msg/sec/chat limit (avoids 429 storms).
  async sendIncident(incident, nvrData = {}, channelData = {}, adminId = null, timezone = null) {
    try {
      const { token, chat } = await this._resolveIncidentTelegram(adminId);
      if (!token || !chat) return; // admin has no bot/channel configured
      const message = buildIncidentTelegramMessage(incident, nvrData, channelData, timezone);
      const imageUrl = buildIncidentImageUrl(incident);
      // Makes "why was this alert text-only" diagnosable: no Image on the
      // incident means the alert can never carry a photo.
      if (!imageUrl) {
        logger.warn(`[TELEGRAM] incident ${incident?._id} has no Image — sending text-only alert`);
      }
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
      logger.error(`[TELEGRAM] Failed to send incident to ${chat}: ${reason}`);
      // A dead/unknown chat will never work — clear the stale binding so we stop
      // erroring on every future incident (self-heals; the admin re-links).
      if (this._isDeadChatError(data)) {
        await this._clearDeadChat(chat);
        return; // no point trying the text fallback to the same dead chat
      }
      // Telegram fetches imageUrl itself, and a just-created snapshot may not
      // be downloadable yet (upload race). Retry the photo ONCE after a short
      // delay before degrading the alert to text.
      if (imageUrl && this._isPhotoFetchError(data) && !job._photoRetried) {
        job._photoRetried = true;
        logger.warn(`[TELEGRAM] photo fetch failed for ${chat} — retrying photo in 3s`);
        await new Promise((r) => setTimeout(r, 3000));
        return this._deliver(job, isRetry);
      }
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
          const fbData = fbErr?.response?.data;
          const fbReason = fbData ? JSON.stringify(fbData) : fbErr?.message || String(fbErr);
          logger.error(`[TELEGRAM] Fallback text also failed for ${chat}: ${fbReason}`);
          if (this._isDeadChatError(fbData)) await this._clearDeadChat(chat);
        }
      }
    }
  }

  // Telegram errors that mean it couldn't download the photo URL (file not
  // there yet / bad content type) — worth one retry before the text fallback.
  _isPhotoFetchError(data) {
    const d = String(data?.description || "").toLowerCase();
    return (
      data?.error_code === 400 &&
      (d.includes("failed to get http url content") ||
        d.includes("wrong file identifier") ||
        d.includes("wrong type of the web page content"))
    );
  }

  // Telegram errors that mean the chat is permanently unusable (bot removed,
  // channel deleted, wrong id) — as opposed to transient issues.
  _isDeadChatError(data) {
    const d = String(data?.description || "").toLowerCase();
    return (
      data?.error_code === 400 &&
      (d.includes("chat not found") ||
        d.includes("bot was kicked") ||
        d.includes("bot is not a member") ||
        d.includes("chat was deleted"))
    );
  }

  // Null out a stale telegramChatId so incidents stop targeting a dead chat.
  async _clearDeadChat(chat) {
    try {
      const res = await adminModel.updateOne(
        { telegramChatId: String(chat) },
        { $set: { telegramChatId: null } },
      );
      if (res.modifiedCount > 0) {
        logger.warn(`[TELEGRAM] cleared stale telegramChatId ${chat} (chat unreachable)`);
      }
    } catch (err) {
      logger.error(`[TELEGRAM] failed to clear stale chat ${chat}: ${err?.message}`);
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
