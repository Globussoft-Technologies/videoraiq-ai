import { Panel } from '../../../components/primitives';
import { AsyncBoundary } from '../../../components/States';
import { useApi } from '../../../hooks/useApi';
import { useAnalyticsRefresh } from './AnalyticsRefreshContext';
import { getSitePerformance } from '../../../helpers/analytics';
import { ENGINE_PALETTE } from '../../../lib/engineMeta';
import { num } from '../../../lib/format';
import AnalyticsBlurb from './AnalyticsBlurb';

const COLS = 'minmax(110px,1.3fr) 1fr';

/**
 * Accuracy/uptime columns from the original mockup are intentionally omitted â€”
 * nothing in the system tracks per-site detection accuracy or NVR uptime
 * history, so there's no real data to back them. Events is the only column
 * with a genuine backend aggregation today.
 */
export default function SitePerformanceCard({ params }) {
  const paramsKey = JSON.stringify(params);
  const api = useApi(() => getSitePerformance(params), [paramsKey]);
  // Refetches on the page's auto-refresh tick / manual refresh.
  useAnalyticsRefresh(api.refetch);
  const sites = (api.data?.sites || []).map((s, i) => ({ ...s, color: ENGINE_PALETTE[i % ENGINE_PALETTE.length] }));

  return (
    <Panel style={{ padding: 18 }}>
      <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14, marginBottom: 15 }}>Site Performance</div>
      <AnalyticsBlurb style={{ marginBottom: 15 }}>
        Compares sites by total incident volume for the selected range, based on NVR location rollups from detection events.
      </AnalyticsBlurb>
      <AsyncBoundary loading={api.loading} error={api.error} isEmpty={!api.loading && !api.error && sites.length === 0} onRetry={api.refetch} minH={160} emptyLabel="No detections in range">
        {() => (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 0, paddingBottom: 9, borderBottom: '1px solid var(--bd)', fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.05em', color: 'var(--tx3)' }}>
              <span>SITE</span><span style={{ textAlign: 'right' }}>EVENTS</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {sites.map((s) => (
                <div key={s.site} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 0, alignItems: 'center', padding: '11px 0', borderBottom: '1px solid var(--bd)', fontSize: 12.5 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flex: '0 0 auto' }} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.site}</span>
                  </span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--tx2)', textAlign: 'right' }}>{num(s.events)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </AsyncBoundary>
    </Panel>
  );
}


