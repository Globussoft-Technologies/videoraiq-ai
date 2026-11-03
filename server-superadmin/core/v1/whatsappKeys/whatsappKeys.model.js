import mongoose from 'mongoose';

// Same tenant collection used by server/core/v2/whatsapp. Never select secrets.
const schema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  credentialSource: { type: String, enum: ['own', 'env'] },
  sharedKeyRequest: {
    requestId: mongoose.Schema.Types.ObjectId,
    type: { type: String, enum: ['enable', 'cancel'] },
    status: { type: String, enum: ['pending', 'approved', 'rejected'] },
    adminName: String, requestedAt: Date, reviewedAt: Date, reviewedBy: mongoose.Schema.Types.ObjectId,
  },
}, { collection: 'whatsappsettings', strict: false, timestamps: true });
export default mongoose.model('WhatsAppKeyAccess', schema);
