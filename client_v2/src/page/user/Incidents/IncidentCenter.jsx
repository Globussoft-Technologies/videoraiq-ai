import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useOutletContext } from 'react-router-dom';
import { Search, X, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, SlidersHorizontal, Maximize2, Minimize2, Flag } from 'lucide-react';
import { AsyncBoundary } from '../../../components/States';
import SharedMultiSelect from '../../../components/MultiSelect';
import DateRangePicker, { fmt } from '../../../components/DateRangePicker';
import IncidentCard, { apiMarkResolved, ReportModal } from './IncidentCard';
import RefreshControl from '../../../components/RefreshControl';
import { useApi } from '../../../hooks/useApi';
import { num, detectionLabel, shortDateTime, mediaUrl } from '../../../lib/format';
import { fetchIncidents, fetchIncidentStats, fetchDetectionTypes } from '../../../helpers/incidents';
import { getLocations, getChannels } from '../../../helpers/monitoring';
import { getNvrs } from '../../../helpers/configure';
import axios from 'axios';
import getAccessToken from '../../../utils/getAccessToken';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const SEVERITIES = [
  { key: 'high',     label: 'High'   },
  { key: 'moderate', label: 'Medium' },
  { key: 'low',      label: 'Low'    },
];

const STATUSES = [
  { key: 'new',          label: 'New'      },
  { key: 'acknowledged', label: 'Ack'      },
  { key: 'resolved',     label: 'Resolved' },
];

const chip = (active, color = 'var(--blue)') => ({
  fontSize: 12, fontWeight: 500,
  padding: '5px 14px', borderRadius: 7, cursor: 'pointer',
  background: active ? color : 'transparent',
  color: active ? '#fff' : 'var(--tx2)',
  border: `1px solid ${active ? color : 'var(--bd2)'}`,
  transition: 'all .15s',
  userSelect: 'none',
});

const filterInput = {
  height: 36,
  padding: '0 12px',
  borderRadius: 8,
  background: 'var(--bg1solid)',
  border: '1px solid var(--bd2)',
  fontSize: 12.5,
  color: 'var(--tx)',
  outline: 'none',
  cursor: 'pointer',
};

