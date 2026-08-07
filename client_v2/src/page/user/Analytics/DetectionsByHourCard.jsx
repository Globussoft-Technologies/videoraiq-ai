import { Panel } from '../../../components/primitives';
import { AsyncBoundary } from '../../../components/States';
import { useApi } from '../../../hooks/useApi';
import { useAnalyticsRefresh } from './AnalyticsRefreshContext';
import { getDetectionsByHour } from '../../../helpers/analytics';
import { num } from '../../../lib/format';
import AnalyticsBlurb from './AnalyticsBlurb';

function barGradient(v, max) {
  if (v >= max * 0.7) return 'linear-gradient(180deg,#a855f7,#6d28d9)';
  if (v >= max * 0.4) return 'linear-gradient(180deg,#3b82f6,#1e40af)';
  return 'linear-gradient(180deg,#22d3ee,#0e7490)';
}

// Evenly spaced y-axis ticks from 0 up to `max`, rounded to a friendly step
// (nearest 1/5/10/25/50/100/... multiple) so labels don't show odd decimals.
function niceStep(max, ticks = 4) {
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const norm = raw / mag;
  const step = norm >= 5 ? 5 * mag : norm >= 2 ? 2 * mag : mag;
  return Math.max(1, Math.round(step));
}

export default function DetectionsByHourCard() {
  const api = useApi(() => getDetectionsByHour(), []);
  // Refetches on the page's auto-refresh tick / manual refresh.
  useAnalyticsRefresh(api.refetch);
  const hours = api.data?.hours || [];
  const max = Math.max(...hours, 1);
  const step = niceStep(max);
  const yTicks = [];
  for (let t = step; t <= max; t += step) yTicks.push(t);
  if (yTicks[yTicks.length - 1] !== max) yTicks.push(max);

  return (
    <Panel style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>Detections by Hour</div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>today UTC</span>
      </div>
      <AnalyticsBlurb style={{ marginBottom: 16 }}>
        Intraday distribution of today's detections, grouped into hourly buckets to show which part of the day is busiest.
      </AnalyticsBlurb>
      <AsyncBoundary loading={api.loading} error={api.error} isEmpty={!api.loading && !api.error && (api.data?.total || 0) === 0} onRetry={api.refetch} minH={150} emptyLabel="No detections today">
        {() => (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              {/* Y-axis â€” detection count scale, top (max) to bottom (0) */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 150, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--tx3)', textAlign: 'right' }}>
                {[...yTicks].reverse().map((t) => <span key={t}>{num(t)}</span>)}
                <span>0</span>
              </div>
              <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
                {/* Gridlines at each y-tick, for reading bar heights against the scale */}
                <div style={{ position: 'absolute', inset: 0 }}>
                  {yTicks.map((t) => (
                    <div key={t} style={{ position: 'absolute', left: 0, right: 0, bottom: `${(t / max) * 100}%`, borderTop: '1px dashed var(--bd)' }} />
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 150, position: 'relative' }}>
                  {hours.map((v, i) => (
                    <div
                      key={i}
                      title={`${String(i).padStart(2, '0')}:00 ${v} detection${v === 1 ? '' : 's'}`}
                      style={{
                        flex: 1, minWidth: 0,
                        height: `${Math.round((v / max) * 100)}%`,
                        background: barGradient(v, max),
                        borderRadius: '3px 3px 0 0',
                        alignSelf: 'flex-end',
                        cursor: 'default',
                      }}
                    />
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--tx3)', marginTop: 7 }}>
                  <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
                </div>
              </div>
            </div>
          </>
        )}
      </AsyncBoundary>
    </Panel>
  );
}


