import moment from 'moment';

const INCIDENT_URL = import.meta.env.VITE_INCIDENT_URL || '';

/**
 * Prefix a backend-relative incident/snapshot image path with VITE_INCIDENT_URL.
 * Mirrors V1 (`${VITE_INCIDENT_URL}${item.Image}`). Already-absolute URLs and
 * empty values pass through unchanged.
 */
export function mediaUrl(path) {
  if (!path) return '';
  if (/^(https?:)?\/\//i.test(path) || /^data:/i.test(path)) return path;
  return `${INCIDENT_URL}${path}`;
}

/** "5 min ago" style relative time. */
export function timeAgo(date) {
  if (!date) return '';
  const m = moment(date);
  if (!m.isValid()) return '';
  return m.fromNow();
}

/** "14:32:05" local time-of-day. */
export function timeOfDay(date) {
  if (!date) return '';
  const m = moment(date);
  return m.isValid() ? m.format('HH:mm:ss') : '';
}

/** "Jun 29, 14:32" */
export function shortDateTime(date) {
  if (!date) return '';
  const m = moment(date);
  return m.isValid() ? m.format('MMM D, HH:mm') : '';
}

/** Thousands-separated integer. */
export function num(n) {
  if (n == null || Number.isNaN(Number(n))) return '0';
  return Number(n).toLocaleString();
}

/** Map a backend severity to a short label + color. */
// Labels are spelled out rather than clipped to 4 chars: the old truncation
// turned "moderate" into "MODE", and abbreviating it to "MED" still didn't
// match the "Medium" the severity filter chips use. Kept in sync with
// SEV_LABEL in Incidents/IncidentCard.jsx.
export function severity(sev) {
  const s = (sev || '').toLowerCase();
  if (s === 'critical') return { short: 'CRIT', color: 'var(--crit)' };
  if (s === 'high') return { short: 'HIGH', color: 'var(--crit)' };
  if (s === 'moderate' || s === 'medium') return { short: 'MEDIUM', color: 'var(--warn)' };
  if (s === 'low') return { short: 'LOW', color: 'var(--tx3)' };
  // Unknown severity: show it in full. Truncating here is what hid the bug.
  return { short: (sev || 'INFO').toUpperCase(), color: 'var(--blue)' };
}

/** Human display name for an incident/detection type. */
export function detectionLabel(type) {
  if (!type) return 'Detection';
  return String(type)
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();
}
