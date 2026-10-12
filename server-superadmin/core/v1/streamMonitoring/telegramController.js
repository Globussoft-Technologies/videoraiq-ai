import { randomBytes } from "node:crypto";
import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import { monitoringSettings } from "./settings.js";
import { SuperAdminTelegramRecipient } from "./telegramModels.js";
import { telegramChannels, selectedTelegramChannels, telegramBotToken, telegramBotUsername } from "./telegramChannels.js";
import { requestStreamTelegramReport } from "./telegramSender.js";

const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };
const responseData = recipient => ({ code: recipient?.telegramLinkCode || null, channels: telegramChannels(recipient || {}),
  selectedChatId: selectedTelegramChannels(recipient || {})[0]?.chatId || "",
  botUsername: telegramBotUsername(), botConfigured: !!telegramBotToken(), collectorEnabled: monitoringSettings().enabled });

function handler(action, message) {
  return async (req, res) => {
    res.set("Cache-Control", "no-store");
    try { return res.send(Response.SuccessResp(message, await action(req))); }
    catch (error) {
      if (!error.status) logger.error("[STREAM_TELEGRAM] channel request failed");
      const status = error.status || 500;
      return res.status(status).send({ statusCode: status, body: { status: "failed",
        message: error.status ? error.message : "Unable to load or update Telegram channels" } });
    }
  };
}

export const getTelegramSettings = handler(async req => {
  const ownerId = req.superAdmin._id;
  for (let attempt = 0; attempt < 3; attempt++) {
    const previous = await SuperAdminTelegramRecipient.findById(ownerId).lean();
    if (/^VRIQ-SA-[0-9A-F]{16}$/.test(previous?.telegramLinkCode || "")) {
      requestStreamTelegramReport();
      return responseData(previous);
    }
    const code = "VRIQ-SA-" + randomBytes(8).toString("hex").toUpperCase();
    try {
      const recipient = await SuperAdminTelegramRecipient.findOneAndUpdate({
        _id: ownerId, telegramLinkCode: previous?.telegramLinkCode ?? null,
      }, { $set: { telegramLinkCode: code } }, { upsert: !previous, new: true, runValidators: true }).lean();
      if (!recipient) continue;
      requestStreamTelegramReport();
      return responseData(recipient);
    } catch (error) { if (error.code !== 11000) throw error; }
  }
  throw Object.assign(new Error("Channel connection changed. Please refresh and try again"), { status: 409 });
}, "Telegram link code and channels fetched");

export const selectTelegramChannel = handler(async req => {
  const chatId = req.body?.chatId;
  const previous = await SuperAdminTelegramRecipient.findById(req.superAdmin._id).lean();
  if (typeof chatId !== "string" || !telegramChannels(previous || {}).some(channel => channel.chatId === chatId))
    invalid("Channel is not connected to this superadmin");
  const recipient = await SuperAdminTelegramRecipient.findOneAndUpdate({ _id: req.superAdmin._id,
    $or: [{ telegramChannels: { $elemMatch: { chatId, active: { $ne: false } } } }, { telegramChatId: chatId }] },
  { $set: { selectedChatId: chatId, selectionChangedAt: new Date() } }, { new: true }).lean();
  if (!recipient) invalid("Channel is no longer connected. Please refresh");
  requestStreamTelegramReport();
  return responseData(recipient);
}, "Telegram delivery channel selected");

export const unlinkTelegramChannel = handler(async req => {
  const chatId = req.body?.chatId;
  const recipient = await SuperAdminTelegramRecipient.findById(req.superAdmin._id).lean();
  if (typeof chatId !== "string" || !telegramChannels(recipient || {}).some(channel => channel.chatId === chatId))
    invalid("Channel is not connected to this superadmin");
  const remaining = (recipient.telegramChannels || []).filter(channel => String(channel.chatId) !== chatId);
  const primary = remaining.find(channel => channel.active !== false);
  await SuperAdminTelegramRecipient.updateOne({ _id: req.superAdmin._id }, {
    $pull: { telegramChannels: { chatId } },
    $set: { telegramLinkCode: null, telegramChatId: primary?.chatId || null, telegramChatTitle: primary?.title || null,
      telegramChatUsername: primary?.username || null, telegramChatType: primary?.chatType || null },
  });
  const updated = await SuperAdminTelegramRecipient.findById(req.superAdmin._id).lean();
  await SuperAdminTelegramRecipient.updateOne({ _id: req.superAdmin._id, selectedChatId: chatId },
    { $set: { selectedChatId: telegramChannels(updated || {})[0]?.chatId || null, selectionChangedAt: new Date() } });
  // The shared bot stays in the channel, preserving staging's existing alerts.
  requestStreamTelegramReport();
  return responseData(await SuperAdminTelegramRecipient.findById(req.superAdmin._id).lean());
}, "Telegram channel disconnected");
