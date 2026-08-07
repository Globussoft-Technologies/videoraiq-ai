import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Search, Plus, X, Loader2, ArrowLeft, Pencil, ListVideo, Play, Maximize2, Minimize2, ArrowUpRight, Cctv, Trash2, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { AsyncBoundary } from '../../../components/States';
import { useApi } from '../../../hooks/useApi';
import DeleteConfirmation from '../../../components/DeleteConfirmation';
import {
  getNvrs,
  getCamerasByNvr,
  registerAndFetchCameras,
  addSelectedCameras,
  updateNvrById,
  deleteNvrById,
  getNvrCamerasForEdit,
} from '../../../helpers/configure';
import { getChannels, getLocations } from '../../../helpers/monitoring';
import { createLocation } from '../Locations/Api';
import { encrypt, decrypt } from '../../../helpers/decryptNvr';
import useHlsPlayer from '../../../hooks/useHlsPlayer';
import { streamUrl } from '../../../lib/stream';
import HScrollHint from '../../../components/HScrollHint';

// ── helpers ──────────────────────────────────────────────────────────────────
// Track a narrow (phone) viewport so inline-styled layouts can adapt.
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

// Add/Edit/Delete NVR and Manage Cameras are cloud-only actions — a local
// setup provisions NVRs outside this UI, so these are hidden there.
const SHOW_NVR_ACTIONS = import.meta.env.VITE_LOCAL_SETUP === 'false';

function statusColor(status) {
  const s = (status || '').toLowerCase();
  if (s === 'online' || s === 'active') return '#22c55e';
  if (s === 'warning') return '#f5a623';
  return '#6b7796';
}

function formatBrand(brand) {
  const value = String(brand || '').trim();
  if (!value) return '';
  if (value.toLowerCase() === 'cpplus') return 'CP Plus';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function inferChannelCapacity(nvr, usedChannels) {
  const explicit = Number(
    nvr.channelCapacity ?? nvr.maxChannels ?? nvr.totalChannels ?? nvr.capacity
  );
  if (Number.isFinite(explicit) && explicit > 0) return Math.max(explicit, usedChannels);

  // Hikvision models commonly encode capacity in the final two digits before
  // NI (DS-7116NI -> 16, DS-9664NI -> 64). Keep this as a display fallback;
  // an explicit API capacity always wins above.
  const match = String(nvr.model || '').match(/DS-\d{2}(\d{2})(?:NI|$)/i);
  const inferred = Number(match?.[1]);
  return Number.isFinite(inferred) && inferred > 0
    ? Math.max(inferred, usedChannels)
    : usedChannels;
}

// Distinct badge colors so adjacent chips (ID/IP/Model/... or table columns)
// don't all read as one indistinguishable blob — same idea as the role-badge
// palette in UsersPage.jsx.
const BADGE_COLORS = [
  '#8b5cf6', '#3b82f6', '#f59e0b', '#10b981', '#ec4899', '#ef4444', '#06b6d4',
];
function badgeColor(key) {
  let hash = 0;
  for (const ch of String(key)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return BADGE_COLORS[hash % BADGE_COLORS.length];
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const ENGINE_LABELS = {
  faceRecognitionSettings: 'FACE',
  faceDetectionSettings: 'FACE',
  genericObjectDetectionSettings: 'OBJ',
  objectDetectionSettings: 'OBJ',
  countPersonsSettings: 'CNT',
  crowdDetectionSettings: 'CRWD',
  unauthorizedAccessSettings: 'INTR',
  intrusionDetectionSettings: 'INTR',
  anprSettings: 'ANPR',
  vehicleNumberPlateSettings: 'ANPR',
  fireSmokeDetectionSettings: 'FIRE',
  fireDetectionSettings: 'FIRE',
  lineCrossingSettings: 'LINE',
  loiteringDetectionSettings: 'LOIT',
  unattendedBaggageDetectionSettings: 'BAG',
  baggageDetectionSettings: 'BAG',
  cashDetectionSettings: 'CASH',
  personalProtectiveEquipmentSettings: 'PPE',
  mobilePhoneDetectionSettings: 'MOB',
};

const ENGINE_NAMES = {
  faceRecognitionSettings: 'Face Recognition',
  faceDetectionSettings: 'Face Detection',
  genericObjectDetectionSettings: 'Object Detection',
  objectDetectionSettings: 'Object Detection',
  countPersonsSettings: 'Count Persons Detection',
  crowdDetectionSettings: 'Crowd Detection',
  unauthorizedAccessSettings: 'Intrusion Detection',
  intrusionDetectionSettings: 'Intrusion Detection',
  anprSettings: 'ANPR Detection',
  vehicleNumberPlateSettings: 'ANPR Detection',
  fireSmokeDetectionSettings: 'Fire & Smoke Detection',
  fireDetectionSettings: 'Fire Detection',
  lineCrossingSettings: 'Line Crossing Detection',
  loiteringDetectionSettings: 'Loitering Detection',
  unattendedBaggageDetectionSettings: 'Unattended Baggage Detection',
  baggageDetectionSettings: 'Baggage Detection',
  cashDetectionSettings: 'Cash Detection',
  personalProtectiveEquipmentSettings: 'Personal Protective Equipment Detection',
  mobilePhoneDetectionSettings: 'Mobile Phone Detection',
};

function compactEngineLabel(settingKey, setting) {
  const key = setting?.settingType || settingKey;
  if (ENGINE_LABELS[key]) return ENGINE_LABELS[key];

  const readable = String(key || setting?.name || '')
    .replace(/Settings$/i, '')
    .replace(/Detection$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[^a-z0-9 ]/gi, ' ')
    .trim();

  if (!readable) return 'ENG';
  return readable
    .split(/\s+/)
    .map(word => word[0])
    .join('')
    .slice(0, 4)
    .toUpperCase();
}

function fullEngineName(settingKey, setting) {
  const key = setting?.settingType || settingKey;
  if (ENGINE_NAMES[key]) return ENGINE_NAMES[key];
  return setting?.name || String(key || 'Detection Engine')
    .replace(/Settings$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
}

function detectionSettingRecord(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  return entry.id && typeof entry.id === 'object' ? entry.id : entry;
}

function isDetectionEnabled(entry) {
  if (entry === true) return true;
  const setting = detectionSettingRecord(entry);
  if (setting?.enabled === true) return true;
  if (entry?.enabled === true && setting?.enabled !== false) return true;
  return false;
}

function enabledEnginesFor(channel) {
  const detections = channel?.detections;
  if (!detections || typeof detections !== 'object') return [];

  const engines = Object.entries(detections)
    .filter(([, entry]) => isDetectionEnabled(entry))
    .map(([key, entry]) => {
      const setting = detectionSettingRecord(entry);
      return {
        label: compactEngineLabel(key, setting),
        title: fullEngineName(key, setting),
      };
    });

  return [...new Map(engines.map(engine => [engine.label, engine])).values()];
}

function EngineChips({ engines }) {
  if (!engines.length) {
    return <span style={{ color: 'var(--tx3)', fontFamily: 'var(--mono)', fontSize: 11 }}>-</span>;
  }

  return (
    <span style={{ display: 'flex', alignItems: 'flex-start', alignContent: 'flex-start', flexWrap: 'wrap', gap: 5, minWidth: 0, maxWidth: '90%', width: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>
      {engines.map(engine => {
        const label = typeof engine === 'string' ? engine : engine.label;
        const title = typeof engine === 'string' ? engine : engine.title;
        const color = badgeColor(label);
        return (
          <span
            key={label}
            title={title}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 18,
              padding: '0 5px',
              borderRadius: 4,
              border: `1px solid ${color}`,
              background: hexA(color, 0.08),
              color,
              fontFamily: 'var(--mono)',
              fontSize: 9.5,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            {label}
          </span>
        );
      })}
    </span>
  );
}

function FieldLabel({ children, required }) {
  return (
    <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 6 }}>
      {children}
      {required && <span style={{ color: 'var(--crit, #ef4444)' }}> *</span>}
    </div>
  );
}

/** Inline validation message shown under the field it belongs to — names the
 * specific problem instead of a single toast that doesn't say which of the
 * several required fields was left blank. */
function FieldError({ children }) {
  if (!children) return null;
  return (
    <div style={{ fontSize: 10.5, color: 'var(--crit, #ef4444)', marginTop: 5, lineHeight: 1.35 }}>
      {children}
    </div>
  );
}

function ModalInput({ label, required, invalid, error, ...props }) {
  return (
    <div>
      <FieldLabel required={required}>{label}</FieldLabel>
      <input
        {...props}
        style={{
          width: '100%', height: 38, padding: '0 12px', boxSizing: 'border-box',
          borderRadius: 9, background: 'var(--bg2)',
          border: `1px solid ${invalid ? 'var(--crit, #ef4444)' : 'var(--bd)'}`,
          fontSize: 12.5, color: 'var(--tx)', outline: 'none',
          ...(props.mono ? { fontFamily: 'var(--mono)' } : {}),
        }}
      />
      <FieldError>{error}</FieldError>
    </div>
  );
}

const NVR_BRANDS = [
  { value: 'hikvision', label: 'Hikvision' },
  { value: 'cpplus', label: 'CP Plus' },
];

// ── Shimmering placeholder block for loading states ────────────────────────
function SkeletonBlock({ width = '100%', height = 12, radius = 5, style = {} }) {
  return (
    <span style={{
      display: 'inline-block', width, height, borderRadius: radius,
      background: 'var(--bg2)', position: 'relative', overflow: 'hidden', ...style,
    }}>
      <span style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.12),transparent)',
        animation: 'vqshimmer 1.6s ease-in-out infinite',
      }} />
    </span>
  );
}

