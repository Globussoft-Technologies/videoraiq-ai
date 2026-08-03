import { Panel } from '../../../components/primitives';
import { AsyncBoundary } from '../../../components/States';
import { useApi } from '../../../hooks/useApi';
import { getResponseFunnel } from '../../../helpers/analytics';
import { ENGINE_PALETTE } from '../../../lib/engineMeta';
import { num } from '../../../lib/format';
import { rangeLabel } from './RangeFilter';

/**
 * Detected -> Reported -> Resolved, using only fields that exist on the
 * Incident schema (report.status, resolved). There's no "Auto-Triaged" or
 * "Dispatched" state anywhere in the system, so this is a 3-stage funnel
 * rather than the 4-stage one in the original mockup.
 */
export default function ResponseFunnelCard({ params }) {
  const paramsKey = JSON.stringify(params);
  const api = useApi(() => getResponseFunnel(params), [paramsKey], { pollMs: 120000 });
  const stages = (api.data?.stages || []).map((s, i) => ({ ...s, color: ENGINE_PALETTE[i % ENGINE_PALETTE.length] }));
  const label = rangeLabel(params);

  return (
    <Panel style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>Response Funnel</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>{label}</span>
      </div>
      <AsyncBoundary loading={api.loading} error={api.error} isEmpty={!api.loading && !api.error && stages.length === 0} onRetry={api.refetch} minH={160} emptyLabel="No detections in range">
        {() => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {stages.map((s) => (
              <div key={s.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                  <span style={{ fontSize: 12, color: 'var(--tx2)' }}>{s.label}</span>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontFamily: 'var(--disp)', fontSize: 14, fontWeight: 700, color: s.color }}>{num(s.count)}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>{s.pct}%</span>
                  </span>
                </div>
                <div
                  style={{
                    height: 34, width: `${s.pct}%`, borderRadius: 8,
                    background: `linear-gradient(90deg,color-mix(in srgb,${s.color} 85%,transparent),color-mix(in srgb,${s.color} 40%,transparent))`,
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </AsyncBoundary>
    </Panel>
  );
}
