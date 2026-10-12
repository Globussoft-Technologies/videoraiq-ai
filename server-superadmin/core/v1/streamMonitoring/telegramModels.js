import mongoose from "mongoose";

const options = { autoCreate: false, autoIndex: false, versionKey: false };
// Separate superadmin records, linked through the existing platform-bot webhook.
const recipientSchema = new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  telegramLinkCode: { type: String, default: null },
  selectedChatId: { type: String, default: null },
  selectionChangedAt: Date,
  telegramChatId: String,
  telegramChatTitle: String,
  telegramChatUsername: String,
  telegramChatType: String,
  telegramChannels: { type: [{ chatId: String, title: String, username: String, chatType: String,
    active: Boolean, linkedAt: Date, disconnectedAt: Date }], default: [] },
}, { ...options, collection: "superadmintelegramrecipients" });

// One reminder clock per Telegram channel, shared across backend instances.
const deliverySchema = new mongoose.Schema({
  _id: String,
  lastSentAt: Date,
  reportedEpisodes: { type: [String], default: [] },
  nextAttemptAt: Date,
  owner: String,
  leaseUntil: Date,
}, { ...options, collection: "superadmintelegramdeliveries" });

export const SuperAdminTelegramRecipient = mongoose.models.SuperAdminTelegramRecipient
  || mongoose.model("SuperAdminTelegramRecipient", recipientSchema);
export const SuperAdminTelegramDelivery = mongoose.models.SuperAdminTelegramDelivery
  || mongoose.model("SuperAdminTelegramDelivery", deliverySchema);