// ── NVR card loading placeholder ────────────────────────────────────────────
function NvrCardSkeleton() {
  return (
    <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg2)', flexShrink: 0 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <SkeletonBlock width="42%" height={12} />
          <SkeletonBlock width="34%" height={9} />
        </div>
      </div>
      <SkeletonBlock width="48%" height={9} style={{ marginBottom: 13 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {['Channels'].map((label) => (
          <div key={label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{label}</span>
              <SkeletonBlock width={35} height={8} />
            </div>
            <SkeletonBlock width="100%" height={5} radius={3} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── NVR card ─────────────────────────────────────────────────────────────────
function NvrCard({ nvr, onEdit, onCameraSettings, onDelete }) {
  const cameraCount = nvr.cameraCount ?? nvr.usedChannels ?? nvr.used ?? 0;
  const channelCapacity = inferChannelCapacity(nvr, cameraCount);
  const channelPercent = channelCapacity > 0
    ? Math.min(100, (cameraCount / channelCapacity) * 100)
    : 0;
  const isMobile = useIsMobile();
  const recorderName = nvr.name || nvr.nvrName || nvr.displayName || nvr.deviceName || 'Unknown Recorder';
  const rawAddress = nvr.ip || nvr.ipAddress || nvr.domain || '';
  const address = decrypt(rawAddress);
  const brand = formatBrand(nvr.brand);
  const location = nvr.location || nvr.locationName || nvr.site || '';
  const connectivity = nvr.isOnline ?? nvr.online ?? nvr.connected ?? nvr.isActive;
  const healthStatus = nvr.status || nvr.health || nvr.connectionStatus ||
    (connectivity === true ? 'online' : connectivity === false ? 'offline' : cameraCount > 0 ? 'online' : '');

  // On phones the three actions can't fit beside the title, so they drop to a
  // full-width row below the fields instead of an absolute top-right cluster.
  const actions = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      ...(isMobile
        ? { marginTop: 14 }
        : { position: 'absolute', top: 14, right: 14 }),
    }}>
      <button
        onClick={() => onCameraSettings(nvr)}
        title="Camera Settings"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, height: 26, padding: '0 8px',
          borderRadius: 6, fontSize: 10.5, fontWeight: 600,
          background: 'rgba(59,130,246,.08)', border: '1px solid rgba(59,130,246,.35)',
          color: 'var(--blue)', cursor: 'pointer', whiteSpace: 'nowrap',
          flex: isMobile ? 1 : undefined, minWidth: 0,
        }}
      >
        <Cctv size={12} /> Camera Settings
      </button>
      {SHOW_NVR_ACTIONS && (
        <>
          <button
            onClick={() => onEdit(nvr)}
            title="Edit NVR"
            style={{
              width: 26, height: 26, borderRadius: 6, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(139,92,246,.08)', border: '1px solid rgba(139,92,246,.35)',
              color: '#8b5cf6', cursor: 'pointer',
            }}
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={() => onDelete(nvr)}
            title="Delete NVR"
            style={{
              width: 26, height: 26, borderRadius: 6, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.35)',
              color: 'var(--crit)', cursor: 'pointer',
            }}
          >
            <Trash2 size={12} />
          </button>
        </>
      )}
      <span
        title={healthStatus || 'Status unavailable'}
        style={{
          width: 9, height: 9, borderRadius: '50%', flexShrink: 0, marginLeft: 1,
          background: statusColor(healthStatus),
          boxShadow: healthStatus ? `0 0 6px ${statusColor(healthStatus)}` : 'none',
        }}
      />
    </div>
  );

  return (
    <div style={{
      background: 'var(--bg1)', border: '1px solid var(--bd)',
      borderRadius: 14, padding: 16, position: 'relative',
    }}>
      {/* Actions (absolute top-right on desktop) */}
      {!isMobile && actions}

      {/* Recorder identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, paddingRight: isMobile ? 0 : (SHOW_NVR_ACTIONS ? 225 : 155) }}>
        <span style={{
          width: 32, height: 32, borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--bd)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--tx2)" strokeWidth="1.7">
            <rect x="3" y="4" width="18" height="7" rx="1.5" />
            <rect x="3" y="13" width="18" height="7" rx="1.5" />
            <circle cx="7" cy="7.5" r=".9" fill="var(--tx2)" />
          </svg>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div title={recorderName} style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {recorderName}
          </div>
          <div style={{ marginTop: 2, fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {[brand, address].filter(Boolean).join(' · ') || 'Recorder details unavailable'}
          </div>
        </div>
      </div>

      <div title={[nvr.model, location].filter(Boolean).join(' · ')} style={{
        marginBottom: 13, fontSize: 11, color: 'var(--tx3)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {[nvr.model, location].filter(Boolean).join(' · ') || 'Model and location not reported'}
      </div>

      {/* Recorder utilization */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 5, fontSize: 10.5, color: 'var(--tx2)' }}>
            <span>Channels</span>
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx3)' }}>
              {channelCapacity > 0 ? `${cameraCount}/${channelCapacity}` : cameraCount}
            </span>
          </div>
          <div style={{ height: 5, borderRadius: 4, overflow: 'hidden', background: 'var(--bd)' }}>
            <div style={{
              width: `${channelPercent}%`, height: '100%', borderRadius: 'inherit',
              position: 'relative', overflow: 'hidden',
              background: 'linear-gradient(90deg,var(--blue),var(--violet))',
              transition: 'width .35s ease',
            }}>
              <span
                aria-hidden="true"
                className="vq-shimmer"
                style={{
                  position: 'absolute', inset: 0, width: '42%',
                  background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.75),transparent)',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Actions (full-width row below fields on phones) */}
      {isMobile && actions}
    </div>
  );
}

