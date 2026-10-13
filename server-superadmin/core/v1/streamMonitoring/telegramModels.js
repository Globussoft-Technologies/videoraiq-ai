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

const eventSchema = new mongoose.Schema({
  _id: String, type: String, cameraId: mongoose.Schema.Types.ObjectId, outageId: String, chatId: String,
  ownerIds: [mongoose.Schema.Types.ObjectId], sequence: Number, status: { type: String, default: 'PENDING' },
  payload: mongoose.Schema.Types.Mixed, attempts: { type: Number, default: 0 }, createdAt: Date,
  nextAttemptAt: Date, sentAt: Date, messageId: Number, owner: String, leaseUntil: Date, errorCode: String,
}, { ...options, collection: 'superadmintelegramoutbox' });
eventSchema.index({ status: 1, nextAttemptAt: 1 });
eventSchema.index({ status: 1, leaseUntil: 1 });
eventSchema.index({ outageId: 1, chatId: 1, type: 1 });
eventSchema.index({ outageId: 1, chatId: 1, status: 1, sentAt: -1 });
export const TelegramOutbox = mongoose.models.SuperAdminTelegramOutbox
  || mongoose.model('SuperAdminTelegramOutbox', eventSchema);
