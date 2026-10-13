import { clock, dur } from './solderLineData.js';

export const REPORT_METRICS = [
  ['Presence', '% of the range at desk', operator => operator.presence, 'high', value => `${value.toFixed(1)}%`],
  ['Absence alerts', 'desk empty past threshold', operator => operator.alerts, 'low', String],
  ['Unavailable time', 'total time away', operator => operator.away, 'low', dur],
  ['Missed points', 'skipped joints', operator => operator.missed, 'low', String],
];

export function buildSolderReportRows(type, station, snapshotUrl = value => value || '') {
  if (type === 'compare') return REPORT_METRICS.map(([name, , get, , format]) => ({
    Metric: name,
    ...Object.fromEntries(station.ops.map(operator => [`${operator.code} · ${operator.zone}`, get(operator) == null ? '—' : format(get(operator))])),
  }));
  if (type === 'absence') return [...station.absences].reverse().map(absence => ({
    Operator: `OP-${absence.op + 1} · ${absence.zone}`,
    Started: absence.start.format('DD MMM HH:mm:ss'),
    Condition: absence.description || `${absence.zone} desk empty`,
    Returned: absence.end ? clock(absence.end) : 'Not returned',
    Duration: dur(absence.durSec),
    Snapshot: snapshotUrl(absence.image),
  }));
  if (type === 'missed') return [...station.missed].reverse().map(missed => ({
    Point: `P${missed.point ?? '?'}`, Panel: missed.panelId || '—',
    Operator: `OP-${missed.op + 1} · ${missed.zone}`, Time: missed.start.format('DD MMM HH:mm:ss'),
    Snapshot: snapshotUrl(missed.image),
  }));
  return station.hourly.map(hour => ({
    Hour: `${hour.h}:00`, Panels: hour.panels,
    ...(type === 'panels' ? {} : Object.fromEntries(station.ops.flatMap(operator => {
      const cell = hour.ops[operator.i];
      return [[`${operator.code} joints`, cell.joints], [`${operator.code} missed`, cell.missed]];
    }))),
  }));
}
