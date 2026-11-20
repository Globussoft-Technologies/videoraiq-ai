import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  _id: String,
  inventoryId: { type: String, required: true },
  session: { type: String, required: true },
  images: [{ _id: false, key: String, file: String }],
  expiresAt: { type: Date, required: true },
}, { versionKey: false });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('AgentInventoryExportGrant', schema);
