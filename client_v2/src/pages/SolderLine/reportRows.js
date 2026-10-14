import { clock, dur } from './solderLineData.js';
import { panelCounts, panelReportFields } from './panelCounts.js';

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
    if (station.panels?.length) return [...station.panels].reverse().filter(panel => panelCounts(panel).missedJoints > 0).map(panel => ({
      'Missed points': panelCounts(panel).missedJoints, Panel: panel.panelId || '—',
      Time: panel.start.format('DD MMM HH:mm:ss'), Snapshot: snapshotUrl(panel.image),
    }));
    const panels = new Map();
    for (const missed of [...station.missed].reverse()) {
      // Panel numbers can restart, so preserve distinct incidents/timestamps.
      const key = missed.incidentId || `${missed.panelId}:${missed.start.valueOf()}`;
      if (!panels.has(key)) panels.set(key, {
        'Missed points': 0, Panel: missed.panelId || '—',
        Time: missed.start.format('DD MMM HH:mm:ss'), Snapshot: snapshotUrl(missed.image),
      });
      const row = panels.get(key);
      row['Missed points'] = missed.missedJoints != null ? Math.max(row['Missed points'], missed.missedJoints) : row['Missed points'] + 1;
    }
    return [...panels.values()];
  }
  if (type === 'total') {
    const panels = station.panels || [];
    const pointCount = Math.max(0, ...panels.map(panel => Math.max(panelCounts(panel).requiredJoints, panelCounts(panel).completedJoints)));
    return [...panels].reverse().map(panel => ({ Panel: panel.panelId || '—', Time: panel.start.format('DD MMM HH:mm:ss'),
      ...panelReportFields(panel, pointCount), Snapshot: snapshotUrl(panel.image),
    }));
  }
  return station.hourly.map(hour => ({
    Hour: `${hour.h}:00-${String(Number(hour.h) + 1).padStart(2, '0')}:00`, Panels: hour.panels,
    ...(type === 'panels' ? {} : { 'Completed joints': hour.completedJoints, 'Missed joints': hour.missedJoints ?? 0, ...Object.fromEntries(station.ops.flatMap(operator => {
      const cell = hour.ops[operator.i];
      return [[`${operator.code} joints`, cell.joints]];
    })) }),
  }));
}
