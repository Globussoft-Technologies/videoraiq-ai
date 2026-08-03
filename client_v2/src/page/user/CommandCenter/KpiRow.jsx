import { useNavigate } from 'react-router-dom';
import KpiCard from '../../../components/KpiCard';
import { num } from '../../../lib/format';

/**
 * Six KPI tiles. Backed metrics come from dashboard/headerStats, the detection
 * chart (events) and the locations master (sites).
 *
 * "Cameras Online" does not use stats.activeCameras because that backend field
 * counts cameras with an AI detection engine enabled, not cameras that are
 * live/streaming. LiveCamera probes the filtered camera streams and reports how
 * many actually connect.
 */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayIndex() {
  return (new Date().getDay() + 6) % 7;
}

function toCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? count : 0;
}

function signedDelta(delta) {
  if (delta > 0) return `+${num(delta)}`;
  if (delta < 0) return `-${num(Math.abs(delta))}`;
  return '0';
}

function dayTrend(dailyComparison, key) {
  const hasComparison = !!(dailyComparison?.today && dailyComparison?.previous);
  const today = toCount(dailyComparison?.today?.[key]);
  const previous = toCount(dailyComparison?.previous?.[key]);
  const delta = today - previous;

  return {
    spark: hasComparison ? [previous, today] : [0, 0],
    delta: hasComparison ? signedDelta(delta) : null,
    title: hasComparison ? `Today ${num(today)} vs previous day ${num(previous)}` : undefined,
  };
}

export default function KpiRow({
  stats = {},
  incidentCounts = null,
  dailyTotals = [],
  dailyComparison = null,
  eventsToday,
  sitesCount = 0,
  onlineCameras = { online: 0, total: 0 },
  loading,
}) {
  const navigate = useNavigate();
  const todayEvents = eventsToday ?? (dailyTotals.length ? dailyTotals[todayIndex()] : 0);
  const camerasTotal = onlineCameras.total || Number(stats.overAllCameraCount ?? 0);
  const cameras = `${num(onlineCameras.online)}/${num(camerasTotal)}`;
  const activeAlerts = incidentCounts?.status?.new ?? stats.totalAlerts ?? 0;
  const highAlerts = incidentCounts?.severity?.high ?? stats.criticalAlerts ?? 0;
  const resolved = incidentCounts?.status?.resolved ?? stats.incidentsResolved ?? 0;
  const activeTrend = dayTrend(dailyComparison, 'activeAlerts');
  const highTrend = dayTrend(dailyComparison, 'highAlerts');
  const eventsTrend = dayTrend(dailyComparison, 'events');
  const resolvedTrend = dayTrend(dailyComparison, 'resolved');

  const cards = [
    { label: 'Cameras Online', value: cameras, sub: `${num(camerasTotal)} total`, color: 'var(--blue)', delta: cameras, deltaColor: 'var(--blue)', onClick: () => navigate('/live') },
    { label: 'Active Alerts', value: num(activeAlerts), sub: 'unresolved', color: 'var(--warn)', spark: activeTrend.spark, delta: activeTrend.delta, title: activeTrend.title, fallbackSpark: false, deltaColor: 'var(--warn)', onClick: () => navigate('/alerts', { state: { statusFilter: 'new' } }) },
    { label: 'High', value: num(highAlerts), sub: 'high severity', color: 'var(--crit)', spark: highTrend.spark, delta: highTrend.delta, title: highTrend.title, fallbackSpark: false, deltaColor: 'var(--crit)', onClick: () => navigate('/incidents', { state: { severityFilter: 'high' } }) },
    { label: 'Events Today', value: num(todayEvents), sub: 'detections today', color: 'var(--violet)', spark: eventsTrend.spark, delta: eventsTrend.delta, title: eventsTrend.title, fallbackSpark: false, deltaColor: 'var(--violet)', onClick: () => navigate('/incidents', { state: { date: todayStr() } }) },
    { label: 'Resolved', value: num(resolved), sub: 'incidents', color: 'var(--ok)', spark: resolvedTrend.spark, delta: resolvedTrend.delta, title: resolvedTrend.title, fallbackSpark: false, deltaColor: 'var(--ok)', onClick: () => navigate('/incidents', { state: { statusFilter: 'resolved' } }) },
    { label: 'Sites Online', value: sitesCount ? `${sitesCount}/${sitesCount}` : '\u2014', sub: 'monitored', color: 'var(--cyan)', delta: sitesCount ? '100%' : null, deltaColor: 'var(--cyan)', unavailable: !sitesCount, onClick: () => navigate('/locations') },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 14 }} className="vq-kpi-row">
      {cards.map((card) => (
        <KpiCard key={card.label} {...card} loading={loading} />
      ))}
    </div>
  );
}
