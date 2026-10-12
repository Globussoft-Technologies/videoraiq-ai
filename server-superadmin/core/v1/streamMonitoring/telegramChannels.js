import config from "config";

export const telegramBotToken = () => config.has("Telegram.botToken")
  ? config.get("Telegram.botToken") : config.has("domainPoint.botToken") ? config.get("domainPoint.botToken") : "";
export const telegramBotUsername = () => config.has("Telegram.botUsername")
  ? config.get("Telegram.botUsername") : "@VideoraIQDEVAlertsbot";

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

