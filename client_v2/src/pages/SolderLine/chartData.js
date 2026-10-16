import moment from 'moment-timezone';

/** Chart totals come from the complete dated API aggregates, not the capped panel logs. */
export function buildChartSeries({ startDate, endDate, timezone = 'UTC', records, hourly, zones, pointsPerPanel = 6 }) {
  const start = moment.tz(startDate, 'YYYY-MM-DD', true, timezone).startOf('day');
  const end = moment.tz(endDate, 'YYYY-MM-DD', true, timezone).startOf('day');
  const scope = `${startDate}:${endDate}`;
  if (!start.isValid() || !end.isValid() || end.isBefore(start)) return { unit: 'hour', scope, rows: [] };
  const days = end.diff(start, 'days');
  const unit = days >= 365 ? 'year'
    : end.clone().add(1, 'day').isAfter(start.clone().add(1, 'month')) ? 'month'
      : days >= 7 ? 'week' : 'hour';
  if (unit === 'hour') return { unit, scope, rows: hourly.map(row => ({ ...row, key: row.h, label: row.h,
    tooltipLabel: `${row.h}:00-${String(Number(row.h) + 1).padStart(2, '0')}:00`,
  })) };

  const rows = [], buckets = new Map();
  const zoneIndex = new Map(zones.map((name, index) => [name, index]));
  const cursor = unit === 'year' ? start.clone().startOf('year') : unit === 'month' ? start.clone().startOf('month') : start.clone();
  while (!cursor.isAfter(end)) {
    const first = moment.max(cursor.clone(), start);
    const last = moment.min(
      unit === 'year' ? cursor.clone().endOf('year').startOf('day')
        : unit === 'month' ? cursor.clone().endOf('month').startOf('day')
          : cursor.clone().add(6, 'days'),
      end,
    );
    const key = unit === 'year' ? cursor.format('YYYY')
      : unit === 'month' ? cursor.format('YYYY-MM') : first.format('YYYY-MM-DD');
    const row = { key,
      label: unit === 'year' ? cursor.format('YYYY') : unit === 'month' ? cursor.format('MMM YYYY') : `Week ${rows.length + 1}`,
      labelDetail: unit === 'week' ? `${first.format(first.isSame(last, 'month') ? 'DD' : 'DD MMM')}-${last.format('DD MMM')}` : '',
      tooltipLabel: `${first.format('DD MMM YYYY')}-${last.format('DD MMM YYYY')}`,
      panels: 0, missedJoints: 0, requiredJoints: 0, ops: zones.map(() => ({ joints: 0, solderSec: 0 })),
    };
    rows.push(row); buckets.set(key, row);
    cursor.add(1, unit === 'year' ? 'year' : unit === 'month' ? 'month' : 'week');
  }
  for (const record of records) {
    // API hour keys already use the account's timezone; do not parse them as UTC.
    const date = moment.tz(record.hour.slice(0, 10), 'YYYY-MM-DD', true, timezone);
    if (!date.isValid() || date.isBefore(start) || date.isAfter(end)) continue;
    const key = unit === 'year' ? date.format('YYYY')
      : unit === 'month' ? date.format('YYYY-MM')
        : start.clone().add(Math.floor(date.diff(start, 'days') / 7) * 7, 'days').format('YYYY-MM-DD');
    const row = buckets.get(key);
    row.panels += record.panels;
    row.missedJoints += record.missedJoints || 0;
    row.requiredJoints += record.requiredJoints ?? record.panels * pointsPerPanel;
    for (const zone of record.zones) {
      const cell = row.ops[zoneIndex.get(zone.zone)];
      if (!cell) continue;
      cell.joints += zone.joints;
      cell.solderSec += zone.solderSec;
    }
  }
  return { unit, scope, rows };
}
