import config from "config";
import axios from "axios";
import crypto from "crypto";
import logger from "../utils/logger.js";
import adminModel from "../core/v1/admin/admin.model.js";
import {
  buildIncidentTelegramMessage,
  buildIncidentImageUrl,
} from "../messagingService/message.helper.js";

const botToken = config.get("domainPoint.botToken");
const chatId = config.get("domainPoint.chatId");

// Shared platform bot used for the one-bot linking flow (Option A). Falls back
// to domainPoint.botToken if a dedicated Telegram.botToken isn't configured.
const platformBotToken = config.has("Telegram.botToken")
  ? config.get("Telegram.botToken")
  : botToken;

class TelegramService {
  constructor() {
    this._queues = new Map();
    this._MIN_GAP_MS = 1100;
    this._MAX_QUEUE = 100;
    this._PHOTO_RETRY_DELAYS_MS = [3000, 15000];
  }

  async sendMessage(message) {
    try {
      await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown",
      });
    } catch (error) {
      console.error("Telegram sendMessage error:", error.message);
    }
  }

  _chatMetadata(chat = {}) {
    const privateName = [chat.first_name, chat.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();

    return {
      telegramChatTitle:
        chat.title || privateName || (chat.username ? `@${chat.username}` : null),
      telegramChatUsername: chat.username || null,
      telegramChatType: chat.type || null,
    };
  }

  _normalizeChannel(channel = {}) {
    if (!channel?.chatId) return null;

    const chatIdValue = String(channel.chatId);
    const channelTitle = channel.channelTitle ?? channel.title ?? null;
    const channelUsername = channel.channelUsername ?? channel.username ?? null;
    const chatType = channel.chatType ?? null;
    const active = channel.active !== false;
    const linkedAt = channel.linkedAt || null;
    const disconnectedAt = channel.disconnectedAt || null;

    return {
      chatId: chatIdValue,
      channelName: channelTitle || (channelUsername ? `@${channelUsername}` : null),
      channelTitle,
      channelUsername,
      chatType,
      active,
      linkedAt,
      disconnectedAt,
    };
  }

  _legacyChannel(admin = {}) {
    if (!admin?.telegramChatId) return null;

    return this._normalizeChannel({
      chatId: admin.telegramChatId,
      title: admin.telegramChatTitle || null,
      username: admin.telegramChatUsername || null,
      chatType: admin.telegramChatType || null,
    });
  }

  _extractChannels(admin = {}) {
    const seen = new Set();
    const channels = [];

    for (const channel of admin.telegramChannels || []) {
      const normalized = this._normalizeChannel(channel);
      if (!normalized || seen.has(normalized.chatId)) continue;
      seen.add(normalized.chatId);
      channels.push(normalized);
    }

    const legacy = this._legacyChannel(admin);
    if (legacy && !seen.has(legacy.chatId)) {
      channels.push(legacy);
    }

    return channels;
  }

  _serializeChannels(channels = []) {
    return channels.map((channel) => ({
      chatId: channel.chatId,
      title: channel.channelTitle || null,
      username: channel.channelUsername || null,
      chatType: channel.chatType || null,
      active: channel.active !== false,
      linkedAt: channel.linkedAt || new Date(),
      disconnectedAt: channel.disconnectedAt || null,
    }));
  }

  _buildLinkStatus(admin = {}) {
    const channels = this._extractChannels(admin);
    const linkedChannels = channels.filter((channel) => channel.active !== false);
    const primary = linkedChannels[0] || null;

    return {
      linked: linkedChannels.length > 0,
      chatId: primary?.chatId || null,
      channelName: primary?.channelName || null,
      channelTitle: primary?.channelTitle || null,
      channelUsername: primary?.channelUsername || null,
      chatType: primary?.chatType || null,
      linkedChannels: channels,
    };
  }

  async _syncChannelState(adminId, channels, { clearCode = false } = {}) {
    const activeChannels = channels.filter((channel) => channel.active !== false);
    const primary = activeChannels[0] || null;
    const setPayload = {
      telegramChatId: primary?.chatId || null,
      telegramChatTitle: primary?.channelTitle || null,
      telegramChatUsername: primary?.channelUsername || null,
      telegramChatType: primary?.chatType || null,
      telegramChannels: this._serializeChannels(channels),
    };

    if (clearCode) {
      setPayload.telegramLinkCode = null;
    }

    await adminModel.updateOne({ _id: adminId }, { $set: setPayload });
  }

  async _ensureChannels(admin) {
    if (!admin?._id) return admin;

    const channels = this._extractChannels(admin);
    const storedCount = Array.isArray(admin.telegramChannels)
      ? admin.telegramChannels.length
      : 0;

    if (channels.length > 0 && storedCount !== channels.length) {
      await this._syncChannelState(admin._id, channels);
    }

    return {
      ...admin,
      telegramChannels: this._serializeChannels(channels),
      ...this._buildLinkStatus({ ...admin, telegramChannels: channels }),
    };
  }

  async _resolveIncidentTelegram(adminId) {
    if (!adminId) return { token: "", chats: [] };

    try {
      const isObjectId = /^[a-f\d]{24}$/i.test(String(adminId));
      const query = isObjectId ? { _id: adminId } : { user_id: String(adminId) };
      let admin = await adminModel
        .findOne(query)
        .select(
          "telegramChatId telegramChatTitle telegramChatUsername telegramChatType telegramChannels",
        )
        .lean();

      admin = await this._ensureChannels(admin);
      const chats = this._extractChannels(admin)
        .filter((channel) => channel.active !== false)
        .map((channel) => channel.chatId);

      return {
        token: platformBotToken || "",
        chats,
      };
    } catch (err) {
      logger.error(
        `[TELEGRAM] Failed to resolve admin telegram for ${adminId}`,
        err.message,
      );
      return { token: "", chats: [] };
    }
  }

  async _resolveSelectedIncidentTelegram(adminId, preferredChatIds = []) {
    const { token, chats } = await this._resolveIncidentTelegram(adminId);
    const preferred = new Set(
      (Array.isArray(preferredChatIds) ? preferredChatIds : [preferredChatIds])
        .map((chatId) => String(chatId || "").trim())
        .filter(Boolean),
    );

    if (!token || !chats?.length) {
      logger.warn(`[TELEGRAM_TRACE] No active telegram chats resolved`, {
        adminId: adminId ? String(adminId) : null,
        preferredChatIds: [...preferred],
        resolvedChats: chats || [],
        hasToken: Boolean(token),
      });
      return { token: "", chats: [] };
    }

    if (!preferred.size) {
      logger.info(`[TELEGRAM_TRACE] No preferred telegram chats selected for this alert`, {
        adminId: adminId ? String(adminId) : null,
        resolvedChats: chats,
      });
      return { token: "", chats: [] };
    }

    const targetedChats = chats.filter((chatId) => preferred.has(String(chatId)));

    logger.info(`[TELEGRAM_TRACE] Resolved preferred telegram chats`, {
      adminId: adminId ? String(adminId) : null,
      preferredChatIds: [...preferred],
      resolvedChats: chats,
      matchedChats: targetedChats,
      fallbackToAllChats: false,
      finalChats: targetedChats,
    });

    if (!targetedChats.length) {
      logger.warn(`[TELEGRAM_TRACE] Preferred telegram chats did not match any active linked chats`, {
        adminId: adminId ? String(adminId) : null,
        preferredChatIds: [...preferred],
        resolvedChats: chats,
      });
      return { token: "", chats: [] };
    }

    return { token, chats: targetedChats };
  }

  async getLinkCode(adminId) {
    const isObjectId = /^[a-f\d]{24}$/i.test(String(adminId));
    const query = isObjectId ? { _id: adminId } : { user_id: String(adminId) };
    let admin = await adminModel
      .findOne(query)
      .select(
        "telegramLinkCode telegramChatId telegramChatTitle telegramChatUsername telegramChatType telegramChannels",
      )
      .lean();

    if (!admin) return null;

    admin = await this._ensureChannels(admin);

    for (const channel of this._extractChannels(admin)) {
      if (channel.channelName) continue;
      admin = await this._backfillChatMetadata({
        ...admin,
        telegramChatId: channel.chatId,
      });
    }

    admin = await this._ensureChannels(admin);
    const linkStatus = this._buildLinkStatus(admin);

    if (admin.telegramLinkCode) {
      return { code: admin.telegramLinkCode, ...linkStatus };
    }

    const code = `VRIQ-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    await adminModel.updateOne({ _id: admin._id }, { $set: { telegramLinkCode: code } });
    return { code, ...linkStatus };
  }

  async _backfillChatMetadata(admin) {
    try {
      const response = await axios.post(
        `https://api.telegram.org/bot${platformBotToken}/getChat`,
        {
          chat_id: admin.telegramChatId,
        },
      );
      const chat = response?.data?.result;
      if (!chat) return admin;

      const metadata = this._chatMetadata(chat);
      const updatedChannels = this._extractChannels(admin).map((channel) =>
        channel.chatId === String(admin.telegramChatId)
          ? {
              ...channel,
              channelName:
                metadata.telegramChatTitle ||
                (metadata.telegramChatUsername
                  ? `@${metadata.telegramChatUsername}`
                  : null),
              channelTitle: metadata.telegramChatTitle,
              channelUsername: metadata.telegramChatUsername,
              chatType: metadata.telegramChatType,
              active: channel.active !== false,
              disconnectedAt: channel.disconnectedAt || null,
            }
          : channel,
      );

      await this._syncChannelState(admin._id, updatedChannels);

      return {
        ...admin,
        ...metadata,
        telegramChannels: this._serializeChannels(updatedChannels),
      };
    } catch (err) {
      logger.warn(
        `[TELEGRAM] could not backfill chat metadata for ${admin.telegramChatId}: ${
          err?.message || err
        }`,
      );
      return admin;
    }
  }

  async unlink(adminId, chatIdToRemove = null) {
    const isObjectId = /^[a-f\d]{24}$/i.test(String(adminId));
    const query = isObjectId ? { _id: adminId } : { user_id: String(adminId) };

    const admin = await adminModel
      .findOne(query)
      .select(
        "telegramChatId telegramChatTitle telegramChatUsername telegramChatType telegramChannels",
      )
      .lean();

    if (!admin) return false;

    const allChannels = this._extractChannels(admin);
    const targetChatId = chatIdToRemove ? String(chatIdToRemove) : null;
    const disconnectedChannels = targetChatId
      ? allChannels.filter((channel) => channel.chatId === targetChatId)
      : allChannels;
    const nextChannels = allChannels.map((channel) => {
      if (targetChatId && channel.chatId !== targetChatId) {
        return channel;
      }
      return {
        ...channel,
        active: false,
        disconnectedAt: new Date(),
      };
    });

    await this._syncChannelState(admin._id, nextChannels, { clearCode: true });

    for (const channel of disconnectedChannels) {
      axios
        .post(`https://api.telegram.org/bot${platformBotToken}/leaveChat`, {
          chat_id: channel.chatId,
        })
        .catch((err) =>
          logger.error(
            `[TELEGRAM] leaveChat failed for ${channel.chatId}: ${
              err?.response?.data
                ? JSON.stringify(err.response.data)
                : err.message
            }`,
          ),
        );
    }

    return true;
  }

  _extractLinkCode(text) {
    if (!text) return null;
    const match = String(text).trim().toUpperCase().match(/^VRIQ-[0-9A-F]{8}$/);
    return match ? match[0] : null;
  }

  async handleUpdate(update) {
    try {
      const msg =
        update?.channel_post ||
        update?.message ||
        update?.edited_channel_post ||
        update?.edited_message;
      if (!msg) return { ok: true, matched: false };

      const code = this._extractLinkCode(msg.text || msg.caption);
      if (!code) return { ok: true, matched: false };

      const chat = msg.chat;
      if (!chat?.id) return { ok: true, matched: false };

      const boundChatId = String(chat.id);
      const chatMetadata = this._chatMetadata(chat);

      const candidate = await adminModel
        .findOne({ telegramLinkCode: code })
        .select(
          "_id telegramLinkCode telegramChatId telegramChatTitle telegramChatUsername telegramChatType telegramChannels",
        )
        .lean();
      if (!candidate) {
        logger.warn(`[TELEGRAM] link code not found or already used: ${code}`);
        return { ok: true, matched: false };
      }

      try {
        await axios.post(`https://api.telegram.org/bot${platformBotToken}/sendMessage`, {
          chat_id: boundChatId,
          text: "This channel is now linked\\. Incident alerts will arrive here\\.",
          parse_mode: "MarkdownV2",
        });
      } catch (sendErr) {
        const reason = sendErr?.response?.data
          ? JSON.stringify(sendErr.response.data)
          : sendErr?.message || String(sendErr);
        logger.warn(
          `[TELEGRAM] link rejected for chat ${boundChatId} - bot cannot post: ${reason}`,
        );
        return { ok: true, matched: false };
      }

      const channels = this._extractChannels(candidate);
      const linkedChannel = {
        chatId: boundChatId,
        channelTitle: chatMetadata.telegramChatTitle,
        channelUsername: chatMetadata.telegramChatUsername,
        chatType: chatMetadata.telegramChatType,
        channelName:
          chatMetadata.telegramChatTitle ||
          (chatMetadata.telegramChatUsername
            ? `@${chatMetadata.telegramChatUsername}`
            : null),
        active: true,
        linkedAt: new Date(),
        disconnectedAt: null,
      };

      const existingIndex = channels.findIndex(
        (channel) => channel.chatId === boundChatId,
      );

      if (existingIndex >= 0) {
        channels[existingIndex] = {
          ...channels[existingIndex],
          ...linkedChannel,
          linkedAt: channels[existingIndex].linkedAt || linkedChannel.linkedAt,
        };
      } else {
        channels.push(linkedChannel);
      }

      const admin = await adminModel
        .findOneAndUpdate(
          { telegramLinkCode: code },
          {
            $set: {
              telegramChatId: channels[0]?.chatId || boundChatId,
              telegramChatTitle:
                channels[0]?.channelTitle || chatMetadata.telegramChatTitle,
              telegramChatUsername:
                channels[0]?.channelUsername ||
                chatMetadata.telegramChatUsername,
              telegramChatType: channels[0]?.chatType || chatMetadata.telegramChatType,
              telegramChannels: this._serializeChannels(channels),
              telegramLinkCode: null,
            },
          },
          { new: false },
        )
        .select("_id")
        .lean();

      if (!admin) {
        logger.warn(`[TELEGRAM] link code not found or already used: ${code}`);
        return { ok: true, matched: false };
      }

      logger.info(`[TELEGRAM] linked admin ${admin._id} -> chat ${boundChatId}`);

      return {
        ok: true,
        matched: true,
        adminId: String(admin._id),
        chatId: boundChatId,
        channelName: linkedChannel.channelName,
      };
    } catch (err) {
      logger.error(`[TELEGRAM] handleUpdate error: ${err?.message || err}`);
      return { ok: true, matched: false };
    }
  }

  async sendIncident(
    incident,
    nvrData = {},
    channelData = {},
    adminId = null,
    timezone = null,
    options = {},
  ) {
    try {
      const { token, chats } = await this._resolveSelectedIncidentTelegram(
        adminId,
        options?.preferredChatIds || [],
      );
      if (!token || !chats?.length) {
        logger.warn(`[TELEGRAM_TRACE] sendIncident skipped - no token/chats`, {
          incidentId: incident?._id ? String(incident._id) : null,
          adminId: adminId ? String(adminId) : null,
          preferredChatIds: options?.preferredChatIds || [],
        });
        return;
      }

      const message = buildIncidentTelegramMessage(
        incident,
        nvrData,
        channelData,
        timezone,
      );
      const imageUrl = buildIncidentImageUrl(incident);

      if (!imageUrl) {
        logger.warn(
          `[TELEGRAM] incident ${incident?._id} has no Image - sending text-only alert`,
        );
      }

      logger.info(`[TELEGRAM_TRACE] Queueing telegram incident`, {
        incidentId: incident?._id ? String(incident._id) : null,
        adminId: adminId ? String(adminId) : null,
        preferredChatIds: options?.preferredChatIds || [],
        targetChats: chats,
        hasImage: Boolean(imageUrl),
      });

      for (const chat of chats) {
        this._enqueue(chat, { token, chat, message, imageUrl });
      }
    } catch (err) {
      logger.error(`[TELEGRAM] sendIncident enqueue error: ${err?.message || err}`);
    }
  }

  _enqueue(chat, job) {
    let queue = this._queues.get(chat);
    if (!queue) {
      queue = { jobs: [], running: false };
      this._queues.set(chat, queue);
    }

    if (queue.jobs.length >= this._MAX_QUEUE) {
      queue.jobs.shift();
      logger.warn(`[TELEGRAM] queue full for ${chat} - dropped oldest alert`);
    }

    queue.jobs.push(job);
    logger.info(`[TELEGRAM_TRACE] Enqueued telegram job`, {
      chat: String(chat),
      pendingJobs: queue.jobs.length,
      hasImage: Boolean(job?.imageUrl),
    });
    if (!queue.running) this._drain(chat, queue);
  }

  async _drain(chat, queue) {
    queue.running = true;
    while (queue.jobs.length) {
      const job = queue.jobs.shift();
      await this._deliver(job);
      await new Promise((resolve) => setTimeout(resolve, this._MIN_GAP_MS));
    }
    queue.running = false;
  }

  async _deliver(job, isRetry = false) {
    const { token, chat, message, imageUrl } = job;

    try {
      if (imageUrl) {
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

      logger.info(`[TELEGRAM_TRACE] Telegram delivery success`, {
        chat: String(chat),
        mode: imageUrl ? "photo" : "text",
        retry: Boolean(isRetry),
      });
    } catch (error) {
      const data = error?.response?.data;

      if (data?.error_code === 429 && !isRetry) {
        const wait = ((data?.parameters?.retry_after || 1) + 1) * 1000;
        logger.warn(`[TELEGRAM] 429 for ${chat} - retrying after ${wait}ms`);
        await new Promise((resolve) => setTimeout(resolve, wait));
        return this._deliver(job, true);
      }

      const reason = data ? JSON.stringify(data) : error?.message || String(error);
      logger.error(
        `[TELEGRAM] Failed to send incident to ${chat}: ${reason}${
          imageUrl ? ` (image: ${imageUrl})` : ""
        }`,
      );

      if (this._isDeadChatError(data)) {
        await this._clearDeadChat(chat);
        return;
      }

      if (imageUrl && this._isPhotoFetchError(data)) {
        const attempt = job._photoAttempt || 0;
        if (attempt < this._PHOTO_RETRY_DELAYS_MS.length) {
          job._photoAttempt = attempt + 1;
          const wait = this._PHOTO_RETRY_DELAYS_MS[attempt];
          logger.warn(
            `[TELEGRAM] photo fetch failed for ${chat} - retry ${attempt + 1}/${this._PHOTO_RETRY_DELAYS_MS.length} in ${
              wait / 1000
            }s`,
          );
          await new Promise((resolve) => setTimeout(resolve, wait));
          return this._deliver(job, isRetry);
        }
      }

      if (imageUrl && data?.error_code !== 429) {
        try {
          await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chat,
            text: message,
            parse_mode: "MarkdownV2",
            disable_web_page_preview: false,
          });
        } catch (fallbackError) {
          const fallbackData = fallbackError?.response?.data;
          const fallbackReason = fallbackData
            ? JSON.stringify(fallbackData)
            : fallbackError?.message || String(fallbackError);
          logger.error(
            `[TELEGRAM] Fallback text also failed for ${chat}: ${fallbackReason}`,
          );
          if (this._isDeadChatError(fallbackData)) {
            await this._clearDeadChat(chat);
          }
        }
      }
    }
  }

  _isPhotoFetchError(data) {
    const description = String(data?.description || "").toLowerCase();
    return (
      data?.error_code === 400 &&
      (description.includes("failed to get http url content") ||
        description.includes("wrong file identifier") ||
        description.includes("wrong type of the web page content"))
    );
  }

  _isDeadChatError(data) {
    const description = String(data?.description || "").toLowerCase();
    return (
      data?.error_code === 400 &&
      (description.includes("chat not found") ||
        description.includes("bot was kicked") ||
        description.includes("bot is not a member") ||
        description.includes("chat was deleted"))
    );
  }

  async _clearDeadChat(chat) {
    try {
      const admin = await adminModel
        .findOne({
          $or: [
            { telegramChatId: String(chat) },
            { "telegramChannels.chatId": String(chat) },
          ],
        })
        .select(
          "_id telegramChatId telegramChatTitle telegramChatUsername telegramChatType telegramChannels",
        )
        .lean();

      if (!admin) return;

      const nextChannels = this._extractChannels(admin).map((channel) =>
        channel.chatId === String(chat)
          ? {
              ...channel,
              active: false,
              disconnectedAt: new Date(),
            }
          : channel,
      );

      await this._syncChannelState(admin._id, nextChannels);
      logger.warn(
        `[TELEGRAM] cleared stale telegram chat ${chat} (chat unreachable)`,
      );
    } catch (err) {
      logger.error(`[TELEGRAM] failed to clear stale chat ${chat}: ${err?.message}`);
    }
  }

  async sendDomainRegistration(domainName, ip, port) {
    const message = `
        *New Domain Registration*
        Domain: ${domainName}
        IP: ${ip}
        Port: ${port}
        Date: ${new Date().toLocaleString()}
    `;
    await this.sendMessage(message);
  }
}

export default new TelegramService();
