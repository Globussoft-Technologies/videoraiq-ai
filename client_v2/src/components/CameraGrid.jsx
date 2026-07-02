import { useMemo, useState, useCallback, useEffect, useRef, memo } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Search, X, Maximize2, Minimize2, ChevronLeft, ChevronRight, Play, Pause } from 'lucide-react';
import axios from 'axios';
import { AsyncBoundary } from './States';
import CameraStream from './CameraStream';
import MultiSelect from './MultiSelect';
import { useApi } from '../hooks/useApi';
import { getChannels, getLocations, getNVRs, getDepartments } from '../helpers/monitoring';
import getAccessToken from '@/utils/getAccessToken';

const Api_url = import.meta.env.VITE_BACKEND;

/* Camera-type maps to the channel `checkType` field on the backend. */
const CAM_TYPE_OPTIONS = [
  { id: 'checkin', label: 'Check In' },
  { id: 'checkout', label: 'Check Out' },
];

/* ── Fetch incidents for a specific channel ───────────────────────────── */
async function fetchChannelIncidents(channelId, limit = 10) {
  if (!channelId) return [];
  const token = getAccessToken();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = today.toISOString();
  try {
    const res = await axios.post(
      `${Api_url}/api/v1/incidents?skip=0&limit=${limit}`,
      { channelId: [channelId] },
      { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
    );
    const data = res?.data;
    // API returns either { data: [...] } or wrapped body
    const arr = data?.data ?? data?.body?.data ?? [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/* ── Map incidentType key → human-readable label + colour ─────────────── */
const INCIDENT_LABEL_MAP = {
  faceRecognition:           { label: 'Face Recognition',       color: 'var(--blue)'    },
  motionDetection:           { label: 'Motion Detected',         color: 'var(--warn)'    },
  countPersons:              { label: 'Person Count',            color: 'var(--blue)'    },
  genericObjectDetection:    { label: 'Object Detected',         color: 'var(--warn)'    },
  countVehicles:             { label: 'Vehicle Count',           color: 'var(--cyan)'    },
  unauthorizedAccess:        { label: 'Unauthorized Access',     color: 'var(--crit)'    },
  lineCrossing:              { label: 'Line Crossing',           color: 'var(--orange)'  },
  fireSmokeDetection:        { label: 'Fire / Smoke',            color: 'var(--crit)'    },
  weaponDetection:           { label: 'Weapon Detected',         color: 'var(--crit)'    },
  unattendedBaggageDetection:{ label: 'Unattended Baggage',      color: 'var(--warn)'    },
  personalProtectiveEquipment:{ label: 'PPE Compliance',         color: 'var(--ok)'      },
  crowdDetection:            { label: 'Crowd Detected',          color: 'var(--warn)'    },
  doorDetection:             { label: 'Door Event',              color: 'var(--cyan)'    },
  lightDetection:            { label: 'Light Detection',         color: 'var(--yellow)'  },
  vehicleDetection:          { label: 'Vehicle Detected',        color: 'var(--cyan)'    },
  deskAbsence:               { label: 'Desk Absence',            color: 'var(--warn)'    },
  guardAbsence:              { label: 'Guard Absence',           color: 'var(--crit)'    },
  loiteringDetection:        { label: 'Loitering',               color: 'var(--warn)'    },
  loiteringWithoutAuth:      { label: 'Loitering (No Auth)',     color: 'var(--crit)'    },
  loiteringWithAuth:         { label: 'Loitering (Auth)',        color: 'var(--ok)'      },
  vehicleObstruction:        { label: 'Vehicle Obstruction',     color: 'var(--crit)'    },
  vehicleTypeDetection:      { label: 'Vehicle Type',            color: 'var(--cyan)'    },
  tableOccupancyDetection:   { label: 'Table Occupancy',         color: 'var(--blue)'    },
  foodServicePPEDetection:   { label: 'Food Safety PPE',         color: 'var(--ok)'      },
};

/* ── Engine key suffix → human-readable label ─────────────────────────── */
export const ENGINE_LABEL_MAP = {
  countPersonsSettings:              'Person Count',
  motionDetectionSettings:           'Motion Detection',
  genericObjectDetectionSettings:    'Object Detection',
  countVehiclesSettings:             'Vehicle Count',
  loiteringWithoutAuthSettings:      'Loitering (No Auth)',
  loiteringWithAuthSettings:         'Loitering (Auth)',
  unauthorizedAccessSettings:        'Unauthorized Access',
  lineCrossingSettings:              'Line Crossing',
  fireSmokeDetectionSettings:        'Fire & Smoke',
  weaponDetectionSettings:           'Weapon Detection',
  unattendedBaggageDetectionSettings:'Unattended Baggage',
  personalProtectiveEquipmentSettings:'PPE Compliance',
  crowdDetectionSettings:            'Crowd Detection',
  doorDetectionSettings:             'Door Detection',
  lightDetectionSettings:            'Light Detection',
  vehicleDetectionSettings:          'Vehicle Detection',
  deskAbsenceSettings:               'Desk Absence',
  guardAbsenceSettings:              'Guard Absence',
  conveyorDetectionSettings:         'Conveyor Detection',
  crusherDetectionSettings:          'Crusher Detection',
  waterSpillageDetectionSettings:    'Water Spillage',
  loiteringDetectionSettings:        'Loitering',
  vehicleTypeDetectionSettings:      'Vehicle Type',
  tableOccupancyDetectionSettings:   'Table Occupancy',
  foodServicePPEDetectionSettings:   'Food Safety PPE',
  vehicleObstructionSettings:        'Vehicle Obstruction',
};

/* ── Extract enabled engines from channel.detections object ─────────────── */
export function getEnabledEngines(channel) {
  const detections = channel?.detections;
  if (!detections || typeof detections !== 'object') return [];
  return Object.entries(detections)
    .filter(([, v]) => v?.enabled === true)
    .map(([key]) => ENGINE_LABEL_MAP[key] || key.replace('Settings', '').replace(/([A-Z])/g, ' $1').trim());
}

/* ── Severity → confidence percent ─────────────────────────────────────── */
const SEV_CONF = { critical: 97, high: 88, medium: 75, low: 62, info: 50 };

/* ── incidentType colour for timeline bars ──────────────────────────────── */
function incidentColor(type) {
  const m = INCIDENT_LABEL_MAP[type];
  return m?.color ?? 'var(--blue)';
}

/* ── Grid size configs (skip 1×1 in the toggle bar per design) ─────────── */
const SIZES = [
  { cols: 1, perPage: 1,  label: '1×1' },
  { cols: 2, perPage: 4,  label: '2×2' },
  { cols: 3, perPage: 9,  label: '3×3' },
  { cols: 4, perPage: 16, label: '4×4' },
];

/* SVG grid icons matching the prod screenshot style */
function GridIcon1x1() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <rect x="1" y="1" width="12" height="12" rx="2" />
    </svg>
  );
}
function GridIcon2x2() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <rect x="0" y="0" width="6" height="6" rx="1"/><rect x="8" y="0" width="6" height="6" rx="1"/>
      <rect x="0" y="8" width="6" height="6" rx="1"/><rect x="8" y="8" width="6" height="6" rx="1"/>
    </svg>
  );
}
function GridIcon3x3() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <rect x="0"  y="0"  width="4" height="4" rx="0.8"/><rect x="5"  y="0"  width="4" height="4" rx="0.8"/><rect x="10" y="0"  width="4" height="4" rx="0.8"/>
      <rect x="0"  y="5"  width="4" height="4" rx="0.8"/><rect x="5"  y="5"  width="4" height="4" rx="0.8"/><rect x="10" y="5"  width="4" height="4" rx="0.8"/>
      <rect x="0"  y="10" width="4" height="4" rx="0.8"/><rect x="5"  y="10" width="4" height="4" rx="0.8"/><rect x="10" y="10" width="4" height="4" rx="0.8"/>
    </svg>
  );
}
function GridIcon4x4() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <rect x="0" y="0" width="3" height="3" rx="0.5"/><rect x="4" y="0" width="3" height="3" rx="0.5"/><rect x="8"  y="0"  width="3" height="3" rx="0.5"/><rect x="12" y="0"  width="2" height="3" rx="0.5"/>
      <rect x="0" y="4" width="3" height="3" rx="0.5"/><rect x="4" y="4" width="3" height="3" rx="0.5"/><rect x="8"  y="4"  width="3" height="3" rx="0.5"/><rect x="12" y="4"  width="2" height="3" rx="0.5"/>
      <rect x="0" y="8" width="3" height="3" rx="0.5"/><rect x="4" y="8" width="3" height="3" rx="0.5"/><rect x="8"  y="8"  width="3" height="3" rx="0.5"/><rect x="12" y="8"  width="2" height="3" rx="0.5"/>
      <rect x="0" y="12" width="3" height="2" rx="0.5"/><rect x="4" y="12" width="3" height="2" rx="0.5"/><rect x="8"  y="12" width="3" height="2" rx="0.5"/><rect x="12" y="12" width="2" height="2" rx="0.5"/>
    </svg>
  );
}

