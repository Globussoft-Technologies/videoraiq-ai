import { Panel } from '../../../components/primitives';
import { AsyncBoundary } from '../../../components/States';
import { useApi } from '../../../hooks/useApi';
import { getEngineShare } from '../../../helpers/analytics';
import { ENGINE_PALETTE, engineMeta } from '../../../lib/engineMeta';

function conicGradient(entries) {
  let acc = 0;
  const stops = entries.map(({ color, pct }) => {
    const start = acc;
    acc += pct;
    return `${color} ${(start * 3.6).toFixed(1)}deg ${(acc * 3.6).toFixed(1)}deg`;
  });
  return `conic-gradient(${stops.join(',')})`;
}

export default function EngineShareCard({ params }) {
  const paramsKey = JSON.stringify(params);
  const api = useApi(() => getEngineShare(params), [paramsKey], { pollMs: 120000 });
  const engines = (api.data?.engines || []).map((e, i) => ({
    ...e,
    name: engineMeta(e.engine).name,
    color: ENGINE_PALETTE[i % ENGINE_PALETTE.length],
  }));

  return (
    <Panel style={{ padding: 18, display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Share by Engine</div>
      <AsyncBoundary loading={api.loading} error={api.error} isEmpty={!api.loading && !api.error && engines.length === 0} onRetry={api.refetch} minH={160} emptyLabel="No detections in range">
        {() => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flex: 1 }}>
            <div
              style={{
                width: 130,
                height: 130,
                borderRadius: '50%',
                background: conicGradient(engines),
                flex: '0 0 auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
              }}
            >
              <div style={{ width: 84, height: 84, borderRadius: '50%', background: 'var(--bg1)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 18 }}>{engines.length}</span>
                <span style={{ fontSize: 9, color: 'var(--tx3)' }}>engines</span>
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {engines.map((g) => (
                <div key={g.engine} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: g.color }} />
                  <span style={{ flex: 1 }}>{g.name}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{g.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </AsyncBoundary>
    </Panel>
  );
}
