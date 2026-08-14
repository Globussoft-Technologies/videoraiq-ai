import mongoose from "mongoose";

const scheduleSchema = new mongoose.Schema(
  {
    frequency: {
      type: String,
      enum: ["daily", "weekly", "monthly", "custom"],
      required: true,
    },
    time: { type: String, default: "00:00" },
    weekday: { type: Number, min: 0, max: 6, default: 1 }, // Monday
    dayOfMonth: { type: Number, min: 1, max: 28, default: 1 },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
  },
  { _id: false },
);

const targetSchema = new mongoose.Schema(
  {
    scope: {
      type: String,
      enum: ["organization", "employees", "departments"],
      default: "organization",
    },
    employeeIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "authorizedUsers" }],
    departmentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Department" }],
  },
  { _id: false },
);

const attendanceAutoEmailReportSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    recipients: [{ type: String, required: true, lowercase: true, trim: true }],
    // Snapshot of Admin.timezone. It is assigned server-side, never selected
    // per report, so every scheduled report follows the organisation timezone.
    timezone: { type: String, required: true },
    schedule: { type: scheduleSchema, required: true },
    target: { type: targetSchema, default: () => ({}) },
    formats: [{ type: String, enum: ["pdf", "csv"] }],
    enabled: { type: Boolean, default: true },
    lastRunKey: { type: String, default: null },
    lastSentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

attendanceAutoEmailReportSchema.index({ adminId: 1, title: 1 }, { unique: true });
attendanceAutoEmailReportSchema.index({ enabled: 1, "schedule.frequency": 1 });

export default mongoose.model("AttendanceAutoEmailReport", attendanceAutoEmailReportSchema);
