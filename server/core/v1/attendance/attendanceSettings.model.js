import mongoose from "mongoose";

const { Schema } = mongoose;

// Defaults used when an org has never saved settings. Exported so the read
// path, the validator and the tests all agree on one set of numbers.
export const DEFAULT_FULL_DAY_HOURS = 8;
export const DEFAULT_HALF_DAY_HOURS = 4;
export const DEFAULT_GRACE_HOURS = 8;

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
 * `graceHours` is not an exception to that rule. It is not lateness grace, which
 * would need a fixed shift start to be late against. It is how long a day stays
 * open waiting for a check-out that may never arrive — measured from the
 * employee's own check-in, so it needs no shift window either.
 *
 * Lives here in v1 rather than v2 because both versions' logAttendance write
 * paths need it (the CV service posts to /api/v1/attendance), and v2 re-exports
 * this file — the same arrangement attendance.model.js and shifts.model.js use.
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
    // How long past fullDayHours a day stays open waiting for a check-out.
    //
    // Deliberately one number doing two jobs, so the two can never contradict
    // each other: a check-out arriving within (fullDayHours + graceHours) of the
    // check-in is still paired with it — including across midnight, which is the
    // only way an overnight shift ever records its hours — and past that same
    // point the day stops reading "Checked In". While a check-out could still
    // land and correct the row, the row is never yet written off.
    graceHours: {
      type: Number,
      required: true,
      min: 0,
      max: 24,
      default: DEFAULT_GRACE_HOURS,
    },
  },
  { timestamps: true },
);

export default mongoose.model("AttendanceSettings", attendanceSettingsSchema);