const GRID_ICONS = { '1×1': GridIcon1x1, '2×2': GridIcon2x2, '3×3': GridIcon3x3, '4×4': GridIcon4x4 };

/** Shared live-camera grid used by Camera View and Live Wall. */
function matchDetection(channel, filter) {
  if (!filter) return true;
  const engines = Array.isArray(channel?.detectionSettings) 
    ? channel.detectionSettings 
    : (Array.isArray(channel?.detections) ? channel.detections : []);
  return engines.some(e => {
    const name = String(e.name || e.type || e || '').toLowerCase();
    if (filter === 'face') {
      return name.includes('face');
    }
    if (filter === 'intrusion') {
      return name.includes('intrusion') || name.includes('motion') || name.includes('weapon');
    }
    if (filter === 'fire') {
      return name.includes('fire') || name.includes('smoke');
    }
    if (filter === 'object') {
      return name.includes('object');
    }
    if (filter === 'anpr') {
      return name.includes('anpr') || name.includes('numberplate') || name.includes('vehicle');
    }
    if (filter === 'line') {
      return name.includes('line') || name.includes('cross');
    }
    if (filter === 'access') {
      return name.includes('access') || name.includes('door') || name.includes('violation') || name.includes('unauthorized');
    }
    if (filter === 'baggage') {
      return name.includes('baggage') || name.includes('unattended');
    }
    if (filter === 'cashier') {
      return name.includes('cashier') || name.includes('absence') || name.includes('loitering');
    }
    return false;
  });
}

