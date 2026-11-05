import mongoose from 'mongoose';

// Refresh credentials are owned by the V2 browser authentication flow.
const schema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  sessionId: { type: String, required: true, index: true },
  claims: { type: mongoose.Schema.Types.Mixed, required: true },
  credentialVersion: { type: String, default: '' },
  expiresAt: { type: Date, required: true },
  consumedAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model('RefreshToken', schema);
