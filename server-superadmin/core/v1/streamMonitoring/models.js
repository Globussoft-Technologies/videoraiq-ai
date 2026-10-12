import mongoose from "mongoose";

const options = { autoCreate: false, autoIndex: false, versionKey: false };
const stateSchema = new mongoose.Schema({
  _id: String,
  adminId: { type: mongoose.Schema.Types.ObjectId, required: true },
  nvrId: { type: mongoose.Schema.Types.ObjectId, required: true },
  cameraId: { type: mongoose.Schema.Types.ObjectId, required: true },
  sourceKey: String,
  revision: { type: Number, default: 0 },
  alive: { type: Boolean, default: null },
  observedAt: Date,
  downSince: { type: Date, default: null },
  telegramDownSince: { type: Date, default: null },
}, { ...options, collection: "streammonitoringstates" });
stateSchema.index({ adminId: 1, nvrId: 1 });

const collectorSchema = new mongoose.Schema({
  _id: String,
  owner: String,
  leaseUntil: Date,
}, { ...options, collection: "streammonitoringcollectors" });

export const MonitoringState = mongoose.models.StreamMonitoringState || mongoose.model("StreamMonitoringState", stateSchema);
export const MonitoringCollector = mongoose.models.StreamMonitoringCollector || mongoose.model("StreamMonitoringCollector", collectorSchema);
