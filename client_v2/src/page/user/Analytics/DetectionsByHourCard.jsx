import { Panel } from '../../../components/primitives';
import { AsyncBoundary } from '../../../components/States';
import { useApi } from '../../../hooks/useApi';
import { getDetectionsByHour } from '../../../helpers/analytics';

function barGradient(v, max) {
  if (v >= max * 0.7) return 'linear-gradient(180deg,#a855f7,#6d28d9)';
  if (v >= max * 0.4) return 'linear-gradient(180deg,#3b82f6,#1e40af)';
  return 'linear-gradient(180deg,#22d3ee,#0e7490)';
}

export default function DetectionsByHourCard() {
  const api = useApi(() => getDetectionsByHour(), [], { pollMs: 60000 });
  const hours = api.data?.hours || [];
  const max = Math.max(...hours, 1);

  return (
    <Panel style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>Detections by Hour</div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>today · UTC</span>
      </div>
      <AsyncBoundary loading={api.loading} error={api.error} isEmpty={!api.loading && !api.error && (api.data?.total || 0) === 0} onRetry={api.refetch} minH={150} emptyLabel="No detections today">
        {() => (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 150 }}>
              {hours.map((v, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1, minWidth: 0,
                    height: `${Math.round((v / max) * 100)}%`,
                    background: barGradient(v, max),
                    borderRadius: '3px 3px 0 0',
                    alignSelf: 'flex-end',
                  }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--tx3)', marginTop: 7 }}>
              <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
            </div>
          </>
        )}
      </AsyncBoundary>
    </Panel>
  );
}
