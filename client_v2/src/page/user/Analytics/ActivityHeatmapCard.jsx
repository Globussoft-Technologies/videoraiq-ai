import { Panel } from '../../../components/primitives';
import { AsyncBoundary } from '../../../components/States';
import { useApi } from '../../../hooks/useApi';
import { useAnalyticsRefresh } from './AnalyticsRefreshContext';
import { getActivityHeatmap } from '../../../helpers/analytics';
import AnalyticsBlurb from './AnalyticsBlurb';

function heatCellColor(v, max) {
  const ratio = max > 0 ? v / max : 0;
  const col = ratio > 0.66 ? '217,70,239' : ratio > 0.33 ? '124,99,255' : '59,130,246';
  return `rgba(${col},${(0.08 + ratio * 0.82).toFixed(2)})`;
}

export default function ActivityHeatmapCard({ params }) {
  const paramsKey = JSON.stringify(params);
  const api = useApi(() => getActivityHeatmap(params), [paramsKey]);
  // Refetches on the page's auto-refresh tick / manual refresh.
  useAnalyticsRefresh(api.refetch);
  const grid = api.data?.grid || [];
  const dayLabels = api.data?.dayLabels || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const max = api.data?.max || 0;

  return (
    <Panel style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>Activity Heatmap</div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>day by hour</span>
      </div>
      <AnalyticsBlurb style={{ marginBottom: 14 }}>
        A 7 by 24 view of when incidents happen most often, with darker cells marking busier day and hour combinations.
      </AnalyticsBlurb>
      <AsyncBoundary loading={api.loading} error={api.error} isEmpty={!api.loading && !api.error && max === 0} onRetry={api.refetch} minH={160} emptyLabel="No detections in range">
        {() => (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--tx3)', padding: '1px 0' }}>
                {dayLabels.map((d) => <span key={d}>{d}</span>)}
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {grid.map((row, ri) => (
                  <div key={ri} style={{ display: 'flex', gap: 2 }}>
                    {row.map((v, ci) => (
                      <div
                        key={ci}
                        title={`${dayLabels[ri] || ''} ${String(ci).padStart(2, '0')}:00 - ${v} alert${v === 1 ? '' : 's'}`}
                        style={{ flex: 1, aspectRatio: '1', borderRadius: 2, background: heatCellColor(v, max) }}
                      />
                    ))}
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 8.5, color: 'var(--tx3)', marginTop: 3 }}>
                  <span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>23h</span>
                </div>
              </div>
            </div>
            {/* Legend â€” cell color = alert volume in that hour, relative to the
                busiest hour/day cell in range (`max`); darker/pinker = busier. */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 10 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--tx3)' }}>Fewer alerts</span>
              <div style={{ display: 'flex', gap: 2 }}>
                {[0, 0.2, 0.4, 0.6, 0.8, 1].map((r) => (
                  <div key={r} style={{ width: 16, height: 10, borderRadius: 2, background: heatCellColor(r, 1) }} />
                ))}
              </div>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--tx3)' }}>More alerts</span>
            </div>
          </>
        )}
      </AsyncBoundary>
    </Panel>
  );
}


