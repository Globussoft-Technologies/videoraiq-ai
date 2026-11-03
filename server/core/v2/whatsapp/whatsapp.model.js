import mongoose from 'mongoose';
const settings = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  enabled: { type: Boolean, default: false },
  alertsPaused: { type: Boolean, default: false },
  credentialSource: { type: String, enum: ['own', 'env'], default: 'own' },
  senderIdentity: String,
  ownReverificationRequired: { type: Boolean, default: false },
  sharedKeyRequest: {
    requestId: mongoose.Schema.Types.ObjectId,
    type: { type: String, enum: ['enable', 'cancel'] },
    status: { type: String, enum: ['pending', 'approved', 'rejected'] },
    adminName: String,
    requestedAt: Date,
    reviewedAt: Date,
    reviewedBy: mongoose.Schema.Types.ObjectId,
  },
  phoneNumberId: String, businessAccountId: String, apiVersion: String,
  credentials: { type: String, select: false },
  webhookVerifyToken: { type: String, select: false },
  templates: { type: [mongoose.Schema.Types.Mixed], default: [] },
  selectedTemplate: { name: String, language: String },
  fallbackTemplate: { name: String, language: String },
  recipients: [{ name: String, phone: String, optedInAt: Date }],
  lastSyncAt: Date,
}, { timestamps: true });
settings.index({ 'sharedKeyRequest.status': 1, 'sharedKeyRequest.requestedAt': -1 });
export const WhatsAppSettings = mongoose.model('WhatsAppSettings', settings);
// Legacy schema retained only for tenant deletion and expiry of existing records.
// Alert sends and webhook callbacks no longer create or update these records.
const delivery = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  messageId: { type: String, unique: true, sparse: true }, recipient: String,
  incidentId: String, template: String, status: String, error: String,
  statusAt: Date, expiresAt: { type: Date, default: () => new Date(Date.now() + 90 * 86400000), expires: 0 },
}, { timestamps: true });
export const WhatsAppDelivery = mongoose.model('WhatsAppDelivery', delivery);
