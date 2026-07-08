import { useApi } from '../../../hooks/useApi';
import { getAnalyticsOverview } from '../../../helpers/analytics';
import { num } from '../../../lib/format';
import { rangeLabel } from './RangeFilter';

function Tile({ label, value, sub, subColor = 'var(--tx3)', color = 'var(--tx)', loading }) {
  return (
    <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 13, padding: 15 }}>
      <div style={{ fontSize: 11, color: 'var(--tx2)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 25, marginTop: 5, color }}>
        {loading ? '…' : value}
      </div>
      <div style={{ fontSize: 11, color: subColor, marginTop: 3 }}>{loading ? '' : sub}</div>
    </div>
  );
}

/**
 * All 4 tiles are real, derived from /api/v1/analytics/overview. The original
 * mockup's False Positive Rate / Mean Response Time / Platform Uptime tiles
 * are gone — nothing in the system tracks that data — so they're replaced
 * with metrics that actually exist: resolved rate, active cameras and the
 * busiest site.
 */
export default function OverviewKpiRow({ params }) {
  const paramsKey = JSON.stringify(params);
  const api = useApi(() => getAnalyticsOverview(params), [paramsKey], { pollMs: 120000 });
  const d = api.data || {};
  const label = rangeLabel(d);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }} className="vq-analytics-kpis">
      <Tile
        label={`Total Detections · ${label}`}
        value={num(d.totalDetections)}
        sub="incidents in range"
        loading={api.loading}
      />
      <Tile
        label="Resolved Rate"
        value={`${d.resolvedRate ?? 0}%`}
        sub="of detections resolved"
        color="var(--cyan)"
        loading={api.loading}
      />
      <Tile
        label="Active Cameras"
        value={num(d.activeCameras)}
        sub="currently running"
        color="var(--violet)"
        loading={api.loading}
      />
      <Tile
        label="Busiest Site"
        value={d.busiestSite?.site || '—'}
        sub={d.busiestSite ? `${num(d.busiestSite.events)} events` : 'no data in range'}
        color="var(--ok)"
        loading={api.loading}
      />
    </div>
  );
}