// ── Site filter dropdown (Camera Inventory search bar) ─────────────────────
// Custom-styled in place of a native <select> so it matches the app's other
// dropdowns instead of falling back to the OS-themed list.
function SiteFilterSelect({ options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const activeLabel = options.find(o => o.v === value)?.l || 'All Sites';

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!wrapperRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div style={{ position: 'relative' }} ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          height: 32, padding: '0 10px 0 12px', borderRadius: 8, minWidth: 128,
          background: value ? 'rgba(59,130,246,.08)' : 'var(--bg2)',
          border: `1px solid ${value ? 'rgba(59,130,246,.4)' : 'var(--bd)'}`,
          fontSize: 11.5, fontWeight: 500, color: value ? 'var(--blue)' : 'var(--tx)',
          cursor: 'pointer', outline: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeLabel}</span>
        <ChevronDown size={13} style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 5px)', left: 0, zIndex: 60, minWidth: 160,
          maxHeight: 220, overflowY: 'auto', background: 'var(--bg1solid)', border: '1px solid var(--bd2)',
          borderRadius: 10, boxShadow: '0 14px 34px rgba(0,0,0,.3)', padding: 5,
        }}>
          {options.map(o => (
            <div
              key={o.v}
              onClick={() => { onChange(o.v); setOpen(false); }}
              style={{
                padding: '7px 10px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                background: value === o.v ? 'var(--blue)' : 'transparent',
                color: value === o.v ? '#fff' : 'var(--tx)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => { if (value !== o.v) e.currentTarget.style.background = 'var(--bg2)'; }}
              onMouseLeave={(e) => { if (value !== o.v) e.currentTarget.style.background = 'transparent'; }}
            >
              {o.l}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Camera row ────────────────────────────────────────────────────────────────
const CAM_COL = '90px minmax(170px, 2fr) minmax(130px, 1.2fr) minmax(0, 1.4fr) 80px';
const NVR_GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 420px))',
  gap: 14,
};

function CamRow({ c, site, onView }) {
  const sc = '#22c55e';
  const camName = c.name || c.channelName || 'Camera';
  const engines = enabledEnginesFor(c);

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: CAM_COL,
      padding: '11px 16px', borderBottom: '1px solid var(--bd)',
      alignItems: 'center', fontSize: 12.5,
    }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx2)' }}>
        {c._id?.slice(-6) || c.channelId || '—'}
      </span>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, width: 'fit-content', maxWidth: '100%',
        padding: '3px 9px', borderRadius: 6,
        background: 'var(--bg1)', border: '1px solid var(--bd)',
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: sc, flexShrink: 0 }} />
        <span style={{ color: 'var(--tx)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {camName}
        </span>
      </span>
      <span style={{
        display: 'inline-block', width: 'fit-content', maxWidth: '100%',
        padding: '3px 9px', borderRadius: 6,
        background: 'var(--bg1)', border: '1px solid var(--bd)',
        color: 'var(--tx)', fontWeight: 600,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {site || '-'}
      </span>
      <span style={{ minWidth: 0, maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>
        <EngineChips engines={engines} />
      </span>
      <span
        onClick={() => onView(c)}
        style={{ display: 'flex', alignItems: 'center', justifySelf: 'end', gap: 3, minWidth: 80, paddingLeft: 10, background: 'var(--bg1)', position: 'relative', zIndex: 1, whiteSpace: 'nowrap', fontSize: 11.5, color: 'var(--blue)', cursor: 'pointer', fontWeight: 500 }}
      >
        View <ArrowUpRight size={12} />
      </span>
    </div>
  );
}

// ── Camera checkbox row (Step 2 / Manage Cameras) ──────────────────────────
function DiscoveredCameraRow({ cam, checked, onToggle, onPreview }) {
  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
        borderRadius: 9, border: '1px solid var(--bd)', cursor: 'pointer',
        background: checked ? 'rgba(59,130,246,.06)' : 'var(--bg2)',
      }}
    >
      <input type="checkbox" checked={checked} onChange={onToggle} onClick={e => e.stopPropagation()} style={{ width: 15, height: 15, cursor: 'pointer', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--tx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {cam.name || `Camera ${cam.channelId}`}
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>Channel {cam.channelId}</div>
      </div>
      {cam.isAdded && (
        <span style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--blue)', background: 'rgba(59,130,246,.12)', borderRadius: 10, padding: '2px 8px', flexShrink: 0 }}>
          Added
        </span>
      )}
      {cam.dbId && onPreview && (
        <button
          onClick={e => { e.stopPropagation(); onPreview(cam); }}
          title="Preview stream"
          style={{
            display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
            fontSize: 10, fontWeight: 600, color: 'var(--blue)',
            background: 'rgba(59,130,246,.08)', border: '1px solid var(--blue)',
            borderRadius: 20, padding: '3px 9px', cursor: 'pointer',
          }}
        >
          <Play size={10} fill="currentColor" /> Preview
        </button>
      )}
    </div>
  );
}

// ── Live stream preview modal ───────────────────────────────────────────────
function CameraPreviewModal({ cam, onClose }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const isMobile = useIsMobile();
  const url = streamUrl(cam);

  useHlsPlayer(videoRef, url, {
    autoPlay: true,
    // Each retry attempt (hls.js retries the 404 every 2s) re-attaches media,
    // which can fire a spurious canplay/playing on the <video> element before
    // the next error arrives. Track the attempt so stale events from a
    // previous attempt can't clear an error that belongs to a newer one.
    onStarted: () => { setIsLoading(true); setHasError(false); },
    onError: (msg) => { setErrorMsg(msg); setIsLoading(false); setHasError(true); },
  });

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(4,6,12,.85)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? 12 : 24,
      }}
    >
      <div
        ref={containerRef}
        onClick={e => e.stopPropagation()}
        style={{
          width: 640, maxWidth: '100%', background: 'var(--bg1solid)',
          border: '1px solid var(--bd2)', borderRadius: 16, overflow: 'hidden',
          boxShadow: '0 30px 80px rgba(0,0,0,.55)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--bd)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="vq-blink" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--crit)', display: 'inline-block' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>{cam.name || `Camera ${cam.channelId}`}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 600, color: 'var(--tx)', background: 'var(--bg2)', border: '1px solid var(--bd2)', borderRadius: 6, padding: '2px 8px' }}>
              Channel {cam.channelId}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg2)', border: '1px solid var(--bd2)', color: 'var(--tx)', cursor: 'pointer' }}>
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg2)', border: '1px solid var(--bd2)', color: 'var(--tx)', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
        </div>
        <div style={{ position: 'relative', background: '#000', aspectRatio: '16/9' }}>
          {isLoading && !hasError && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, background: 'rgba(0,0,0,.8)', zIndex: 2 }}>
              <Loader2 size={26} className="animate-spin" style={{ color: '#fff' }} />
              <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,.7)' }}>Connecting to stream…</span>
            </div>
          )}
          {hasError && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'rgba(0,0,0,.85)', zIndex: 3, color: '#fff', textAlign: 'center', padding: 16 }}>
              <span style={{ fontSize: 13 }}>Unable to load stream</span>
              <span style={{ fontSize: 11, opacity: 0.7 }}>{errorMsg || 'Camera offline'}</span>
            </div>
          )}
          <video
            ref={videoRef}
            autoPlay muted playsInline preload="metadata"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            // hls.js retries a 404 by re-attaching media every 2s, which can
            // fire a spurious canplay/playing on the element before the next
            // error lands. Only trust genuine advancing playback time (real
            // decoded frames) to clear the error/loading state.
            onTimeUpdate={(e) => {
              if (e.currentTarget.currentTime > 0) { setIsLoading(false); setHasError(false); }
            }}
          />
          {!isLoading && !hasError && (
            <span style={{ position: 'absolute', bottom: 10, left: 10, zIndex: 1, fontSize: 9.5, fontWeight: 700, color: 'var(--crit)', background: 'rgba(0,0,0,.55)', border: '1px solid var(--crit)', borderRadius: 5, padding: '3px 8px', letterSpacing: '.05em' }}>
              LIVE PREVIEW
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Manage Cameras modal (existing NVR) ─────────────────────────────────────
export function ManageCamerasModal({ nvr, onClose, onSaved, zIndex = 200 }) {
  const [cameras, setCameras] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [initialAdded, setInitialAdded] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewCam, setPreviewCam] = useState(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    let cancelled = false;
    getNvrCamerasForEdit(nvr._id).then(body => {
      if (cancelled) return;
      if (body?.status === 'success') {
        const available = body.data.availableCameras || [];
        const addedMap = new Map();
        const selectedSet = new Set();
        available.forEach(cam => {
          if (cam.isAdded && cam.dbId) {
            addedMap.set(cam.channelId, cam.dbId);
            selectedSet.add(cam.channelId);
          }
        });
        setCameras(available);
        setInitialAdded(addedMap);
        setSelected(selectedSet);
      } else {
        toast.error(friendlyErrorMessage(body, 'Failed to load cameras for this NVR.'));
        onClose();
      }
    }).catch(e => {
      if (cancelled) return;
      toast.error(friendlyErrorMessage(e?.response?.data?.body, 'Failed to load cameras from NVR.'));
      onClose();
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [nvr._id]);

  const toggleCamera = (channelId) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(channelId) ? next.delete(channelId) : next.add(channelId);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(cameras.map(c => c.channelId)));
  const clearAll = () => setSelected(new Set());

  async function handleSave() {
    setSaving(true);
    try {
      const toAdd = cameras.filter(cam => selected.has(cam.channelId) && !initialAdded.has(cam.channelId));
      const toRemove = cameras.filter(cam => !selected.has(cam.channelId) && initialAdded.has(cam.channelId));

      if (toAdd.length === 0 && toRemove.length === 0) {
        toast.info('No changes made');
        onClose();
        return;
      }

      // The backend's add-cameras endpoint syncs every camera's isAdded flag
      // to "is it present in cameraIds" — the same bulk sync handles single
      // removals already. It only special-cases a literally EMPTY array as a
      // validation error, so a fully-cleared selection sends a sentinel that
      // matches no real channelId, keeping the request in the same "sync to
      // this set" shape instead of a separate unlink-all call.
      const idsToSend = selected.size > 0 ? Array.from(selected) : ['__none__'];
      const resp = await addSelectedCameras({ nvrId: nvr._id, cameraIds: idsToSend });
      const body = resp?.data?.body;
      if (body?.status !== 'success') {
        toast.error(friendlyErrorMessage(body, 'Failed to update cameras. Please try again.'));
        return;
      }
      const parts = [];
      if (toAdd.length > 0) parts.push(`${toAdd.length} camera${toAdd.length > 1 ? 's' : ''} added`);
      if (toRemove.length > 0) parts.push(`${toRemove.length} camera${toRemove.length > 1 ? 's' : ''} removed`);
      toast.success(parts.join(', '));
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(friendlyErrorMessage(e?.response?.data?.body, 'Something went wrong while saving. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex,
        background: 'rgba(6,8,13,.62)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? 12 : 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 520, maxWidth: '100%', maxHeight: isMobile ? '88vh' : '85vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg1solid)', border: '1px solid var(--bd2)',
          borderRadius: 16, boxShadow: '0 30px 80px rgba(0,0,0,.55)', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: isMobile ? '14px 16px' : '18px 20px', borderBottom: '1px solid var(--bd)', flexShrink: 0, flexWrap: 'wrap' }}>
          <span style={{
            width: 38, height: 38, borderRadius: 10, background: 'var(--bg2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <ListVideo size={17} color="var(--blue)" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 16 }}>Manage Cameras</div>
            <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 1 }}>Check to add · Uncheck to remove</div>
          </div>
          {cameras.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button onClick={selectAll} style={{
                fontSize: 11.5, fontWeight: 600, color: 'var(--blue)',
                border: '1px solid var(--bd)', borderRadius: 8, padding: '6px 11px', cursor: 'pointer', background: 'none',
              }}>
                Add all
              </button>
              <button onClick={clearAll} style={{
                fontSize: 11.5, fontWeight: 600, color: 'var(--tx2)',
                border: '1px solid var(--bd)', borderRadius: 8, padding: '6px 11px', cursor: 'pointer', background: 'none',
              }}>
                Clear all
              </button>
            </div>
          )}
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--tx3)', border: '1px solid var(--bd)', background: 'none', flexShrink: 0,
          }}>
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '16px 20px' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
              <Loader2 size={22} className="animate-spin" style={{ color: 'var(--blue)' }} />
            </div>
          ) : cameras.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--tx3)', textAlign: 'center', padding: 24 }}>
              No cameras found on this NVR.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {cameras.map(cam => (
                <DiscoveredCameraRow
                  key={cam.channelId}
                  cam={cam}
                  checked={selected.has(cam.channelId)}
                  onToggle={() => toggleCamera(cam.channelId)}
                  onPreview={(c) => setPreviewCam({ ...c, streamingUrl: `stream/${nvr._id}-${c.dbId}/playlist.m3u8` })}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '15px 20px', borderTop: '1px solid var(--bd)', flexShrink: 0 }}>
          <button onClick={onClose} disabled={saving} style={{
            fontSize: 12.5, fontWeight: 600, color: 'var(--tx2)',
            border: '1px solid var(--bd)', borderRadius: 9, padding: '9px 16px', cursor: saving ? 'default' : 'pointer', background: 'none',
          }}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              fontSize: 12.5, fontWeight: 600, color: '#fff',
              background: 'linear-gradient(135deg,var(--blue),var(--violet))',
              borderRadius: 9, padding: '9px 18px', border: 'none',
              cursor: (saving || loading) ? 'wait' : 'pointer',
              opacity: (saving || loading) ? 0.6 : 1,
            }}
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {previewCam && <CameraPreviewModal cam={previewCam} onClose={() => setPreviewCam(null)} />}
    </div>
  );
}

