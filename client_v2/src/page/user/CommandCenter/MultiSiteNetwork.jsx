import { Panel } from '../../../components/primitives';
import { Empty } from '../../../components/States';
import sitemap from '../../../assets/sitemap2.jpg';

const MAX_NODES = 18;
const FALLBACK_GROUP = 'Connectivity';

const SLOTS = [
  [16, 26], [36, 18], [58, 24], [78, 34], [66, 54], [42, 48],
  [22, 62], [50, 76], [82, 72], [12, 44], [28, 82], [72, 16],
  [88, 50], [56, 38], [34, 66], [68, 84], [46, 28], [18, 76],
];

const STATUS_META = {
  clear: { label: 'No detections', color: 'var(--ok)' },
  moderate: { label: 'Moderate', color: 'var(--warn)' },
  major: { label: 'Major', color: 'var(--crit)' },
};

function cleanId(value) {
  if (!value) return '';
  if (typeof value === 'object') return String(value._id || value.id || value.$oid || '');
  return String(value);
}

function textValue(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

function nvrIdOfChannel(channel) {
  return cleanId(channel?.nvrId || channel?.nvr || channel?.nvrData?._id || channel?.nvrData);
}

function cameraIdOf(value) {
  return cleanId(value?.channelId || value?.cameraId || value?.channelData?._id || value?.cameraData?._id || value?.channel);
}

function locationOfChannel(channel, nvr) {
  return textValue(
    channel?.location,
    channel?.locationName,
    channel?.site,
    channel?.nvrId?.location,
    channel?.nvrData?.location,
    nvr?.location,
    nvr?.locationName,
    nvr?.site
  );
}

function severityRank(severity) {
  const value = String(severity || '').toLowerCase();
  if (['critical', 'high', 'major', 'alert'].includes(value)) return 2;
  if (['moderate', 'medium', 'warn', 'warning', 'low'].includes(value)) return 1;
  return 1;
}

function nodeStatus(majorCams, moderateCams) {
  if (majorCams > 0) return 'major';
  if (moderateCams > 0) return 'moderate';
  return 'clear';
}

function buildCameraSeverity(alerts) {
  const map = {};
  (Array.isArray(alerts) ? alerts : []).forEach((alert) => {
    const cameraId = cameraIdOf(alert);
    if (!cameraId) return;
    map[cameraId] = Math.max(map[cameraId] || 0, severityRank(alert?.severity));
  });
  return map;
}

function normalizeLocations(value) {
  return (Array.isArray(value) ? value : value ? [value] : [])
    .map((item) => String(item).trim().toLowerCase())
    .filter(Boolean);
}

function buildNodes({ nvrs, channels, alerts, activeLocations }) {
  const nvrMap = {};
  (Array.isArray(nvrs) ? nvrs : []).forEach((nvr) => {
    const id = cleanId(nvr?._id || nvr?.id);
    if (!id) return;
    nvrMap[id] = nvr;
  });

  const cameraSeverity = buildCameraSeverity(alerts);
  const nodesById = {};

  (Array.isArray(channels) ? channels : []).forEach((channel) => {
    const nvrId = nvrIdOfChannel(channel);
    if (!nvrId) return;
    const nvr = nvrMap[nvrId] || {};
    const node = nodesById[nvrId] || {
      id: nvrId,
      name: textValue(nvr?.nvrName, nvr?.name, channel?.nvrId?.nvrName, channel?.nvrData?.nvrName, 'NVR'),
      location: locationOfChannel(channel, nvr),
      cameraCount: 0,
      majorCams: 0,
      moderateCams: 0,
    };

    const cameraId = cleanId(channel?._id || channel?.id || channel?.channelId);
    const rank = cameraSeverity[cameraId] || 0;
    node.cameraCount += 1;
    if (rank >= 2) node.majorCams += 1;
    else if (rank === 1) node.moderateCams += 1;
    if (!node.location) node.location = locationOfChannel(channel, nvr);
    nodesById[nvrId] = node;
  });

  Object.entries(nvrMap).forEach(([id, nvr]) => {
    if (nodesById[id]) return;
    nodesById[id] = {
      id,
      name: textValue(nvr?.nvrName, nvr?.name, 'NVR'),
      location: textValue(nvr?.location, nvr?.locationName, nvr?.site),
      cameraCount: 0,
      majorCams: 0,
      moderateCams: 0,
    };
  });

  const active = normalizeLocations(activeLocations);
  return Object.values(nodesById)
    .filter((node) => {
      if (!active.length) return true;
      const loc = String(node.location || '').trim().toLowerCase();
      return loc ? active.includes(loc) : true;
    })
    .map((node) => {
      const status = nodeStatus(node.majorCams, node.moderateCams);
      return {
        ...node,
        status,
        color: STATUS_META[status].color,
        group: node.location || FALLBACK_GROUP,
      };
    })
    .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name))
    .slice(0, MAX_NODES);
}

