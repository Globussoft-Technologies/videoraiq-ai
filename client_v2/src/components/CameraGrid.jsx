import { useMemo, useState, useEffect, useRef } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Search, X, Maximize2, Minimize2, Calendar } from 'lucide-react';
import { AsyncBoundary } from './States';
import MultiSelect from './MultiSelect';
import PlaybackTimeline from './PlaybackTimeline';
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

/* Camera View pages one camera at a time — no grid layout. */
const PER_PAGE = 1;

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

/** Local YYYY-MM-DD for a Date — matches an <input type="date"> value, not UTC-shifted. */
function toDateInputValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function CameraGrid() {
  const ctx      = useOutletContext() || {};
  const ctxLoc   = ctx.location || '';
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkCamId = searchParams.get('cam');

  const [page,       setPage]       = useState(0);
  const [search,     setSearch]     = useState('');
  const [isPageFS,   setIsPageFS]   = useState(false); // browser fullscreen
  const [dateStr,    setDateStr]    = useState(() => toDateInputValue(new Date())); // playback date, YYYY-MM-DD
  const pageRef = useRef(null);

  const isMobile = useIsMobile();
  // On phones (outside fullscreen) let the page grow and scroll with the app's
  // outer scroll container instead of clamping to 100% height with an inner
  // scroll region — otherwise the tall wrapped toolbar squeezes the video to a sliver.
  const relax = isMobile && !isPageFS;

  const todayStr = useMemo(() => toDateInputValue(new Date()), []);
  const playbackDate = useMemo(() => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [dateStr]);

  /* ── Multi-select filters (all arrays of ids/values) ────────────── */
  const [selLoc,  setSelLoc]  = useState([]); // location names
  const [selNvr,  setSelNvr]  = useState([]); // nvr ids
  const [selCam,  setSelCam]  = useState([]); // channel ids
  const [selDept, setSelDept] = useState([]); // department ids
  const [selType, setSelType] = useState([]); // checkin | checkout

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
    search.trim() || dateStr !== todayStr;
  const clearFilters = () => {
    setSelLoc([]); setSelNvr([]); setSelCam([]); setSelDept([]); setSelType([]);
    setSearch(''); setPage(0); setDateStr(todayStr);
  };

  const list = useMemo(() => {
    let arr = Array.isArray(channels.data) ? channels.data : [];
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(c => `${c.customName || ''} ${c.name || ''} ${c.location || ''}`.toLowerCase().includes(q));
    }
    if (selCam.length) arr = arr.filter(c => selCam.includes(c._id || c.channelId));
    return arr;
  }, [channels.data, search, selCam]);

  const pages    = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const safePage = Math.min(page, pages - 1);
  const visible  = list.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE);

  /* Browser fullscreen toggle */
  function togglePageFullscreen() {
    if (!document.fullscreenElement) {
      pageRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  /* Deep-link: ?cam=<id> selects that camera into the (single) playback
     view once channels load — no separate modal, same screen as always. */
  useEffect(() => {
    if (!deepLinkCamId || !Array.isArray(channels.data)) return;
    const match = channels.data.find((c) => (c._id || c.channelId) === deepLinkCamId);
    if (match) {
      setSelCam([match._id || match.channelId]);
      setPage(0);
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
  const pillCls = (active) =>
    `flex items-center gap-[6px] h-[34px] rounded-[8px] cursor-pointer text-[12.5px] font-medium select-none transition-all duration-150 border ${
      active
        ? 'bg-[var(--bg3)] text-[var(--tx)] border-[var(--bd2)]'
        : 'bg-[var(--bg2)] text-[var(--tx2)] border-[var(--bd)]'
    }`;

  return (
    <div
      ref={pageRef}
      className={`flex flex-col bg-[var(--bg0)] ${relax ? 'h-auto min-h-full overflow-visible' : 'h-full overflow-hidden'}`}
    >
      {/* ── Toolbar ──────────────────────────────────────────────── */}
      <div className="vq-wall-toolbar flex items-center gap-[8px] py-[10px] px-[16px] bg-[var(--bg1solid)] border-b border-[var(--bd)] flex-wrap shrink-0">

        {/* Search */}
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
            className="w-full sm:w-36 md:w-40"
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
          className="w-full sm:w-36 md:w-40"
          maxHeight="max-h-48"
          msg="No NVR Found"
        />
        <MultiSelect
          options={cameraOptions}
          value={selCam}
          onChange={onFilter(setSelCam)}
          placeholder="Select Cameras"
          searchPlaceholder="Search Cameras..."
          className="w-full sm:w-36 md:w-40"
          maxHeight="max-h-48"
          msg="No Camera Found"
        />
        <MultiSelect
          options={deptOptions}
          value={selDept}
          onChange={onFilter(setSelDept)}
          placeholder="Select Department"
          searchPlaceholder="Search Departments..."
          className="w-full sm:w-36 md:w-40"
          maxHeight="max-h-48"
          msg="No Department Found"
        />
        <MultiSelect
          options={CAM_TYPE_OPTIONS}
          value={selType}
          onChange={onFilter(setSelType)}
          placeholder="Select Camera Type"
          searchPlaceholder="Search Camera Type..."
          className="w-full sm:w-36 md:w-40"
          maxHeight="max-h-48"
          msg="No Type Found"
        />

        {/* Playback date filter */}
        <div className="relative max-w-full shrink-0">
          <Calendar size={13} className={`absolute left-[10px] top-1/2 -translate-y-1/2 pointer-events-none ${dateStr !== todayStr ? 'text-[var(--blue)]' : 'text-[var(--tx3)]'}`} />
          <input
            type="date"
            value={dateStr}
            max={todayStr}
            onChange={e => { if (e.target.value) setDateStr(e.target.value); }}
            title="Select playback date"
            className={`${pillCls(dateStr !== todayStr)} pl-[30px] pr-[16px] max-w-full box-border`}
          />
        </div>

        {/* Clear-all filters — only when a filter is active */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            title="Clear all filters"
            className="flex items-center gap-[5px] h-[40px] px-[14px] rounded-[8px] bg-[var(--brand)] border border-[var(--brand)] cursor-pointer text-white text-[12.5px] font-semibold"
          >
            <X size={13} />
            Clear
          </button>
        )}

        {/* Camera count */}
        <span className="font-[family-name:var(--mono)] text-[11px] font-semibold text-[var(--ph)] ml-[4px] whitespace-nowrap">
          Showing {visible.length} of {list.length} cameras
        </span>

        <div className="flex-[1_1_0%] min-w-0" />

        {/* Fullscreen page toggle */}
        <button
          onClick={togglePageFullscreen}
          title={isPageFS ? 'Exit fullscreen' : 'Fullscreen'}
          className="flex items-center gap-[6px] h-[34px] px-[12px] rounded-[8px] bg-[var(--bg2)] border border-[var(--bd)] cursor-pointer text-[var(--tx2)] text-[12px] font-medium"
        >
          {isPageFS ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          {isPageFS ? 'Exit' : 'Fullscreen'}
        </button>
      </div>

      {/* ── Single-screen playback ──────────────────────────────────
          One video surface only: PlaybackTimeline owns it end-to-end
          (recording, not the live feed). Prev/next switch which camera's
          recording is loaded; there is no separate live-view screen. ── */}
      <div className={`flex-1 min-h-0 ${relax ? 'overflow-visible p-[12px]' : 'overflow-auto p-[16px]'}`}>
        <AsyncBoundary
          loading={channels.loading}
          error={channels.error}
          isEmpty={!channels.loading && !channels.error && list.length === 0}
          onRetry={channels.refetch}
          minH={360}
          emptyLabel="No cameras found"
        >
          {() => (
            visible[0] && (
              <PlaybackTimeline
                channel={visible[0]}
                date={playbackDate}
                onPrev={pages > 1 ? () => setPage(p => (p - 1 + pages) % pages) : null}
                onNext={pages > 1 ? () => setPage(p => (p + 1) % pages) : null}
                onExpand={togglePageFullscreen}
                isExpanded={isPageFS}
              />
            )
          )}
        </AsyncBoundary>
      </div>
    </div>
  );
}
