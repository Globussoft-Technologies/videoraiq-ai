import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
  name: { type: String, required: true, maxlength: 100 },
  keyHash: { type: String, required: true, unique: true, select: false },
  prefix: { type: String, required: true },
  access: { type: String, enum: ['read', 'full'], required: true },
  scopes: { type: [String], required: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  lastUsedAt: { type: Date, default: null },
  lastUsedIp: { type: String, default: '' },
  lastUsedPath: { type: String, default: '' },
  lastStatus: { type: Number, default: null },
  requestCount: { type: Number, default: 0 },
}, { timestamps: true });
schema.index({ adminId: 1, createdAt: -1 });
export default mongoose.model('IntegrationApiKey', schema);
