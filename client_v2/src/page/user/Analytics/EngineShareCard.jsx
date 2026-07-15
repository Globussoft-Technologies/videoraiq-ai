import { useState } from 'react';
import { Panel } from '../../../components/primitives';
import { AsyncBoundary } from '../../../components/States';
import { useApi } from '../../../hooks/useApi';
import { getEngineShare } from '../../../helpers/analytics';
import { num } from '../../../lib/format';
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

// Which donut slice a mouse position falls in, given the entries' cumulative
// pct ranges (same ordering as conicGradient's stops, starting at 12 o'clock).
function sliceAt(entries, clientX, clientY, rect) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  const r = Math.sqrt(dx * dx + dy * dy);
  if (r > rect.width / 2 || r < rect.width * 0.32) return null; // outside ring or inside the hole
  // atan2 gives 0deg at 3 o'clock, going counter-clockwise negative — convert
  // to clockwise-from-12-o'clock degrees to match conicGradient's stops.
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  if (deg < 0) deg += 360;
  const pctPos = deg / 3.6;
  let acc = 0;
  for (const e of entries) {
    acc += e.pct;
    if (pctPos <= acc) return e;
  }
  return entries[entries.length - 1] || null;
}

export default function EngineShareCard({ params }) {
  const paramsKey = JSON.stringify(params);
  const api = useApi(() => getEngineShare(params), [paramsKey], { pollMs: 120000 });
  const engines = (api.data?.engines || []).map((e, i) => ({
    ...e,
    name: engineMeta(e.engine).name,
    color: ENGINE_PALETTE[i % ENGINE_PALETTE.length],
  }));

  const [hover, setHover] = useState(null); // { entry, x, y } in viewport coords

  const onDonutMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const entry = sliceAt(engines, e.clientX, e.clientY, rect);
    setHover(entry ? { entry, x: e.clientX, y: e.clientY } : null);
  };
  const onDonutLeave = () => setHover(null);

  return (
    <Panel style={{ padding: 18, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Detection Percentage</div>
      <AsyncBoundary loading={api.loading} error={api.error} isEmpty={!api.loading && !api.error && engines.length === 0} onRetry={api.refetch} minH={160} emptyLabel="No detections in range">
        {() => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flex: 1 }}>
            <div
              onMouseMove={onDonutMove}
              onMouseLeave={onDonutLeave}
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
                cursor: 'default',
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
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--tx3)' }}>{num(g.count)}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, minWidth: 40, textAlign: 'right' }}>{g.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </AsyncBoundary>
      {hover && (
        <div
          style={{
            position: 'fixed',
            left: hover.x + 14,
            top: hover.y + 14,
            background: 'var(--tooltip)',
            border: '1px solid var(--bd)',
            borderRadius: 8,
            padding: '6px 10px',
            backdropFilter: 'blur(6px)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 14px rgba(0,0,0,.18)',
            zIndex: 50,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx)' }}>{hover.entry.name}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: hover.entry.color }}>{num(hover.entry.count)} event{hover.entry.count === 1 ? '' : 's'}</div>
        </div>
      )}
    </Panel>
  );
}
