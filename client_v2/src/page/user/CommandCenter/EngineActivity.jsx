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

  const chartW = 720;
  const chartH = 200;
  const { area, line } = areaChartPoints(events24h, chartW, chartH);
  // Peak hourly count = the chart's top; matches areaChartPoints' own max (…, 1)
  // so the y-axis labels line up with where the line actually peaks/bottoms out.
  const peak = Math.max(...events24h, 1);
  const yTicks = [1, 0.75, 0.5, 0.25, 0]; // fractions of peak, top → bottom

  return (
    <Panel style={{ padding: 16 }}>
      <AsyncBoundary loading={loading} error={error} isEmpty={isEmpty} onRetry={onRetry} minH={160} emptyLabel="No detections in range">
        {() => (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 22 }} className="vq-engine-grid">
            {/* Engine Activity · Today — donut (share of today's detections) + legend */}
            <div>
              <div className="font-[var(--disp)] font-semibold text-[14px] mb-[14px]">Engine Activity · Today</div>
              <div className="flex items-center justify-center gap-[18px] mt-[38px]">
                {/* Donut */}
                <div className="relative w-[132px] h-[132px] flex-none">
                  <svg viewBox="0 0 100 100" className="w-full h-full [transform:rotate(-90deg)]">
                    {/* track ring */}
                    <circle cx="50" cy="50" r={DONUT_R} fill="none" stroke="var(--track)" strokeWidth="13" />
                    {segments.map((s) => (
                      <circle
                        key={s.type}
                        cx="50"
                        cy="50"
                        r={DONUT_R}
                        fill="none"
                        stroke={s.color}
                        strokeWidth="13"
                        strokeDasharray={`${s.dash} ${DONUT_C - s.dash}`}
                        strokeDashoffset={-s.offset}
                      >
                        <title>{`${engineMeta(s.type).name}: ${num(s.count)} (${s.pct.toFixed(0)}%)`}</title>
                      </circle>
                    ))}
                  </svg>
                  {/* center total */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="font-[var(--mono)] font-bold text-[20px] leading-none text-[var(--tx)]">{formatCount(todayTotal)}</span>
                    <span className="font-[var(--mono)] text-[9px] tracking-[.08em] text-[var(--tx3)] mt-[3px]">TODAY</span>
                  </div>
                </div>

                {/* Legend */}
                <div className="vq-scroll flex-[0_1_auto] min-w-0 max-w-[320px] flex flex-col gap-[9px] max-h-[148px] overflow-y-auto">
                  {segments.map((s) => {
                    const meta = engineMeta(s.type);
                    return (
                      <div key={s.type} className="flex items-center gap-[10px]">
                        <span className="w-[9px] h-[9px] rounded-full flex-none" style={{ background: s.color, boxShadow: `0 0 7px ${s.color}` }} />
                        <span className="w-[52px] font-[var(--mono)] text-[10px] text-[var(--tx2)] flex-none">{meta.short}</span>
                        <span className="flex-1 min-w-0 text-[12px] text-[var(--tx)]">{meta.name}</span>
                        <span className="font-[var(--mono)] text-[11.5px] font-semibold text-[var(--tx)] flex-none">{formatCount(s.count)}</span>
                        <span className="w-[38px] text-right font-[var(--mono)] text-[10px] text-[var(--tx3)] flex-none">{s.pct.toFixed(0)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Detection Events · 24h */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>Detection Events · 24h</div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>{num(total24h)} total</span>
              </div>
              <div style={{ flex: 1, display: 'flex', gap: 6 }}>
                {/* Y-axis title — what the numbers mean */}
                <div style={{ width: 14, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontFamily: 'var(--mono)', fontSize: 8.5, letterSpacing: '.12em', color: 'var(--tx3)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                    Detections
                  </span>
                </div>
                <div style={{ flex: 1, display: 'flex', gap: 8, minWidth: 0 }}>
                  {/* Y-axis — detection count at each gridline (peak → 0) */}
                  <div style={{ width: 30, flex: '0 0 auto', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--tx3)', paddingBottom: 1 }}>
                    {yTicks.map((f) => (
                      <span key={f}>{num(Math.round(peak * f))}</span>
                    ))}
                  </div>
                  {/* Plot area */}
                  <div style={{ position: 'relative', flex: 1, minHeight: 170 }}>
                    {/* horizontal gridlines aligned with the y-axis ticks */}
                    {yTicks.map((f) => (
                      <div key={f} style={{ position: 'absolute', left: 0, right: 0, top: `${(1 - f) * 100}%`, borderTop: '1px dashed var(--grid)' }} />
                    ))}
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
                </div>
              </div>
              {/* X-axis tick labels — padded left (14 title + 6 gap + 30 y-nums + 8 gap) to sit under the plot */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--tx3)', marginTop: 8, paddingLeft: 58 }}>
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
