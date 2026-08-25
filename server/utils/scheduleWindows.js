/**
 * Shared weekly-schedule primitives for detection scheduling.
 *
 * One implementation of "what does this weekly schedule actually cover?", used
 * by the Joi validators (v1 + v2 detectionSettings, and the global schedule
 * that reuses them) and by the runtime evaluator in
 * services/detectionSchedule.resolver.js. Before this module the validator and
 * the evaluator each carried their own copy of timeToMinutes plus the window
 * comparison, which is exactly how a "22:00 -> 08:00" range ends up accepted by
 * one and ignored by the other.
 *
 * TIME REPRESENTATION - why windows stay wall-clock rather than UTC.
 *
 * A window is stored as local "HH:mm" plus the schedule's IANA timezone, and is
 * resolved to an absolute instant only at evaluation time. Normalising to UTC
 * on save instead would be wrong for any zone observing DST: "09:00 in
 * America/New_York" is 13:00Z in January and 14:00Z in July, so a UTC value
 * frozen at save time drifts by an hour twice a year and would need
 * re-migrating on every transition. Storing the user's actual intent
 * (wall-clock + zone) and converting late keeps DST correct for free, and keeps
 * every already-saved schedule readable without migration.
 *
 * The comparison itself IS absolute: new Date() is a UTC instant, projected
 * into the schedule's zone by Intl (fully IANA/DST aware) to obtain the local
 * weekday and minute-of-day. Nothing here depends on the server's own timezone.
 */

export const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export const MINUTES_IN_DAY = 24 * 60;

/** Minutes since local midnight for "HH:mm". NaN for anything unparseable. */
export const timeToMinutes = (time) => {
  const [hours, minutes] = String(time ?? "").split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes)
    ? hours * 60 + minutes
    : NaN;
};

export const nextWeekday = (day) => {
  const index = WEEKDAYS.indexOf(day);
  return index === -1 ? null : WEEKDAYS[(index + 1) % WEEKDAYS.length];
};

export const previousWeekday = (day) => {
  const index = WEEKDAYS.indexOf(day);
  return index === -1 ? null : WEEKDAYS[(index + 6) % WEEKDAYS.length];
};

/**
 * A window whose end is strictly before its start runs past midnight into the
 * following day: 22:00 -> 08:00 means "Monday 22:00 until Tuesday 08:00".
 *
 * start === end is deliberately NOT overnight. The pre-existing rule rejected
 * it (start >= end was an error) and it stays rejected, so nobody accidentally
 * acquires a 24-hour window by typing the same time twice.
 */
export const isOvernightWindow = (window) => {
  const start = timeToMinutes(window?.start);
  const end = timeToMinutes(window?.end);
  return Number.isFinite(start) && Number.isFinite(end) && end < start;
};

const formatWindow = (window) => `${window?.start ?? "?"}-${window?.end ?? "?"}`;

/**
 * Expand every configured window into the concrete minute ranges it occupies,
 * keyed by the day those minutes fall on.
 *
 * A normal window contributes one segment to its own day. An overnight window
 * contributes two: the tail of its own day, and the head of the next day -
 * which is what makes cross-midnight overlap detection possible at all. Each
 * segment remembers the day and window it came from, so a conflict can be
 * reported in terms of what the user typed rather than the split form.
 *
 * Sunday's overnight spill lands on Monday: the week wraps.
 */
export const expandScheduleSegments = (days = {}) => {
  const segments = Object.fromEntries(WEEKDAYS.map((day) => [day, []]));

  for (const day of WEEKDAYS) {
    const windows = Array.isArray(days?.[day]) ? days[day] : [];

    for (const window of windows) {
      const start = timeToMinutes(window?.start);
      const end = timeToMinutes(window?.end);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;

      const origin = { day, label: formatWindow(window) };

      if (end > start) {
        segments[day].push({ start, end, ...origin });
        continue;
      }
      if (end === start) continue; // rejected upstream; occupies no time

      segments[day].push({ start, end: MINUTES_IN_DAY, ...origin });
      const spillDay = nextWeekday(day);
      if (spillDay) segments[spillDay].push({ start: 0, end, ...origin });
    }
  }

  return segments;
};

