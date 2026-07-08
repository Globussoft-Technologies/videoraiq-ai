import config from "config";
import axios from "axios";
import logger from "../utils/logger.js";
import adminModel from "../core/v1/admin/admin.model.js";
import { buildIncidentTelegramMessage, buildIncidentImageUrl } from "../messagingService/message.helper.js";
const botToken = config.get("domainPoint.botToken");
const chatId = config.get("domainPoint.chatId");

class TelegramService {
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

  // Send an incident alert to the admin's own Telegram channel. Only sends if
  // the admin has BOTH telegramBotToken and telegramChatId configured; otherwise
  // silently skips (no global fallback). Never throws — a Telegram outage must
  // not affect the alert flow.
  async sendIncident(incident, nvrData = {}, channelData = {}, adminId = null) {
    const { token, chat } = await this._resolveIncidentTelegram(adminId);
    if (!token || !chat) {
      // Admin hasn't configured their own bot+channel — skip Telegram for them.
      return;
    }
    const message = buildIncidentTelegramMessage(incident, nvrData, channelData);
    const imageUrl = buildIncidentImageUrl(incident);
    try {
      if (imageUrl) {
        // sendPhoto shows the snapshot inline with the details as caption.
        // Telegram caps photo captions at 1024 chars.
        await axios.post(`https://api.telegram.org/bot${token}/sendPhoto`, {
          chat_id: chat,
          photo: imageUrl,
          caption: message.slice(0, 1024),
          parse_mode: "Markdown",
        });
      } else {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
          chat_id: chat,
          text: message,
          parse_mode: "Markdown",
          disable_web_page_preview: false,
        });
      }
    } catch (error) {
      logger.error("[TELEGRAM] Failed to send incident:", error?.response?.data || error.message);
      // If sending the photo failed (e.g. Telegram couldn't fetch the URL),
      // fall back to a plain text message so the alert still goes out.
      if (imageUrl) {
        try {
          await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chat,
            text: message,
            parse_mode: "Markdown",
            disable_web_page_preview: false,
          });
        } catch (fallbackErr) {
          logger.error("[TELEGRAM] Fallback text also failed:", fallbackErr?.response?.data || fallbackErr.message);
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
