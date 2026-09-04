import { SHIFT_DAY_KEYS, resolveShiftDay } from "./shifts.model.js";

/**
 * Turning a standing shift plus a sparse set of overrides into a filled grid.
 *
 * Kept out of the service so the Shift Schedule grid, any future export, and
 * (when attendance starts honouring per-day assignments) the grading pipeline
 * all answer "what shift is this employee on this date" the same way.
 */

/** "YYYY-MM-DD" for a Date, read in the given IANA zone. */
export function toDateKey(date, timezone = "UTC") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date instanceof Date ? date : new Date(date));
}

/**
 * Every day of a month as `{ key, day, weekday, isWeekend }`.
 *
 * Built from a plain "YYYY-MM" string using UTC arithmetic on purpose: these
 * are calendar labels, not instants, so constructing them in the server's own
 * zone would shift the month by a day either side of midnight.
 */
export function monthDays(month) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month || ""));
  if (!match) return [];

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return [];

  const dayCount = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

  return Array.from({ length: dayCount }, (_, index) => {
    const day = index + 1;
    const at = new Date(Date.UTC(year, monthIndex, day));
    const weekdayIndex = at.getUTCDay();
    return {
      key: `${match[1]}-${match[2]}-${String(day).padStart(2, "0")}`,
      day,
      weekday: SHIFT_DAY_KEYS[weekdayIndex],
      weekdayIndex,
      isWeekend: weekdayIndex === 0 || weekdayIndex === 6,
    };
  });
}

/** First and last date key of a month, for a range query. */
export function monthRange(month) {
  const days = monthDays(month);
  return days.length ? { start: days[0].key, end: days[days.length - 1].key } : null;
}

/**
 * What one employee is on for one date.
 *
 * Precedence, highest first:
 *   1. an explicit override row for that date
 *   2. the employee's standing shift, read through its own working-day pattern
 *   3. nothing — an unassigned cell, which the grid renders as a "+"
 *
 * Returns `source` so the UI can tell a deliberate assignment from an inherited
 * one: only overrides get a "clear" action, since clearing an inherited cell
 * would mean nothing.
 */
export function resolveScheduledDay({ override, standingShift, weekday, shiftsById }) {
  if (override) {
    if (override.isOff) {
      return { type: "off", shift: null, source: "override", note: override.note || null };
    }
    const shift = override.shiftId
      ? shiftsById?.get(String(override.shiftId)) || null
      : null;
    if (!shift) {
      // The override deliberately clears the day rather than inheriting.
      return { type: "none", shift: null, source: "override", note: override.note || null };
    }
    return {
      type: override.dayType || "full",
      shift,
      source: "override",
      note: override.note || null,
    };
  }

  if (!standingShift) {
    return { type: "none", shift: null, source: "none", note: null };
  }

  const day = resolveShiftDay(standingShift, weekday);
  if (!day || day.type === "off") {
    return { type: "off", shift: standingShift, source: "standing", note: null };
  }

  return { type: day.type, shift: standingShift, source: "standing", note: null };
}
