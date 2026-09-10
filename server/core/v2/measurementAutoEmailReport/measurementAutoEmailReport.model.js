import mongoose from "mongoose";

// Mirrors attendanceAutoEmailReport.model.js — a saved schedule for the
// Mattress Measurement Logs page. Kept as its own collection so QC report
// schedules and attendance report schedules stay independent.

const scheduleSchema = new mongoose.Schema(
  {
    frequency: {
      type: String,
      enum: ["daily", "weekly", "monthly", "custom"],
      required: true,
    },
    time: { type: String, default: "07:00" },
    weekday: { type: Number, min: 0, max: 6, default: 1 }, // Monday
    dayOfMonth: { type: Number, min: 1, max: 28, default: 1 },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
  },
  { _id: false },
);

// Which QC stations the report covers. "all" = every station.
const targetSchema = new mongoose.Schema(
  {
    scope: { type: String, enum: ["all", "stations"], default: "all" },
    stations: [{ type: String, trim: true }],
  },
  { _id: false },
);

const deliveryHistorySchema = new mongoose.Schema(
  {
    sentAt: { type: Date, default: Date.now },
    period: { type: String, default: "" },
    rowCount: { type: Number, default: 0 },
    recipients: [{ type: String }],
    files: [
      {
        format: { type: String, enum: ["pdf", "xlsx", "csv"] },
        path: { type: String },
      },
    ],
  },
  { _id: false },
);

const measurementAutoEmailReportSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    recipients: [{ type: String, required: true, lowercase: true, trim: true }],
    // Snapshot of Admin.timezone — assigned server-side, never chosen per report.
    timezone: { type: String, required: true },
    schedule: { type: scheduleSchema, required: true },
    target: { type: targetSchema, default: () => ({}) },
    formats: [{ type: String, enum: ["pdf", "xlsx", "csv"] }],
    // Report content preset. "full" = every record; "pass" / "mismatch" /
    // "qrerror" keep only records with that result.
    reportType: {
      type: String,
      enum: ["full", "pass", "mismatch", "qrerror"],
      default: "full",
    },
    includeSnapshots: { type: Boolean, default: true },
    mismatchOnly: { type: Boolean, default: false },
    enabled: { type: Boolean, default: true },
    lastRunKey: { type: String, default: null },
    lastSentAt: { type: Date, default: null },
    lastError: { type: String, default: null },
    history: { type: [deliveryHistorySchema], default: [] },
  },
  { timestamps: true },
);

measurementAutoEmailReportSchema.index({ adminId: 1, title: 1 }, { unique: true });
measurementAutoEmailReportSchema.index({ enabled: 1, "schedule.frequency": 1 });

export default mongoose.model("MeasurementAutoEmailReport", measurementAutoEmailReportSchema);
