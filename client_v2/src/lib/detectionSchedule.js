/**
 * Weekly detection-schedule rules for the client.
 *
 * A deliberate mirror of the server's server/utils/scheduleWindows.js. The two
 * cannot literally share a module across the repo boundary, so the contract is
 * pinned here instead: same half-open windows, same overnight expansion, same
 * boundary rule. The server stays the authority — anything this misses still
 * comes back as a toast from the API — but the two must never *disagree*, or
 * the UI rejects what the backend would have accepted (or worse, the reverse).
 *
 * Overnight ranges: a window whose end is before its start runs past midnight
 * into the next day, so "22:00 -> 08:00" on Monday means "Monday 22:00 until
 * Tuesday 08:00". The user keeps configuring and seeing one logical range; the
 * split into two day-segments happens only inside validation here, and inside
 * the scheduler on the server. It is never persisted or shown.
 *
 * start === end stays invalid, exactly as before, so nobody acquires a 24-hour
 * window by typing the same time twice.
 */

export const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export const MINUTES_IN_DAY = 24 * 60;

/** Minutes since local midnight for "HH:mm". NaN for anything unparseable. */
export const timeToMinutes = (time) => {
  const [hours, minutes] = String(time ?? '').split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : NaN;
};

export const nextWeekday = (day) => {
  const index = WEEKDAYS.indexOf(day);
  return index === -1 ? null : WEEKDAYS[(index + 1) % WEEKDAYS.length];
};

const titleCase = (value) => String(value || '').charAt(0).toUpperCase() + String(value || '').slice(1);

/**
 * True when this range runs past midnight. Used by the editor to badge the row
 * so an overnight range reads as intentional rather than as a typo.
 */
export const isOvernightRange = (range) => {
  const start = timeToMinutes(range?.start);
  const end = timeToMinutes(range?.end);
  return Number.isFinite(start) && Number.isFinite(end) && end < start;
};

const formatRange = (range) => `${range?.start ?? '?'}-${range?.end ?? '?'}`;

/**
 * Expand every range into the concrete minute segments it occupies, keyed by
 * the day those minutes land on. An overnight range yields two: the tail of
 * its own day and the head of the next. That second segment is the only way to
 * catch a clash with a range configured on the following day.
 */
export const expandScheduleSegments = (days = {}) => {
  const segments = Object.fromEntries(WEEKDAYS.map((day) => [day, []]));

  for (const day of WEEKDAYS) {
    const ranges = Array.isArray(days?.[day]) ? days[day] : [];

    for (const range of ranges) {
      const start = timeToMinutes(range?.start);
      const end = timeToMinutes(range?.end);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;

      const origin = { day, label: formatRange(range) };

      if (end > start) {
        segments[day].push({ start, end, ...origin });
        continue;
      }
      if (end === start) continue;

      segments[day].push({ start, end: MINUTES_IN_DAY, ...origin });
      const spillDay = nextWeekday(day);
      if (spillDay) segments[spillDay].push({ start: 0, end, ...origin });
    }
  }

  return segments;
};

export const hasAnyRange = (days = {}) =>
  WEEKDAYS.some((day) => (Array.isArray(days?.[day]) ? days[day].length : 0) > 0);

/**
 * First problem with a weekly schedule as a user-facing sentence, or null.
 *
 * Boundary rule: touching ranges are allowed (09:00-12:00 beside 12:00-18:00),
 * because windows are half-open [start, end) and the comparison is a strict >.
 * Identical to the server's rule and to how the scheduler evaluates them.
 */
export const validateScheduleDays = (days = {}) => {
  // Pass 1 — each range on its own.
  for (const day of WEEKDAYS) {
    const ranges = Array.isArray(days?.[day]) ? days[day] : [];
    for (const range of ranges) {
      if (!range?.start || !range?.end) {
        return `${titleCase(day)}: fill in both start and end times.`;
      }
      const start = timeToMinutes(range.start);
      const end = timeToMinutes(range.end);
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        return `${titleCase(day)}: enter a valid time.`;
      }
      if (start === end) {
        return `${titleCase(day)}: start and end time cannot be the same.`;
      }
    }
  }

  // Pass 2 — overlaps on each day's real timeline, including minutes carried
  // in by the previous day's overnight range.
  const segments = expandScheduleSegments(days);

  for (const day of WEEKDAYS) {
    const sorted = segments[day].slice().sort((a, b) => a.start - b.start);

    for (let index = 0; index < sorted.length - 1; index += 1) {
      const current = sorted[index];
      const next = sorted[index + 1];
      if (current.end <= next.start) continue;

      if (current.day === next.day) {
        return `${titleCase(current.day)}: time ranges cannot overlap.`;
      }

      const overnight = current.day === day ? next : current;
      const sameDay = current.day === day ? current : next;
      return (
        `${titleCase(overnight.day)} ${overnight.label} runs overnight into ` +
        `${titleCase(day)} and overlaps ${titleCase(sameDay.day)} ${sameDay.label}.`
      );
    }
  }

  return null;
};
