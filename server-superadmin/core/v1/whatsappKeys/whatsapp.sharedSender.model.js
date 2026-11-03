import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  _id: { type: String, default: 'default' },
  phoneNumberId: String, businessAccountId: String, apiVersion: String,
  credentials: { type: String, select: false },
  revision: { type: Number, default: 0 },
  verifiedAt: Date, updatedBy: mongoose.Schema.Types.ObjectId,
  templates: { type: [mongoose.Schema.Types.Mixed], default: [] }, lastSyncAt: Date,
}, { collection: 'whatsapp_shared_senders', timestamps: true });
export default mongoose.model('WhatsAppSharedSender', schema);