function DetailedCameraView({ channel, onPrev, onNext, onClose }) {
  /* ── Derive engines from channel.detections field ─────────── */
  const engines = useMemo(() => getEnabledEngines(channel), [channel]);

  /* ── Channel metadata ─────────────────────────────────────── */
  const channelId   = channel?._id || channel?.channelId;
  const camName     = channel?.customName || channel?.name || 'Camera';
  const site        = channel?.location   || channel?.locationName || channel?.site || '—';
  const nvrRes      = channel?.resolution;
  const resolution  = nvrRes
    ? (typeof nvrRes === 'object'
        ? `${nvrRes.width}×${nvrRes.height}`
        : String(nvrRes))
    : '—';
  const fps         = channel?.fps || '—';
  const protocol    = channel?.rtspChannels?.[0]?.url?.startsWith('rtsp') ? 'RTSP / H.265' : 'RTSP / H.264';

  /* ── Active incidents ─────────────────────────────────────── */
  const [incidents,    setIncidents]    = useState([]);
  const [incLoading,   setIncLoading]   = useState(false);
  const [playing,      setPlaying]      = useState(false);
  const [speed,        setSpeed]        = useState('1×');

  useEffect(() => {
    if (!channelId) return;
    setIncLoading(true);
    fetchChannelIncidents(channelId, 10)
      .then(arr => setIncidents(arr))
      .finally(() => setIncLoading(false));
  }, [channelId]);

  /* ── Today's seconds range for timeline ──────────────────── */
  const now = new Date();
  const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const nowPct = ((nowSec / 86400) * 100).toFixed(2);

  const timelineBlocks = useMemo(() => incidents.map(inc => {
    const d = new Date(inc.timeOfIncident);
    const sec = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
    return {
      leftPct: ((sec / 86400) * 100).toFixed(2),
      color: incidentColor(inc.incidentType),
    };
  }), [incidents]);

  /* ── Format current time ─────────────────────────────────── */
  const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, padding: 16, background: 'var(--bg0)', height: '100%', color: 'var(--tx)', overflowY: 'auto' }}>
      {/* Column 1: Video and Scrubber */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: '1 1 500px', minWidth: 280 }}>
        <div style={{ position: 'relative', height: 480, background: '#000', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--bd)' }}>
          {/* Main stream */}
          <CameraStream channel={channel} minH={0} rounded={false} showOverlay />

          {/* Navigation Controls */}
          {onPrev && (
            <button
              onClick={onPrev}
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', zIndex: 10, width: 34, height: 34, borderRadius: '50%', background: 'rgba(15,23,42,0.65)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background-color .15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(15,23,42,0.85)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(15,23,42,0.65)'}
            >
              <ChevronLeft size={18} />
            </button>
          )}
          {onNext && (
            <button
              onClick={onNext}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', zIndex: 10, width: 34, height: 34, borderRadius: '50%', background: 'rgba(15,23,42,0.65)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background-color .15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(15,23,42,0.85)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(15,23,42,0.65)'}
            >
              <ChevronRight size={18} />
            </button>
          )}

          {/* Top Left Labels */}
          <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ background: 'rgba(15,23,42,0.75)', border: '1px solid rgba(255,255,255,0.15)', padding: '6px 12px', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600, backdropFilter: 'blur(4px)' }}>
              {camName}{site && site !== '—' ? ` — ${site}` : ''}
            </div>
            <div style={{ background: 'rgba(15,23,42,0.65)', padding: '4px 10px', borderRadius: 6, color: 'rgba(255,255,255,0.85)', fontSize: 10.5, fontFamily: 'var(--mono)', width: 'fit-content' }}>
              {resolution !== '—' ? `${resolution} · ` : ''}{fps !== '—' ? `${fps}fps · ` : ''}{engines.length} engine{engines.length !== 1 ? 's' : ''} active
            </div>
            {channelId && (
              <div style={{ background: 'var(--violet)', padding: '4px 10px', borderRadius: 6, color: '#fff', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600, width: 'fit-content', boxShadow: '0 0 8px rgba(168,85,247,0.4)' }}>
                ID: {channelId}
              </div>
            )}
          </div>

          {/* Top Right Labels */}
          <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ background: 'rgba(15,23,42,0.75)', border: '1px solid rgba(255,255,255,0.15)', padding: '5px 10px', borderRadius: 8, color: '#fff', fontSize: 10.5, fontWeight: 600, fontFamily: 'var(--mono)', display: 'flex', alignItems: 'center', gap: 6, backdropFilter: 'blur(4px)' }}>
              <span className="vq-blink" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--crit)', display: 'inline-block' }} />
              REC · LIVE
            </div>
            {onClose && (
              <button
                onClick={onClose}
                style={{ background: 'rgba(15,23,42,0.75)', border: '1px solid rgba(255,255,255,0.15)', padding: '5px 10px', borderRadius: 8, color: '#fff', fontSize: 10.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ✕
              </button>
            )}
          </div>

          {/* PTZ Pad Overlay */}
          <div style={{
            position: 'absolute', bottom: 16, left: 16, zIndex: 10,
            background: 'rgba(15,23,42,0.75)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '50%', width: 72, height: 72, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            alignItems: 'center', justifyContent: 'center', padding: 4, backdropFilter: 'blur(4px)',
            color: 'rgba(255,255,255,0.85)', fontSize: 10, cursor: 'pointer',
          }}>
            <div /> <div style={{ textAlign: 'center' }}>▲</div> <div />
            <div style={{ textAlign: 'center' }}>◀</div> <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.6)', margin: '0 auto' }} /> <div style={{ textAlign: 'center' }}>▶</div>
            <div /> <div style={{ textAlign: 'center' }}>▼</div> <div />
          </div>
        </div>

        {/* Playback Controls & Scrubber */}
        <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            {/* Play Button + Time */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={() => setPlaying(p => !p)}
                style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--violet)', border: 0, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 8px rgba(168,85,247,0.4)' }}
              >
                {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
              </button>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--tx)' }}>
                {timeStr} / 24:00:00
              </span>
            </div>

            {/* Speed selection */}
            <div style={{ display: 'flex', gap: 4 }}>
              {['1×', '4×', '16×'].map(s => (
                <button key={s} onClick={() => setSpeed(s)} style={{ background: speed === s ? 'var(--bg3)' : 'var(--bg2)', border: `1px solid ${speed === s ? 'var(--blue)' : 'var(--bd)'}`, borderRadius: 6, padding: '3px 8px', fontSize: 11, fontFamily: 'var(--mono)', color: speed === s ? 'var(--blue)' : 'var(--tx2)', cursor: 'pointer' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Timeline bar with real incident markers */}
          <div style={{ position: 'relative', height: 28, background: 'var(--bg3)', borderRadius: 6, border: '1px solid var(--bd)', marginTop: 8, overflow: 'hidden' }}>
            {/* Hour Ticks */}
            {[0, 4, 8, 12, 16, 20, 24].map(h => (
              <div key={h} style={{ position: 'absolute', left: `${(h / 24) * 100}%`, display: 'flex', flexDirection: 'column', alignItems: 'center', transform: 'translateX(-50%)', top: 0 }}>
                <div style={{ width: 1, height: 6, background: 'var(--bd2)' }} />
                <span style={{ fontSize: 8.5, color: 'var(--tx3)', fontFamily: 'var(--mono)', marginTop: 1 }}>
                  {String(h).padStart(2, '0')}:00
                </span>
              </div>
            ))}
            {/* Real incident markers */}
            {timelineBlocks.map((blk, i) => (
              <div key={i} title={`Incident at ${blk.leftPct}%`} style={{ position: 'absolute', left: `${blk.leftPct}%`, width: 3, height: 10, top: 9, background: blk.color, borderRadius: 1.5, transform: 'translateX(-50%)' }} />
            ))}
            {/* Current time cursor */}
            <div style={{ position: 'absolute', left: `${nowPct}%`, width: 2, height: '100%', background: 'var(--magenta)', boxShadow: '0 0 8px var(--magenta)', zIndex: 3, top: 0 }} />
          </div>
        </div>
      </div>

      {/* Column 2: Sidebar panels */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: 300, flexShrink: 0 }}>
        {/* Active Detections Panel */}
        <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--bd)' }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--disp)' }}>Active Detections</span>
            <span style={{ fontSize: 9.5, background: 'var(--bg3)', border: '1px solid var(--bd)', padding: '2px 6px', borderRadius: 4, fontFamily: 'var(--mono)', color: 'var(--blue)', fontWeight: 600, marginLeft: 'auto' }}>
              {incLoading ? '…' : `${incidents.length} TRACKED`}
            </span>
          </div>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 260, overflowY: 'auto' }}>
            {incLoading && (
              <span style={{ fontSize: 11, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>Loading…</span>
            )}
            {!incLoading && incidents.length === 0 && (
              <span style={{ fontSize: 11, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>No incidents today</span>
            )}
            {!incLoading && incidents.map((inc, idx) => {
              const cfg   = INCIDENT_LABEL_MAP[inc.incidentType] || { label: inc.incidentType || 'Incident', color: 'var(--blue)' };
              const conf  = SEV_CONF[inc.severity] || 70;
              const ts    = inc.timeOfIncident ? new Date(inc.timeOfIncident).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
              const desc  = inc.incidentName || inc.description || cfg.label;
              return (
                <div key={inc._id || idx} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
                    <span style={{ fontWeight: 600 }}>{desc}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: cfg.color }}>{conf}%</span>
                  </div>
                  <div style={{ height: 5, background: 'var(--bg2)', borderRadius: 2.5, overflow: 'hidden' }}>
                    <div style={{ width: `${conf}%`, height: '100%', background: cfg.color, borderRadius: 2.5 }} />
                  </div>
                  <span style={{ fontSize: 9, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>
                    {ts}{inc.severity ? ` · ${inc.severity}` : ''}{inc.resolved ? ' · resolved' : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Engines on this Camera Panel */}
        <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--disp)' }}>Engines on this Camera</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {engines.length > 0 ? (
              engines.map((label, idx) => (
                <span key={idx} style={{ fontSize: 9.5, fontFamily: 'var(--mono)', border: '1px solid var(--blue)', color: 'var(--blue)', borderRadius: 6, padding: '3px 8px', fontWeight: 600, background: 'rgba(59,130,246,0.06)' }}>
                  • {label}
                </span>
              ))
            ) : (
              <span style={{ fontSize: 11, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>No engines configured</span>
            )}
          </div>
          <button style={{ background: 'transparent', border: 0, padding: 0, textAlign: 'left', color: 'var(--blue)', fontSize: 11, cursor: 'pointer', fontWeight: 500, marginTop: 4 }}>
            Configure detection zones →
          </button>
        </div>

        {/* Camera Info Panel */}
        <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--disp)' }}>Camera Info</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11.5 }}>
            {[
              { label: 'Site',       val: site },
              { label: 'Resolution', val: resolution },
              { label: 'Frame rate', val: fps !== '—' ? `${fps} fps` : '—' },
              { label: 'Protocol',   val: protocol },
              { label: 'Status',     val: 'Streaming', isStatus: true },
            ].map((info, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--tx2)' }}>{info.label}</span>
                {info.isStatus ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, color: 'var(--ok)' }}>
                    <span className="vq-glowpulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok)', boxShadow: '0 0 6px var(--ok)' }} />
                    {info.val}
                  </span>
                ) : (
                  <span style={{ fontWeight: 600 }}>{info.val}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Plain video-only fullscreen — no sidebar/incidents/timeline, just the live feed. */
function FullscreenCameraView({ channel, onPrev, onNext, onClose }) {
  const camName = channel?.customName || channel?.name || 'Camera';
  const site    = channel?.location   || channel?.locationName || channel?.site || '';

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000' }}>
      <CameraStream channel={channel} minH={0} rounded={false} showOverlay={false} />

      {/* Top-left label */}
      <div style={{ position: 'absolute', top: 14, left: 14, zIndex: 10, background: 'rgba(15,23,42,0.75)', border: '1px solid rgba(255,255,255,0.15)', padding: '6px 12px', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600, backdropFilter: 'blur(4px)' }}>
        {camName}{site ? ` — ${site}` : ''}
      </div>

      {/* Close button */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute', top: 14, right: 14, zIndex: 50,
            width: 36, height: 36, boxSizing: 'border-box',
            background: '#ef4444', border: '2px solid #fff', borderRadius: '50%',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,.5)',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#dc2626'}
          onMouseLeave={e => e.currentTarget.style.background = '#ef4444'}
        >
          <X size={20} strokeWidth={3} color="#fff" />
        </button>
      )}

      {/* Prev/Next nav */}
      {onPrev && (
        <button
          onClick={onPrev}
          style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', zIndex: 10, width: 40, height: 40, borderRadius: '50%', background: 'rgba(15,23,42,0.65)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <ChevronLeft size={20} />
        </button>
      )}
      {onNext && (
        <button
          onClick={onNext}
          style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', zIndex: 10, width: 40, height: 40, borderRadius: '50%', background: 'rgba(15,23,42,0.65)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <ChevronRight size={20} />
        </button>
      )}
    </div>
  );
}

export default function CameraGrid({ defaultCols = 3, hideSingleUp = false }) {
  const ctx      = useOutletContext() || {};
  const ctxLoc   = ctx.location || '';
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkCamId = searchParams.get('cam');

  const defaultIdx = SIZES.findIndex((s) => s.cols === defaultCols);
  const [sizeIdx,    setSizeIdx]    = useState(defaultIdx < 0 ? 2 : defaultIdx);
  const [page,       setPage]       = useState(0);
  const [search,     setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // '' | 'live' | 'offline'
  const [detFilter,    setDetFilter]    = useState('');
  const [fullscreen, setFullscreen] = useState(null);
  const [isPageFS,   setIsPageFS]   = useState(false); // browser fullscreen
  const pageRef = useRef(null);

  /* ── Multi-select filters (all arrays of ids/values) ────────────── */
  const [selLoc,  setSelLoc]  = useState([]); // location names
  const [selNvr,  setSelNvr]  = useState([]); // nvr ids
  const [selCam,  setSelCam]  = useState([]); // channel ids
  const [selDept, setSelDept] = useState([]); // department ids
  const [selType, setSelType] = useState([]); // checkin | checkout

  const size     = SIZES[sizeIdx] || SIZES[2];

  /* Location/NVR/Department/CamType are applied server-side; camera is
     applied client-side so its own selection never shrinks the options. */
  const effLoc = ctxLoc ? [ctxLoc] : selLoc;
  const channels = useApi(
    () => getChannels({ location: effLoc, nvrId: selNvr, department: selDept, camType: selType, limit: 200 }),
    [ctxLoc, selLoc.join(','), selNvr.join(','), selDept.join(','), selType.join(',')]
  );

  const locsApi  = useApi(() => getLocations(0, 100), []);
  const nvrsApi  = useApi(() => getNVRs(), []);
  const deptApi  = useApi(() => getDepartments({ limit: 200 }), []);
  const locations = Array.isArray(locsApi.data) ? locsApi.data : [];

  /* Filter option lists in MultiSelect's { id, label } shape */
  const locOptions = useMemo(
    () => locations.map((l) => { const name = l.locationName || l.name || l; return { id: name, label: name }; }),
    [locations]
  );
  const nvrOptions = useMemo(
    () => (Array.isArray(nvrsApi.data) ? nvrsApi.data : []).map((n) => ({ id: n._id, label: n.nvrName })),
    [nvrsApi.data]
  );
  const deptOptions = useMemo(
    () => (Array.isArray(deptApi.data) ? deptApi.data : []).map((d) => ({ id: d._id, label: d.departmentName })),
    [deptApi.data]
  );
  const cameraOptions = useMemo(
    () => (Array.isArray(channels.data) ? channels.data : []).map((c) => ({
      id: c._id || c.channelId,
      label: c.customName || c.name || c.channelId,
    })),
    [channels.data]
  );

  /* wrap setters so any filter change resets pagination to the first page */
  const onFilter = (setter) => (v) => { setter(v); setPage(0); };

  /* Clear-all: reset every filter (and search) in one click */
  const hasActiveFilters =
    selLoc.length || selNvr.length || selCam.length || selDept.length || selType.length ||
    statusFilter || detFilter || search.trim();
  const clearFilters = () => {
    setSelLoc([]); setSelNvr([]); setSelCam([]); setSelDept([]); setSelType([]);
    setStatusFilter(''); setDetFilter(''); setSearch(''); setPage(0);
  };

  /* track which channels are live (updated by CameraStream via onLiveChange) */
  const [liveSet, setLiveSet] = useState(() => new Set());
  const setLive = useCallback((id, isLive) => {
    setLiveSet(prev => {
      const next = new Set(prev);
      isLive ? next.add(id) : next.delete(id);
      return next;
    });
  }, []);

  const activeCount = liveSet.size;

  const list = useMemo(() => {
    let arr = Array.isArray(channels.data) ? channels.data : [];
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(c => `${c.customName || ''} ${c.name || ''} ${c.location || ''}`.toLowerCase().includes(q));
    }
    if (selCam.length)              arr = arr.filter(c => selCam.includes(c._id || c.channelId));
    if (statusFilter === 'live')    arr = arr.filter(c => liveSet.has(c._id || c.channelId));
    if (statusFilter === 'offline') arr = arr.filter(c => !liveSet.has(c._id || c.channelId));
    if (detFilter)                  arr = arr.filter(c => matchDetection(c, detFilter));
    return arr;
  }, [channels.data, search, selCam, statusFilter, liveSet, detFilter]);

  const pages    = Math.max(1, Math.ceil(list.length / size.perPage));
  const safePage = Math.min(page, pages - 1);
  const visible  = list.slice(safePage * size.perPage, safePage * size.perPage + size.perPage);

  const autoPageFsRef = useRef(false);

  const openFullscreen  = useCallback((ch) => setFullscreen(ch), []);
  const closeFullscreen = useCallback(() => {
    setFullscreen(null);
    if (autoPageFsRef.current && document.fullscreenElement) {
      document.exitFullscreen?.();
    }
    autoPageFsRef.current = false;
  }, []);

  /* Browser fullscreen toggle */
  function togglePageFullscreen() {
    if (!document.fullscreenElement) {
      pageRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  /* Deep-link: ?cam=<id> opens that camera fullscreen (both the detail modal
     and the real browser Fullscreen API) once channels load */
  useEffect(() => {
    if (!deepLinkCamId || !Array.isArray(channels.data)) return;
    const match = channels.data.find((c) => (c._id || c.channelId) === deepLinkCamId);
    if (match) {
      setFullscreen(match);
      if (!document.fullscreenElement) {
        pageRef.current?.requestFullscreen?.();
        autoPageFsRef.current = true;
      }
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('cam');
      return next;
    }, { replace: true });
  }, [deepLinkCamId, channels.data, setSearchParams]);
  useEffect(() => {
    const h = () => setIsPageFS(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  /* pill — uses CSS vars so it works in both themes */
  const pill = (active) => ({
    display: 'flex', alignItems: 'center', gap: 6,
    height: 34, padding: '0 16px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 500,
    background: active ? 'var(--bg3)' : 'var(--bg2)',
    color: active ? 'var(--tx)' : 'var(--tx2)',
    border: `1px solid ${active ? 'var(--bd2)' : 'var(--bd)'}`,
    userSelect: 'none', transition: 'all .15s',
  });

  return (
    <div
      ref={pageRef}
      style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: 'var(--bg0)' }}
    >
      {/* ── Fullscreen camera modal ───────────────────────────────── */}
      {fullscreen && (
        <div
          onClick={closeFullscreen}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(4,6,12,.93)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)' }}
        >
          <div onClick={e => e.stopPropagation()} style={{ width: '95vw', height: '95vh', position: 'relative', borderRadius: 12, overflow: 'hidden', background: 'var(--bg0)' }}>
            <FullscreenCameraView
              channel={fullscreen}
              onClose={closeFullscreen}
              onPrev={() => {
                const idx = list.findIndex(c => (c._id || c.channelId) === (fullscreen._id || fullscreen.channelId));
                if (idx >= 0) {
                  const prev = list[(idx - 1 + list.length) % list.length];
                  setFullscreen(prev);
                }
              }}
              onNext={() => {
                const idx = list.findIndex(c => (c._id || c.channelId) === (fullscreen._id || fullscreen.channelId));
                if (idx >= 0) {
                  const next = list[(idx + 1) % list.length];
                  setFullscreen(next);
                }
              }}
            />
          </div>
        </div>
      )}

      {/* ── Toolbar ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: 'var(--bg1solid)', borderBottom: '1px solid var(--bd)', flexWrap: 'wrap', flexShrink: 0 }}>

        {/* Grid size toggles */}
        <div style={{ display: 'flex', gap: 3, background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 9, padding: 3 }}>
          {SIZES.filter(s => hideSingleUp ? s.label !== '1×1' : true).map((s) => {
            const realIdx = SIZES.indexOf(s);
            const active  = realIdx === sizeIdx;
            const Icon    = GRID_ICONS[s.label];
            return (
              <div
                key={s.label}
                onClick={() => { setSizeIdx(realIdx); setPage(0); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 11px', borderRadius: 6, cursor: 'pointer',
                  fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 600,
                  background: active ? 'var(--bg3)' : 'transparent',
                  color: active ? 'var(--tx)' : 'var(--tx3)',
                  transition: 'all .15s',
                }}
              >
                {Icon && <Icon />} {s.label}
              </div>
            );
          })}
        </div>

        {/* Search (placed right after the grid toggles) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, height: 40, padding: '0 11px', borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--bd)', minWidth: 180 }}>
          <Search size={13} style={{ color: 'var(--ph)', flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search cameras…"
            className="vq-ph-hl"
            style={{ flex: 1, background: 'transparent', border: 0, outline: 'none', color: 'var(--tx)', fontSize: 12 }}
          />
        </div>

        {/* Multi-select filters (Location / NVR / Cameras / Department / Camera Type) */}
        {!ctxLoc && (
          <MultiSelect
            options={locOptions}
            value={selLoc}
            onChange={onFilter(setSelLoc)}
            placeholder="Select Location"
            searchPlaceholder="Search Locations..."
            className="w-40"
            maxHeight="max-h-48"
            msg="No Location Found"
          />
        )}
        <MultiSelect
          options={nvrOptions}
          value={selNvr}
          onChange={onFilter(setSelNvr)}
          placeholder="Select NVR"
          searchPlaceholder="Search NVRs..."
          className="w-40"
          maxHeight="max-h-48"
          msg="No NVR Found"
        />
        <MultiSelect
          options={cameraOptions}
          value={selCam}
          onChange={onFilter(setSelCam)}
          placeholder="Select Cameras"
          searchPlaceholder="Search Cameras..."
          className="w-40"
          maxHeight="max-h-48"
          msg="No Camera Found"
        />
        <MultiSelect
          options={deptOptions}
          value={selDept}
          onChange={onFilter(setSelDept)}
          placeholder="Select Department"
          searchPlaceholder="Search Departments..."
          className="w-40"
          maxHeight="max-h-48"
          msg="No Department Found"
        />
        <MultiSelect
          options={CAM_TYPE_OPTIONS}
          value={selType}
          onChange={onFilter(setSelType)}
          placeholder="Select Camera Type"
          searchPlaceholder="Search Camera Type..."
          className="w-40"
          maxHeight="max-h-48"
          msg="No Type Found"
        />

        {/* Status filter */}
        <div style={{ position: 'relative' }}>
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(0); }}
            style={{ ...pill(!!statusFilter), paddingRight: 28, appearance: 'none', cursor: 'pointer' }}
          >
            <option value="">All Status</option>
            <option value="live">Live</option>
            <option value="offline">Offline</option>
          </select>
          <svg style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--tx3)' }} width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
        </div>

        {/* Detections filter */}
        <div style={{ position: 'relative' }}>
          <select
            value={detFilter}
            onChange={e => { setDetFilter(e.target.value); setPage(0); }}
            style={{ ...pill(!!detFilter), paddingRight: 28, appearance: 'none', cursor: 'pointer' }}
          >
            <option value="">All Detections</option>
            <option value="face">Face Recognition</option>
            <option value="intrusion">Intrusion Detection</option>
            <option value="fire">Fire & Smoke</option>
            <option value="object">Object Detection</option>
            <option value="anpr">Number Plate (ANPR)</option>
            <option value="line">Line-Cross</option>
            <option value="access">Unauthorized Access</option>
            <option value="baggage">Unattended Baggage</option>
            <option value="cashier">Cashier Absence</option>
          </select>
          <svg style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--tx3)' }} width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
        </div>

        {/* Clear-all filters — only when a filter is active */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            title="Clear all filters"
            style={{ display: 'flex', alignItems: 'center', gap: 5, height: 40, padding: '0 14px', borderRadius: 8, background: 'var(--brand)', border: '1px solid var(--brand)', cursor: 'pointer', color: '#fff', fontSize: 12.5, fontWeight: 600 }}
          >
            <X size={13} />
            Clear
          </button>
        )}

        {/* Camera count */}
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, color: 'var(--ph)', marginLeft: 4 }}>
          Showing {visible.length} of {list.length} cameras
        </span>

        <div style={{ flex: 1 }} />

        {/* Active detections badge */}
        {activeCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--crit)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--crit)', display: 'inline-block', boxShadow: '0 0 6px var(--crit)' }} className="vq-blink" />
            {activeCount} active detection{activeCount !== 1 ? 's' : ''}
          </div>
        )}

        {/* Fullscreen page toggle */}
        <button
          onClick={togglePageFullscreen}
          title={isPageFS ? 'Exit fullscreen' : 'Fullscreen'}
          style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--bd)', cursor: 'pointer', color: 'var(--tx2)', fontSize: 12, fontWeight: 500 }}
        >
          {isPageFS ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          {isPageFS ? 'Exit' : 'Fullscreen'}
        </button>
      </div>

      {/* ── Grid ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', padding: size.cols === 1 ? 0 : 6 }}>
        <AsyncBoundary
          loading={channels.loading}
          error={channels.error}
          isEmpty={!channels.loading && !channels.error && list.length === 0}
          onRetry={channels.refetch}
          minH={360}
          emptyLabel="No cameras found"
        >
          {() => (
            <>
              {size.cols === 1 && visible[0] ? (
                <div style={{ minHeight: 'calc(100vh - 130px)' }}>
                  <DetailedCameraView 
                    channel={visible[0]} 
                    onPrev={pages > 1 ? () => setPage(p => (p - 1 + pages) % pages) : null}
                    onNext={pages > 1 ? () => setPage(p => (p + 1) % pages) : null}
                  />
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${size.cols},1fr)`, gap: 4 }}>
                  {visible.map((c, idx) => {
                    const id = c._id || c.channelId;
                    const camLabel = `CAM-${String(safePage * size.perPage + idx + 1).padStart(3, '0')}`;
                    return (
                      <div key={id} style={{ aspectRatio: '16/9' }}>
                        <CameraStreamTile
                          channel={c}
                          camLabel={camLabel}
                          channelId={id}
                          onMaximize={openFullscreen}
                          setLive={setLive}
                          rounded={false}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pagination */}
              {pages > 1 && size.cols !== 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '14px 0 4px' }}>
                  <button
                    disabled={safePage === 0}
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    style={{ height: 32, padding: '0 16px', borderRadius: 7, background: 'var(--bg2)', border: '1px solid var(--bd)', color: safePage === 0 ? 'var(--tx3)' : 'var(--tx)', fontSize: 12, cursor: safePage === 0 ? 'default' : 'pointer' }}
                  >
                    Prev
                  </button>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--tx3)' }}>
                    {safePage + 1} / {pages}
                  </span>
                  <button
                    disabled={safePage + 1 >= pages}
                    onClick={() => setPage(p => p + 1)}
                    style={{ height: 32, padding: '0 16px', borderRadius: 7, background: 'var(--bg2)', border: '1px solid var(--bd)', color: safePage + 1 >= pages ? 'var(--tx3)' : 'var(--tx)', fontSize: 12, cursor: safePage + 1 >= pages ? 'default' : 'pointer' }}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </AsyncBoundary>
      </div>
    </div>
  );
}

/* ── CameraStreamTile: memoized to prevent infinite re-render from inline callbacks ── */
const CameraStreamTile = memo(function CameraStreamTile({ channel, camLabel, channelId, onMaximize, setLive, rounded }) {
  const handleMaximize  = useCallback(() => onMaximize(channel),          [onMaximize, channel]);
  const handleLiveChange = useCallback((live) => setLive(channelId, live), [setLive, channelId]);
  return (
    <CameraStream
      channel={channel}
      camLabel={camLabel}
      minH={0}
      rounded={rounded}
      showOverlay
      onMaximize={handleMaximize}
      onLiveChange={handleLiveChange}
    />
  );
});
