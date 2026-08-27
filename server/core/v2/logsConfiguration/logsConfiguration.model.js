import mongoose from "mongoose";

const logsConfigSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      unique: true,
      index: true,
    },
    logs: {
      attendanceLogs: { type: Boolean, default: true },
      accessLogs: { type: Boolean, default: true },
      taggedUsers: { type: Boolean, default: true },
      detectedUsers: { type: Boolean, default: true },
      personCountLogs: { type: Boolean, default: true },
      deskAbsenceLogs: { type: Boolean, default: true },
      anprLogs: { type: Boolean, default: true },
      trackLogs: { type: Boolean, default: true },
      visibilityLogs: { type: Boolean, default: true },
      guardLogs: { type: Boolean, default: true },
      conveyorLogs: { type: Boolean, default: true },
      vehicleObstructionLogs: { type: Boolean, default: true },
      vehicleCountLogs: { type: Boolean, default: true },
      carLogs: { type: Boolean, default: true },
      crusherLogs: { type: Boolean, default: true },
      lineCrossingLogs: { type: Boolean, default: true },
      waterSpillLogs: { type: Boolean, default: true },
      unauthorizedAccessLogs: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

export default mongoose.model("LogsConfiguration", logsConfigSchema);
