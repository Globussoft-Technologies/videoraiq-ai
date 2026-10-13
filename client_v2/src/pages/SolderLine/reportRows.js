import { clock, dur } from './solderLineData.js';

export const REPORT_METRICS = [
  ['Presence', '% of the range at desk', operator => operator.presence, 'high', value => `${value.toFixed(1)}%`],
  ['Absence alerts', 'desk empty past threshold', operator => operator.alerts, 'low', String],
  ['Unavailable time', 'total time away', operator => operator.away, 'low', dur],
  ['Missed points', 'panel total across all workers', operator => operator.missed, 'low', String],
];

export function buildSolderReportRows(type, station, snapshotUrl = value => value || '') {
  if (type === 'compare') return REPORT_METRICS.map(([name, , get, , format]) => ({
    Metric: name,
    ...Object.fromEntries(station.ops.map(operator => [`${operator.code} · ${operator.zone}`, get(operator) == null ? '—' : format(get(operator))])),
    'All workers': name === 'Missed points' ? station.sum?.missed ?? 0 : '—',
  }));
  if (type === 'absence') return [...station.absences].reverse().map(absence => ({
    Operator: `OP-${absence.op + 1} · ${absence.zone}`,
    Started: absence.start.format('DD MMM HH:mm:ss'),
    Condition: absence.description || `${absence.zone} desk empty`,
    Returned: absence.end ? clock(absence.end) : 'Not returned',
    Duration: dur(absence.durSec),
    Snapshot: snapshotUrl(absence.image),
  }));
  if (type === 'missed') {
    const panels = new Map();
    for (const missed of [...station.missed].reverse()) {
      // Panel numbers can restart, so preserve distinct incidents/timestamps.
      const key = missed.incidentId || `${missed.panelId}:${missed.start.valueOf()}`;
      if (!panels.has(key)) panels.set(key, {
        'Missed points': 0, Panel: missed.panelId || '—', Operator: 'All workers',
        Time: missed.start.format('DD MMM HH:mm:ss'), Snapshot: snapshotUrl(missed.image),
      });
      panels.get(key)['Missed points'] += 1;
    }
    return [...panels.values()];
  }
  return station.hourly.map(hour => ({
    Hour: `${hour.h}:00`, Panels: hour.panels,
    ...(type === 'panels' ? {} : { 'Completed joints': hour.ops.reduce((sum, operator) => sum + operator.joints, 0), 'Missed joints': hour.missedJoints ?? 0, ...Object.fromEntries(station.ops.flatMap(operator => {
      const cell = hour.ops[operator.i];
      return [[`${operator.code} joints`, cell.joints]];
    })) }),
  }));
}
