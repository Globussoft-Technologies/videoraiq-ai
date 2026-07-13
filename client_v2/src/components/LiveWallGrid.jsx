import { useMemo, useState, useCallback, useEffect, useRef, memo } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Search, X, Maximize2, Minimize2, ChevronLeft, ChevronRight } from 'lucide-react';
import { AsyncBoundary } from './States';
import CameraStream from './CameraStream';
import MultiSelect from './MultiSelect';
import { useApi } from '../hooks/useApi';
import { getChannels, getLocations, getNVRs, getDepartments } from '../helpers/monitoring';

/* Camera-type maps to the channel `checkType` field on the backend. */
const CAM_TYPE_OPTIONS = [
  { id: 'checkin', label: 'Check In' },
  { id: 'checkout', label: 'Check Out' },
];

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

/** Plain video-only fullscreen — no sidebar/incidents/timeline, just the live feed. */
function FullscreenCameraView({ channel, onPrev, onNext, onClose, onExpand, isExpanded }) {
  const camName = channel?.customName || channel?.name || 'Camera';
  const site    = channel?.location   || channel?.locationName || channel?.site || '';

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000' }}>
      <CameraStream channel={channel} minH={0} rounded={false} showOverlay={false} />

      {/* Top-left label */}
      <div className="vq-fs-label" style={{ position: 'absolute', top: 14, left: 14, zIndex: 10, maxWidth: 'calc(100% - 64px)', background: 'rgba(15,23,42,0.75)', border: '1px solid rgba(255,255,255,0.15)', padding: '6px 12px', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600, backdropFilter: 'blur(4px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {camName}{site ? ` — ${site}` : ''}
      </div>

      {/* Close button */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="vq-fs-close"
          style={{
            position: 'absolute', top: 14, right: 14, zIndex: 50,
            width: 36, height: 36, boxSizing: 'border-box',
            background: '#ef4444', border: '2px solid #fff', borderRadius: '50%',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,.5)', flexShrink: 0,
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
          className="vq-fs-nav vq-fs-nav-prev"
          style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', zIndex: 10, width: 40, height: 40, borderRadius: '50%', background: 'rgba(15,23,42,0.65)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <ChevronLeft size={20} />
        </button>
      )}
      {onNext && (
        <button
          onClick={onNext}
          className="vq-fs-nav vq-fs-nav-next"
          style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', zIndex: 10, width: 40, height: 40, borderRadius: '50%', background: 'rgba(15,23,42,0.65)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <ChevronRight size={20} />
        </button>
      )}

      {/* Browser fullscreen toggle */}
      {onExpand && (
        <button
          onClick={onExpand}
          title={isExpanded ? 'Exit fullscreen' : 'Fullscreen'}
          style={{ position: 'absolute', bottom: 14, right: 14, zIndex: 10, width: 30, height: 30, borderRadius: 6, background: 'rgba(6,8,13,.6)', border: '1px solid rgba(255,255,255,.15)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          {isExpanded ? <Minimize2 size={14} color="#fff" /> : <Maximize2 size={14} color="#fff" />}
        </button>
      )}
    </div>
  );
}

export default function LiveWallGrid() {
  const ctx      = useOutletContext() || {};
  const ctxLoc   = ctx.location || '';
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkCamId = searchParams.get('cam');

  const [sizeIdx,    setSizeIdx]    = useState(2); // 3×3 default
  const [page,       setPage]       = useState(0);
  const [search,     setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // '' | 'live' | 'offline'
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
    statusFilter || search.trim();
  const clearFilters = () => {
    setSelLoc([]); setSelNvr([]); setSelCam([]); setSelDept([]); setSelType([]);
    setStatusFilter(''); setSearch(''); setPage(0);
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
    return arr;
  }, [channels.data, search, selCam, statusFilter, liveSet]);

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
      style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg0)', overflow: 'hidden' }}
    >
      {/* ── Fullscreen camera modal ───────────────────────────────── */}
      {fullscreen && (
        <div
          onClick={closeFullscreen}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(4,6,12,.93)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)' }}
        >
          <div className="vq-fs-modal" onClick={e => e.stopPropagation()} style={{ width: '95vw', height: '95vh', position: 'relative', borderRadius: 12, overflow: 'hidden', background: 'var(--bg0)' }}>
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
      <div className="vq-wall-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: 'var(--bg1solid)', borderBottom: '1px solid var(--bd)', flexWrap: 'wrap', flexShrink: 0 }}>

        {/* Grid size toggles */}
        <div className="vq-wall-sizetoggle" style={{ display: 'flex', gap: 3, background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 9, padding: 3 }}>
          {SIZES.map((s) => {
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
        <div className="vq-wall-search" style={{ display: 'flex', alignItems: 'center', gap: 7, height: 40, padding: '0 11px', borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--bd)', minWidth: 180, flex: '1 1 180px' }}>
          <Search size={13} style={{ color: 'var(--ph)', flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search cameras…"
            className="vq-ph-hl"
            style={{ flex: 1, minWidth: 0, background: 'transparent', border: 0, outline: 'none', color: 'var(--tx)', fontSize: 12 }}
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
            className="w-full sm:w-40 md:w-44"
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
          className="w-full sm:w-40 md:w-44"
          maxHeight="max-h-48"
          msg="No NVR Found"
        />
        <MultiSelect
          options={cameraOptions}
          value={selCam}
          onChange={onFilter(setSelCam)}
          placeholder="Select Cameras"
          searchPlaceholder="Search Cameras..."
          className="w-full sm:w-40 md:w-44"
          maxHeight="max-h-48"
          msg="No Camera Found"
        />
        <MultiSelect
          options={deptOptions}
          value={selDept}
          onChange={onFilter(setSelDept)}
          placeholder="Select Department"
          searchPlaceholder="Search Departments..."
          className="w-full sm:w-44 md:w-48"
          maxHeight="max-h-48"
          msg="No Department Found"
        />
        <MultiSelect
          options={CAM_TYPE_OPTIONS}
          value={selType}
          onChange={onFilter(setSelType)}
          placeholder="Select Camera Type"
          searchPlaceholder="Search Camera Type..."
          className="w-full sm:w-48 md:w-52"
          maxHeight="max-h-48"
          msg="No Type Found"
        />

        {/* Status filter */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
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

        {/* Clear-all filters — only when a filter is active */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            title="Clear all filters"
            style={{ display: 'flex', alignItems: 'center', gap: 5, height: 40, padding: '0 14px', borderRadius: 8, background: 'var(--brand)', border: '1px solid var(--brand)', cursor: 'pointer', color: '#fff', fontSize: 12.5, fontWeight: 600, flexShrink: 0 }}
          >
            <X size={13} />
            Clear
          </button>
        )}

        {/* Camera count */}
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, color: 'var(--ph)', marginLeft: 4, whiteSpace: 'nowrap', flexShrink: 0 }}>
          Showing {visible.length} of {list.length} cameras
        </span>

        <div style={{ flex: 1 }} />

        {/* Active (live-streaming) cameras badge */}
        {activeCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--ok)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ok)', display: 'inline-block', boxShadow: '0 0 6px var(--ok)', flexShrink: 0 }} className="vq-blink" />
            {activeCount} active camera{activeCount !== 1 ? 's' : ''}
          </div>
        )}

        {/* Fullscreen page toggle */}
        <button
          onClick={togglePageFullscreen}
          title={isPageFS ? 'Exit fullscreen' : 'Fullscreen'}
          style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--bd)', cursor: 'pointer', color: 'var(--tx2)', fontSize: 12, fontWeight: 500, flexShrink: 0, whiteSpace: 'nowrap' }}
        >
          {isPageFS ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          {isPageFS ? 'Exit' : 'Fullscreen'}
        </button>
      </div>

      {/* ── Grid ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, overflow: size.cols === 1 ? 'hidden' : 'auto', padding: size.cols === 1 ? 0 : 6, display: size.cols === 1 ? 'flex' : 'block', flexDirection: 'column' }}>
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
                <div style={{ flex: 1, minHeight: 0 }}>
                  <FullscreenCameraView
                    channel={visible[0]}
                    onPrev={pages > 1 ? () => setPage(p => (p - 1 + pages) % pages) : null}
                    onNext={pages > 1 ? () => setPage(p => (p + 1) % pages) : null}
                    onExpand={togglePageFullscreen}
                    isExpanded={isPageFS}
                  />
                </div>
              ) : (
                <div className="vq-wall-grid" data-cols={size.cols} style={{ display: 'grid', gridTemplateColumns: `repeat(${size.cols},1fr)`, gap: 4 }}>
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '14px 8px 4px', flexWrap: 'wrap' }}>
                  <button
                    disabled={safePage === 0}
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    style={{ height: 32, padding: '0 16px', borderRadius: 7, background: 'var(--bg2)', border: '1px solid var(--bd)', color: safePage === 0 ? 'var(--tx3)' : 'var(--tx)', fontSize: 12, cursor: safePage === 0 ? 'default' : 'pointer', flexShrink: 0 }}
                  >
                    Prev
                  </button>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--tx3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {safePage + 1} / {pages}
                  </span>
                  <button
                    disabled={safePage + 1 >= pages}
                    onClick={() => setPage(p => p + 1)}
                    style={{ height: 32, padding: '0 16px', borderRadius: 7, background: 'var(--bg2)', border: '1px solid var(--bd)', color: safePage + 1 >= pages ? 'var(--tx3)' : 'var(--tx)', fontSize: 12, cursor: safePage + 1 >= pages ? 'default' : 'pointer', flexShrink: 0 }}
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
