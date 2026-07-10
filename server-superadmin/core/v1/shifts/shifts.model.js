import mongoose from "mongoose";

const ShiftSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },

    color: {
      type: String, // hex or predefined key
      required: true,
    },

    timings: {
      monday: { start: String, end: String, enabled: Boolean }, // HH:MM format
      tuesday: { start: String, end: String, enabled: Boolean },
      wednesday: { start: String, end: String, enabled: Boolean },
      thursday: { start: String, end: String, enabled: Boolean },
      friday: { start: String, end: String, enabled: Boolean },
      saturday: { start: String, end: String, enabled: Boolean },
      sunday: { start: String, end: String, enabled: Boolean },
    },

    settings: {
      lateLogin: { type: Number, default: 0 }, // minutes | How many minutes late an employee can log in without penalty.
      earlyLogout: { type: Number, default: 0 }, // minutes | How many minutes early an employee can log out without penalty.
      halfDay: { type: String }, // HH:MM | Minimum hours required to be considered a half-day.
      overTime: { type: String }, // HH:MM | Minimum hours after shift end to be considered overtime.
      halfDayProductiveTime: { type: String }, // HH:MM  | Minimum productive work time to qualify as half-day.
      fullDayProductiveTime: { type: String }, // HH:MM | Minimum productive time for full-day attendance.
    },

    note: {
      type: String,
      trim: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Shift", ShiftSchema);
