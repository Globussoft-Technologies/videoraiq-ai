/**
 * Unit coverage for the grace window in core/v2/attendance/attendanceStatus.js
 *
 * Before this, a row with a check-in and no check-out graded CHECKED_IN
 * forever — so an employee who never checked out stayed "on site" for months,
 * sat outside the Absent tile, and left the Attendance Analytics tiles unable
 * to sum to the roster.
 *
 * Now CHECKED_IN is time-bounded: it holds only while a check-out could still
 * arrive and be paired (the same window checkoutCarryOver.js uses), and past
 * that the row falls through to ABSENT. These tests pin the stage's *shape*
 * rather than running it through MongoDB, so what they actually protect is the
 * branch order and the window arithmetic — the two things a later edit could
 * silently invert.
 *
 * Mocks (1):
 *   1. attendanceSettings.model.js — the module is imported for its defaults
 *      and its model; no query is made on these paths.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../core/v1/attendance/attendanceSettings.model.js", () => ({
  default: { findOne: vi.fn() },
  DEFAULT_FULL_DAY_HOURS: 8,
  DEFAULT_HALF_DAY_HOURS: 4,
  DEFAULT_GRACE_HOURS: 8,
}));

const { ATTENDANCE_STATUS, attendanceStatusStage } = await import(
  "../../../core/v2/attendance/attendanceStatus.js"
);

const NOW = new Date("2026-09-01T18:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

function branches(rules) {
  return attendanceStatusStage({ now: NOW, ...rules }).$addFields.status.$switch
    .branches;
}

/** The CHECKED_IN branch is always first — it must win before any duration. */
function checkedInCase(rules) {
  const first = branches(rules)[0];
  expect(first.then).toBe(ATTENDANCE_STATUS.CHECKED_IN);
  return first.case.$and;
}

describe("attendanceStatusStage — grace window", () => {
  it("bounds Checked In by fullDay + grace from the check-in", () => {
    const conditions = checkedInCase({ fullDayHours: 8, halfDayHours: 4, graceHours: 8 });
    const bound = conditions.at(-1);

    expect(bound).toEqual({
      $lte: [{ $subtract: [NOW, "$firstCheckIn"] }, 16 * HOUR_MS],
    });
  });

  it("tracks the org's own hours rather than a fixed 16", () => {
    const conditions = checkedInCase({ fullDayHours: 9, halfDayHours: 4, graceHours: 2.5 });
    expect(conditions.at(-1).$lte[1]).toBe(11.5 * HOUR_MS);
  });

  it("still requires a check-in and no check-out before the window is consulted", () => {
    const conditions = checkedInCase({ fullDayHours: 8, halfDayHours: 4, graceHours: 8 });
    expect(conditions).toHaveLength(3);
    expect(conditions[0]).toEqual({ $ne: [{ $ifNull: ["$firstCheckIn", null] }, null] });
    expect(conditions[1]).toEqual({
      $not: [{ $ne: [{ $ifNull: ["$lastCheckOut", null] }, null] }] });
  });

  it("a zero grace still allows the full day itself", () => {
    const conditions = checkedInCase({ fullDayHours: 8, halfDayHours: 4, graceHours: 0 });
    expect(conditions.at(-1).$lte[1]).toBe(8 * HOUR_MS);
  });

  it("omitting graceHours disables the timeout — the pre-grace behaviour", () => {
    const conditions = checkedInCase({ fullDayHours: 8, halfDayHours: 4 });
    // No window term at all, so Checked In is unbounded exactly as before.
    expect(conditions).toHaveLength(2);
    expect(JSON.stringify(conditions)).not.toContain("$subtract");
  });

  it("leaves the duration branches alone, so a timed-out row lands on ABSENT", () => {
    const all = branches({ fullDayHours: 8, halfDayHours: 4, graceHours: 8 });
    const stage = attendanceStatusStage({
      fullDayHours: 8,
      halfDayHours: 4,
      graceHours: 8,
      now: NOW,
    });

    // A row past the window has no lastCheckOut, so both duration comparisons
    // are against null and fail — the default is what actually grades it.
    expect(all.map((b) => b.then)).toEqual([
      ATTENDANCE_STATUS.CHECKED_IN,
      ATTENDANCE_STATUS.ABSENT,
      ATTENDANCE_STATUS.PRESENT,
      ATTENDANCE_STATUS.HALF_DAY,
    ]);
    expect(stage.$addFields.status.$switch.default).toBe(ATTENDANCE_STATUS.ABSENT);
  });
});
