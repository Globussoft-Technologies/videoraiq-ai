import KpiCard from '../../../components/KpiCard';
import { num } from '../../../lib/format';

/**
 * Six KPI tiles. Backed metrics come from dashboard/headerStats, the detection
 * chart (events) and the locations master (sites). Metrics with no backend
 * source yet (avg latency, accuracy) render as "unavailable" rather than mock.
 *
 * "Cameras Online" does NOT use stats.activeCameras — that backend field
 * actually counts cameras with an AI detection engine enabled, not cameras
 * that are live/streaming (there's no org-wide "is this stream up" query).
 * Instead LiveCamera probes every filtered camera's stream in the background
 * and reports how many actually connect, out of the filtered total.
 */
export default function KpiRow({ stats = {}, dailyTotals = [], sitesCount = 0, onlineCameras = { online: 0, total: 0 }, loading }) {
  const eventsToday = dailyTotals.length ? dailyTotals[dailyTotals.length - 1] : 0;
  const camerasTotal = onlineCameras.total || num(stats.overAllCameraCount ?? 0);
  const cameras = `${num(onlineCameras.online)}/${num(camerasTotal)}`;

  const cards = [
    { label: 'Cameras Online', value: cameras, sub: 'streaming now', color: 'var(--blue)' },
    { label: 'Active Alerts', value: num(stats.totalAlerts ?? 0), sub: 'unresolved', color: 'var(--warn)', spark: dailyTotals },
    { label: 'Critical', value: num(stats.criticalAlerts ?? 0), sub: 'high severity', color: 'var(--crit)' },
    { label: 'Events Today', value: num(eventsToday), sub: 'detections', color: 'var(--violet)', spark: dailyTotals },
    { label: 'Resolved', value: num(stats.incidentsResolved ?? 0), sub: 'incidents', color: 'var(--ok)' },
    { label: 'Sites Online', value: sitesCount ? `${sitesCount}/${sitesCount}` : '—', sub: 'monitored', color: 'var(--cyan)', unavailable: !sitesCount },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 14 }} className="vq-kpi-row">
      {cards.map((c) => (
        <KpiCard key={c.label} {...c} loading={loading} />
      ))}
    </div>
  );
}
