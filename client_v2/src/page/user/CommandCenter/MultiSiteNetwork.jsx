import { useEffect, useState } from 'react';
import { Panel } from '../../../components/primitives';
import { Empty } from '../../../components/States';
import sitemap from '../../../assets/sitemap2.jpg';

// Track a narrow (phone) viewport — the label-flip below applies on mobile only,
// leaving the desktop map layout untouched.
function useIsMobile(maxWidth = 640) {
  const query = `(max-width:${maxWidth}px)`;
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setIsMobile(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return isMobile;
}

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
  const isMobile = useIsMobile();
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
      className="vq-msn p-0 relative overflow-hidden min-h-[380px]"
      style={{ background: 'linear-gradient(180deg,var(--bg1),var(--bg0))' }}
    >
      {/* Responsive breakpoints scoped to this component, following the
          existing .vq-* media-query convention used in theme/tokens.css. */}
      <style>{`
        .vq-msn { min-height: 380px; }
        .vq-msn .vq-msn-header {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
        }
        .vq-msn .vq-msn-legend { flex-wrap: wrap; justify-content: flex-end; }
        .vq-msn .vq-msn-node-label {
          max-width: 46vw;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        @media (max-width: 900px) {
          .vq-msn { min-height: 420px; }
        }
        @media (max-width: 640px) {
          .vq-msn { min-height: 460px; }
          .vq-msn .vq-msn-node-label {
            max-width: 34vw;
            font-size: 10px !important;
            padding: 3px 6px !important;
          }
        }
        @media (max-width: 420px) {
          .vq-msn { min-height: 520px; }
          .vq-msn .vq-msn-node-label { max-width: 28vw; }
        }
      `}</style>
      {/* aerial site map - fills the entire card */}
      <img
        src={sitemap}
        alt=""
        className="absolute inset-0 w-full h-full object-cover object-center z-0 opacity-[.92]"
      />
      <div className="absolute inset-0 z-0 bg-[linear-gradient(180deg,rgba(8,16,30,.30),rgba(8,16,30,.52))] pointer-events-none" />

      <div className="vq-msn-header absolute top-[16px] left-[18px] right-[18px] z-[3] [text-shadow:0_1px_6px_rgba(0,0,0,.85)]">
        <div className="min-w-0">
          <div className="font-[family-name:var(--disp)] font-semibold text-[14px] text-[#f4f8ff]">Multi-Site Network</div>
          <div className="text-[11px] text-[#c7d6ee] mt-[2px]">
            {n} site{n === 1 ? '' : 's'} · {totalCams.toLocaleString()} camera{totalCams === 1 ? '' : 's'} · live topology
          </div>
        </div>
        <div className="vq-msn-legend flex gap-[6px] font-[family-name:var(--mono)] text-[10px] [text-shadow:0_1px_5px_rgba(0,0,0,.8)]">
          {[['OK', 'var(--ok)'], ['WARN', 'var(--warn)'], ['ALERT', 'var(--crit)']].map(([l, c]) => (
            <span key={l} className="flex items-center gap-[5px] text-[#d4e0f2]">
              <span className="w-[7px] h-[7px] rounded-full" style={{ background: c }} />
              {l}
            </span>
          ))}
        </div>
      </div>

      {/* grid + glow */}
      <div className="absolute inset-0 bg-[linear-gradient(var(--grid)_1px,transparent_1px),linear-gradient(90deg,var(--grid)_1px,transparent_1px)] bg-[length:38px_38px]" />
      <div className="absolute inset-0 bg-[radial-gradient(700px_360px_at_38%_42%,rgba(59,130,246,.10),transparent_70%)]" />

      {n === 0 ? (
        <Empty label="No sites configured" minH={360} />
      ) : (
        <>
          {/* connecting lines */}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
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
                className="[animation:vq-dash_1.6s_linear_infinite]"
              />
            ))}
          </svg>

          {nodes.map((nd, i) => {
            // On mobile, right-side nodes render their label to the LEFT of the
            // dot so it doesn't extend past the (narrow) card edge and get
            // clipped. Desktop keeps every label on the right, as before.
            const flip = isMobile && nd.x > 60;
            return (
            <div
              key={i}
              className="absolute z-[2] -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${nd.x}%`,
                top: `${nd.y}%`,
              }}
            >
              <div
                className="absolute left-1/2 top-1/2 w-[18px] h-[18px] rounded-full -translate-x-1/2 -translate-y-1/2 [animation:vq-ring_2.6s_ease-out_infinite]"
                style={{ border: `1.5px solid ${nd.color}` }}
              />
              <div
                className="w-[13px] h-[13px] rounded-full border-2 border-[var(--bg0)]"
                style={{
                  background: nd.color,
                  boxShadow: `0 0 14px ${nd.color}`,
                }}
              />
              <div
                className={`vq-msn-node-label absolute top-[-7px] whitespace-nowrap bg-[var(--tooltip)] border border-[var(--bd)] rounded-[7px] py-[4px] px-[8px] backdrop-blur-[6px] ${flip ? 'right-[18px] text-right' : 'left-[18px]'}`}
              >
                <div className="text-[11px] font-semibold leading-[1.1] overflow-hidden text-ellipsis">{nd.name}</div>
                <div className="font-[family-name:var(--mono)] text-[9.5px] text-[var(--tx3)]">{nd.cams} cams</div>
              </div>
            </div>
            );
          })}
        </>
      )}
    </Panel>
  );
}