/* ── Multi-select dropdown ─────────────────────────────────────────────────── */
function MultiSelect({ options, selected, onChange, placeholder = 'Select' }) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState('');
  const ref                 = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() =>
    options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase())),
    [options, search]
  );

  const toggle = (val) => {
    const next = new Set(selected);
    next.has(val) ? next.delete(val) : next.add(val);
    onChange(next);
  };

  const selectAll = () => onChange(new Set(options.map((o) => o.value)));
  const clearAll  = () => onChange(new Set());

  const label = selected.size === 0
    ? placeholder
    : selected.size === 1
      ? detectionLabel([...selected][0])
      : `${selected.size} selected`;

  return (
    <div ref={ref} style={{ position: 'relative', userSelect: 'none' }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          ...filterInput,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          minWidth: 180, gap: 8, paddingRight: 10,
          border: open ? '1px solid var(--blue)' : '1px solid var(--bd2)',
          boxShadow: open ? '0 0 0 3px rgba(59,130,246,.15)' : 'none',
        }}
      >
        <span style={{ fontSize: 12.5, color: selected.size ? 'var(--tx)' : 'var(--tx3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        {open ? <ChevronUp size={14} style={{ color: 'var(--blue)', flexShrink: 0 }} />
               : <ChevronDown size={14} style={{ color: 'var(--tx3)', flexShrink: 0 }} />}
      </div>

      {open && (
        <div className="vq-inc-multiselect" style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200,
          width: 240, maxWidth: 'min(240px, calc(100vw - 24px))', background: 'var(--bg1solid)',
          border: '1px solid var(--bd)',
          borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,.18)',
          overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px 6px', borderBottom: '1px solid var(--bd)' }}>
            <button onClick={selectAll} style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              Select All
            </button>
            <button onClick={clearAll} style={{ fontSize: 12, color: 'var(--crit)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              Clear All
            </button>
          </div>

          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--bd)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--bg2)', borderRadius: 7, padding: '6px 10px', border: '1px solid var(--bd)' }}>
              <Search size={13} style={{ color: 'var(--tx3)', flexShrink: 0 }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                style={{ border: 0, outline: 'none', background: 'transparent', fontSize: 12, color: 'var(--tx)', width: '100%' }}
              />
            </div>
          </div>

          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--tx3)', textAlign: 'center' }}>No results</div>
            ) : (
              filtered.map((opt) => {
                const checked = selected.has(opt.value);
                return (
                  <div
                    key={opt.value}
                    onClick={() => toggle(opt.value)}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: '9px 14px', cursor: 'pointer',
                      background: checked ? 'rgba(59,130,246,.08)' : 'transparent',
                      transition: 'background .1s',
                    }}
                    onMouseEnter={e => { if (!checked) e.currentTarget.style.background = 'var(--bg2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = checked ? 'rgba(59,130,246,.08)' : 'transparent'; }}
                  >
                    <div style={{
                      width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 1,
                      border: `1.5px solid ${checked ? 'var(--blue)' : 'var(--bd2)'}`,
                      background: checked ? 'var(--blue)' : 'var(--bg1solid)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {checked && (
                        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                          <path d="M1 3.5L3.5 6L8 1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span style={{ fontSize: 12.5, color: 'var(--tx2)', lineHeight: 1.4 }}>{opt.label}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Simple single select with chevron ────────────────────────────────────── */
function FilterSelect({ value, onChange, children, style = {} }) {
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <select
        value={value}
        onChange={onChange}
        style={{ ...filterInput, paddingRight: 30, appearance: 'none', minWidth: 150, ...style }}
      >
        {children}
      </select>
      <ChevronDown size={14} style={{ position: 'absolute', right: 10, pointerEvents: 'none', color: 'var(--tx3)' }} />
    </div>
  );
}

/* ── Additional Filters popover (collapsible accordion) ───────────────────── */
async function fetchDepartments() {
  const token = getAccessToken();
  const res = await axios.post(
    `${import.meta.env.VITE_BACKEND}/departments/get`,
    {},
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  const data = res?.data?.body?.data;
  return Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
}

function FiltersPopover({ nvrIds, setNvrIds, channelIds, setChannelIds, deptIds, setDeptIds, locIds, setLocIds }) {
  const [open, setOpen] = useState(false);
  const ref             = useRef(null);

  const nvrsApi  = useApi(() => getNvrs(0, 100), []);
  const deptsApi = useApi(() => fetchDepartments(), []);
  const locsApi  = useApi(() => getLocations(0, 100), []);

  const [cameras, setCameras] = useState([]);
  useEffect(() => {
    if (!nvrIds.length) { setCameras([]); return; }
    getChannels({ nvrId: nvrIds[0], limit: 200 }).then(d => setCameras(Array.isArray(d) ? d : [])).catch(() => {});
  }, [nvrIds.join(',')]);

  useEffect(() => {
    // The NVR/Camera/Department/Location pickers below are SharedMultiSelect,
    // which portals its open panel to document.body (so it isn't clipped by
    // this popover's own bounds) — that panel lives outside `ref`'s subtree,
    // so a plain containment check treats every checkbox click as "outside"
    // and closes this popover before the selection registers. Recognize any
    // portaled panel (tagged with data-vq-portal-panel) as still "inside".
    const h = (e) => {
      if (ref.current && ref.current.contains(e.target)) return;
      if (e.target.closest?.('[data-vq-portal-panel]')) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const nvrs  = nvrsApi.data?.nvrs  ?? [];
  const depts = deptsApi.data ?? [];
  const locs  = locsApi.data  ?? [];

  const activeCount = [nvrIds, channelIds, deptIds, locIds].filter(a => a.length > 0).length;
  const resetAll    = () => { setNvrIds([]); setChannelIds([]); setDeptIds([]); setLocIds([]); };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px',
          border: `1px solid ${activeCount > 0 ? 'var(--blue)' : 'var(--bd2)'}`,
          background: activeCount > 0 ? 'rgba(59,130,246,.08)' : 'var(--bg1solid)',
          borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
          color: activeCount > 0 ? 'var(--blue)' : 'var(--tx2)',
          boxShadow: open ? '0 0 0 3px rgba(59,130,246,.15)' : 'none',
          transition: 'all .15s',
        }}
      >
        <SlidersHorizontal size={14} />
        Filters
        {activeCount > 0 && (
          <span style={{ background: 'var(--blue)', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="vq-inc-filterspopover" style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 300,
          width: 280, maxWidth: 'min(280px, calc(100vw - 24px))', background: 'var(--bg1solid)',
          border: '1px solid var(--bd)', borderRadius: 12,
          boxShadow: '0 10px 32px rgba(0,0,0,.22)',
          padding: 16,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--bd)', paddingBottom: 10 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--tx)' }}>Additional Filters</span>
            {activeCount > 0 && (
              <button
                onClick={resetAll}
                style={{ fontSize: 11, color: 'var(--crit)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
              >
                Reset all
              </button>
            )}
          </div>

          {/* All filters shown at once — no accordion, matching LogsFilterPopover */}
          <SharedMultiSelect
            options={nvrs.map(o => ({ id: o._id || o.id, label: o.nvrName || o.name || '' }))}
            value={nvrIds}
            onChange={v => { setNvrIds(v); setChannelIds([]); }}
            placeholder="Select NVR"
            searchPlaceholder="Search NVR..."
            maxHeight="max-h-40"
            msg="No NVR Found"
          />
          <SharedMultiSelect
            options={cameras.map(o => ({ id: o._id || o.id, label: o.customName || o.name || '' }))}
            value={channelIds}
            onChange={setChannelIds}
            placeholder="Select Camera"
            searchPlaceholder="Search camera..."
            maxHeight="max-h-40"
            msg="No Camera Found"
          />
          <SharedMultiSelect
            options={depts.map(o => ({ id: o._id || o.id, label: o.departmentName || o.name || '' }))}
            value={deptIds}
            onChange={setDeptIds}
            placeholder="Select Department"
            searchPlaceholder="Search department..."
            maxHeight="max-h-40"
            msg="No Department Found"
          />
          <SharedMultiSelect
            options={locs.map(o => {
              // The backend matches NVR.location by NAME (a plain string field,
              // not an ObjectId ref) — id MUST be the name, not o._id, or the
              // filter silently matches zero incidents. Same fix already
              // applied in CommandCenter.jsx's location filter.
              const name = o.locationName || o.name || String(o);
              return { id: name, label: name };
            })}
            value={locIds}
            onChange={setLocIds}
            placeholder="Select Location"
            searchPlaceholder="Search location..."
            maxHeight="max-h-40"
            msg="No Location Found"
          />
        </div>
      )}
    </div>
  );
}

/* ── Full-screen incident viewer with prev/next navigation ──────────────────
   Gallery-style lightbox: click arrows, use ←/→ keys, or scroll the wheel to
   move through the currently-filtered `items` list without closing the modal. */
/* Inline spinner — `vq-spin` keyframes are defined in the page's <style> block. */
function Spinner({ size = 20, color = '#fff' }) {
  return (
    <span
      style={{
        width: size, height: size, borderRadius: '50%', display: 'inline-block',
        border: `2px solid ${color}`, borderTopColor: 'transparent',
        animation: 'vq-spin .7s linear infinite',
      }}
    />
  );
}

function navBtnStyle(side) {
  return {
    // Inset from the viewport edge (the lightbox is now full-bleed, so the old
    // negative offsets would push these off-screen), and above the loading
    // overlay (20) so the spinner never swallows a click.
    position: 'absolute', top: '50%', [side]: 20, transform: 'translateY(-50%)',
    width: 46, height: 46, borderRadius: '50%',
    background: 'rgba(15,23,42,.55)', border: '1px solid rgba(255,255,255,.15)',
    backdropFilter: 'blur(6px)', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', transition: 'background-color .15s, transform .1s', zIndex: 30,
  };
}

function IncidentLightbox({ items, index, onIndexChange, onClose, onRefresh, pageOffset = 0, totalCount = 0, onNavigateGlobal, navLoading = false, navFailedAt = 0 }) {
  const item = items[index];
  // Navigation spans the whole filtered result set, not just the loaded page:
  // hitting either end of `items` fetches the neighbouring page via
  // onNavigateGlobal, so prev/next only stop at the true first/last incident.
  const globalIndex = pageOffset + index;
  const total       = totalCount || items.length;
  const hasPrev = globalIndex > 0;
  const hasNext = globalIndex < total - 1;
  const wheelLockRef = useRef(false);

  // Overlay panel state (ported from client's VideoModal): the panel collapses
  // behind the blue tab, and resolve/report act on the currently-shown incident.
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [reportOpen, setReportOpen]   = useState(false);
  const [resolved, setResolved]       = useState(false);
  const [resolving, setResolving]     = useState(false);
  // Which arrow triggered the in-flight page fetch, so only that one spins.
  const [navDir, setNavDir] = useState(null);
  useEffect(() => { if (!navLoading) setNavDir(null); }, [navLoading]);

  // The new page's image needs its own spinner: navLoading covers the fetch,
  // this covers the image bytes arriving afterwards.
  const [imgLoading, setImgLoading] = useState(false);

  // Re-seed from the incident whenever navigation lands on a different one,
  // otherwise the previous incident's resolved state leaks onto the next.
  useEffect(() => { setResolved(!!item?.resolved); }, [item?._id, item?.id, item?.resolved]);

  // A new incident means a new <img> (keyed by id) that has to load — show the
  // overlay until onLoad/onError fires. Must be set unconditionally: an
  // incident with no Image mounts no <img>, so onLoad/onError can never fire
  // and a leftover `true` would spin forever over a blank frame.
  useEffect(() => { setImgLoading(!!item?.Image); }, [item?._id, item?.id]);

  // Abandoned cross-page jump: `item` is unchanged, so the effect above won't
  // re-run and the already-loaded <img> won't fire onLoad again. Without this
  // the optimistic imgLoading from goPrev/goNext would dim the frame forever.
  // Seeded with the mount-time value so this only fires on a genuine INCREMENT:
  // navFailedAt is never reset by the parent, so a bare truthiness check would
  // clear imgLoading on every later mount and kill the first-load indicator.
  const seenNavFailRef = useRef(navFailedAt);
  useEffect(() => {
    if (navFailedAt === seenNavFailRef.current) return;
    seenNavFailRef.current = navFailedAt;
    setImgLoading(false);
  }, [navFailedAt]);

  // Within the loaded page it's a local index change; at the edges it hands off
  // to the page-crossing fetch, which is async and drives the spinners.
  // setImgLoading here (not only in the post-commit effect) closes the gap
  // where navLoading has cleared but the new item's effect hasn't run yet —
  // that window rendered an undecoded image with no overlay at all.
  const goPrev = useCallback(() => {
    if (!hasPrev || navLoading) return;
    setImgLoading(true);
    if (index > 0) onIndexChange(index - 1);
    else { setNavDir('prev'); onNavigateGlobal?.(globalIndex - 1); }
  }, [hasPrev, navLoading, index, onIndexChange, onNavigateGlobal, globalIndex]);

  const goNext = useCallback(() => {
    if (!hasNext || navLoading) return;
    setImgLoading(true);
    if (index < items.length - 1) onIndexChange(index + 1);
    else { setNavDir('next'); onNavigateGlobal?.(globalIndex + 1); }
  }, [hasNext, navLoading, index, items.length, onIndexChange, onNavigateGlobal, globalIndex]);

  async function handleMarkResolved() {
    if (resolving || !item) return;
    setResolving(true);
    try {
      const next = !resolved;
      await apiMarkResolved(item._id || item.id, item.incidentType, next);
      setResolved(next);
      onRefresh?.();
    } catch {
      // leave the checkbox unchanged so the user sees it didn't take
    } finally {
      setResolving(false);
    }
  }

  useEffect(() => {
    function onKeyDown(e) {
      // The report modal owns the keyboard while it's open — arrow keys must not
      // navigate incidents behind it, and Escape should dismiss it first.
      if (reportOpen) { if (e.key === 'Escape') setReportOpen(false); return; }
      if (e.key === 'ArrowLeft')  goPrev();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [goPrev, goNext, onClose, reportOpen]);

  function onWheel(e) {
    if (reportOpen) return;
    if (wheelLockRef.current) return;
    if (Math.abs(e.deltaY) < 10) return;
    wheelLockRef.current = true;
    if (e.deltaY > 0) goNext(); else goPrev();
    setTimeout(() => { wheelLockRef.current = false; }, 250);
  }

  if (!item) return null;
  // True only when a mounted arrow is rendering its own spinner.
  const arrowSpinning = navLoading && ((navDir === 'prev' && hasPrev) || (navDir === 'next' && hasNext));
  const imgSrc = item.Image ? mediaUrl(item.Image) : null;
  const det    = detectionLabel(item.incidentType || item.displayName);
  const cam    = item.channelData?.name || '';
  const site   = item.nvrData?.nvrName  || item.location  || '';

  return (
    <div
      onClick={onClose}
      onWheel={onWheel}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000' }}
    >
      {/* Fills the viewport like client's VideoModal (fixed inset-0 bg-black)
          rather than a centred 86vw box, so the frame is truly fullscreen. */}
      <div onClick={e => e.stopPropagation()} className="vq-inc-lightbox" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        {hasPrev && (
          <button
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            className="vq-inc-navbtn"
            style={navBtnStyle('left')}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(15,23,42,.8)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(15,23,42,.55)'}
            onMouseDown={e => e.currentTarget.style.transform = 'translateY(-50%) scale(0.92)'}
            onMouseUp={e => e.currentTarget.style.transform = 'translateY(-50%) scale(1)'}
            title="Previous incident"
            disabled={navLoading}
          >
            {/* Only the arrow that was clicked spins; the centre overlay is the
                other spinner, and navDir keeps them from doubling up. */}
            {navLoading && navDir === 'prev' ? <Spinner size={18} /> : <ChevronLeft size={22} />}
          </button>
        )}

        {imgSrc && (
          <img
            key={item._id || item.id}
            src={imgSrc}
            alt={det}
            onLoad={() => setImgLoading(false)}
            onError={() => setImgLoading(false)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          />
        )}

        {/* Exactly one spinner is visible at a time. While a page fetch is in
            flight the clicked arrow spins, so the centre overlay dims the frame
            WITHOUT its own spinner; once the fetch lands, the arrow reverts and
            the centre spinner takes over for the image decode. */}
        {(navLoading || (imgLoading && !!imgSrc)) && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 20,
            background: 'rgba(0,0,0,.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            {/* Suppress the centre spinner only when an arrow is ACTUALLY
                showing one. Crossing a page boundary flips hasPrev/hasNext the
                moment pageOffset updates, unmounting the very arrow that
                started the jump — gating on navLoading alone then left the
                frame dimmed with no indicator anywhere. */}
            {!arrowSpinning && <Spinner size={40} />}
          </div>
        )}

        {/* ── Security-feed overlay panel (ported from client's VideoModal) ──
            Collapsible blue tab + angled slate panel carrying the incident
            title, resolve checkbox and report action. */}
        <div
          className="vq-inc-panel"
          style={{
            // Overlaid on the image (as in client's VideoModal), not stacked
            // below it. zIndex sits ABOVE the loading overlay (20) so collapse/
            // expand keeps working while a fetch is in flight — the panel is
            // independent of navigation state.
            position: 'absolute', bottom: 32, left: 32, zIndex: 30,
            display: 'flex', alignItems: 'stretch', maxWidth: 'calc(100% - 64px)',
          }}
        >
          {/* Blue collapse tab — own stacking context above the panel body so a
              mis-sized/animating panel can never cover the re-expand click. */}
          <div style={{ display: 'flex', alignItems: 'center', marginRight: 4, position: 'relative', zIndex: 2, flexShrink: 0 }}>
            <button
              onClick={(e) => { e.stopPropagation(); setIsCollapsed(c => !c); }}
              title={isCollapsed ? 'Show details' : 'Hide details'}
              style={{
                width: 16, height: 120, borderRadius: 3, flexShrink: 0,
                background: '#38bdf8', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background .15s', zIndex: 10,
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#7dd3fc'}
              onMouseLeave={e => e.currentTarget.style.background = '#38bdf8'}
            >
              {isCollapsed
                ? <ChevronRight size={12} color="#0f172a" />
                : <ChevronLeft  size={12} color="#0f172a" />}
            </button>
          </div>

          {/* Panel body — unmounted when collapsed. Earlier attempts kept it
              mounted at width:0, but a zero-width box whose content still laid
              out at natural size kept covering the tab and eating the click
              that re-expands it. Unmounting removes that failure mode entirely
              and makes collapse depend on nothing but isCollapsed. */}
          {!isCollapsed && (
          <div
            className="vq-inc-panel-body"
            style={{
              position: 'relative', zIndex: 1, overflow: 'hidden',
              background: 'rgba(2,6,23,.5)',
              border: '1px solid rgba(255,255,255,.2)',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,.6)',
              backdropFilter: 'blur(6px)',
              clipPath: 'polygon(0 0, 95% 0, 100% 20%, 100% 100%, 5% 100%, 0 80%)',
            }}
          >
            <div className="vq-inc-panel-inner" style={{ display: 'flex', alignItems: 'flex-start', gap: 40, padding: '28px 40px', flexWrap: 'wrap', width: 'max-content', maxWidth: '100%' }}>
              {/* Title block */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.3em', color: '#38bdf8', textTransform: 'uppercase' }}>
                  Security Feed
                </span>
                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: '#fff', letterSpacing: '-.02em', textTransform: 'uppercase', lineHeight: 1.15, wordBreak: 'break-word' }}>
                  {item.incidentName || det}
                </h1>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,.6)', wordBreak: 'break-word' }}>
                  {item.description || [cam, site].filter(Boolean).join(' · ')}
                </p>
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,.45)', marginTop: 2 }}>
                  {shortDateTime(item.timeOfIncident)} · {index + 1} / {items.length}
                </span>
              </div>

              {/* Mark as resolved */}
              <div
                onClick={(e) => { e.stopPropagation(); handleMarkResolved(); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '8px 20px', cursor: resolving ? 'wait' : 'pointer',
                  border: `1px solid ${resolved ? 'rgba(16,185,129,.5)' : 'rgba(255,255,255,.3)'}`,
                  background: resolved ? 'rgba(16,185,129,.2)' : 'rgba(255,255,255,.05)',
                  color: resolved ? '#34d399' : '#fff',
                  transition: 'all .15s', whiteSpace: 'nowrap',
                }}
              >
                <span style={{
                  width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                  border: `1.5px solid ${resolved ? '#10b981' : 'rgba(255,255,255,.5)'}`,
                  background: resolved ? '#10b981' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {resolved && (
                    <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                      <path d="M1 3.5L3.5 6L8 1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em' }}>
                  {resolving ? 'Saving…' : resolved ? 'Resolved' : 'Mark As Resolved'}
                </span>
              </div>

              {/* Report incident */}
              <button
                onClick={(e) => { e.stopPropagation(); setReportOpen(true); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 20px', cursor: 'pointer',
                  border: '1px solid rgba(59,130,246,.5)',
                  background: 'rgba(59,130,246,.2)',
                  color: '#60a5fa', transition: 'background .15s', whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,.3)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(59,130,246,.2)'}
              >
                <Flag size={14} />
                <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em' }}>
                  {item.report?.status ? 'Reported' : 'Report Incident'}
                </span>
              </button>
            </div>

            {/* Decorative corner accent */}
            <div style={{ position: 'absolute', top: 0, right: 0, width: 48, height: 48, background: 'rgba(255,255,255,.05)', transform: 'rotate(-45deg) translate(24px,-24px)', pointerEvents: 'none' }} />
          </div>
          )}
        </div>

        <button
          onClick={onClose}
          style={{ position: 'absolute', top: 16, right: 16, zIndex: 30, width: 36, height: 36, borderRadius: '50%', background: 'rgba(63,63,63,.5)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', backdropFilter: 'blur(6px)' }}
        >
          <X size={15} />
        </button>

        {hasNext && (
          <button
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            className="vq-inc-navbtn"
            style={navBtnStyle('right')}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(15,23,42,.8)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(15,23,42,.55)'}
            onMouseDown={e => e.currentTarget.style.transform = 'translateY(-50%) scale(0.92)'}
            onMouseUp={e => e.currentTarget.style.transform = 'translateY(-50%) scale(1)'}
            title="Next incident"
            disabled={navLoading}
          >
            {navLoading && navDir === 'next' ? <Spinner size={18} /> : <ChevronRight size={22} />}
          </button>
        )}
      </div>

      {/* Rendered inside the lightbox but outside the stopPropagation wrapper's
          flow — its own overlay swallows clicks, so the lightbox stays open. */}
      {reportOpen && (
        <div onClick={e => e.stopPropagation()}>
          <ReportModal
            item={item}
            onClose={() => setReportOpen(false)}
            onSuccess={onRefresh}
          />
        </div>
      )}
    </div>
  );
}

function GoToPage({ pages, page, onGo }) {
  const [value, setValue] = useState('');

  const commit = () => {
    const n = parseInt(value, 10);
    if (Number.isFinite(n) && n >= 1 && n <= pages) onGo(n - 1);
    setValue('');
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8, fontSize: 12.5, color: 'var(--tx3)' }}>
      <span>Go to</span>
      <input
        type="number"
        min={1}
        max={pages}
        value={value}
        placeholder={String(page + 1)}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
        onBlur={commit}
        style={{
          width: 48, height: 34, borderRadius: 8, border: '1px solid var(--bd)',
          background: 'var(--bg1solid)', color: 'var(--tx)', fontSize: 12.5,
          textAlign: 'center', outline: 'none',
        }}
      />
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────────────────────── */
export default function IncidentCenter() {
  const ctx    = useOutletContext() || {};
  const ctxLoc = ctx.location || '';
  const location = useLocation();
  // A KPI card elsewhere (e.g. Command Center's "Resolved"/"Events Today"/
  // "High" tiles) can deep-link here with an initial status/date/severity
  // filter via navigate(..., { state }).
  const initialStatusFilter = location.state?.statusFilter;
  const initialDate = location.state?.date;
  const initialSeverityFilter = location.state?.severityFilter;

  const pageRef = useRef(null);
  const [isPageFS, setIsPageFS] = useState(false);
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

  const [page,       setPage]       = useState(0);
  const [pageSize,   setPageSize]   = useState(10);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [navLoading, setNavLoading] = useState(false);
  // Bumped when a cross-page jump is abandoned. The lightbox watches this to
  // undo the imgLoading it set optimistically when navigation began — on an
  // abandoned jump `item` never changes, so no new <img> mounts and neither
  // onLoad nor onError would ever fire to clear it.
  const [navFailedAt, setNavFailedAt] = useState(0);
  const [detTypes,   setDetTypes]   = useState(() => new Set());
  const [sevSet,     setSevSet]     = useState(() => new Set(initialSeverityFilter ? [initialSeverityFilter] : []));
  const [statusSet,  setStatusSet]  = useState(() => new Set(initialStatusFilter ? [initialStatusFilter] : []));
  const [dateFrom,   setDateFrom]   = useState(() => initialDate || '');
  const [dateTo,     setDateTo]     = useState(() => initialDate || '');
  const [nvrIds,     setNvrIds]     = useState([]);
  const [channelIds, setChannelIds] = useState([]);
  const [deptIds,    setDeptIds]    = useState([]);
  const [locIds,     setLocIds]     = useState([]);

  const serverFilter = useMemo(() => {
    const f = {};
    if (ctxLoc)            f.location           = ctxLoc;
    if (detTypes.size)     f.incidentTypeFilter = [...detTypes];
    if (dateFrom && dateTo) { f.startDate = dateFrom; f.endDate = dateTo; }
    if (nvrIds.length)     f.nvrId              = nvrIds;
    if (channelIds.length) f.channelId          = channelIds;
    if (deptIds.length)    f.department         = deptIds;
    if (locIds.length)     f.location           = locIds;
    if (sevSet.size)       f.severity           = [...sevSet];
    if (statusSet.size)    f.statusFilter       = [...statusSet];
    return f;
  }, [ctxLoc, detTypes, dateFrom, dateTo, nvrIds, channelIds, deptIds, locIds, sevSet, statusSet]);

  const stats = useApi(() => fetchIncidentStats(serverFilter), [JSON.stringify(serverFilter)], { pollMs: 60000 });
  const types = useApi(() => fetchDetectionTypes(), []);
  const grid  = useApi(
    () => fetchIncidents({ skip: page * pageSize, limit: pageSize }, serverFilter),
    [page, pageSize, JSON.stringify(serverFilter)]
  );

  const items = useMemo(() => grid.data?.items || [], [grid.data]);

  const totalCount = grid.data?.totalCount ?? 0;
  const pages      = Math.max(1, Math.ceil(totalCount / pageSize));

  // Running total of everything shown up to and including this page — 10, 20,
  // 30 … — instead of a flat per-page count that reads the same on every page.
  const shownCount = num(page * pageSize + items.length);

  // Lightbox navigation past the edge of the loaded page: jump `page` to
  // whichever page holds the requested global index and land the lightbox on
  // that incident's offset within it. The grid fetch is driven by `page`, so
  // switching pages re-runs it; navLoading clears once the new items arrive.
  // `page` alone can't tell us whether `items` belongs to the page we asked
  // for: on a fetch error useApi keeps the previous `data`, so `items` would
  // still be the OLD page's array while `page` already points at the new one —
  // landing the lightbox on the wrong incident. Track which page the loaded
  // items actually came from and only settle when the two agree.
  const pendingNavRef = useRef(null);
  const loadedPageRef = useRef(page);
  useEffect(() => { if (!grid.loading && !grid.error) loadedPageRef.current = page; }, [grid.data]);

  const handleNavigateGlobal = useCallback((globalIdx) => {
    if (globalIdx < 0 || globalIdx >= totalCount) return;
    const targetPage   = Math.floor(globalIdx / pageSize);
    const targetOffset = globalIdx % pageSize;
    if (targetPage === page) { setLightboxIndex(targetOffset); return; }
    setNavLoading(true);
    pendingNavRef.current = { page: targetPage, offset: targetOffset };
    setPage(targetPage);
  }, [totalCount, pageSize, page]);

  useEffect(() => {
    const pending = pendingNavRef.current;
    if (!pending || grid.loading) return;

    // The request failed — `items` still holds the previously-loaded page, so
    // roll `page` back to match. Leaving it on the target page desyncs
    // pageOffset/globalIndex from what's actually displayed: the next arrow
    // press would skip a whole page, and `shownCount` would overstate.
    if (grid.error) {
      pendingNavRef.current = null;
      setNavLoading(false);
      setNavFailedAt(n => n + 1);
      setPage(loadedPageRef.current);
      return;
    }

    // Items for a different page (a superseded or unrelated fetch settled) —
    // keep waiting for the one we actually asked for.
    if (loadedPageRef.current !== pending.page) return;

    pendingNavRef.current = null;
    setNavLoading(false);
    if (items.length) setLightboxIndex(Math.min(pending.offset, items.length - 1));
  }, [grid.loading, grid.error, items]);

  const toggleSet = (setter) => (key) =>
    setter((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const hasFilters = !!(detTypes.size || sevSet.size || statusSet.size || dateFrom || dateTo || nvrIds.length || channelIds.length || deptIds.length || locIds.length);

  const clearAll = useCallback(() => {
    setDetTypes(new Set());
    setSevSet(new Set()); setStatusSet(new Set());
    setDateFrom(''); setDateTo('');
    setNvrIds([]); setChannelIds([]); setDeptIds([]); setLocIds([]);
    setPage(0);
  }, []);

  const s    = stats.data || {};
  const kpis = [
    { label: 'Total Incidents · 24h', value: num((s.totalAlerts ?? 0) + (s.incidentsResolved ?? 0)), color: 'var(--tx)' },
    { label: 'High',                  value: num(s.criticalAlerts   ?? 0), color: 'var(--crit)' },
    { label: 'Unresolved (New)',      value: num(s.totalAlerts      ?? 0), color: 'var(--warn)' },
    { label: 'Resolved',             value: num(s.incidentsResolved ?? 0), color: 'var(--ok)'   },
  ];

  const typeOptions = useMemo(() => {
    const raw = Array.isArray(types.data) ? types.data : [];
    return raw.map((t) => {
      const v = t.incidentType || t.type || t.value || t;
      return { value: v, label: detectionLabel(v) };
    });
  }, [types.data]);

  return (
    <div ref={pageRef} className="vq-inc-page" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 20, background: 'var(--bg0)', minHeight: '100%', overflow: isPageFS ? 'auto' : undefined }}>
      <style>{`
        @media (max-width: 1024px) {
          .vq-inc-kpis { grid-template-columns: repeat(2,1fr) !important; }
          .vq-inc-cards { grid-template-columns: repeat(2,1fr) !important; }
        }
        @media (max-width: 640px) {
          .vq-inc-page { padding: 14px 12px !important; }
          .vq-inc-kpis { grid-template-columns: 1fr !important; }
          .vq-inc-cards { grid-template-columns: 1fr !important; }
          .vq-inc-datepicker, .vq-inc-multiselect, .vq-inc-filterspopover {
            width: calc(100vw - 24px) !important; max-width: calc(100vw - 24px) !important;
          }
        }
        @media (max-width: 480px) {
          .vq-inc-navbtn { width: 36px !important; height: 36px !important; }
        }
        @media (max-width: 900px) {
          /* The angled clip-path and wide gutters eat the whole viewport on
             small screens — stack the panel's blocks and tighten the padding. */
          .vq-inc-panel-inner { gap: 16px !important; padding: 18px 22px !important; }
          .vq-inc-panel-inner h1 { font-size: 18px !important; }
        }
        @media (max-width: 640px) {
          .vq-inc-panel { bottom: 12px !important; left: 12px !important; max-width: calc(100% - 24px) !important; }
          .vq-inc-panel-body { clip-path: none !important; }
          .vq-inc-panel-inner { flex-direction: column !important; padding: 14px 16px !important; width: auto !important; }
        }
      `}</style>

      {/* ── KPI row ─────────────────────────────────────────────────────────── */}
      <div className="vq-inc-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
        {kpis.map((k) => (
          <div key={k.label} style={{
            background: 'var(--bg1solid)', border: '1px solid var(--bd)', borderRadius: 12,
            padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 6,
            boxShadow: '0 1px 3px rgba(0,0,0,.07)', minWidth: 0,
          }}>
            <div style={{ fontSize: 12, color: 'var(--tx2)', fontWeight: 500 }}>{k.label}</div>
            <div style={{ fontSize: 36, fontWeight: 700, color: k.color, lineHeight: 1 }}>
              {stats.loading ? '—' : k.value}
            </div>
            <div style={{ height: 3, background: 'var(--bg3)', borderRadius: 2, marginTop: 4 }}>
              <div style={{ width: '60%', height: '100%', background: k.color, borderRadius: 2, opacity: .7 }} />
            </div>
          </div>
        ))}
      </div>

      {/* ── Filter bar ──────────────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--bg1solid)', border: '1px solid var(--bd)', borderRadius: 12,
        padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,.07)',
      }}>
        {/* Row 1 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Detection multi-select */}
          <MultiSelect
            options={typeOptions}
            selected={detTypes}
            onChange={(next) => { setDetTypes(next); setPage(0); }}
            placeholder="Select Incident"
          />

          {/* Date range */}
          <DateRangePicker
            from={dateFrom}
            to={dateTo}
            onFrom={(v) => { setDateFrom(v); setPage(0); }}
            onTo={(v) => { setDateTo(v); setPage(0); }}
            onClear={() => { setDateFrom(''); setDateTo(''); setPage(0); }}
          />

          {/* Additional filters popover */}
          <FiltersPopover
            nvrIds={nvrIds}         setNvrIds={v => { setNvrIds(v); setPage(0); }}
            channelIds={channelIds} setChannelIds={v => { setChannelIds(v); setPage(0); }}
            deptIds={deptIds}       setDeptIds={v => { setDeptIds(v); setPage(0); }}
            locIds={locIds}         setLocIds={v => { setLocIds(v); setPage(0); }}
          />

          {hasFilters && (
            <button onClick={clearAll} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#fff', background: 'var(--crit)', border: '1px solid var(--crit)', borderRadius: 7, cursor: 'pointer', padding: '5px 10px' }}>
              <X size={13} /> Clear
            </button>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <RefreshControl
              storageKey="incident_center"
              onManualRefresh={() => { stats.refetch(); grid.refetch(); }}
            />
            <button
              onClick={togglePageFullscreen}
              title={isPageFS ? 'Exit fullscreen' : 'Fullscreen'}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--bd)', cursor: 'pointer', color: 'var(--tx2)' }}
            >
              {isPageFS ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
        </div>

        {/* Row 2: severity + status chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              onClick={() => { setSevSet(new Set()); setStatusSet(new Set()); setPage(0); }}
              style={{ ...chip(!sevSet.size && !statusSet.size), padding: '5px 16px' }}
            >
              All
            </button>
            {SEVERITIES.map((x) => (
              <button key={x.key}
                onClick={() => { toggleSet(setSevSet)(x.key); setPage(0); }}
                style={chip(sevSet.has(x.key), x.key === 'high' ? 'var(--crit)' : x.key === 'moderate' ? 'var(--warn)' : '#6b7796')}
              >
                {x.label}
              </button>
            ))}
          </div>

          <div style={{ width: 1, height: 20, background: 'var(--bd2)' }} />

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button onClick={() => { setStatusSet(new Set()); setPage(0); }} style={chip(!statusSet.size)}>All</button>
            {STATUSES.map((x) => (
              <button key={x.key}
                onClick={() => { toggleSet(setStatusSet)(x.key); setPage(0); }}
                style={chip(statusSet.has(x.key), x.key === 'new' ? 'var(--crit)' : x.key === 'acknowledged' ? 'var(--warn)' : 'var(--ok)')}
              >
                {x.label}
              </button>
            ))}
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--tx3)' }}>
              {grid.loading ? 'Loading…' : `Showing ${shownCount} of ${num(totalCount)}`}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--tx3)' }}>
              <span>Show</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
                style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid var(--bd)', background: 'var(--bg1solid)', color: 'var(--tx2)', fontSize: 12.5, cursor: 'pointer' }}
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ── Grid ────────────────────────────────────────────────────────────── */}
      <div>
        <div style={{ marginBottom: 14, display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx)' }}>
            {detTypes.size === 1 ? detectionLabel([...detTypes][0]) : detTypes.size > 1 ? `${detTypes.size} detection types` : 'All detections'}
          </span>
          <span style={{ fontSize: 12, color: 'var(--tx3)' }}>
            showing {shownCount} of {num(totalCount)}
          </span>
          {/* The grid keeps rendering the last good page on a failed refresh,
              so surface the failure here rather than letting it pass silently. */}
          {grid.error && items.length > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', fontSize: 11.5, color: 'var(--crit)' }}>
              Couldn’t refresh — showing last loaded results
              <button
                onClick={() => grid.refetch()}
                style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
              >
                Retry
              </button>
            </span>
          )}
        </div>

        {/* Keep showing the last good page when a refetch fails: useApi retains
            the previous `data` on error, so replacing a readable grid with a
            full error screen would throw away results the user still has. Only
            surface the error state when there is genuinely nothing to show. */}
        <AsyncBoundary loading={grid.loading && !items.length} error={items.length ? null : grid.error} onRetry={() => grid.refetch()} minH={720}>
          {items.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '56px 24px', gap: 12 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75"/>
                </svg>
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--tx)' }}>
                {dateFrom && dateTo
                  ? `No incidents found for ${dateFrom === dateTo ? fmt(dateFrom) : `${fmt(dateFrom)} – ${fmt(dateTo)}`}`
                  : hasFilters
                    ? 'No incidents match your filters'
                    : 'No incidents yet'}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--tx3)', textAlign: 'center', maxWidth: 320, lineHeight: 1.6 }}>
                {dateFrom && dateTo
                  ? 'There are no recorded incidents for the selected date range. Try a different date or clear the filter to see all incidents.'
                  : hasFilters
                    ? 'Try adjusting or clearing your filters to see more results.'
                    : 'Incidents will appear here once detections are recorded.'}
              </div>
              {(dateFrom || hasFilters) && (
                <button
                  onClick={clearAll}
                  style={{ marginTop: 4, fontSize: 12.5, fontWeight: 600, color: 'var(--blue)', background: 'rgba(59,130,246,.08)', border: '1px solid rgba(59,130,246,.25)', borderRadius: 8, padding: '7px 18px', cursor: 'pointer' }}
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <div className="vq-inc-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
              {items.map((item, i) => (
                <IncidentCard
                  key={item._id || item.id}
                  item={item}
                  onRefresh={() => grid.refetch()}
                  onOpenLightbox={() => setLightboxIndex(i)}
                />
              ))}
            </div>
          )}
        </AsyncBoundary>
      </div>

      {/* ── Pagination ──────────────────────────────────────────────────────── */}
      {items.length > 0 && pages > 1 && (
        <div className="vq-inc-pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, paddingBottom: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => setPage(0)}
            disabled={page === 0}
            title="First page"
            style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid var(--bd)', background: page === 0 ? 'var(--bg2)' : 'var(--bg1solid)', color: page === 0 ? 'var(--tx3)' : 'var(--tx2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: page === 0 ? 'default' : 'pointer' }}
          >
            <ChevronsLeft size={15} />
          </button>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{ padding: '6px 16px', borderRadius: 8, border: '1px solid var(--bd)', background: page === 0 ? 'var(--bg2)' : 'var(--bg1solid)', color: page === 0 ? 'var(--tx3)' : 'var(--tx2)', fontSize: 12.5, cursor: page === 0 ? 'default' : 'pointer' }}
          >
            Previous
          </button>
          {Array.from({ length: Math.min(7, pages) }, (_, i) => {
            const p = pages <= 7 ? i : Math.max(0, Math.min(page - 3, pages - 7)) + i;
            return (
              <button key={p} onClick={() => setPage(p)} style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid var(--bd)', background: p === page ? 'var(--blue)' : 'var(--bg1solid)', color: p === page ? '#fff' : 'var(--tx2)', fontSize: 12.5, cursor: 'pointer', fontWeight: p === page ? 600 : 400 }}>
                {p + 1}
              </button>
            );
          })}
          <button
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            disabled={page >= pages - 1}
            style={{ padding: '6px 16px', borderRadius: 8, border: '1px solid var(--bd)', background: page >= pages - 1 ? 'var(--bg2)' : 'var(--bg1solid)', color: page >= pages - 1 ? 'var(--tx3)' : 'var(--tx2)', fontSize: 12.5, cursor: page >= pages - 1 ? 'default' : 'pointer' }}
          >
            Next
          </button>
          <button
            onClick={() => setPage(pages - 1)}
            disabled={page >= pages - 1}
            title="Last page"
            style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid var(--bd)', background: page >= pages - 1 ? 'var(--bg2)' : 'var(--bg1solid)', color: page >= pages - 1 ? 'var(--tx3)' : 'var(--tx2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: page >= pages - 1 ? 'default' : 'pointer' }}
          >
            <ChevronsRight size={15} />
          </button>
          <GoToPage pages={pages} page={page} onGo={setPage} />
          <span style={{ fontSize: 12, color: 'var(--tx3)', marginLeft: 4, whiteSpace: 'nowrap' }}>
            of {pages}
          </span>
        </div>
      )}

      {lightboxIndex != null && (
        <IncidentLightbox
          items={items}
          index={Math.min(lightboxIndex, items.length - 1)}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onRefresh={() => grid.refetch()}
          pageOffset={page * pageSize}
          totalCount={totalCount}
          onNavigateGlobal={handleNavigateGlobal}
          navLoading={navLoading}
          navFailedAt={navFailedAt}
        />
      )}
    </div>
  );
}
