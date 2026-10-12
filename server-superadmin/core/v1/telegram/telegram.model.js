import mongoose from "mongoose";

// Match staging's existing fields and casting without changing the general Admin model.
// This model updates existing admins only; it never creates admin accounts or indexes.
const schema = new mongoose.Schema({
  telegramLinkCode: String,
  telegramChatId: String,
  telegramChatTitle: String,
  telegramChatUsername: String,
  telegramChatType: String,
  telegramChannels: { type: [{
    chatId: { type: String, default: null },
    title: { type: String, default: null },
    username: { type: String, default: null },
    chatType: { type: String, default: null },
    active: { type: Boolean, default: true },
    linkedAt: { type: Date, default: Date.now },
    disconnectedAt: { type: Date, default: null },
  }], default: [] },
}, { collection: "admins", timestamps: true, autoCreate: false, autoIndex: false });

export default mongoose.models.StagingTelegramLink || mongoose.model("StagingTelegramLink", schema);
