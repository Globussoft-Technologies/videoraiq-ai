import config from "config";
import axios from "axios";
import { randomBytes } from "node:crypto";
import logger from "../utils/logger.js";
import SuperAdmin from "../core/v1/superAdmin/superAdmin.model.js";
import StagingTelegramLink from "../core/v1/telegram/telegram.model.js";
import { SuperAdminTelegramRecipient } from "../core/v1/streamMonitoring/telegramModels.js";
import { telegramChannels, telegramBotToken } from "../core/v1/streamMonitoring/telegramChannels.js";
import { requestStreamTelegramReport } from "../core/v1/streamMonitoring/telegramSender.js";
const botToken = config.get("domainPoint.botToken");
const chatId = config.get("domainPoint.chatId");

const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };

class TelegramService {
  async getSuperAdminLinkCode(ownerId) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const previous = await SuperAdminTelegramRecipient.findById(ownerId).lean();
      if (/^VRIQ-SA-[0-9A-F]{16}$/.test(previous?.telegramLinkCode || "")) {
        requestStreamTelegramReport();
        return previous;
      }
      const code = "VRIQ-SA-" + randomBytes(8).toString("hex").toUpperCase();
      try {
        const recipient = await SuperAdminTelegramRecipient.findOneAndUpdate({
          _id: ownerId, telegramLinkCode: previous?.telegramLinkCode ?? null,
        }, { $set: { telegramLinkCode: code } }, { upsert: !previous, new: true, runValidators: true }).lean();
        if (!recipient) continue;
        requestStreamTelegramReport();
        return recipient;
      } catch (error) { if (error.code !== 11000) throw error; }
    }
    throw Object.assign(new Error("Channel connection changed. Please refresh and try again"), { status: 409 });
  }

  async selectSuperAdminChannel(ownerId, chatId) {
    const previous = await SuperAdminTelegramRecipient.findById(ownerId).lean();
    if (typeof chatId !== "string" || !telegramChannels(previous || {}).some(channel => channel.chatId === chatId))
      invalid("Channel is not connected to this superadmin");
    const recipient = await SuperAdminTelegramRecipient.findOneAndUpdate({ _id: ownerId,
      $or: [{ telegramChannels: { $elemMatch: { chatId, active: { $ne: false } } } }, { telegramChatId: chatId }] },
    { $set: { selectedChatId: chatId, selectionChangedAt: new Date() } }, { new: true }).lean();
    if (!recipient) invalid("Channel is no longer connected. Please refresh");
    requestStreamTelegramReport();
    return recipient;
  }

  async unlinkSuperAdminChannel(ownerId, chatId) {
    const recipient = await SuperAdminTelegramRecipient.findById(ownerId).lean();
    if (typeof chatId !== "string" || !telegramChannels(recipient || {}).some(channel => channel.chatId === chatId))
      invalid("Channel is not connected to this superadmin");
    const remaining = (recipient.telegramChannels || []).filter(channel => String(channel.chatId) !== chatId);
    const primary = remaining.find(channel => channel.active !== false);
    await SuperAdminTelegramRecipient.updateOne({ _id: ownerId }, {
      $pull: { telegramChannels: { chatId } },
      $set: { telegramLinkCode: null, telegramChatId: primary?.chatId || null, telegramChatTitle: primary?.title || null,
        telegramChatUsername: primary?.username || null, telegramChatType: primary?.chatType || null },
    });
    const updated = await SuperAdminTelegramRecipient.findById(ownerId).lean();
    await SuperAdminTelegramRecipient.updateOne({ _id: ownerId, selectedChatId: chatId },
      { $set: { selectedChatId: telegramChannels(updated || {})[0]?.chatId || null, selectionChangedAt: new Date() } });
    // The shared bot stays in the channel, preserving staging's existing alerts.
    requestStreamTelegramReport();
    return await SuperAdminTelegramRecipient.findById(ownerId).lean();
  }

  async _postLinkMessage(chatId, text, parseMode) {
    const token = telegramBotToken();
    if (!token) throw new Error("Telegram bot is not configured");
    try {
      const response = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`,
        { chat_id: chatId, text, ...(parseMode ? { parse_mode: parseMode } : {}) },
        { timeout: 5000, maxRedirects: 0, maxContentLength: 1_000_000 });
      if (response.data?.ok === true) return true;
      if ([400, 403].includes(response.data?.error_code)) return false;
    } catch (error) {
      const code = error.response?.data?.error_code || error.response?.status;
      if ([400, 403].includes(code)) return false;
    }
    // Do not expose axios URLs or the shared bot token to callers or logs.
    throw new Error("Telegram connection temporarily unavailable");
  }

  _stagingChannels(admin) {
    const source = [...(admin.telegramChannels || [])];
    if (admin.telegramChatId && !source.some(channel => String(channel.chatId) === String(admin.telegramChatId)))
      source.push({ chatId: admin.telegramChatId, title: admin.telegramChatTitle,
        username: admin.telegramChatUsername, chatType: admin.telegramChatType });
    const seen = new Set();
    return source.filter(channel => {
      const id = channel.chatId && String(channel.chatId);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    }).map(channel => ({ chatId: String(channel.chatId), title: channel.channelTitle ?? channel.title ?? null,
      username: channel.channelUsername ?? channel.username ?? null, chatType: channel.chatType ?? null,
      active: channel.active !== false, linkedAt: channel.linkedAt || new Date(), disconnectedAt: channel.disconnectedAt || null }));
  }

  async _bindSuperAdmin(msg, code) {
    const chat = msg.chat;
    if (chat?.type !== "channel" || !Number.isSafeInteger(chat.id) || chat.id >= 0)
      return { ok: true, matched: false };
    const recipient = await SuperAdminTelegramRecipient.findOne({ telegramLinkCode: code }).lean();
    if (!recipient || !await SuperAdmin.findById(recipient._id).select("_id").lean())
      return { ok: true, matched: false };
    const chatId = String(chat.id);
    const existing = recipient.telegramChannels?.find(channel => String(channel.chatId) === chatId);
    const channel = { chatId, title: chat.title || null, username: chat.username || null,
      chatType: chat.type, active: true, linkedAt: existing?.linkedAt || new Date(), disconnectedAt: null };
    if (!await this._postLinkMessage(chatId,
      "This channel is now linked. Streaming-down alerts will arrive here every minute while streams remain down."))
      return { ok: true, matched: false };
    const result = await SuperAdminTelegramRecipient.collection.updateOne(
      { _id: recipient._id, telegramLinkCode: code }, [{ $set: {
        telegramChannels: { $concatArrays: [
          { $filter: { input: { $ifNull: ["$telegramChannels", []] }, as: "channel",
            cond: { $ne: ["$$channel.chatId", { $literal: chatId }] } } },
          { $literal: [channel] },
        ] },
        telegramLinkCode: null, selectedChatId: { $literal: chatId }, selectionChangedAt: new Date(),
      } }]);
    if (result.modifiedCount === 1) requestStreamTelegramReport();
    return { ok: true, matched: result.modifiedCount === 1 };
  }

  async _bindStaging(msg, code) {
    const chat = msg.chat;
    if (!chat?.id) return { ok: true, matched: false };
    const chatId = String(chat.id);
    const candidate = await StagingTelegramLink.findOne({ telegramLinkCode: code }).lean();
    if (!candidate) {
      await this._postLinkMessage(chatId,
        "This link code has expired or is already used. Please copy the latest code from VideoeraIQ and try again.");
      return { ok: true, matched: false };
    }
    if (!await this._postLinkMessage(chatId,
      "This channel is now linked\\. Incident alerts will arrive here\\.", "MarkdownV2"))
      return { ok: true, matched: false };
    const privateName = [chat.first_name, chat.last_name].filter(Boolean).join(" ").trim();
    const channels = this._stagingChannels(candidate);
    const existingIndex = channels.findIndex(channel => channel.chatId === chatId);
    const channel = { chatId, title: chat.title || privateName || (chat.username ? `@${chat.username}` : null),
      username: chat.username || null, chatType: chat.type || null, active: true,
      linkedAt: existingIndex >= 0 ? channels[existingIndex].linkedAt : new Date(), disconnectedAt: null };
    if (existingIndex >= 0) channels[existingIndex] = channel;
    else channels.push(channel);
    const primary = channels[0];
    const admin = await StagingTelegramLink.findOneAndUpdate({ _id: candidate._id, telegramLinkCode: code },
      { $set: { telegramChatId: primary?.chatId || chatId,
        telegramChatTitle: primary?.title || channel.title,
        telegramChatUsername: primary?.username || channel.username,
        telegramChatType: primary?.chatType || channel.chatType,
        telegramChannels: channels, telegramLinkCode: null } }, { new: false }).select("_id").lean();
    return { ok: true, matched: !!admin, ...(admin ? {
      adminId: String(admin._id), chatId, channelName: channel.title } : {}) };
  }

  async handleUpdate(update) {
    const msg = update?.channel_post || update?.message || update?.edited_channel_post || update?.edited_message;
    if (!msg) return { ok: true, matched: false };
    const code = String(msg.text || msg.caption || "").trim().toUpperCase();
    try {
      if (/^VRIQ-SA-[0-9A-F]{16}$/.test(code)) return await this._bindSuperAdmin(msg, code);
      if (/^VRIQ-[0-9A-F]{8}$/.test(code)) return await this._bindStaging(msg, code);
      return { ok: true, matched: false };
    } catch {
      logger.warn("[TELEGRAM] webhook processing failed; Telegram may retry");
      throw new Error("Telegram webhook temporarily unavailable");
    }
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
