import { Panel } from '../../../components/primitives';
import { AsyncBoundary } from '../../../components/States';
import { useApi } from '../../../hooks/useApi';
import { getTopCameras } from '../../../helpers/analytics';
import { ENGINE_PALETTE } from '../../../lib/engineMeta';
import { num } from '../../../lib/format';
import AnalyticsBlurb from './AnalyticsBlurb';

export default function TopCamerasCard({ params, limit = 5 }) {
  const paramsKey = JSON.stringify(params);
  const api = useApi(() => getTopCameras({ ...params, limit }), [paramsKey, limit], { pollMs: 120000 });
  const cameras = (api.data?.cameras || []).map((c, i) => ({ ...c, color: ENGINE_PALETTE[i % ENGINE_PALETTE.length] }));

  return (
    <Panel style={{ padding: 18 }}>
      <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14, marginBottom: 16 }}>Top Cameras by Detections</div>
      <AnalyticsBlurb style={{ marginBottom: 16 }}>
        Ranks the busiest cameras by incident count so you can quickly see where most detections are being generated.
      </AnalyticsBlurb>
      <AsyncBoundary loading={api.loading} error={api.error} isEmpty={!api.loading && !api.error && cameras.length === 0} onRetry={api.refetch} minH={160} emptyLabel="No detections in range">
        {() => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {cameras.map((c) => (
              <div key={c.channelId}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                  <span>{c.name}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: c.color }}>{num(c.count)}</span>
                </div>
                <div style={{ height: 7, borderRadius: 4, background: 'var(--track)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${c.pct}%`, background: c.color, borderRadius: 4, boxShadow: `0 0 8px ${c.color}`, position: 'relative', overflow: 'hidden' }}>
                    <span
                      style={{
                        position: 'absolute', top: 0, bottom: 0, left: 0, width: '45%',
                        background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent)',
                        animation: 'vqshimmer 2.6s ease-in-out infinite',
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </AsyncBoundary>
    </Panel>
  );
}


