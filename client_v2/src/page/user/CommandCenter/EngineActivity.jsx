import { Panel } from '../../../components/primitives';
import { AsyncBoundary } from '../../../components/States';
import { num } from '../../../lib/format';
import { ENGINE_PALETTE as PALETTE, engineMeta } from '../../../lib/engineMeta';

function formatCount(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return num(n);
}

const DONUT_R = 38;
const DONUT_C = 2 * Math.PI * DONUT_R;

/**
 * Turn per-engine counts into donut segments: each gets a color, its arc length
 * (`dash`) as a share of the ring, the cumulative `offset` where it starts, and
 * its percentage. A single engine fills the whole ring; many stack around it.
 */
function donutSegments(engines) {
  const total = engines.reduce((s, e) => s + (e.count || 0), 0);
  let acc = 0;
  const segments = engines.map((e, i) => {
    const frac = total ? e.count / total : 0;
    const dash = frac * DONUT_C;
    const seg = { ...e, color: PALETTE[i % PALETTE.length], dash, offset: acc, pct: frac * 100 };
    acc += dash;
    return seg;
  });
  return { total, segments };
}

function areaChartPoints(values, width, height) {
  if (!values.length) return { area: '', line: '' };
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1 || 1);
  const pts = values.map((v, i) => {
    const x = i * step;
    const y = height - (v / max) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const first = pts[0].split(',');
  const last = pts[pts.length - 1].split(',');
  const area = `${first[0]},${height} ${pts.join(' ')} ${last[0]},${height}`;
  return { area, line: pts.join(' ') };
}

/**
 * Bottom Command Center row:
 *  - Left: per-engine event counts for today.
 *  - Right: 24-hour detection event area chart.
 */
export default function EngineActivity({ todayEngines = [], events24h = [], total24h = 0, loading, error, isEmpty, onRetry }) {
  const { total: todayTotal, segments } = donutSegments(todayEngines);
  // Largest engine count sets the full-width bar; floor at 1 so an empty or
  // all-zero set doesn't divide by zero (or Math.max() → -Infinity).
  const maxCount = Math.max(...todayEngines.map((e) => e.count || 0), 1);

  const chartW = 720;
  const chartH = 200;
  const { area, line } = areaChartPoints(events24h, chartW, chartH);
  // Peak hourly count = the chart's top; matches areaChartPoints' own max (…, 1)
  // so the y-axis labels line up with where the line actually peaks/bottoms out.
  const peak = Math.max(...events24h, 1);
  const yTicks = [1, 0.75, 0.5, 0.25, 0]; // fractions of peak, top → bottom

  return (
    <Panel style={{ padding: 16, overflow: 'hidden' }}>
      <style>{`
        .vq-engine-activity { max-width: 100%; }
        .vq-ea-row { min-width: 0; }
        .vq-ea-name { min-width: 0; }
        .vq-ea-bar { flex: 1 1 60px; min-width: 40px; max-width: 140px; }
        .vq-ea-axis span { flex: 0 1 auto; }
        @media (max-width: 640px) {
          .vq-ea-label { width: 40px !important; font-size: 9px !important; }
          .vq-ea-bar { max-width: 72px !important; }
          .vq-ea-count { width: 44px !important; font-size: 10.5px !important; }
          .vq-ea-axis { font-size: 8.5px !important; }
        }
        @media (max-width: 420px) {
          .vq-ea-bar { max-width: 48px !important; }
        }
      `}</style>
      <AsyncBoundary loading={loading} error={error} isEmpty={isEmpty} onRetry={onRetry} minH={160} emptyLabel="No detections in range">
        {() => (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 22 }} className="vq-engine-grid">
            {/* Engine Activity · Today */}
            <div>
              <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Engine Activity · Today</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {todayEngines.map((e, i) => {
                  const meta = engineMeta(e.type);
                  const color = PALETTE[i % PALETTE.length];
                  return (
                    <div key={e.type} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ width: 54, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx2)', flex: '0 0 auto' }}>{meta.short}</span>
                      <span style={{ flex: 1, fontSize: 12, color: 'var(--tx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta.name}</span>
                      <div style={{ width: 140, height: 6, borderRadius: 3, background: 'var(--track)', overflow: 'hidden', flex: '0 0 auto' }}>
                        <div
                          style={{
                            width: `${(e.count / maxCount) * 100}%`,
                            height: '100%',
                            borderRadius: 3,
                            background: color,
                            boxShadow: `0 0 8px ${color}`,
                            position: 'relative',
                            overflow: 'hidden',
                          }}
                        >
                          <span
                            style={{
                              position: 'absolute',
                              top: 0,
                              bottom: 0,
                              left: 0,
                              width: '45%',
                              background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent)',
                              animation: 'vqshimmer 2.6s ease-in-out infinite',
                            }}
                          />
                        </div>
                      </div>
                      <span style={{ width: 52, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 600, flex: '0 0 auto' }}>{formatCount(e.count)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Detection Events · 24h */}
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>Detection Events · 24h</div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', whiteSpace: 'nowrap' }}>{num(total24h)} total</span>
              </div>
              <div style={{ flex: 1, position: 'relative', minHeight: 170 }}>
                <svg viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                  <defs>
                    <linearGradient id="det-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="rgba(59,130,246,.5)" />
                      <stop offset="1" stopColor="rgba(59,130,246,0)" />
                    </linearGradient>
                  </defs>
                  <polygon points={area} fill="url(#det-area)" />
                  <polyline points={line} fill="none" stroke="var(--blue)" strokeWidth="2.2" strokeLinejoin="round" />
                </svg>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--tx3)', marginTop: 8 }}>
                <span>00:00</span>
                <span>06:00</span>
                <span>12:00</span>
                <span>18:00</span>
                <span>now</span>
              </div>
              {/* X-axis title — what the labels mean */}
              <div style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 8.5, letterSpacing: '.12em', color: 'var(--tx3)', textTransform: 'uppercase', marginTop: 5, paddingLeft: 58 }}>
                Time of day · last 24h
              </div>
            </div>
          </div>
        )}
      </AsyncBoundary>
    </Panel>
  );
}
