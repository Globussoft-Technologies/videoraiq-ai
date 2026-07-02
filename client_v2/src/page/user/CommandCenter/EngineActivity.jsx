import { Panel } from '../../../components/primitives';
import { AsyncBoundary } from '../../../components/States';
import { detectionLabel, num } from '../../../lib/format';

const PALETTE = ['var(--blue)', 'var(--violet)', 'var(--magenta)', 'var(--cyan)', 'var(--ok)', 'var(--warn)', 'var(--crit)', '#f472b6', '#60a5fa'];

const ENGINE_META = {
  facerecognition: { short: 'FACE', name: 'Face Recognition' },
  facedetection: { short: 'FACE', name: 'Face Recognition' },
  intrusiondetection: { short: 'INTR', name: 'Intrusion Detection' },
  intrusion: { short: 'INTR', name: 'Intrusion Detection' },
  firedetection: { short: 'FIRE', name: 'Fire & Smoke' },
  firesmoke: { short: 'FIRE', name: 'Fire & Smoke' },
  objectdetection: { short: 'OBJ', name: 'Object Detection' },
  object: { short: 'OBJ', name: 'Object Detection' },
  anpr: { short: 'ANPR', name: 'Number Plate (ANPR)' },
  numberplate: { short: 'ANPR', name: 'Number Plate (ANPR)' },
  linecrossing: { short: 'LINE', name: 'Line-Cross' },
  linecross: { short: 'LINE', name: 'Line-Cross' },
  unauthorizedaccess: { short: 'ACCS', name: 'Unauthorized Access' },
  accessviolation: { short: 'ACCS', name: 'Unauthorized Access' },
  unattendedbaggage: { short: 'BAG', name: 'Unattended Baggage' },
  baggage: { short: 'BAG', name: 'Unattended Baggage' },
  cashierabsence: { short: 'CASH', name: 'Cashier Absence' },
  deskabsence: { short: 'CASH', name: 'Cashier Absence' },
  absence: { short: 'CASH', name: 'Cashier Absence' },
  waterspillagedetection: { short: 'WATER', name: 'Water Spillage' },
  water: { short: 'WATER', name: 'Water Spillage' },
  vehicledetection: { short: 'VEH', name: 'Vehicle Detection' },
  vehicle: { short: 'VEH', name: 'Vehicle Detection' },
  persondetection: { short: 'PERSON', name: 'Person Detection' },
  person: { short: 'PERSON', name: 'Person Detection' },
};

function engineMeta(type) {
  const key = String(type || '').toLowerCase().replace(/[^a-z]/g, '');
  return ENGINE_META[key] || { short: key.slice(0, 4).toUpperCase() || 'DET', name: detectionLabel(type) };
}

function formatCount(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return num(n);
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
  const maxCount = Math.max(...todayEngines.map((e) => e.count), 1);

  const chartW = 720;
  const chartH = 200;
  const { area, line } = areaChartPoints(events24h, chartW, chartH);

  return (
    <Panel style={{ padding: 16 }}>
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
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>Detection Events · 24h</div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>{num(total24h)} total</span>
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
            </div>
          </div>
        )}
      </AsyncBoundary>
    </Panel>
  );
}
