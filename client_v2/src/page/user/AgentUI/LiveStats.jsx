import { engineMeta } from '@/lib/engineMeta';
import { useApi } from '@/hooks/useApi';
import { fetchIncidents } from '@/helpers/incidents';

function DetectionTypeChart({ rows, total }) {
  const visible = rows.slice(0, 11);
  const other = rows.slice(11).reduce((total, row) => total + Number(row.count), 0);
  const bars = other ? [...visible, { type: 'other', count: other }] : visible;
  const max = Math.max(1, ...bars.map((row) => Number(row.count) || 0));
  const summary = rows.length
    ? `Today's detections by type: ${rows.map((row) => `${engineMeta(row.type).name}: ${row.count}`).join(', ')}`
    : total > 0 ? 'Detection activity; breakdown unavailable' : 'No detections by type today';

  return <div className="agent-type-chart agent-bars" role="img" aria-label={summary}>
    {!bars.length && total > 0 && <div className="agent-type-activity" aria-hidden="true" />}
    {bars.map((row, index) => {
      const name = row.type === 'other' ? 'Other types' : engineMeta(row.type).name;
      return <i key={row.type} className="is-active" title={`${name}: ${Number(row.count).toLocaleString()}`} style={{ height: `${Math.max(12, Number(row.count) / max * 100)}%`, animationDelay: `${0.9 + index * 0.06}s` }} />;
    })}
  </div>;
}

export default function LiveStats({ detections, incidents, detectionBars = [] }) {
  const today = new Date().toLocaleDateString('en-CA');
  const alertsApi = useApi(
    () => fetchIncidents(
      { skip: 0, limit: 1 },
      { startDate: today, endDate: today, severity: ['critical', 'Critical', 'CRITICAL'], statusFilter: ['new', 'resolved', 'reported'] },
    ),
    [today],
    { pollMs: 60000, pollSilent: true },
  );
  const alertsToday = alertsApi.data ? Number(alertsApi.data.totalCount) : null;
  const values = [alertsToday, detections, incidents];
  return <section className="agent-live-stats grid grid-cols-3">
    {['Critical alerts', 'Detections today', 'Open incidents'].map((label, index) => {
      const value = values[index];
      return <div className="agent-tile" key={label}>
        <span>{label}</span>
        <b key={`${index}-${value}`} className="agent-bump">{Number.isFinite(value) ? value.toLocaleString() : '—'}</b>
        {index === 0 && <div className="agent-scan" aria-label={`${alertsToday ?? 0} critical alerts today`} />}
        {index === 1 && <DetectionTypeChart rows={detectionBars} total={detections} />}
        {index === 2 && <div className="agent-scan" />}
      </div>;
    })}
  </section>;
}
