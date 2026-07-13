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

// Track a narrow (phone) viewport so the locked full-height layout can relax
// into a normally-scrolling page (the toolbar wraps very tall on phones).
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
    <div className="relative w-full h-full bg-black">
      <CameraStream channel={channel} minH={0} rounded={false} showOverlay={false} />

      {/* Top-left label */}
      <div className="vq-fs-label absolute top-[14px] left-[14px] z-10 max-w-[calc(100%-64px)] bg-[rgba(15,23,42,0.75)] border border-[rgba(255,255,255,0.15)] py-[6px] px-[12px] rounded-[8px] text-white text-[12px] font-semibold backdrop-blur-[4px] overflow-hidden text-ellipsis whitespace-nowrap">
        {camName}{site ? ` — ${site}` : ''}
      </div>

      {/* Close button */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="vq-fs-close absolute top-[14px] right-[14px] z-50 w-[36px] h-[36px] box-border bg-[#ef4444] border-2 border-white rounded-full text-white flex items-center justify-center cursor-pointer shadow-[0_2px_10px_rgba(0,0,0,.5)] shrink-0"
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
          className="vq-fs-nav vq-fs-nav-prev absolute left-[16px] top-1/2 -translate-y-1/2 z-10 w-[40px] h-[40px] rounded-full bg-[rgba(15,23,42,0.65)] border border-[rgba(255,255,255,0.15)] text-white cursor-pointer flex items-center justify-center"
        >
          <ChevronLeft size={20} />
        </button>
      )}
      {onNext && (
        <button
          onClick={onNext}
          className="vq-fs-nav vq-fs-nav-next absolute right-[16px] top-1/2 -translate-y-1/2 z-10 w-[40px] h-[40px] rounded-full bg-[rgba(15,23,42,0.65)] border border-[rgba(255,255,255,0.15)] text-white cursor-pointer flex items-center justify-center"
        >
          <ChevronRight size={20} />
        </button>
      )}

      {/* Browser fullscreen toggle */}
      {onExpand && (
        <button
          onClick={onExpand}
          title={isExpanded ? 'Exit fullscreen' : 'Fullscreen'}
          className="absolute bottom-[14px] right-[14px] z-10 w-[30px] h-[30px] rounded-[6px] bg-[rgba(6,8,13,.6)] border border-[rgba(255,255,255,.15)] backdrop-blur-[4px] flex items-center justify-center cursor-pointer"
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

  const isMobile = useIsMobile();
  // On phones (outside fullscreen, and not the single-camera 1×1 view which
  // fills the height by design) let the page grow and scroll with the app's
  // outer scroll container instead of clamping the grid into a tiny inner
  // scroll region under the tall wrapped toolbar.
  const relax = isMobile && !isPageFS && size.cols !== 1;

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
  const pill = (active) =>
    `flex items-center gap-[6px] h-[34px] px-[16px] rounded-[8px] cursor-pointer text-[12.5px] font-medium select-none transition-all duration-150 border ${
      active ? 'bg-[var(--bg3)] text-[var(--tx)] border-[var(--bd2)]' : 'bg-[var(--bg2)] text-[var(--tx2)] border-[var(--bd)]'
    }`;

  return (
    <div
      ref={pageRef}
      className={`flex flex-col bg-[var(--bg0)] ${relax ? 'h-auto min-h-full overflow-visible' : 'h-full overflow-hidden'}`}
    >
      {/* ── Fullscreen camera modal ───────────────────────────────── */}
      {fullscreen && (
        <div
          onClick={closeFullscreen}
          className="fixed inset-0 z-[9999] bg-[rgba(4,6,12,.93)] flex items-center justify-center backdrop-blur-[6px]"
        >
          <div className="vq-fs-modal w-[95vw] h-[95vh] relative rounded-[12px] overflow-hidden bg-[var(--bg0)]" onClick={e => e.stopPropagation()}>
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
      <div className="vq-wall-toolbar flex items-center gap-[8px] py-[10px] px-[16px] bg-[var(--bg1solid)] border-b border-[var(--bd)] flex-wrap shrink-0">

        {/* Grid size toggles */}
        <div className="vq-wall-sizetoggle flex gap-[3px] bg-[var(--bg2)] border border-[var(--bd)] rounded-[9px] p-[3px]">
          {SIZES.map((s) => {
            const realIdx = SIZES.indexOf(s);
            const active  = realIdx === sizeIdx;
            const Icon    = GRID_ICONS[s.label];
            return (
              <div
                key={s.label}
                onClick={() => { setSizeIdx(realIdx); setPage(0); }}
                className={`flex items-center gap-[5px] py-[5px] px-[11px] rounded-[6px] cursor-pointer font-[family-name:var(--mono)] text-[11.5px] font-semibold transition-all duration-150 ${
                  active ? 'bg-[var(--bg3)] text-[var(--tx)]' : 'bg-transparent text-[var(--tx3)]'
                }`}
              >
                {Icon && <Icon />} {s.label}
              </div>
            );
          })}
        </div>

        {/* Search (placed right after the grid toggles) */}
        <div className="vq-wall-search flex items-center gap-[7px] h-[40px] px-[11px] rounded-[8px] bg-[var(--bg2)] border border-[var(--bd)] min-w-[180px] flex-[1_1_180px]">
          <Search size={13} className="text-[var(--ph)] shrink-0" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search cameras…"
            className="vq-ph-hl flex-1 min-w-0 bg-transparent border-0 outline-none text-[var(--tx)] text-[12px]"
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
        <div className="relative shrink-0">
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(0); }}
            className={`${pill(!!statusFilter)} pr-[28px] appearance-none cursor-pointer`}
          >
            <option value="">All Status</option>
            <option value="live">Live</option>
            <option value="offline">Offline</option>
          </select>
          <svg className="absolute right-[9px] top-1/2 -translate-y-1/2 pointer-events-none text-[var(--tx3)]" width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
        </div>

        {/* Clear-all filters — only when a filter is active */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            title="Clear all filters"
            className="flex items-center gap-[5px] h-[40px] px-[14px] rounded-[8px] bg-[var(--brand)] border border-[var(--brand)] cursor-pointer text-white text-[12.5px] font-semibold shrink-0"
          >
            <X size={13} />
            Clear
          </button>
        )}

        {/* Camera count */}
        <span className="font-[family-name:var(--mono)] text-[11px] font-semibold text-[var(--ph)] ml-[4px] whitespace-nowrap shrink-0">
          Showing {visible.length} of {list.length} cameras
        </span>

        <div className="flex-1" />

        {/* Active (live-streaming) cameras badge */}
        {activeCount > 0 && (
          <div className="flex items-center gap-[6px] text-[11.5px] font-semibold text-[var(--ok)] whitespace-nowrap shrink-0">
            <span className="vq-blink w-[7px] h-[7px] rounded-full bg-[var(--ok)] inline-block shadow-[0_0_6px_var(--ok)] shrink-0" />
            {activeCount} active camera{activeCount !== 1 ? 's' : ''}
          </div>
        )}

        {/* Fullscreen page toggle */}
        <button
          onClick={togglePageFullscreen}
          title={isPageFS ? 'Exit fullscreen' : 'Fullscreen'}
          className="flex items-center gap-[6px] h-[34px] px-[12px] rounded-[8px] bg-[var(--bg2)] border border-[var(--bd)] cursor-pointer text-[var(--tx2)] text-[12px] font-medium shrink-0 whitespace-nowrap"
        >
          {isPageFS ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          {isPageFS ? 'Exit' : 'Fullscreen'}
        </button>
      </div>

      {/* ── Grid ─────────────────────────────────────────────────── */}
      <div className={`flex-1 min-h-0 flex-col ${relax ? 'overflow-visible' : (size.cols === 1 ? 'overflow-hidden' : 'overflow-auto')} ${size.cols === 1 ? 'p-0 flex' : 'p-[6px] block'}`}>
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
                <div className="flex-1 min-h-0">
                  <FullscreenCameraView
                    channel={visible[0]}
                    onPrev={pages > 1 ? () => setPage(p => (p - 1 + pages) % pages) : null}
                    onNext={pages > 1 ? () => setPage(p => (p + 1) % pages) : null}
                    onExpand={togglePageFullscreen}
                    isExpanded={isPageFS}
                  />
                </div>
              ) : (
                <div className="vq-wall-grid grid gap-[4px]" data-cols={size.cols} style={{ gridTemplateColumns: `repeat(${size.cols},1fr)` }}>
                  {visible.map((c, idx) => {
                    const id = c._id || c.channelId;
                    const camLabel = `CAM-${String(safePage * size.perPage + idx + 1).padStart(3, '0')}`;
                    return (
                      <div key={id} className="aspect-[16/9]">
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
                <div className="flex items-center justify-center gap-[10px] pt-[14px] px-[8px] pb-[4px] flex-wrap">
                  <button
                    disabled={safePage === 0}
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    className={`h-[32px] px-[16px] rounded-[7px] bg-[var(--bg2)] border border-[var(--bd)] text-[12px] shrink-0 ${
                      safePage === 0 ? 'text-[var(--tx3)] cursor-default' : 'text-[var(--tx)] cursor-pointer'
                    }`}
                  >
                    Prev
                  </button>
                  <span className="font-[family-name:var(--mono)] text-[11.5px] text-[var(--tx3)] whitespace-nowrap shrink-0">
                    {safePage + 1} / {pages}
                  </span>
                  <button
                    disabled={safePage + 1 >= pages}
                    onClick={() => setPage(p => p + 1)}
                    className={`h-[32px] px-[16px] rounded-[7px] bg-[var(--bg2)] border border-[var(--bd)] text-[12px] shrink-0 ${
                      safePage + 1 >= pages ? 'text-[var(--tx3)] cursor-default' : 'text-[var(--tx)] cursor-pointer'
                    }`}
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
