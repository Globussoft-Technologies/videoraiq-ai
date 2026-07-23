import { useNavigate } from 'react-router-dom';
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
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// dailyTotals is Monday-first (index 0 = Monday … 6 = Sunday), matching the
// backend's isoDayOfWeek bucketing — Date.getDay() is Sunday-first (0-6), so
// convert to the same Monday-first index instead of assuming "today" is
// always the last slot (which only holds true on Sundays).
function todayIndex() {
  return (new Date().getDay() + 6) % 7;
}

export default function KpiRow({ stats = {}, dailyTotals = [], sitesCount = 0, onlineCameras = { online: 0, total: 0 }, loading }) {
  const navigate = useNavigate();
  const eventsToday = dailyTotals.length ? dailyTotals[todayIndex()] : 0;
  const camerasTotal = onlineCameras.total || num(stats.overAllCameraCount ?? 0);
  const cameras = `${num(onlineCameras.online)}/${num(camerasTotal)}`;

  const cards = [
    { label: 'Cameras Online', value: cameras, sub: 'streaming now', color: 'var(--blue)', onClick: () => navigate('/live') },
    { label: 'Active Alerts', value: num(stats.totalAlerts ?? 0), sub: 'unresolved', color: 'var(--warn)', spark: dailyTotals, onClick: () => navigate('/alerts', { state: { statusFilter: 'new' } }) },
    { label: 'High', value: num(stats.criticalAlerts ?? 0), sub: 'high severity', color: 'var(--crit)', onClick: () => navigate('/incidents', { state: { severityFilter: 'high' } }) },
    { label: 'Events Today', value: num(eventsToday), sub: 'detections', color: 'var(--violet)', spark: dailyTotals, onClick: () => navigate('/incidents', { state: { date: todayStr() } }) },
    { label: 'Resolved', value: num(stats.incidentsResolved ?? 0), sub: 'incidents', color: 'var(--ok)', onClick: () => navigate('/incidents', { state: { statusFilter: 'resolved' } }) },
    { label: 'Sites Online', value: sitesCount ? `${sitesCount}/${sitesCount}` : '—', sub: 'monitored', color: 'var(--cyan)', unavailable: !sitesCount, onClick: () => navigate('/locations') },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 14 }} className="vq-kpi-row">
      {cards.map((c) => (
        <KpiCard key={c.label} {...c} loading={loading} />
      ))}
    </div>
  );
}
