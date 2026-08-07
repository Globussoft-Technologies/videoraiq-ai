import mongoose from "mongoose";

const { Schema } = mongoose;

// Defaults used when an org has never saved settings. Exported so the read
// path, the validator and the tests all agree on one set of numbers.
export const DEFAULT_FULL_DAY_HOURS = 8;
export const DEFAULT_HALF_DAY_HOURS = 4;

/**
 * Per-organisation attendance rules.
 *
 * Deliberately duration-only: an employee's day is graded on how long they were
 * on site (last check-out minus first check-in), not on when they arrived. There
 * are no fixed shift windows here and therefore no late/early grace periods —
 * orgs using this don't run fixed shifts, so "15 minutes late" has nothing to be
 * late against. Per-employee shift patterns are a separate concern and remain
 * modelled by the Shift collection.
 *
 * One document per admin; `adminId` is unique so reads can be a single lookup
 * and a double-submit can't create a second, conflicting row.
 */
const attendanceSettingsSchema = new Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      unique: true,
      index: true,
    },
    // Hours on site at or above which a day counts as Present.
    fullDayHours: {
      type: Number,
      required: true,
      min: 0,
      max: 24,
      default: DEFAULT_FULL_DAY_HOURS,
    },
    // Hours on site at or above which a day counts as Half Day. Below this the
    // day is Absent. Must not exceed fullDayHours — enforced in the validator so
    // the API returns a readable message rather than a mongoose ValidationError.
    halfDayHours: {
      type: Number,
      required: true,
      min: 0,
      max: 24,
      default: DEFAULT_HALF_DAY_HOURS,
    },
  },
  { timestamps: true },
);

export default mongoose.model("AttendanceSettings", attendanceSettingsSchema);