function withPositions(nodes) {
  if (nodes.length === 1) return [{ ...nodes[0], x: 50, y: 54 }];
  return nodes.map((node, index) => {
    const [x, y] = SLOTS[index % SLOTS.length];
    const wraps = Math.floor(index / SLOTS.length);
    return {
      ...node,
      x: Math.min(92, x + wraps * 2),
      y: Math.min(88, y + wraps * 2),
    };
  });
}

function buildLines(nodes) {
  const groups = new Map();
  nodes.forEach((node) => {
    const list = groups.get(node.group) || [];
    list.push(node);
    groups.set(node.group, list);
  });

  const lines = [];
  const hubs = [];
  groups.forEach((list) => {
    const hub = list[0];
    hubs.push(hub);
    list.slice(1).forEach((node) => lines.push({ x1: hub.x, y1: hub.y, x2: node.x, y2: node.y, group: hub.group }));
  });

  hubs.slice(1).forEach((hub) => lines.push({ x1: hubs[0].x, y1: hubs[0].y, x2: hub.x, y2: hub.y, group: 'backbone' }));
  return lines;
}

export default function MultiSiteNetwork({
  nvrs = [],
  channels = [],
  alerts = [],
  activeLocations = [],
  tall = false,
  fillAvailable = false,
}) {
  const nodes = withPositions(buildNodes({ nvrs, channels, alerts, activeLocations }));
  const lines = buildLines(nodes);
  const totalCams = nodes.reduce((sum, node) => sum + node.cameraCount, 0);
  const groups = new Set(nodes.map((node) => node.group));
  const hasLocations = [...groups].some((group) => group !== FALLBACK_GROUP);
  const baseHeight = tall ? 520 : 580;

  return (
    <Panel
      gradient
      className="vq-msn"
      style={{
        padding: 0,
        position: 'relative',
        overflow: 'hidden',
        minHeight: baseHeight,
        flex: fillAvailable ? '1 1 auto' : undefined,
        background: 'linear-gradient(180deg,#101827,#080d18)',
      }}
    >
      <style>{`
        .vq-msn { min-height: ${baseHeight}px; }
        .vq-msn .vq-msn-header {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
        }
        .vq-msn .vq-msn-legend { flex-wrap: wrap; justify-content: flex-end; }
        .vq-msn .vq-msn-node-label {
          max-width: 230px;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        @keyframes vq-msn-ring {
          0% { transform: translate(-50%, -50%) scale(.72); opacity: .9; }
          100% { transform: translate(-50%, -50%) scale(2.2); opacity: 0; }
        }
        @media (max-width: 900px) {
          .vq-msn { min-height: ${baseHeight + 40}px; }
        }
        @media (max-width: 640px) {
          .vq-msn { min-height: ${baseHeight + 110}px; }
          .vq-msn .vq-msn-node-label {
            max-width: 38vw;
            font-size: 10px !important;
            padding: 4px 6px !important;
          }
        }
      `}</style>

      <img
        src={sitemap}
        alt=""
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'fill',
          objectPosition: 'center',
          zIndex: 0,
          opacity: 0.76,
          filter: 'saturate(1.05) contrast(1.08)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(148,163,184,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,.08) 1px,transparent 1px)',
          backgroundSize: '38px 38px',
        }}
      />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(650px 360px at 50% 45%,rgba(59,130,246,.16),transparent 70%)' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(15,23,42,.12),rgba(2,6,23,.66))' }} />

      <div
        className="vq-msn-header"
        style={{ position: 'absolute', top: 16, left: 18, right: 18, zIndex: 3, textShadow: '0 1px 6px rgba(0,0,0,.85)' }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14, color: '#f4f8ff' }}>
            NVR Interconnectivity
          </div>
          <div style={{ fontSize: 11, color: '#c7d6ee', marginTop: 2 }}>
            {hasLocations ? `${groups.size} location${groups.size === 1 ? '' : 's'} · ` : ''}
            {nodes.length} NVR{nodes.length === 1 ? '' : 's'} · {totalCams.toLocaleString()} camera{totalCams === 1 ? '' : 's'} · connectivity
          </div>
        </div>
        <div
          className="vq-msn-legend"
          style={{
            display: 'flex',
            gap: 8,
            fontFamily: 'var(--mono)',
            fontSize: 10,
            textShadow: '0 1px 5px rgba(0,0,0,.8)',
          }}
        >
          {[
            ['NO DETECTIONS', STATUS_META.clear.color],
            ['MODERATE', STATUS_META.moderate.color],
            ['MAJOR', STATUS_META.major.color],
          ].map(([label, color]) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#d4e0f2' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {nodes.length === 0 ? (
        <Empty label="No NVR connectivity available" minH={baseHeight - 30} />
      ) : (
        <>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            {lines.map((line, index) => (
              <line
                key={`${line.group}-${index}`}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke={line.group === 'backbone' ? 'rgba(96,165,250,.42)' : 'rgba(148,163,184,.34)'}
                strokeWidth={line.group === 'backbone' ? '.45' : '.32'}
                strokeDasharray="1.5 1.5"
                style={{ animation: 'vq-dash 1.8s linear infinite' }}
              />
            ))}
          </svg>

          {nodes.map((node) => (
            <div
              key={node.id}
              style={{
                position: 'absolute',
                left: `${node.x}%`,
                top: `${node.y}%`,
                transform: 'translate(-50%,-50%)',
                zIndex: 2,
                width: 14,
                height: 14,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  border: `1.5px solid ${node.color}`,
                  transform: 'translate(-50%,-50%)',
                  animation: node.status === 'clear' ? 'none' : 'vq-msn-ring 2.6s ease-out infinite',
                  zIndex: 0,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: node.color,
                  boxShadow: `0 0 16px ${node.color}`,
                  border: '2px solid #08101f',
                  boxSizing: 'border-box',
                  transform: 'translate(-50%,-50%)',
                  zIndex: 1,
                }}
              />
              <div
                className="vq-msn-node-label"
                style={{
                  position: 'absolute',
                  left: 20,
                  top: -9,
                  whiteSpace: 'nowrap',
                  background: 'rgba(248,250,252,.95)',
                  color: '#172033',
                  border: '1px solid rgba(226,232,240,.8)',
                  borderRadius: 7,
                  padding: '5px 8px',
                  boxShadow: '0 10px 28px rgba(0,0,0,.22)',
                  zIndex: 2,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: '#64748b', marginTop: 2 }}>
                  {node.group} · {node.cameraCount} cam{node.cameraCount === 1 ? '' : 's'}
                </div>
                {node.status !== 'clear' && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: node.status === 'major' ? '#dc2626' : '#b45309', marginTop: 2 }}>
                    {node.majorCams ? `${node.majorCams} major` : `${node.moderateCams} moderate`}
                  </div>
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </Panel>
  );
}