/**
 * First conflict in a weekly schedule, or null when it is sound.
 *
 * Boundary rule, unchanged from the original validator: touching windows are
 * legal (09:00-12:00 next to 12:00-18:00 is fine) because the comparison is a
 * strict >. Windows are half-open [start, end), so a shared edge is not a
 * shared minute. isWithinScheduleDays applies the same half-open rule, so
 * validation and runtime cannot disagree about a boundary.
 *
 * Returns { type, day, message }, where `day` is the day whose timeline the
 * clash falls on.
 */
export const findScheduleConflict = (days = {}) => {
  // Pass 1 - each window on its own. A zero-length window is now the only
  // shape that is invalid in isolation, since end < start is a legal overnight.
  for (const day of WEEKDAYS) {
    const windows = Array.isArray(days?.[day]) ? days[day] : [];
    for (const window of windows) {
      const start = timeToMinutes(window?.start);
      const end = timeToMinutes(window?.end);
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        return {
          type: "invalid",
          day,
          message: `${day} schedule has an invalid time`,
        };
      }
      if (start === end) {
        return {
          type: "zero-length",
          day,
          message: `${day} schedule start and end time cannot be the same`,
        };
      }
    }
  }

  // Pass 2 - overlaps on each day's real timeline, including the minutes
  // carried in by the previous day's overnight window.
  const segments = expandScheduleSegments(days);

  for (const day of WEEKDAYS) {
    const sorted = segments[day].slice().sort((a, b) => a.start - b.start);

    for (let index = 0; index < sorted.length - 1; index += 1) {
      const current = sorted[index];
      const next = sorted[index + 1];
      if (current.end <= next.start) continue;

      // Both halves were configured on the same day: keep the long-standing
      // message so existing clients and docs still read correctly.
      if (current.day === next.day) {
        return {
          type: "overlap",
          day,
          message: `${current.day} schedule windows cannot overlap`,
        };
      }

      // A cross-midnight clash. Naming both sides is the difference between a
      // user finding the offending range and guessing at it.
      const overnight = current.day === day ? next : current;
      const sameDay = current.day === day ? current : next;
      return {
        type: "overlap-overnight",
        day,
        message:
          `${overnight.day} overnight window ${overnight.label} runs into ` +
          `${day} and overlaps ${sameDay.day} ${sameDay.label}`,
      };
    }
  }

  return null;
};

/** True when at least one day carries at least one window. */
export const hasAnyWindow = (days = {}) =>
  WEEKDAYS.some((day) => (Array.isArray(days?.[day]) ? days[day].length : 0) > 0);

/**
 * Is `minutes` on `day` covered by the schedule?
 *
 * Checks the day's own windows, then the previous day's overnight windows,
 * whose minutes land here after midnight. Pure - the caller supplies the
 * already-resolved local weekday and minute-of-day, which is what keeps this
 * testable without mocking clocks.
 */
export const isWithinScheduleDays = (days = {}, day, minutes) => {
  if (!WEEKDAYS.includes(day) || !Number.isFinite(minutes)) return false;

  const todayWindows = Array.isArray(days?.[day]) ? days[day] : [];
  const coveredToday = todayWindows.some((window) => {
    const start = timeToMinutes(window?.start);
    const end = timeToMinutes(window?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
    // Normal window - byte-identical to the original half-open comparison.
    if (end > start) return minutes >= start && minutes < end;
    // Overnight window - today's share runs from start through to midnight.
    if (end < start) return minutes >= start;
    return false; // zero-length occupies nothing
  });
  if (coveredToday) return true;

  const yesterday = previousWeekday(day);
  const yesterdayWindows = Array.isArray(days?.[yesterday]) ? days[yesterday] : [];
  return yesterdayWindows.some((window) => {
    const start = timeToMinutes(window?.start);
    const end = timeToMinutes(window?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
    return end < start && minutes < end;
  });
};

/**
 * Does the runtime accept this IANA zone? Mirrors the probe already used by
 * admin.service.js updateTimezone, so aliases the ICU build understands
 * ("Asia/Calcutta") pass here exactly as they do there.
 */
/**
 * Did this schedule OPEN within the last minute?
 *
 * True only on the tick that crosses a start boundary: covered now, not
 * covered a minute ago. Handles the midnight rollover, so an overnight
 * window opening at 00:00 is caught too.
 *
 * Used to re-assert every covered detector exactly once per window. The
 * runner is otherwise idempotent against our own stored `enabled` flag, so a
 * detector marked running that DS never actually started stays invisible to
 * it forever. Re-asserting at the open is what heals that drift without
 * hammering DS every minute.
 */
export const isScheduleOpeningNow = (days = {}, day, minutes) => {
  if (!WEEKDAYS.includes(day) || !Number.isFinite(minutes)) return false;
  if (!isWithinScheduleDays(days, day, minutes)) return false;

  const previousMinute = minutes - 1;
  if (previousMinute >= 0) {
    return !isWithinScheduleDays(days, day, previousMinute);
  }
  // Just after local midnight: the minute before belongs to yesterday.
  const yesterday = previousWeekday(day);
  return !isWithinScheduleDays(days, yesterday, MINUTES_IN_DAY - 1);
};

export const isValidTimezone = (timezone) => {
  if (typeof timezone !== "string" || !timezone.trim()) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
};

/* ── Local wall-clock <-> absolute instant ────────────────────────────────
   Everything above works in (weekday, minute-of-day). Manual overrides need a
   real expiry timestamp, which means converting a local wall-clock time in an
   IANA zone back to a UTC instant. Intl only converts the other way, so the
   offset is recovered by formatting a guess and measuring the drift.        */

/** Zone offset in ms at instant "ts" (positive east of UTC). */
const timezoneOffsetMs = (ts, timezone) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ts));

  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - ts;
};

