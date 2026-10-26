import Response from "../../../utils/response.js";
import { monitoringSettings } from "./settings.js";
import { monitoringStore } from "./localStore.js";
import { readInventory } from "./inventory.js";
import { readMonitoringControl } from "./control.js";
import { telegramChannels, monitoringChannels, selectedMonitoringChannel, telegramBotIdentity } from "./telegramChannels.js";

function handler(action) {
  return async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const settings = monitoringSettings(), snapshot = await readInventory(settings);
      const recipient = snapshot.recipients.find(row => String(row._id) === String(req.superAdmin._id))
        || { _id: String(req.superAdmin._id) };
      const store = monitoringStore(settings);
      if (action) await action(req, recipient, store);
      const state = await store.read(), control = await readMonitoringControl(settings);
      const identity = await telegramBotIdentity();
      res.send(Response.SuccessResp("Telegram monitoring settings fetched", {
        code: recipient.telegramLinkCode || null, readOnlyRecipients: true,
        channels: monitoringChannels(recipient, state), availableChannels: telegramChannels(recipient),
        selectedChatId: selectedMonitoringChannel(recipient, state)?.chatId || "",
        botUsername: identity.username, botConfigured: true, collectorEnabled: control.enabled,
        checkIntervalMs: settings.intervalMs, reportIntervalMs: settings.reportIntervalMs,
      }));
    } catch (error) { res.status(error.status || 503).json({ statusCode: error.status || 503,
      body: { message: error.status ? error.message : "Telegram monitoring settings unavailable" } }); }
  };
}
const requireChannel = (recipient, chatId) => {
  if (!telegramChannels(recipient).some(channel => channel.chatId === chatId))
    throw Object.assign(new Error("Select an existing linked channel"), { status: 400 });
};
export const getTelegramSettings = handler();
export const selectTelegramChannel = handler(async (req, recipient, store) => {
  const chatId = req.body?.chatId; requireChannel(recipient, chatId);
  await store.update(value => {
    const owner = String(recipient._id);
    value.hiddenChannels[owner] = (value.hiddenChannels[owner] || []).filter(id => id !== chatId);
    value.selections[owner] = chatId;
  });
});
export const unlinkTelegramChannel = handler(async (req, recipient, store) => {
  const chatId = req.body?.chatId; requireChannel(recipient, chatId);
  await store.update(value => {
    const owner = String(recipient._id);
    const selected = selectedMonitoringChannel(recipient, value)?.chatId;
    value.hiddenChannels[owner] = [...new Set([...(value.hiddenChannels[owner] || []), chatId])];
    if (selected === chatId)
      value.selections[owner] = monitoringChannels(recipient, value)[0]?.chatId || null;
  });
});
