import { Panel } from '../../../components/primitives';
import { AsyncBoundary } from '../../../components/States';
import { useApi } from '../../../hooks/useApi';
import { getPeakActivity } from '../../../helpers/analytics';
import { num } from '../../../lib/format';
import { rangeLabel } from './RangeFilter';

function formatHour(h) {
  if (h == null) return '—';
  const suffix = h < 12 ? 'AM' : 'PM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:00 ${suffix}`;
}

/**
 * Replaces the Model Performance card (precision/recall/F1/mAP) — there's no
 * ground-truth/validation subsystem in the product, so those metrics can't
 * be computed from anything currently stored. This surfaces the busiest
 * hour and weekday instead, from the same aggregation as the heatmap.
 */
export default function PeakActivityCard({ params }) {
  const paramsKey = JSON.stringify(params);
  const api = useApi(() => getPeakActivity(params), [paramsKey], { pollMs: 120000 });
  const { peakHour, peakDay } = api.data || {};
  const label = rangeLabel(api.data);
  const rangeText = label || 'selected range';

  return (
    <Panel style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>Peak Activity</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>{label}</span>
      </div>
      <AsyncBoundary loading={api.loading} error={api.error} isEmpty={!api.loading && !api.error && !peakHour && !peakDay} onRetry={api.refetch} minH={140} emptyLabel="No detections in range">
        {() => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <div style={{ fontSize: 12.5, color: 'var(--tx2)', marginBottom: 6 }}>Busiest Hour Across Range</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 25, color: 'var(--blue)' }}>{formatHour(peakHour?.hour)}</span>
                {peakHour && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)' }}>{num(peakHour.count)} events</span>}
              </div>
              {peakHour && (
                <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>Total events during the {formatHour(peakHour.hour)} hour bucket over {rangeText}.</div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 12.5, color: 'var(--tx2)', marginBottom: 6 }}>Busiest Weekday Across Range</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 25, color: 'var(--violet)' }}>{peakDay?.day || '—'}</span>
                {peakDay && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)' }}>{num(peakDay.count)} events</span>}
              </div>
              {peakDay && (
                <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>Total events across all {peakDay.day}s in {rangeText}, not one specific date.</div>
              )}
            </div>
          </div>
        )}
      </AsyncBoundary>
    </Panel>
  );
}