// ── Turn a backend fail response into a message a user can act on ─────────
function friendlyErrorMessage(body, fallback) {
  const detail = body?.error || body?.data;
  const raw = typeof detail === 'string' ? detail : body?.message;
  if (!raw) return fallback;

  if (/"?ip"?.*(does not match|fails to match|not allowed)/i.test(raw) || /"ip".*must be/i.test(raw)) {
    return 'Please enter a plain IP address or hostname (no "http://" or "https://" prefix, no port).';
  }
  if (/"?port"?.*(must be|required)/i.test(raw)) {
    return 'Please enter a valid port number between 1 and 65535.';
  }
  if (/"?rtspPort"?.*(must be|required)/i.test(raw)) {
    return 'Please enter a valid RTSP port number between 1 and 65535.';
  }
  if (/"?nvrName"?.*(required|pattern)/i.test(raw)) {
    return 'NVR name is required and cannot contain special characters like < > " \' ( ) { } [ ].';
  }
  if (/"?location"?.*required/i.test(raw)) {
    return 'Please select or create a location.';
  }
  if (/"?username"?.*required/i.test(raw)) {
    return 'Username is required.';
  }
  if (/"?password"?.*required/i.test(raw)) {
    return 'Password is required.';
  }
  if (/"?oldPassword"?.*required/i.test(raw)) {
    return 'Old password is required.';
  }
  if (/"?newPassword"?.*required/i.test(raw)) {
    return 'New password is required.';
  }
  if (/"?brand"?.*required/i.test(raw)) {
    return 'Please select an NVR brand.';
  }
  if (raw === 'Validation Failed' && !detail) {
    return fallback;
  }
  return raw;
}

