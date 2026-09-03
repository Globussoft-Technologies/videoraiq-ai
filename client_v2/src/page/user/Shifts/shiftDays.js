/**
 * Shared day vocabulary for Shift Management.
 *
 * Ordered Sunday-first to match `Date#getDay()` (and the server's
 * SHIFT_DAY_KEYS), so the table's S M T W T F S strip and the form's tiles are
 * the same sequence the backend grades attendance against.
 */
export const DAYS = [
  { key: 'sunday', short: 'Sun', letter: 'S' },
  { key: 'monday', short: 'Mon', letter: 'M' },
  { key: 'tuesday', short: 'Tue', letter: 'T' },
  { key: 'wednesday', short: 'Wed', letter: 'W' },
  { key: 'thursday', short: 'Thu', letter: 'T' },
  { key: 'friday', short: 'Fri', letter: 'F' },
  { key: 'saturday', short: 'Sat', letter: 'S' },
];

/** Click order of the day tiles: Off -> Full Day -> Half Day -> Off. */
export const DAY_CYCLE = ['off', 'full', 'half'];

export const DAY_TYPE_META = {
  off: { label: 'Off', bg: 'var(--bg3)', fg: 'var(--tx3)', border: 'var(--bd)' },
  full: { label: 'Full', bg: 'var(--blue)', fg: '#fff', border: 'var(--blue)' },
  half: { label: 'Half', bg: 'var(--warn)', fg: '#1a1205', border: 'var(--warn)' },
};

export const nextDayType = (current) =>
  DAY_CYCLE[(DAY_CYCLE.indexOf(current) + 1) % DAY_CYCLE.length] || 'full';

/** A Mon-Fri week — what a brand-new shift starts on. */
export const defaultWorkingDays = () =>
  Object.fromEntries(
    DAYS.map(({ key }) => [
      key,
      { type: key === 'sunday' || key === 'saturday' ? 'off' : 'full' },
    ]),
  );

/**
 * Normalise whatever the API returned into `{ day: { type, start, end } }`.
 *
 * The list endpoint already resolves `workingDays` for every shift, but a
 * pre-rework shift edited straight from a cached row may still arrive with only
 * the legacy `timings` block, so that path is handled too.
 *
 * `start`/`end` come back blank unless the day genuinely runs a different
 * window from the shift: the server resolves every day against the shift-level
 * times, so keeping those would turn each one into an explicit override and
 * later edits to Start/End Time would stop reaching them.
 */
export const readWorkingDays = (shift) => {
  const override = (start, end) => ({
    start: start && start !== shift?.startTime ? start : '',
    end: end && end !== shift?.endTime ? end : '',
  });

  return Object.fromEntries(
    DAYS.map(({ key }) => {
      const configured = shift?.workingDays?.[key];
      if (configured?.type) {
        return [key, { type: configured.type, ...override(configured.start, configured.end) }];
      }
      const legacy = shift?.timings?.[key];
      if (legacy && typeof legacy.enabled === 'boolean') {
        return [
          key,
          { type: legacy.enabled ? 'full' : 'off', ...override(legacy.start, legacy.end) },
        ];
      }
      return [key, { type: key === 'sunday' || key === 'saturday' ? 'off' : 'full', start: '', end: '' }];
    }),
  );
};

/** "HH:MM" -> minutes since midnight, or null. */
export const toMinutes = (value) => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

/**
 * Length of the shift window in minutes, wrapping past midnight for a night
 * shift so 22:00-06:00 reads as 8 hours rather than a negative span.
 */
export const windowMinutes = (start, end) => {
  const from = toMinutes(start);
  const to = toMinutes(end);
  if (from === null || to === null) return null;
  return to > from ? to - from : to + 24 * 60 - from;
};

/** "8h 30m", for the table's duration column. */
export const formatDuration = (minutes) => {
  if (minutes === null || minutes === undefined) return '—';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (!hours) return `${mins}m`;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
};
