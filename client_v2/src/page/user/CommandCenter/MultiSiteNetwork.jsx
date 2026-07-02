import { Panel } from '../../../components/primitives';
import { Empty } from '../../../components/States';
import sitemap from '../../../assets/sitemap2.jpg';

/**
 * Multi-site network map — matches the design reference exactly.
 * The background map fills the card with object-fit:cover, straight dashed
 * topology lines, and compact tooltip-style site labels.
 */

// Node anchor positions over the map (first 5 are the prototype's exact slots).
const SLOTS = [
  [34, 36], [64, 24], [74, 60], [46, 68], [18, 58],
  [84, 38], [24, 20], [56, 46], [12, 40], [88, 74], [40, 86], [66, 86],
];

function statusColor(alertCount, critCount) {
  if (critCount > 0) return 'var(--crit)';
  if (alertCount > 0) return 'var(--warn)';
  return 'var(--ok)';
}

export default function MultiSiteNetwork({ sites = [] }) {
  const list = Array.isArray(sites) ? sites.slice(0, SLOTS.length) : [];
  const n = list.length;
  const totalCams = list.reduce((a, s) => a + (s.cameraCount || 0), 0);

  const nodes = list.map((s, i) => {
    const [x, y] = SLOTS[i];
    return {
      name: s.locationName || s.name || `Site ${i + 1}`,
      cams: s.cameraCount || 0,
      x: n === 1 ? 50 : x,
      y: n === 1 ? 50 : y,
      color: statusColor(s.alertCount || 0, s.critCount || 0),
    };
  });

  // Hub-and-spoke topology lines from the first node to the others.
  const lines = nodes.slice(1).map((nd) => ({ x1: nodes[0].x, y1: nodes[0].y, x2: nd.x, y2: nd.y }));
  if (nodes[2]) lines.push({ x1: nodes[1].x, y1: nodes[1].y, x2: nodes[2].x, y2: nodes[2].y });

  return (
    <Panel
      gradient
      style={{
        padding: 0,
        position: 'relative',
        overflow: 'hidden',
        minHeight: 380,
        background: 'linear-gradient(180deg,var(--bg1),var(--bg0))',
      }}
    >
      {/* aerial site map - fills the entire card */}
      <img
        src={sitemap}
        alt=""
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center',
          zIndex: 0,
          opacity: 0.92,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          background: 'linear-gradient(180deg,rgba(8,16,30,.30),rgba(8,16,30,.52))',
          pointerEvents: 'none',
        }}
      />

      <div style={{ position: 'absolute', top: 16, left: 18, zIndex: 3, textShadow: '0 1px 6px rgba(0,0,0,.85)' }}>
        <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14, color: '#f4f8ff' }}>Multi-Site Network</div>
        <div style={{ fontSize: 11, color: '#c7d6ee', marginTop: 2 }}>
          {n} site{n === 1 ? '' : 's'} · {totalCams.toLocaleString()} camera{totalCams === 1 ? '' : 's'} · live topology
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 18,
          zIndex: 3,
          display: 'flex',
          gap: 6,
          fontFamily: 'var(--mono)',
          fontSize: 10,
          textShadow: '0 1px 5px rgba(0,0,0,.8)',
        }}
      >
        {[['OK', 'var(--ok)'], ['WARN', 'var(--warn)'], ['ALERT', 'var(--crit)']].map(([l, c]) => (
          <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#d4e0f2' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />
            {l}
          </span>
        ))}
      </div>

      {/* grid + glow */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px)',
          backgroundSize: '38px 38px',
        }}
      />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(700px 360px at 38% 42%,rgba(59,130,246,.10),transparent 70%)' }} />

      {n === 0 ? (
        <Empty label="No sites configured" minH={360} />
      ) : (
        <>
          {/* connecting lines */}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            {lines.map((l, i) => (
              <line
                key={i}
                x1={l.x1}
                y1={l.y1}
                x2={l.x2}
                y2={l.y2}
                stroke="rgba(99,140,255,.32)"
                strokeWidth=".3"
                strokeDasharray="1.4 1.4"
                style={{ animation: 'vq-dash 1.6s linear infinite' }}
              />
            ))}
          </svg>

          {nodes.map((nd, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${nd.x}%`,
                top: `${nd.y}%`,
                transform: 'translate(-50%,-50%)',
                zIndex: 2,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  border: `1.5px solid ${nd.color}`,
                  transform: 'translate(-50%,-50%)',
                  animation: 'vq-ring 2.6s ease-out infinite',
                }}
              />
              <div
                style={{
                  width: 13,
                  height: 13,
                  borderRadius: '50%',
                  background: nd.color,
                  boxShadow: `0 0 14px ${nd.color}`,
                  border: '2px solid var(--bg0)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: 18,
                  top: -7,
                  whiteSpace: 'nowrap',
                  background: 'var(--tooltip)',
                  border: '1px solid var(--bd)',
                  borderRadius: 7,
                  padding: '4px 8px',
                  backdropFilter: 'blur(6px)',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.1 }}>{nd.name}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--tx3)' }}>{nd.cams} cams</div>
              </div>
            </div>
          ))}
        </>
      )}
    </Panel>
  );
}