/**
 * The instant whose local time in the given zone is the supplied wall-clock.
 *
 * Two passes: guess using the offset at the naive instant, then re-measure at
 * the corrected one. That second pass is what makes DST transitions land
 * correctly, since the offset on one side of a jump is not the offset on the
 * other. A wall-clock time that a spring-forward skips resolves to the instant
 * the clock jumps to, which is the behaviour a schedule boundary wants.
 */
export const zonedWallClockToUtc = ({ year, month, day, minutes }, timezone) => {
  const naive = Date.UTC(year, month, day, 0, minutes, 0, 0);
  const firstPass = naive - timezoneOffsetMs(naive, timezone);
  const secondOffset = timezoneOffsetMs(firstPass, timezone);
  return new Date(naive - secondOffset);
};

/** Local calendar date, weekday and minute-of-day for an instant, in a zone. */
export const zonedParts = (date, timezone) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);

  const get = (type) => parts.find((part) => part.type === type)?.value;
  return {
    year: Number(get("year")),
    month: Number(get("month")) - 1,
    day: Number(get("day")),
    weekday: get("weekday")?.toLowerCase(),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
};

/**
 * When does this schedule's verdict next flip?
 *
 * Returns the absolute instant at which isWithinScheduleDays would start
 * answering differently than it does at "from" — the end of the current ON
 * window, or the start of the next one. Null when the verdict never changes
 * within a week (an empty schedule, a non-custom one, or one covering every
 * minute), which callers read as "no natural expiry".
 *
 * This is what gives a manual override a defined lifetime: it holds until the
 * schedule would next have changed the state anyway, then hands control back.
 *
 * Only segment edges can change the answer, so this tests a handful of
 * candidate minutes rather than walking all 10,080 in a week.
 */
export const nextScheduleBoundary = (schedule, from = new Date()) => {
  if (!schedule || schedule.mode !== "custom") return null;

  const timezone = isValidTimezone(schedule.timezone) ? schedule.timezone : "UTC";
  const days = schedule.days || {};
  const segments = expandScheduleSegments(days);

  const origin = zonedParts(from, timezone);
  if (!WEEKDAYS.includes(origin.weekday)) return null;

  const startVerdict = isWithinScheduleDays(days, origin.weekday, origin.minutes);
  const startIndex = WEEKDAYS.indexOf(origin.weekday);

  for (let offset = 0; offset <= 7; offset += 1) {
    const weekday = WEEKDAYS[(startIndex + offset) % WEEKDAYS.length];

    const candidates = [
      ...new Set(segments[weekday].flatMap((seg) => [seg.start, seg.end])),
    ]
      .filter((minute) => minute > 0 && minute < MINUTES_IN_DAY)
      .sort((a, b) => a - b);

    // Midnight is itself a boundary when the previous day's carry ends there.
    if (offset > 0) candidates.unshift(0);

    for (const minute of candidates) {
      if (offset === 0 && minute <= origin.minutes) continue;
      if (isWithinScheduleDays(days, weekday, minute) === startVerdict) continue;

      return zonedWallClockToUtc(
        {
          year: origin.year,
          month: origin.month,
          day: origin.day + offset,
          minutes: minute,
        },
        timezone,
      );
    }
  }

  return null;
};
