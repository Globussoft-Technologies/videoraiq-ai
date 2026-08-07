import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useApi } from '../../../hooks/useApi';
import { useAnalyticsRefresh } from './AnalyticsRefreshContext';
import { getAnalyticsOverview } from '../../../helpers/analytics';
import { num } from '../../../lib/format';
import { engineMeta } from '../../../lib/engineMeta';
import { rangeLabel } from './RangeFilter';
import AnalyticsBlurb from './AnalyticsBlurb';

function Tile({ label, value, sub, subColor = 'var(--tx3)', color = 'var(--tx)', loading, onClick, expanded }) {
  const interactive = typeof onClick === 'function';
  return (
    <div
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-expanded={interactive ? expanded : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      style={{
        background: 'var(--bg1)',
        border: '1px solid var(--bd)',
        borderRadius: 13,
        padding: 15,
        cursor: interactive ? 'pointer' : 'default',
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--tx2)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 25, marginTop: 5, color }}>
        {loading ? '...' : value}
      </div>
      <div style={{ fontSize: 11, color: subColor, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
        {loading ? '' : sub}
        {interactive && !loading && (
          <ChevronDown size={12} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
        )}
      </div>
    </div>
  );
}

/**
 * All 4 tiles are real, derived from /analytics/overview. The original
 * mockup's False Positive Rate / Mean Response Time / Platform Uptime tiles
 * are gone because nothing in the system tracks that data, so they're replaced
 * with metrics that actually exist: resolved rate, detection-enabled cameras
 * (Channel.control === 1, i.e. at least one AI engine turned on, not the same
 * as live/streaming status) and the busiest site.
 */
export default function OverviewKpiRow({ params }) {
  const paramsKey = JSON.stringify(params);
  const api = useApi(() => getAnalyticsOverview(params), [paramsKey]);
  // Refetches on the page's auto-refresh tick / manual refresh.
  useAnalyticsRefresh(api.refetch);
  const d = api.data || {};
  const label = rangeLabel(params);

  // Total Detections counts every incident recorded; the Alerts & Events list
  // only shows those with a reviewable snapshot. When the two disagree the
  // total looks wrong, so the breakdown below shows exactly which engines make
  // up the number and which of them Alerts leaves out.
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const byType = Array.isArray(d.byType) ? d.byType : [];
  const total = d.totalDetections ?? 0;
  const alertsVisible = d.alertsVisible ?? 0;
  const hiddenFromAlerts = Math.max(0, total - alertsVisible);

  return (
    <div>
      <AnalyticsBlurb style={{ marginBottom: 10 }}>
        High-level incident KPIs for the selected range: total detections, share resolved, cameras with AI enabled, and the site generating the most events.
      </AnalyticsBlurb>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }} className="vq-analytics-kpis">
        <Tile
          label={label ? `Total Detections · ${label}` : 'Total Detections'}
          value={num(total)}
          sub={hiddenFromAlerts > 0 ? `${num(hiddenFromAlerts)} not shown in Alerts` : 'incidents in range'}
          subColor={hiddenFromAlerts > 0 ? 'var(--warn)' : 'var(--tx3)'}
          loading={api.loading}
          onClick={byType.length ? () => setBreakdownOpen((o) => !o) : undefined}
          expanded={breakdownOpen}
        />
        <Tile
          label="Resolved Rate"
          value={`${d.resolvedRate ?? 0}%`}
          sub="of detections resolved"
          color="var(--cyan)"
          loading={api.loading}
        />
        <Tile
          label="Detection-Enabled Cameras"
          value={num(d.activeCameras)}
          sub="AI engine active"
          color="var(--violet)"
          loading={api.loading}
        />
        {/* `tied` is surfaced rather than hidden: when the top sites are level
            on events the winner is one valid answer among several, and saying
            so beats presenting an arbitrary pick as the busiest. */}
        <Tile
          label="Busiest Site"
          value={d.busiestSite?.site || '—'}
          sub={
            d.busiestSite
              ? `${num(d.busiestSite.events)} events${d.busiestSite.tied ? ' · tied with another site' : ''}`
              : 'no data in range'
          }
          color="var(--ok)"
          loading={api.loading}
        />
      </div>

      {breakdownOpen && byType.length > 0 && (
        <div style={{ marginTop: 12, background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 13, padding: 15 }}>
          <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 10 }}>
            Where the {num(total)} come from — by detection engine
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {byType.map((row) => {
              const meta = engineMeta(row.type);
              const hidden = row.count - row.inAlerts;
              return (
                <div
                  key={row.type}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--bd)' }}
                >
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--tx3)', width: 52, flex: '0 0 auto' }}>
                    {meta.short}
                  </span>
                  <span style={{ fontSize: 12.5, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {meta.name}
                  </span>
                  {hidden > 0 && (
                    <span style={{ fontSize: 10.5, color: 'var(--warn)', flex: '0 0 auto' }}>
                      {row.inAlerts === 0 ? 'not listed in Alerts' : `${num(hidden)} not listed in Alerts`}
                    </span>
                  )}
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12.5, fontWeight: 600, flex: '0 0 auto' }}>
                    {num(row.count)}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 10, lineHeight: 1.5 }}>
            {hiddenFromAlerts > 0 ? (
              <>
                {num(alertsVisible)} of {num(total)} appear in Alerts &amp; Events. That list only shows
                incidents with a reviewable snapshot, so counting and line-crossing engines are left out —
                they have their own pages under Logs &amp; Records. Alerts may show fewer still, depending on
                the status filters selected there.
              </>
            ) : (
              <>All {num(total)} are eligible for Alerts &amp; Events.</>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
