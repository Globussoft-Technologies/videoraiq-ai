/**
 * Returns true if seeking to `offsetMs` within the day starting at `dayStart`
 * targets a time in the future relative to `now`.
 *
 * @param {number|Date} dayStart - Start of the day (timestamp or Date object)
 * @param {number} offsetMs - Milliseconds from the start of the day
 * @param {number} [now=Date.now()] - Current epoch timestamp
 * @returns {boolean}
 */
export function isFutureSeek(dayStart, offsetMs, now = Date.now()) {
  const start = typeof dayStart === 'number' ? dayStart : new Date(dayStart).getTime();
  return start + offsetMs > now;
}
