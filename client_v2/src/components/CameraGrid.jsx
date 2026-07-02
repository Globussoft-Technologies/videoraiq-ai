import { useMemo, useState, useCallback, useEffect, useRef, memo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Search, X, Maximize2, Minimize2 } from 'lucide-react';
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

/* ── Grid size configs (skip 1×1 in the toggle bar per design) ─────────── */
const SIZES = [
  { cols: 1, perPage: 1,  label: '1×1' },
  { cols: 2, perPage: 4,  label: '2×2' },
  { cols: 3, perPage: 9,  label: '3×3' },
  { cols: 4, perPage: 16, label: '4×4' },
];

/* SVG grid icons matching the prod screenshot style */
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

const GRID_ICONS = { '1×1': null, '2×2': GridIcon2x2, '3×3': GridIcon3x3, '4×4': GridIcon4x4 };

/** Shared live-camera grid used by Camera View and Live Wall. */
export default function CameraGrid({ defaultCols = 3, hideSingleUp = false }) {
  const ctx      = useOutletContext() || {};
  const ctxLoc   = ctx.location || '';

  const defaultIdx = SIZES.findIndex((s) => s.cols === defaultCols);
  const [sizeIdx,    setSizeIdx]    = useState(defaultIdx < 0 ? 2 : defaultIdx);
  const [page,       setPage]       = useState(0);
  const [search,     setSearch]     = useState('');
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
    selLoc.length || selNvr.length || selCam.length || selDept.length || selType.length || search.trim();
  const clearFilters = () => {
    setSelLoc([]); setSelNvr([]); setSelCam([]); setSelDept([]); setSelType([]);
    setSearch(''); setPage(0);
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
    if (selCam.length) arr = arr.filter(c => selCam.includes(c._id || c.channelId));
    return arr;
  }, [channels.data, search, selCam]);

  const pages    = Math.max(1, Math.ceil(list.length / size.perPage));
  const safePage = Math.min(page, pages - 1);
  const visible  = list.slice(safePage * size.perPage, safePage * size.perPage + size.perPage);

  const openFullscreen  = useCallback((ch) => setFullscreen(ch), []);
  const closeFullscreen = useCallback(() => setFullscreen(null), []);

  /* Browser fullscreen toggle */
  function togglePageFullscreen() {
    if (!document.fullscreenElement) {
      pageRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }
  useEffect(() => {
    const h = () => setIsPageFS(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

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
          <div onClick={e => e.stopPropagation()} style={{ width: '95vw', height: '95vh', position: 'relative', borderRadius: 12, overflow: 'hidden' }}>
            <CameraStream channel={fullscreen} minH={0} rounded={false} showOverlay />
            <button
              onClick={closeFullscreen}
              style={{ position: 'absolute', top: 14, right: 14, zIndex: 10, width: 34, height: 34, borderRadius: 8, background: 'rgba(6,8,13,.7)', border: '1px solid rgba(255,255,255,.15)', backdropFilter: 'blur(4px)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}
            >
              <X size={16} />
            </button>
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
      <div style={{ flex: 1, overflow: 'auto', padding: size.cols === 1 ? 16 : 6 }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${size.cols},1fr)`, gap: size.cols === 1 ? 0 : 4 }}>
                {visible.map((c, idx) => {
                  const id = c._id || c.channelId;
                  const camLabel = `CAM-${String(safePage * size.perPage + idx + 1).padStart(3, '0')}`;
                  return (
                    <div key={id} style={{ aspectRatio: size.cols === 1 ? undefined : '16/9', minHeight: size.cols === 1 ? 'calc(100vh - 130px)' : undefined }}>
                      <CameraStreamTile
                        channel={c}
                        camLabel={camLabel}
                        channelId={id}
                        onMaximize={openFullscreen}
                        setLive={setLive}
                        rounded={size.cols === 1}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              {pages > 1 && (
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
