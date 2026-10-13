import moment from 'moment-timezone';
import { buildReportPdf, buildReportXlsx } from './reportLayout.js';
import { solderPanelCounts } from '../../../utils/solderPanelCounts.js';

export const REPORT_TITLES = { compare: 'Operator comparison', absence: 'Absence report', missed: 'Missed solder report', hourly: 'Hourly activity', panels: 'Panels counted per hour' };

export function resolveSnapshotUrl(image, baseUrl = '') {
  if (typeof image !== 'string' || !image.trim()) return '';
  image = image.trim();
  if (/^https?:\/\//i.test(image)) return image;
  if (!/^([a-z][a-z\d+.-]*:|\/\/)/i.test(image) && /^https?:\/\//i.test(baseUrl)) return `${baseUrl.replace(/\/+$/, '')}/${image.replace(/^\/+/, '')}`;
  return '';
}

/** Exact report window; an overlapping absence contributes only time inside it. */
export function buildReportRows(type, { channel, panels, absences, window, timezone, snapshotBase = '' }) {
  const countedPanels = panels.map(panel => ({ ...panel, ...solderPanelCounts(panel) }));
  const totalMissed = countedPanels.reduce((sum, panel) => sum + panel.missedJoints, 0);
  const zones = (channel.detections?.deskSolarShoulderDetectionSettings?.id?.settings?.zone_configs || []).map((z) => z.name);
  [...new Set([...panels.flatMap((p) => (p.zones || []).map((z) => z.zone)), ...absences.map((a) => a.zone)].filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).forEach((z) => { if (!zones.includes(z)) zones.push(z); });
  const operator = (zone) => `OP-${zones.indexOf(zone) + 1} · ${zone || 'Unassigned'}`;
  const stamp = (date) => moment(date).tz(timezone).format('DD MMM YYYY HH:mm:ss');
  const clipped = absences.map((a) => {
    const start = new Date(a.timeOfIncident).getTime();
    const duration = a.durationSec == null || a.durationSec === '' ? NaN : Number(a.durationSec);
    // Use the measured API duration; an open incident is not a live timer.
    const end = Number.isFinite(duration) && duration >= 0 ? start + duration * 1000
      : a.returnedAt ? new Date(a.returnedAt).getTime() : start;
    return { ...a, start: Math.max(start, window.start.valueOf()), end: Math.min(end, window.end.valueOf()),
      duration: Number.isFinite(duration) && duration >= 0 ? duration : a.returnedAt && Number.isFinite(end) ? Math.max(0, (end - start) / 1000) : null };
  }).filter((a) => a.end > a.start || (new Date(a.timeOfIncident).getTime() >= window.start.valueOf() && new Date(a.timeOfIncident).getTime() < window.end.valueOf()));
  if (type === 'absence') return clipped.map((a) => ({
    Operator: operator(a.zone), Started: stamp(a.timeOfIncident), Condition: a.description || `${a.zone || 'Desk'} desk empty`,
    Returned: a.returnedAt ? stamp(a.returnedAt) : 'Not returned',
    Duration: a.duration == null ? '—' : `${a.duration} s`, Snapshot: resolveSnapshotUrl(a.Image, snapshotBase),
  }));
  if (type === 'missed') return countedPanels.filter(panel => panel.missedJoints > 0).map((p) => ({
      'Missed points': p.missedJoints, Panel: p.panelId, Operator: 'All workers',
      Time: stamp(p.time), Snapshot: resolveSnapshotUrl(p.Image, snapshotBase),
    }));
  if (type === 'hourly' || type === 'panels') {
    const buckets = new Map();
    for (const p of countedPanels) {
      const hour = moment(p.time).tz(timezone).format('YYYY-MM-DD HH:00 Z');
      if (!buckets.has(hour)) buckets.set(hour, { Hour: hour, Panels: 0, ...(type === 'panels' ? {} : { 'Completed joints': 0, 'Missed joints': 0 }) });
      const row = buckets.get(hour); row.Panels++;
      if (type === 'panels') continue;
      row['Completed joints'] += p.completedJoints;
      row['Missed joints'] += p.missedJoints;
      for (const zone of zones) {
        const z = (p.zones || []).find((v) => v.zone === zone);
        for (const [metric, value] of [['joints', z?.done || 0]]) {
          const key = `${operator(zone)} ${metric}`; row[key] = (row[key] || 0) + value;
        }
      }
    }
    return [...buckets.values()];
  }
  return [...zones.map((zone) => {
    const intervals = clipped.filter((a) => a.zone === zone).sort((a, b) => a.start - b.start);
    // Merge overlapping absence intervals so presence cannot double-count gaps.
    const merged = [];
    for (const a of intervals.filter((interval) => interval.end > interval.start)) {
      const last = merged.at(-1);
      if (last && a.start <= last.end) last.end = Math.max(last.end, a.end);
      else merged.push({ start: a.start, end: a.end });
    }
    const away = merged.reduce((n, a) => n + (a.end - a.start) / 1000, 0);
    return { Operator: operator(zone), 'Presence (%)': Number((100 * (1 - away / window.end.diff(window.start, 'seconds'))).toFixed(1)),
      'Absence alerts': intervals.length, 'Unavailable seconds': Math.round(away),
      'Missed points': totalMissed ? 'Not reported per worker' : 0 };
  }), { Operator: 'Panel total (all workers)', 'Presence (%)': '—', 'Absence alerts': '—', 'Unavailable seconds': '—', 'Missed points': totalMissed }];
}

export async function buildAttachments(rows, title, subtitle, formats) {
  const attachments = [];
  if (formats.includes('xlsx')) {
    const buffer = await buildReportXlsx(rows, title, subtitle);
    attachments.push({ content: buffer.toString('base64'), filename: 'solder-report.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', disposition: 'attachment' });
  }
  if (formats.includes('pdf')) {
    const buffer = await buildReportPdf(rows, title, subtitle);
    attachments.push({ content: buffer.toString('base64'), filename: 'solder-report.pdf', type: 'application/pdf', disposition: 'attachment' });
  }
  return attachments;
}
