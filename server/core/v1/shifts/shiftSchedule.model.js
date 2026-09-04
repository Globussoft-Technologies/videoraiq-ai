import mongoose from "mongoose";

/**
 * A shift assignment for one employee on one calendar day.
 *
 * This collection holds **deviations only**. An employee's standing shift
 * (`authorizedUsers.shiftId`) plus that shift's `workingDays` already answers
 * "what is Aarav on next Tuesday" for most people on most days, so writing a
 * row per employee per day would be ~7,500 documents a month for a 250-person
 * tenant that never changes anything. Instead the Shift Schedule grid derives
 * every cell from the standing shift and stores a row only where a day was
 * deliberately overridden — see `resolveScheduledDay` below, which is the one
 * place that precedence is expressed.
 *
 * `date` is a plain "YYYY-MM-DD" string, not a Date. A roster day is a calendar
 * day in the organisation's own zone, not an instant: "Aarav works nights on
 * the 4th" is true regardless of what UTC thinks. Storing an instant would
 * re-introduce exactly the day-boundary drift that already bites the attendance
 * read path, and string comparison ranges (`$gte: "2026-09-01"`) index and sort
 * correctly for month queries.
 */
const shiftScheduleSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "authorizedUsers",
      required: true,
    },
    // "YYYY-MM-DD" in the org's timezone.
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    // Null together with `isOff` false means "no shift" — the employee is
    // explicitly unassigned that day rather than falling back to the standing
    // shift, which is what clearing a cell to blank produces.
    shiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shift",
      default: null,
    },
    // A deliberate day off, distinct from "no shift configured". The grid shows
    // this as Off; the standing shift's own week-off days also render as Off
    // but store nothing.
    isOff: {
      type: Boolean,
      default: false,
    },
    // Half a day of the assigned shift, matching the shift model's day types.
    dayType: {
      type: String,
      enum: ["full", "half", "off"],
      default: "full",
    },
    note: { type: String, trim: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

// One assignment per employee per day — a double-submit or a bulk range that
// overlaps an existing cell must update, never duplicate.
shiftScheduleSchema.index({ adminId: 1, employee: 1, date: 1 }, { unique: true });
// The grid reads a whole month for a page of employees at a time.
shiftScheduleSchema.index({ adminId: 1, date: 1 });

export default mongoose.model("ShiftSchedule", shiftScheduleSchema);
