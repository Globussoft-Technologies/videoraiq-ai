import mongoose from "mongoose";

const targetSchema = new mongoose.Schema({
  channelId: { type: mongoose.Schema.Types.ObjectId, required: true },
  detectionType: { type: String, required: true },
  settingId: { type: mongoose.Schema.Types.ObjectId, default: null },
  before: { type: mongoose.Schema.Types.Mixed, required: true },
  after: { type: mongoose.Schema.Types.Mixed, required: true },
  expectedVersion: { type: String, required: true },
  result: { type: mongoose.Schema.Types.Mixed, default: null },
}, { _id: false });

const agentActionSchema = new mongoose.Schema({
  accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  requester: { type: mongoose.Schema.Types.Mixed, required: true },
  approver: { type: mongoose.Schema.Types.Mixed, default: null },
  operation: { type: String, enum: ["camera_detection_toggle", "camera_processing_toggle", "camera_configuration_update", "camera_schedule_update", "one_time_restore"], required: true },
  targets: { type: [targetSchema], validate: [(value) => value.length > 0 && value.length <= 100, "One to 100 targets are required"] },
  proposalVersion: { type: Number, default: 1, required: true },
  digest: { type: String, required: true },
  idempotencyKey: { type: String, required: true },
  requestFingerprint: { type: String, required: true },
  status: { type: String, enum: ["prepared", "approved", "cancelled", "expired", "invalidated", "executing", "completed", "partially_failed", "failed", "verification_pending"], default: "prepared", index: true },
  expiresAt: { type: Date, required: true, index: true },
  decidedAt: { type: Date, default: null },
  executedAt: { type: Date, default: null },
  verifiedAt: { type: Date, default: null },
  correlationId: { type: String, required: true },
  agentRunId: { type: String, default: null, index: true },
  executionIdempotencyKey: { type: String, default: null },
  decisionIdempotencyKey: { type: String, default: null },
  requestId: { type: String, required: true, index: true },
  impact: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true, minimize: false });

// The requester scope makes a repeated prepare retry safe without sharing a
// proposal between tenants or users.
agentActionSchema.index({ accountId: 1, "requester.subject": 1, idempotencyKey: 1 }, { unique: true });

export const AgentAction = mongoose.models.AgentAction || mongoose.model("AgentAction", agentActionSchema);

const auditEventSchema = new mongoose.Schema({
  accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  actionId: { type: mongoose.Schema.Types.ObjectId, ref: "AgentAction", default: null, index: true },
  actor: { type: mongoose.Schema.Types.Mixed, required: true },
  source: { type: String, enum: ["agent", "product"], default: "agent", index: true },
  action: { type: String, required: true, index: true },
  target: { type: mongoose.Schema.Types.Mixed, required: true },
  before: { type: mongoose.Schema.Types.Mixed, default: null },
  after: { type: mongoose.Schema.Types.Mixed, default: null },
  outcome: { type: mongoose.Schema.Types.Mixed, default: null },
  correlationId: { type: String, required: true, index: true },
  requestId: { type: String, required: true, index: true },
}, { timestamps: true, minimize: false });

auditEventSchema.index({ accountId: 1, createdAt: -1 });
export const AuditEvent = mongoose.models.AuditEvent || mongoose.model("AuditEvent", auditEventSchema);
