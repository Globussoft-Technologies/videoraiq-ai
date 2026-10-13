import mongoose from "mongoose";

const options = { autoCreate: false, autoIndex: false, versionKey: false };
const stateSchema = new mongoose.Schema({
  _id: String, adminId: { type: mongoose.Schema.Types.ObjectId, required: true },
  nvrId: { type: mongoose.Schema.Types.ObjectId, required: true },
  cameraId: { type: mongoose.Schema.Types.ObjectId, required: true },
  sourceKey: String, sourceHost: String, revision: { type: Number, default: 0 },
  alive: { type: Boolean, default: null }, observedAt: Date, downSince: Date, telegramDownSince: Date,
  state: { type: String, enum: ["UNKNOWN", "ALIVE", "SUSPECTED_DOWN", "DOWN", "RECOVERING"] },
  availability: String, failureStreak: Number, healthyStreak: Number, inconclusiveStreak: Number,
  firstFailureAt: Date, lastSuccessfulCheckAt: Date, lastConclusiveAt: Date, nextCheckAt: Date,
  latestResult: mongoose.Schema.Types.Mixed,
  activeOutage: mongoose.Schema.Types.Mixed, pendingTransitions: { type: [mongoose.Schema.Types.Mixed], default: [] },
  remindersPaused: Boolean, alertsMuted: { type: Boolean, default: false }, lifecycleReason: String,
}, { ...options, collection: "streammonitoringstates" });
stateSchema.index({ adminId: 1, nvrId: 1 });
stateSchema.index({ nextCheckAt: 1 });
stateSchema.index({ "activeOutage.id": 1 });

const collectorSchema = new mongoose.Schema({
  _id: String, owner: String, leaseUntil: Date, heartbeatAt: Date, lastCycleStats: mongoose.Schema.Types.Mixed, retryUntil: Date,
}, { ...options, collection: "streammonitoringcollectors" });
const outageSchema = new mongoose.Schema({
  _id: String, cameraId: mongoose.Schema.Types.ObjectId, adminId: mongoose.Schema.Types.ObjectId,
  nvrId: mongoose.Schema.Types.ObjectId, startedAt: Date, confirmedAt: Date, closedAt: Date,
  closeReason: String, reason: String, snapshot: mongoose.Schema.Types.Mixed, revision: Number, isOpen: Boolean,
}, { ...options, collection: "streammonitoringoutages" });
outageSchema.index({ cameraId: 1, startedAt: -1 });
outageSchema.index({ cameraId: 1 }, { unique: true, partialFilterExpression: { isOpen: true } });
const issueSchema = new mongoose.Schema({
  _id: String, reason: String, host: String, lastSeenAt: Date, nextWarningAt: Date, lastSentAt: Date, lastAttemptAt: Date,
  warningId: String, warningPayload: mongoose.Schema.Types.Mixed,
}, { ...options, collection: "streammonitoringissues" });

export const MonitoringState = mongoose.models.StreamMonitoringState || mongoose.model("StreamMonitoringState", stateSchema);
export const MonitoringCollector = mongoose.models.StreamMonitoringCollector || mongoose.model("StreamMonitoringCollector", collectorSchema);
export const MonitoringOutage = mongoose.models.StreamMonitoringOutage || mongoose.model("StreamMonitoringOutage", outageSchema);
export const MonitoringIssue = mongoose.models.StreamMonitoringIssue || mongoose.model("StreamMonitoringIssue", issueSchema);
