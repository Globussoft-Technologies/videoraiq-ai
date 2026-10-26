import config from "config";
import "dotenv/config";
import axios from "axios";

export const telegramBotToken = () => process.env.TELEGRAM_BOT_TOKEN || (config.has("Telegram.botToken")
  ? config.get("Telegram.botToken") : config.has("domainPoint.botToken") ? config.get("domainPoint.botToken") : "");
export const telegramBotUsername = () => config.has("Telegram.botUsername")
  ? config.get("Telegram.botUsername") : "@videraIQAdminbot";

let identityCache;
export async function telegramBotIdentity() {
  const token = telegramBotToken();
  const unavailable = message => Object.assign(new Error(message), { status: 503 });
  if (!token) throw unavailable("Telegram bot is not configured");
  if (!identityCache || identityCache.token !== token || identityCache.expiresAt <= Date.now()) {
    const entry = { token, expiresAt: Date.now() + 300_000 };
    entry.promise = (async () => {
      try {
        const { data } = await axios.get(`https://api.telegram.org/bot${token}/getMe`,
          { timeout: 5000, maxRedirects: 0, maxContentLength: 1_000_000 });
        if (!data?.ok || !data.result?.is_bot || !Number.isSafeInteger(data.result.id) || !data.result.username)
          throw new Error("Invalid bot identity");
        return { id: data.result.id, username: `@${data.result.username}` };
      } catch {
        if (identityCache === entry) identityCache = null;
        throw unavailable("Unable to verify the Telegram bot. Check its token and connection");
      }
    })();
    identityCache = entry;
  }
  const identity = await identityCache.promise;
  const expected = String(telegramBotUsername()).replace(/^@/, "");
  if (identity.username.slice(1).toLowerCase() !== expected.toLowerCase())
    throw unavailable(`Configured token belongs to ${identity.username}; @${expected} is required. Set Telegram.botToken or TELEGRAM_BOT_TOKEN to the correct token`);
  return identity;
}

// Same multi-channel and legacy single-channel normalization as stagingv2.
export function telegramChannels(admin = {}) {
  const channels = [...(admin.telegramChannels || [])];
  if (admin.telegramChatId && !channels.some(channel => String(channel.chatId) === String(admin.telegramChatId))) {
    channels.push({ chatId: admin.telegramChatId, title: admin.telegramChatTitle,
      username: admin.telegramChatUsername, chatType: admin.telegramChatType, active: true });
  }
  const seen = new Set();
  return channels.filter(channel => {
    const id = channel.chatId && String(channel.chatId);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return channel.active !== false;
  }).map(channel => ({ chatId: String(channel.chatId),
    channelName: channel.channelTitle || channel.title || (channel.username ? `@${channel.username}` : String(channel.chatId)),
    linkedAt: channel.linkedAt || null,
  })).sort((a, b) => new Date(b.linkedAt || 0) - new Date(a.linkedAt || 0));
}

export function selectedTelegramChannels(recipient = {}) {
  const channels = telegramChannels(recipient);
  const selected = recipient.selectedChatId || channels[0]?.chatId;
  return channels.filter(channel => channel.chatId === selected);
}

// Monitoring overrides are local; the shared bot/linking records stay unchanged.
export function monitoringChannels(recipient, state) {
  const hidden = state.hiddenChannels[String(recipient._id)] || [];
  return telegramChannels(recipient).filter(channel => !hidden.includes(channel.chatId));
}

export function selectedMonitoringChannel(recipient, state) {
  const channels = monitoringChannels(recipient, state), owner = String(recipient._id);
  const selected = Object.hasOwn(state.selections, owner) ? state.selections[owner]
    : recipient.selectedChatId || channels[0]?.chatId;
  return channels.find(channel => channel.chatId === selected) || null;
}

