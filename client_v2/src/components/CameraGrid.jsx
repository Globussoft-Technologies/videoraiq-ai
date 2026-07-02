import { useMemo, useState, useCallback, useEffect, useRef, memo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Search, X, Maximize2, Minimize2 } from 'lucide-react';
import { AsyncBoundary } from './States';
import CameraStream from './CameraStream';
import { useApi } from '../hooks/useApi';
import { getChannels, getLocations } from '../helpers/monitoring';

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
  const [locFilter,    setLocFilter]    = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // '' | 'live' | 'offline'
  const [fullscreen, setFullscreen] = useState(null);
  const [isPageFS,   setIsPageFS]   = useState(false); // browser fullscreen
  const pageRef = useRef(null);

  const size     = SIZES[sizeIdx] || SIZES[2];
  const channels = useApi(() => getChannels({ location: ctxLoc || locFilter, limit: 200 }), [ctxLoc, locFilter]);
  const locsApi  = useApi(() => getLocations(0, 100), []);
  const locations = Array.isArray(locsApi.data) ? locsApi.data : [];

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
    if (statusFilter === 'live')    arr = arr.filter(c => liveSet.has(c._id || c.channelId));
    if (statusFilter === 'offline') arr = arr.filter(c => !liveSet.has(c._id || c.channelId));
    return arr;
  }, [channels.data, search, statusFilter, liveSet]);

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

        {/* Location filter */}
        <div style={{ position: 'relative' }}>
          <select
            value={locFilter}
            onChange={e => { setLocFilter(e.target.value); setPage(0); }}
            style={{ ...pill(!!locFilter), paddingRight: 28, appearance: 'none', cursor: 'pointer' }}
          >
            <option value="">All Locations</option>
            {locations.map((l, i) => {
              const name = l.locationName || l.name || l;
              return <option key={i} value={name}>{name}</option>;
            })}
          </select>
          <svg style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--tx3)' }} width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
        </div>

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

        {/* All Detections */}
        <div onClick={() => {}} style={pill(false)}>All Detections</div>

        {/* Camera count */}
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)', marginLeft: 4 }}>
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

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 11px', borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--bd)', minWidth: 180 }}>
          <Search size={13} style={{ color: 'var(--tx3)', flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search cameras…"
            style={{ flex: 1, background: 'transparent', border: 0, outline: 'none', color: 'var(--tx)', fontSize: 12 }}
          />
        </div>

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