// ── Add / Edit NVR wizard ───────────────────────────────────────────────────
function AddNvrModal({ onClose, onSaved, editingNvr }) {
  const isEdit = !!editingNvr;
  const isMobile = useIsMobile();

  const [step, setStep] = useState(1);
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState(isEdit ? {
    brand: editingNvr.brand || 'hikvision',
    name: editingNvr.name || editingNvr.nvrName || '',
    location: editingNvr.location || editingNvr.locationName || '',
    ip: decrypt(editingNvr.ipAddress || editingNvr.ip || ''),
    user: editingNvr.username || 'admin',
    oldPass: '', newPass: '',
    rtsp: editingNvr.rtspPort || '554',
    http: editingNvr.port || '80',
  } : {
    brand: 'hikvision', name: '', location: '', ip: '',
    user: '', pass: '', rtsp: '', http: '',
  });

  const [savedNvrId, setSavedNvrId] = useState(isEdit ? editingNvr._id : null);
  const [fetchedCameras, setFetchedCameras] = useState([]);
  const [initialAdded, setInitialAdded] = useState(new Map());
  const [selectedCameras, setSelectedCameras] = useState(new Set());
  const [connecting, setConnecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingLocation, setCreatingLocation] = useState(false);
  const [previewCam, setPreviewCam] = useState(null);
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationQuery, setLocationQuery] = useState(isEdit ? (editingNvr.location || editingNvr.locationName || '') : '');
  const locationDropdownRef = useRef(null);
  const locationInputRef = useRef(null);
  const [brandOpen, setBrandOpen] = useState(false);
  const brandDropdownRef = useRef(null);
  // Per-field validation, shown under each input rather than a single toast
  // that names only one problem at a time and doesn't say which field it means.
  const [errors, setErrors] = useState({});

  useEffect(() => {
    getLocations(0, 100).then(data => setLocations(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!locationOpen) return undefined;
    const handleClickOutside = (event) => {
      if (locationDropdownRef.current?.contains(event.target)) return;
      setLocationOpen(false);
      // Clicked away without picking/creating a location — snap the visible
      // text back to whatever is actually selected, so stale search text
      // can't masquerade as a chosen value.
      setLocationQuery(form.location || '');
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [locationOpen, form.location]);

  useEffect(() => {
    if (!brandOpen) return undefined;
    const handleClickOutside = (event) => {
      if (!brandDropdownRef.current?.contains(event.target)) setBrandOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [brandOpen]);

  const locationOptions = useMemo(
    () => locations.map((l) => l.locationName || l.name || l).filter(Boolean),
    [locations],
  );

  const filteredLocationOptions = useMemo(() => {
    if (form.location && locationQuery.trim().toLowerCase() === form.location.trim().toLowerCase()) {
      return locationOptions;
    }
    const q = locationQuery.trim().toLowerCase();
    if (!q) return locationOptions;
    return locationOptions.filter((name) => name.toLowerCase().includes(q));
  }, [form.location, locationOptions, locationQuery]);

  const toggleLocationDropdown = () => {
    setLocationOpen((open) => {
      const nextOpen = !open;
      if (nextOpen) {
        requestAnimationFrame(() => locationInputRef.current?.focus());
      } else {
        locationInputRef.current?.blur();
        setLocationQuery(form.location || '');
      }
      return nextOpen;
    });
  };

  // Only offer "Create" when the typed value isn't already an exact match
  // (case-insensitive) for an existing location — avoids creating duplicates.
  const canCreateLocation = useMemo(() => {
    const q = locationQuery.trim();
    if (!q) return false;
    return !locationOptions.some((name) => name.toLowerCase() === q.toLowerCase());
  }, [locationOptions, locationQuery]);

  const set = (k) => (e) => {
    setForm(f => ({ ...f, [k]: e.target.value }));
    setErrors(prev => (prev[k] ? { ...prev, [k]: undefined } : prev));
  };

  const applyFetchedCameras = (available) => {
    // registerAndFetchCameras (brand-new NVR) returns raw saved Camera docs
    // (dbId lives at `_id`); editNvrCameras (existing NVR) already normalizes
    // to `dbId`. Normalize here so Preview works the same for both.
    const normalized = (available || []).map((cam) => ({ ...cam, dbId: cam.dbId ?? cam._id ?? null }));
    const addedMap = new Map();
    const selectedSet = new Set();
    normalized.forEach((cam) => {
      if (cam.isAdded && cam.dbId) {
        addedMap.set(cam.channelId, cam.dbId);
        selectedSet.add(cam.channelId);
      }
    });
    setFetchedCameras(normalized);
    setInitialAdded(addedMap);
    setSelectedCameras(selectedSet);
  };

  async function handleCreateLocation() {
    const name = locationQuery.trim();
    if (!name) return;
    setCreatingLocation(true);
    try {
      const resp = await createLocation({ locationName: name });
      if (resp?.data?.body?.status === 'success') {
        toast.success(resp?.data?.body?.message || 'Location created');
        setLocations(prev => [...prev, { locationName: name }]);
        setForm(f => ({ ...f, location: name }));
        setErrors(prev => (prev.location ? { ...prev, location: undefined } : prev));
        setLocationQuery(name);
        setLocationOpen(false);
      } else {
        toast.error(resp?.data?.body?.message || 'Failed to create location');
      }
    } catch (e) {
      toast.error(e?.response?.data?.body?.message || 'Failed to create location');
    } finally {
      setCreatingLocation(false);
    }
  }

  async function handleConnect() {
    const ip = form.ip.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/:\d+$/, '');

    // Every required field is checked in one pass so the form surfaces all of
    // its problems at once, under the fields they actually belong to, instead
    // of one generic toast that doesn't say which field was left blank.
    const found = {};
    if (!form.brand.trim()) found.brand = 'NVR brand is required.';
    if (!form.name.trim()) found.name = 'NVR name is required.';
    if (!form.location.trim()) found.location = 'Select or create a location.';
    if (!ip) found.ip = 'Public IP address is required.';
    if (!form.user.trim()) found.user = 'Username is required.';
    if (!String(form.rtsp || '').trim()) found.rtsp = 'RTSP port is required.';
    if (!String(form.http || '').trim()) found.http = 'HTTP port is required.';
    setErrors(found);
    if (Object.keys(found).length) return;

    if (ip !== form.ip.trim()) {
      toast.error('The IP address should not include "http://", "https://", or a port — using the cleaned value.');
      setForm(f => ({ ...f, ip }));
    }

    setConnecting(true);
    try {
      if (isEdit) {
        const payload = {
          ip: encrypt(ip),
          port: Number(form.http),
          rtspPort: Number(form.rtsp),
          username: form.user,
          nvrName: form.name,
          location: form.location,
          brand: form.brand,
        };
        if (form.oldPass) payload.oldPassword = form.oldPass;
        if (form.newPass) payload.newPassword = form.newPass;
        const resp = await updateNvrById(editingNvr._id, payload);
        const body = resp?.data?.body;
        if (body?.status !== 'success') {
          toast.error(friendlyErrorMessage(body, 'Failed to update NVR. Please check the details and try again.'));
          return;
        }
        toast.success(body?.message || 'NVR updated');

        const camerasBody = await getNvrCamerasForEdit(editingNvr._id);
        if (camerasBody?.status === 'success') {
          applyFetchedCameras(camerasBody.data.availableCameras || []);
          setStep(2);
        } else {
          toast.error(friendlyErrorMessage(camerasBody, 'Failed to load cameras for this NVR.'));
          onSaved?.();
          onClose();
        }
      } else {
        const payload = {
          ip,
          port: Number(form.http),
          rtspPort: Number(form.rtsp),
          username: form.user,
          password: form.pass,
          nvrName: form.name,
          location: form.location,
          brand: form.brand,
        };
        const resp = await registerAndFetchCameras(payload);
        const body = resp?.data?.body;
        if (body?.status === 'success') {
          setSavedNvrId(body.data.nvr._id);
          applyFetchedCameras(body.data.cameras || []);
          setStep(2);
        } else {
          toast.error(friendlyErrorMessage(body, 'Failed to connect to NVR. Please check the connection details and try again.'));
        }
      }
    } catch (e) {
      toast.error(friendlyErrorMessage(e?.response?.data?.body, 'Failed to connect to NVR. Please check your network and try again.'));
    } finally {
      setConnecting(false);
    }
  }

  const toggleCamera = (channelId) => {
    setSelectedCameras(prev => {
      const next = new Set(prev);
      next.has(channelId) ? next.delete(channelId) : next.add(channelId);
      return next;
    });
  };
  const allSelected = fetchedCameras.length > 0 && selectedCameras.size === fetchedCameras.length;
  const toggleSelectAll = () => setSelectedCameras(allSelected ? new Set() : new Set(fetchedCameras.map(c => c.channelId)));

  async function handleSaveCameras() {
    setSaving(true);
    try {
      const toAdd = fetchedCameras.filter(c => selectedCameras.has(c.channelId) && !initialAdded.has(c.channelId));

      if (toAdd.length === 0) {
        toast.info('No new cameras selected');
        onSaved?.();
        onClose();
        return;
      }

      const resp = await addSelectedCameras({ nvrId: savedNvrId, cameraIds: toAdd.map(c => c.channelId) });
      const body = resp?.data?.body;
      if (body?.status !== 'success') {
        toast.error(friendlyErrorMessage(body, 'Failed to add cameras. Please try again.'));
        return;
      }
      toast.success(`${toAdd.length} camera${toAdd.length > 1 ? 's' : ''} added`);
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(friendlyErrorMessage(e?.response?.data?.body, 'Something went wrong while saving cameras. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(6,8,13,.62)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? 12 : 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 600, maxWidth: '100%', maxHeight: isMobile ? '92vh' : '90vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg1solid)', border: '1px solid var(--bd2)',
          borderRadius: 16, boxShadow: '0 30px 80px rgba(0,0,0,.55)', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 20px', borderBottom: '1px solid var(--bd)', flexShrink: 0 }}>
          <span style={{
            width: 38, height: 38, borderRadius: 10, background: 'var(--bg2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="1.7">
              <rect x="3" y="4" width="18" height="7" rx="1.5" />
              <rect x="3" y="13" width="18" height="7" rx="1.5" />
              <circle cx="7" cy="7.5" r=".9" fill="var(--blue)" />
              <circle cx="7" cy="16.5" r=".9" fill="var(--blue)" />
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 16 }}>
              {isEdit ? 'Edit Network Recorder' : 'Add Network Recorder'}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 1 }}>
              {isEdit ? 'Update NVR credentials and manage cameras' : 'Connect an NVR and onboard its cameras'}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--tx3)', border: '1px solid var(--bd)', background: 'none', flexShrink: 0,
          }}>
            <X size={14} />
          </button>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px 6px', flexShrink: 0 }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 600,
            background: step >= 1 ? 'var(--blue)' : 'var(--bg2)',
            color: step >= 1 ? '#fff' : 'var(--tx3)',
            border: `1px solid ${step >= 1 ? 'var(--blue)' : 'var(--bd)'}`,
          }}>1</div>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)' }}>Connection</span>
          <div style={{ flex: 1, height: 1, background: 'var(--bd)' }} />
          <div style={{
            width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 600,
            background: step >= 2 ? 'var(--blue)' : 'var(--bg2)',
            color: step >= 2 ? '#fff' : 'var(--tx3)',
            border: `1px solid ${step >= 2 ? 'var(--blue)' : 'var(--bd)'}`,
          }}>2</div>
          <span style={{ fontSize: 12, fontWeight: 600, color: step >= 2 ? 'var(--tx)' : 'var(--tx2)' }}>Select Cameras</span>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {step === 1 && (
            <div style={{ padding: isMobile ? '14px 16px 18px' : '14px 20px 20px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '13px 14px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <FieldLabel required>NVR Brand</FieldLabel>
                <div ref={brandDropdownRef} style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => !isEdit && setBrandOpen((open) => !open)}
                    disabled={isEdit}
                    style={{
                      width: '100%', height: 38, padding: '0 10px 0 12px', boxSizing: 'border-box',
                      borderRadius: 9, background: 'var(--bg2)',
                      border: `1px solid ${errors.brand ? 'var(--crit, #ef4444)' : 'var(--bd)'}`,
                      fontSize: 12.5, color: 'var(--tx)', cursor: isEdit ? 'default' : 'pointer', outline: 'none',
                      opacity: isEdit ? 0.6 : 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                      textAlign: 'left',
                    }}
                  >
                    <span>{NVR_BRANDS.find((b) => b.value === form.brand)?.label || 'Select brand...'}</span>
                    <ChevronDown
                      size={14}
                      style={{
                        flexShrink: 0, color: 'var(--tx3)',
                        transform: brandOpen ? 'rotate(180deg)' : 'none',
                        transition: 'transform .15s ease',
                      }}
                    />
                  </button>

                  {brandOpen && (
                    <div
                      className="vq-scroll"
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 5px)',
                        left: 0,
                        right: 0,
                        zIndex: 80,
                        maxHeight: 200,
                        overflowY: 'auto',
                        borderRadius: 9,
                        background: 'var(--bg1solid)',
                        border: '1px solid var(--bd)',
                        boxShadow: '0 14px 34px rgba(15,23,42,.24)',
                        padding: 4,
                      }}
                    >
                      {NVR_BRANDS.map((b) => (
                        <button
                          key={b.value}
                          type="button"
                          onClick={() => {
                            setForm((f) => ({ ...f, brand: b.value }));
                            setErrors((prev) => (prev.brand ? { ...prev, brand: undefined } : prev));
                            setBrandOpen(false);
                          }}
                          style={{
                            width: '100%', minHeight: 32, padding: '7px 10px', border: 0, borderRadius: 7,
                            background: form.brand === b.value ? 'rgba(99,102,241,.14)' : 'transparent',
                            color: form.brand === b.value ? 'var(--blue)' : 'var(--tx)',
                            fontSize: 12.5, cursor: 'pointer', textAlign: 'left',
                          }}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <FieldError>{errors.brand}</FieldError>
              </div>
              <ModalInput label="NVR Name" required value={form.name} onChange={set('name')} placeholder="e.g. HQ Core Recorder" invalid={!!errors.name} error={errors.name} />
              <div>
                <FieldLabel required>Location</FieldLabel>
                <div ref={locationDropdownRef} style={{ position: 'relative', marginBottom: 6 }}>
                  <div
                    style={{
                      width: '100%', height: 38, padding: '0 10px 0 12px', boxSizing: 'border-box',
                      borderRadius: 9, background: 'var(--bg2)',
                      border: `1px solid ${errors.location ? 'var(--crit, #ef4444)' : 'var(--bd)'}`,
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    <input
                      ref={locationInputRef}
                      value={locationQuery}
                      onFocus={() => setLocationOpen(true)}
                      onChange={(e) => {
                        setLocationOpen(true);
                        setLocationQuery(e.target.value);
                        setForm((f) => ({ ...f, location: '' }));
                        setErrors((prev) => (prev.location ? { ...prev, location: undefined } : prev));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && canCreateLocation && !filteredLocationOptions.length) {
                          e.preventDefault();
                          handleCreateLocation();
                        }
                      }}
                      placeholder="Search or create a location..."
                      style={{
                        flex: 1, minWidth: 0, height: '100%', border: 0, background: 'transparent',
                        fontSize: 12.5, color: 'var(--tx)', outline: 'none', padding: 0,
                      }}
                    />
                    <ChevronDown
                      size={14}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={toggleLocationDropdown}
                      style={{
                        flexShrink: 0,
                        color: 'var(--tx3)',
                        cursor: 'pointer',
                        transform: locationOpen ? 'rotate(180deg)' : 'none',
                        transition: 'transform .15s ease',
                      }}
                    />
                  </div>

                  {locationOpen && (
                    <div
                      className="vq-scroll"
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 5px)',
                        left: 0,
                        right: 0,
                        zIndex: 80,
                        maxHeight: 200,
                        overflowY: 'auto',
                        borderRadius: 9,
                        background: 'var(--bg1solid)',
                        border: '1px solid var(--bd)',
                        boxShadow: '0 14px 34px rgba(15,23,42,.24)',
                        padding: 4,
                      }}
                    >
                      {filteredLocationOptions.map((name, i) => (
                        <button
                          key={`${name}-${i}`}
                          type="button"
                          onClick={() => {
                            setForm((f) => ({ ...f, location: name }));
                            setLocationQuery(name);
                            setErrors((prev) => (prev.location ? { ...prev, location: undefined } : prev));
                            setLocationOpen(false);
                          }}
                          style={{
                            width: '100%', minHeight: 32, padding: '7px 10px', border: 0, borderRadius: 7,
                            background: form.location === name ? 'rgba(99,102,241,.14)' : 'transparent',
                            color: form.location === name ? 'var(--blue)' : 'var(--tx)',
                            fontSize: 12.5, cursor: 'pointer', textAlign: 'left',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}
                        >
                          {name}
                        </button>
                      ))}

                      {canCreateLocation && (
                        <button
                          type="button"
                          onClick={handleCreateLocation}
                          disabled={creatingLocation}
                          style={{
                            width: '100%', minHeight: 32, padding: '7px 10px', border: 0, borderRadius: 7,
                            background: 'transparent', color: 'var(--blue)',
                            fontSize: 12.5, fontWeight: 600, cursor: creatingLocation ? 'default' : 'pointer',
                            textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6,
                            opacity: creatingLocation ? 0.6 : 1,
                          }}
                        >
                          <Plus size={13} />
                          {creatingLocation ? 'Creating…' : `Create "${locationQuery.trim()}"`}
                        </button>
                      )}

                      {!filteredLocationOptions.length && !canCreateLocation && (
                        <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--tx3)' }}>
                          No locations found
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <FieldError>{errors.location}</FieldError>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <ModalInput label="Public IP Address" required value={form.ip} onChange={set('ip')} placeholder="e.g. 203.0.113.24 (no http:// or port)" mono invalid={!!errors.ip} error={errors.ip} />
              </div>
              <ModalInput label="Username" required value={form.user} onChange={set('user')} placeholder="admin" invalid={!!errors.user} error={errors.user} />
              {isEdit ? (
                <div />
              ) : (
                <ModalInput label="Password" type="password" value={form.pass} onChange={set('pass')} placeholder="••••••••" />
              )}
              {isEdit && (
                <>
                  <ModalInput label="Old Password" type="password" value={form.oldPass} onChange={set('oldPass')} placeholder="••••••••" />
                  <ModalInput label="New Password" type="password" value={form.newPass} onChange={set('newPass')} placeholder="••••••••" />
                </>
              )}
              <ModalInput label="RTSP Port" required value={form.rtsp} onChange={set('rtsp')} placeholder="554" mono invalid={!!errors.rtsp} error={errors.rtsp} />
              <ModalInput label="HTTP Port" required value={form.http} onChange={set('http')} placeholder="80" mono invalid={!!errors.http} error={errors.http} />
            </div>
          )}
          {step === 2 && (
            <div style={{ padding: '14px 20px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--tx)' }}>Discovered Cameras</span>
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--blue)',
                  background: 'rgba(59,130,246,.12)', borderRadius: 6, padding: '2px 8px',
                }}>
                  {selectedCameras.size} selected
                </span>
                {fetchedCameras.length > 0 && (
                  <button
                    onClick={toggleSelectAll}
                    style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 600, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    {allSelected ? 'Deselect all' : 'Select all'}
                  </button>
                )}
              </div>
              {fetchedCameras.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--tx3)', textAlign: 'center', padding: 24 }}>
                  No cameras discovered on this NVR.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 320, overflowY: 'auto' }}>
                  {fetchedCameras.map(cam => (
                    <DiscoveredCameraRow
                      key={cam.channelId}
                      cam={cam}
                      checked={selectedCameras.has(cam.channelId)}
                      onToggle={() => toggleCamera(cam.channelId)}
                      onPreview={(c) => setPreviewCam({ ...c, streamingUrl: `stream/${savedNvrId}-${c.dbId}/playlist.m3u8` })}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 20px', borderTop: '1px solid var(--bd)', flexShrink: 0 }}>
          {step === 2 && (
            <button onClick={() => setStep(1)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12.5, fontWeight: 600, color: 'var(--tx2)',
              border: '1px solid var(--bd)', borderRadius: 9, padding: '9px 14px', cursor: 'pointer', background: 'none',
            }}>
              <ArrowLeft size={13} /> Back
            </button>
          )}
          <button onClick={onClose} style={{
            fontSize: 12.5, fontWeight: 600, color: 'var(--tx3)',
            cursor: 'pointer', padding: '9px 6px', background: 'none', border: 'none',
          }}>
            Cancel
          </button>
          <span style={{ marginLeft: 'auto' }}>
            {step === 1 ? (
              <button
                onClick={handleConnect}
                disabled={connecting}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  fontSize: 12.5, fontWeight: 600, color: '#fff',
                  background: 'linear-gradient(135deg,var(--blue),var(--violet))',
                  borderRadius: 9, padding: '9px 16px', cursor: connecting ? 'wait' : 'pointer', border: 'none',
                  opacity: connecting ? 0.7 : 1,
                }}
              >
                {connecting && <Loader2 size={13} className="animate-spin" />}
                {connecting ? 'Connecting…' : 'Discover Cameras →'}
              </button>
            ) : (
              <button
                onClick={handleSaveCameras}
                disabled={saving}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  fontSize: 12.5, fontWeight: 600, color: '#fff',
                  background: 'linear-gradient(135deg,var(--blue),var(--violet))',
                  borderRadius: 9, padding: '9px 16px', cursor: saving ? 'wait' : 'pointer', border: 'none',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving && <Loader2 size={13} className="animate-spin" />}
                {saving ? 'Saving…' : `Add NVR & ${selectedCameras.size} Camera${selectedCameras.size !== 1 ? 's' : ''}`}
              </button>
            )}
          </span>
        </div>
      </div>

      {previewCam && <CameraPreviewModal cam={previewCam} onClose={() => setPreviewCam(null)} />}
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function NVRCameras() {
  const navigate = useNavigate();
  const { setCamHealth } = useOutletContext() || {};
  const isMobile = useIsMobile();
  const [nvrModal, setNvrModal] = useState(false);
  const [editingNvr, setEditingNvr] = useState(null);
  const [manageCamerasNvr, setManageCamerasNvr] = useState(null);
  const [nvrPickerOpen, setNvrPickerOpen] = useState(false);
  const [camSearch, setCamSearch] = useState('');
  const [siteFilter, setSiteFilter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const nvrPickerRef = useRef(null);

  useEffect(() => {
    if (!nvrPickerOpen) return;
    const h = (e) => { if (nvrPickerRef.current && !nvrPickerRef.current.contains(e.target)) setNvrPickerOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [nvrPickerOpen]);

  const nvrsApi     = useApi(() => getNvrs(0, 100), []);
  const channelsApi = useApi(() => getChannels({ limit: 200 }), []);
  const refetchNvrs = nvrsApi.refetch;
  const refetchChannels = channelsApi.refetch;

  useEffect(() => {
    const onCamerasChanged = () => {
      refetchNvrs();
      refetchChannels();
    };
    window.addEventListener('nvr-cameras-changed', onCamerasChanged);
    return () => window.removeEventListener('nvr-cameras-changed', onCamerasChanged);
  }, [refetchNvrs, refetchChannels]);

  /* Only show the NVR skeleton once loading has actually taken a moment,
     so a fast response never flashes placeholder cards. */
  const [showNvrSkeleton, setShowNvrSkeleton] = useState(false);
  useEffect(() => {
    if (!nvrsApi.loading) { setShowNvrSkeleton(false); return; }
    const t = setTimeout(() => setShowNvrSkeleton(true), 200);
    return () => clearTimeout(t);
  }, [nvrsApi.loading]);

  const nvrs      = nvrsApi.data?.nvrs ?? (Array.isArray(nvrsApi.data) ? nvrsApi.data : []);
  const channels  = channelsApi.data ?? [];

  // Manage Cameras updates the channel list, but the Sidebar health footer is
  // owned by the layout and is otherwise only refreshed by stream-probing
  // pages. Publish the latest inventory total here so add/remove changes are
  // reflected immediately without requiring a dashboard visit or full reload.
  useEffect(() => {
    if (channelsApi.loading || channelsApi.error || !Array.isArray(channelsApi.data)) return;
    setCamHealth?.((previous) => {
      const previousOnline = Number(previous?.online) || 0;
      return {
        online: Math.min(previousOnline, channels.length),
        total: channels.length,
      };
    });
  }, [channelsApi.data, channelsApi.error, channelsApi.loading, channels.length, setCamHealth]);

  /* Channels don't carry their own location — it lives on the parent NVR.
     Only one NVR is registered on most installs, so also fall back to it
     directly when a channel's NVR reference can't be resolved by id. */
  const siteByNvrId = useMemo(() => {
    const map = new Map();
    nvrs.forEach(n => {
      const site = n.location || n.locationName || n.site || '';
      [n._id, n.id, n.nvrId].filter(Boolean).forEach(key => map.set(key, site));
    });
    return map;
  }, [nvrs]);

  /* `nvrId` on a channel is the populated NVR document itself (not a bare id
     string), so its `location` can be read straight off — the id-map lookup
     is only a fallback for shapes where nvrId comes back unpopulated. */
  const channelNvrId = (c) => c.nvrId?._id || c.nvr?._id || c.nvrId || c.nvr || c.nvrID || null;

  const siteOf = (c) => {
    const direct = c.location || c.locationName || c.site || c.nvrId?.location || c.nvr?.location;
    if (direct) return direct;
    const viaId = siteByNvrId.get(channelNvrId(c));
    if (viaId) return viaId;
    // Single-NVR installs: every channel belongs to the only NVR present.
    if (nvrs.length === 1) return nvrs[0].location || nvrs[0].locationName || nvrs[0].site || '';
    return '';
  };

  const camFiltered = channels.filter(c => {
    const nameMatch = !camSearch || (c.name || c.channelName || '').toLowerCase().includes(camSearch.toLowerCase());
    const siteMatch = !siteFilter || siteOf(c).trim().toLowerCase() === siteFilter.trim().toLowerCase();
    return nameMatch && siteMatch;
  });

  const handleViewCamera = (c) => {
    const camId = c._id || c.channelId;
    navigate(`/live${camId ? `?cam=${camId}` : ''}`);
  };

  const handleConfirmDeleteNvr = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteNvrById(deleteTarget._id || deleteTarget.id);
      toast.success('NVR deleted successfully');
      setDeleteTarget(null);
      nvrsApi.refetch();
      channelsApi.refetch();
    } catch (err) {
      toast.error(err?.response?.data?.body?.message || 'Failed to delete NVR');
    } finally {
      setDeleting(false);
    }
  };

  /* Built from the NVRs' own `location` field — the same source siteOf()
     reads for the filter — so every option here is guaranteed matchable.
     (The standalone Location collection is a separate free-text list that
     doesn't necessarily agree in spelling/casing with what's on each NVR.) */
  const nvrSites = [...new Set(nvrs.map(n => (n.location || n.locationName || n.site || '').trim()).filter(Boolean))].sort();
  const siteOpts = [
    { v: '', l: 'All Sites' },
    ...nvrSites.map(s => ({ v: s, l: s })),
  ];

  function handleManageCamerasClick() {
    if (nvrs.length === 0) {
      toast.error('Add an NVR first before managing cameras.');
      return;
    }
    if (nvrs.length === 1) {
      setManageCamerasNvr(nvrs[0]);
      return;
    }
    setNvrPickerOpen(true);
  }

  return (
    <div style={{ padding: isMobile ? 14 : 22, display: 'flex', flexDirection: 'column', gap: isMobile ? 14 : 18 }}>

      {/* ── Title + filters ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15 }}>Network Recorders</span>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)',
          background: 'var(--bg2)', border: '1px solid var(--bd)',
          borderRadius: 6, padding: '3px 9px',
        }}>
          {nvrs.length} NVR{nvrs.length !== 1 ? 's' : ''}
        </span>
        {SHOW_NVR_ACTIONS && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7 }}>
            <button
              onClick={() => setNvrModal(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                fontSize: 12.5, fontWeight: 600, color: '#fff',
                background: 'linear-gradient(135deg,var(--blue),var(--violet))',
                borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
                border: 'none', whiteSpace: 'nowrap',
                boxShadow: '0 0 14px rgba(99,102,241,.3)',
              }}
            >
              <Plus size={14} /> Add NVR
            </button>
          </div>
        )}
      </div>

      {/* ── NVR cards ─────────────────────────────────────────────────────── */}
      {nvrsApi.loading ? (
        showNvrSkeleton ? (
          <div style={NVR_GRID_STYLE} className="vq-nvr-grid">
            {Array.from({ length: 2 }, (_, i) => <NvrCardSkeleton key={i} />)}
          </div>
        ) : (
          <div style={{ minHeight: 140 }} />
        )
      ) : (
        <AsyncBoundary
          loading={false}
          error={nvrsApi.error}
          isEmpty={!nvrsApi.error && nvrs.length === 0}
          onRetry={nvrsApi.refetch}
          minH={140}
          emptyLabel="No NVRs found"
        >
          {() => (
            <div style={NVR_GRID_STYLE} className="vq-nvr-grid">
              {nvrs.map(n => (
                <NvrCard
                  key={n._id || n.id}
                  nvr={n}
                  onEdit={setEditingNvr}
                  onCameraSettings={(nvr) => navigate('/camera-settings', { state: { nvrId: nvr._id || nvr.id } })}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          )}
        </AsyncBoundary>
      )}

      {/* ── Camera Inventory ──────────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 14, overflow: 'hidden' }}>

        {/* Table header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--bd)' }}>
          <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>Camera Inventory</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)', marginLeft: 8 }}>
            {camFiltered.length} of {channels.length} cameras
          </span>
          <div ref={nvrPickerRef} style={{ marginLeft: 'auto', position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
            {SHOW_NVR_ACTIONS && (
              <button
                onClick={handleManageCamerasClick}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 12.5, fontWeight: 600, color: 'var(--tx2)',
                  background: 'var(--bg2)', border: '1px solid var(--bd)',
                  borderRadius: 8, padding: '7px 14px', cursor: 'pointer',
                }}
              >
                <ListVideo size={13} /> Manage Cameras
              </button>
            )}
            {nvrPickerOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
                minWidth: 200, background: 'var(--bg1solid)', border: '1px solid var(--bd)',
                borderRadius: 10, boxShadow: '0 10px 32px rgba(0,0,0,.3)', overflow: 'hidden',
              }}>
                {nvrs.map(n => (
                  <div
                    key={n._id || n.id}
                    onClick={() => { setManageCamerasNvr(n); setNvrPickerOpen(false); }}
                    style={{ padding: '9px 14px', fontSize: 12.5, color: 'var(--tx)', cursor: 'pointer', borderBottom: '1px solid var(--bd)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {n.name || n.nvrName || 'Unknown NVR'}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Search + filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 16px', borderBottom: '1px solid var(--bd)', flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7, height: 32, padding: '0 11px', borderRadius: 8,
            background: camSearch ? 'rgba(59,130,246,.08)' : 'var(--bg2)',
            border: `1px solid ${camSearch ? 'rgba(59,130,246,.4)' : 'var(--bd)'}`,
            color: 'var(--tx3)', transition: 'border-color .12s, background .12s',
          }}>
            <Search size={13} style={{ color: camSearch ? 'var(--blue)' : 'var(--tx3)', flexShrink: 0 }} />
            <input
              value={camSearch}
              onChange={e => setCamSearch(e.target.value)}
              placeholder="Search camera or ID"
              style={{ background: 'transparent', border: 0, outline: 'none', fontSize: 12, width: 140, color: 'var(--tx)' }}
            />
          </div>
          <SiteFilterSelect options={siteOpts} value={siteFilter} onChange={setSiteFilter} />
          {(camSearch || siteFilter) && (
            <button
              onClick={() => { setCamSearch(''); setSiteFilter(''); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, height: 32, padding: '0 11px', borderRadius: 8,
                fontSize: 11.5, fontWeight: 600, color: 'var(--crit)',
                background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', cursor: 'pointer',
              }}
            >
              <X size={12} /> Clear filters
            </button>
          )}
        </div>

        {/* Column headers + rows share one horizontal scroller so the grid
            columns stay aligned and are swipeable on narrow screens. */}
        <HScrollHint minWidth={720}>
          {/* Column headers */}
          <div style={{
            display: 'grid', gridTemplateColumns: CAM_COL,
            padding: '10px 16px', borderBottom: '1px solid var(--bd)',
            fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.07em', color: 'var(--tx3)',
          }}>
            {['ID', 'NAME', 'SITE', 'ENGINES', ''].map((h, i) => <span key={i}>{h}</span>)}
          </div>

          {/* Rows */}
          <div style={{ maxHeight: 430, overflowY: 'auto' }}>
            <AsyncBoundary
              loading={channelsApi.loading}
              error={channelsApi.error}
              isEmpty={!channelsApi.loading && !channelsApi.error && camFiltered.length === 0}
              onRetry={channelsApi.refetch}
              minH={100}
              emptyLabel="No cameras found"
            >
              {() => camFiltered.map(c => (
                <CamRow key={c._id || c.id} c={c} site={siteOf(c)} onView={handleViewCamera} />
              ))}
            </AsyncBoundary>
          </div>
        </HScrollHint>
      </div>

      {/* Add / Edit NVR wizard */}
      {(nvrModal || editingNvr) && (
        <AddNvrModal
          editingNvr={editingNvr}
          onClose={() => { setNvrModal(false); setEditingNvr(null); }}
          onSaved={() => { nvrsApi.refetch(); channelsApi.refetch(); }}
        />
      )}

      {/* Manage Cameras */}
      {manageCamerasNvr && (
        <ManageCamerasModal
          nvr={manageCamerasNvr}
          onClose={() => setManageCamerasNvr(null)}
          onSaved={() => { nvrsApi.refetch(); channelsApi.refetch(); }}
        />
      )}

      {/* Delete NVR confirmation */}
      <DeleteConfirmation
        open={!!deleteTarget}
        icon={<Trash2 className="w-7 h-7 text-[var(--crit)]" />}
        message={
          <>
            Are you sure you want to delete "{deleteTarget?.name || deleteTarget?.nvrName || ''}"? This action cannot be undone. Once deleted, this NVR and all channels associated with it cannot be recovered.
          </>
        }
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDeleteNvr}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        loading={deleting}
      />
    </div>
  );
}
