import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Search, Calendar, X, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, SlidersHorizontal, Maximize2, Minimize2 } from 'lucide-react';
import { AsyncBoundary } from '../../../components/States';
import SharedMultiSelect from '../../../components/MultiSelect';
import IncidentCard from './IncidentCard';
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

/* ── Calendar date-range picker ───────────────────────────────────────────── */
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS  = ['S','M','T','W','T','F','S'];

function fmt(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${MONTH_NAMES[+m - 1].slice(0, 3)} ${+d}`;
}

function toStr(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function DateRangePicker({ from, to, onFrom, onTo, onClear }) {
  const today    = new Date();
  const todayStr = toStr(today.getFullYear(), today.getMonth(), today.getDate());

  const [open,        setOpen]        = useState(false);
  const [hover,       setHover]       = useState(null);
  const [viewY,       setViewY]       = useState(today.getFullYear());
  const [viewM,       setViewM]       = useState(today.getMonth());
  const [pendingFrom, setPendingFrom] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false); setPendingFrom(null); setHover(null);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const hasRange   = from && to;
  const triggerLabel = hasRange
    ? (from === to ? fmt(from) : `${fmt(from)} - ${fmt(to)}`)
    : 'Select Date';

  const firstDay      = new Date(viewY, viewM, 1).getDay();
  const daysInMonth   = new Date(viewY, viewM + 1, 0).getDate();
  const prevMonthDays = new Date(viewY, viewM, 0).getDate();
  const cells = [];
  for (let i = firstDay - 1; i >= 0; i--) cells.push({ day: prevMonthDays - i, cur: false });
  for (let d = 1; d <= daysInMonth; d++)   cells.push({ day: d, cur: true });
  const trailing = 42 - cells.length;
  for (let d = 1; d <= trailing; d++)      cells.push({ day: d, cur: false });

  function cellDate(cell) {
    return cell.cur ? toStr(viewY, viewM, cell.day) : null;
  }

  function isFuture(ds) { return ds > todayStr; }

  function commit(start, end) {
    const lo = start <= end ? start : end;
    const hi = start <= end ? end   : start;
    onFrom(lo); onTo(hi);
    setPendingFrom(null); setHover(null);
    setOpen(false);
  }

  function handleDayClick(ds) {
    if (!ds || isFuture(ds)) return;
    if (!pendingFrom) {
      setPendingFrom(ds);
    } else {
      commit(pendingFrom, ds);
    }
  }

  const effectiveFrom = pendingFrom || from;
  const effectiveEnd  = pendingFrom
    ? (hover && !isFuture(hover) ? hover : null)
    : to;

  function inRange(ds) {
    if (!ds || !effectiveFrom || !effectiveEnd) return false;
    const lo = effectiveFrom < effectiveEnd ? effectiveFrom : effectiveEnd;
    const hi = effectiveFrom < effectiveEnd ? effectiveEnd  : effectiveFrom;
    return ds > lo && ds < hi;
  }

  function isStart(ds) { return !!ds && ds === effectiveFrom; }
  function isEnd(ds)   { return !!ds && !!effectiveEnd && ds === effectiveEnd && effectiveEnd !== effectiveFrom; }
  function isToday(ds) { return ds === todayStr; }

  const isCurrentMonth = viewY === today.getFullYear() && viewM === today.getMonth();

  function prevMonth() {
    if (viewM === 0) { setViewM(11); setViewY(y => y - 1); }
    else setViewM(m => m - 1);
  }
  function nextMonth() {
    if (isCurrentMonth) return;
    if (viewM === 11) { setViewM(0); setViewY(y => y + 1); }
    else setViewM(m => m + 1);
  }

  const hintText = pendingFrom
    ? 'Now pick an end date'
    : 'Double-tap to pick one date\nor select a range.';

  return (
    <div ref={ref} style={{ position: 'relative', userSelect: 'none' }}>
      <div
        onClick={() => { setOpen(o => !o); if (!open) { setPendingFrom(null); setHover(null); } }}
        style={{
          ...filterInput,
          display: 'flex', alignItems: 'center', gap: 7,
          paddingRight: 10, minWidth: 155,
          border: open || hasRange ? '1px solid var(--blue)' : '1px solid var(--bd2)',
          background: hasRange ? 'rgba(59,130,246,.08)' : 'var(--bg1solid)',
          boxShadow: open ? '0 0 0 3px rgba(59,130,246,.15)' : 'none',
        }}
      >
        <Calendar size={14} style={{ color: hasRange ? 'var(--blue)' : 'var(--tx3)', flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, color: hasRange ? 'var(--blue)' : 'var(--tx3)', flex: 1, whiteSpace: 'nowrap' }}>
          {pendingFrom ? `${fmt(pendingFrom)} → …` : triggerLabel}
        </span>
        {hasRange
          ? <X size={13} style={{ color: 'var(--tx3)', flexShrink: 0 }}
              onClick={(e) => { e.stopPropagation(); onClear(); setPendingFrom(null); setHover(null); setOpen(false); }} />
          : <ChevronDown size={13} style={{ color: 'var(--tx3)', flexShrink: 0 }} />
        }
      </div>

      {open && (
        <div className="vq-inc-datepicker" style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 300,
          background: 'var(--bg1solid)', border: '1px solid var(--bd)', borderRadius: 12,
          boxShadow: '0 10px 32px rgba(0,0,0,.22)', padding: '16px 18px 14px',
          width: 280, maxWidth: 'min(280px, calc(100vw - 24px))',
        }}>
          {/* Month nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <button onClick={prevMonth} style={{ width: 28, height: 28, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx2)' }}>
              <ChevronDown size={15} style={{ transform: 'rotate(90deg)' }} />
            </button>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--tx)' }}>
              {MONTH_NAMES[viewM]} {viewY}
            </span>
            <button
              onClick={nextMonth}
              disabled={isCurrentMonth}
              style={{ width: 28, height: 28, border: 'none', background: 'none', cursor: isCurrentMonth ? 'default' : 'pointer', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: isCurrentMonth ? 'var(--bd2)' : 'var(--tx2)' }}
            >
              <ChevronDown size={15} style={{ transform: 'rotate(-90deg)' }} />
            </button>
          </div>

          {/* Day labels */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 4 }}>
            {DAY_LABELS.map((l, i) => (
              <div key={i} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--tx3)', paddingBottom: 6 }}>{l}</div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
            {cells.map((cell, i) => {
              const ds       = cellDate(cell);
              const future   = ds ? isFuture(ds) : false;
              const start    = isStart(ds);
              const end      = isEnd(ds);
              const range    = inRange(ds);
              const today_   = isToday(ds);
              const active   = start || end;
              const disabled = !cell.cur || future;
              const hasStrip = effectiveFrom && effectiveEnd && effectiveFrom !== effectiveEnd;

              return (
                <div
                  key={i}
                  onClick={() => !disabled && handleDayClick(ds)}
                  onMouseEnter={() => { if (pendingFrom && ds && !future) setHover(ds); }}
                  onMouseLeave={() => setHover(null)}
                  style={{ position: 'relative', height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: disabled ? 'default' : 'pointer' }}
                >
                  {range && <div style={{ position: 'absolute', inset: 0, background: 'rgba(59,130,246,.12)' }} />}
                  {start && hasStrip && <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', right: 0, background: 'rgba(59,130,246,.12)' }} />}
                  {end   && hasStrip && <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: '50%', background: 'rgba(59,130,246,.12)' }} />}

                  <div style={{
                    position: 'relative', zIndex: 1,
                    width: 30, height: 30, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13,
                    fontWeight: active ? 700 : today_ ? 600 : 400,
                    background: active ? 'var(--blue)' : 'transparent',
                    color: active ? '#fff' : disabled ? 'var(--bd2)' : today_ ? 'var(--blue)' : 'var(--tx2)',
                    border: today_ && !active ? '1.5px solid var(--blue)' : 'none',
                    transition: 'background .1s',
                  }}>
                    {cell.day}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Hint + Reset */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 10, borderTop: '1px solid var(--bd)', paddingTop: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--tx3)', lineHeight: 1.4, maxWidth: 170, whiteSpace: 'pre-line' }}>{hintText}</span>
            <button
              onClick={() => { onClear(); setPendingFrom(null); setHover(null); setOpen(false); }}
              style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx2)', background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 7, padding: '5px 14px', cursor: 'pointer' }}
            >
              Reset
            </button>
          </div>
        </div>
      )}
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
function navBtnStyle(side) {
  return {
    position: 'absolute', top: '39vh', [side]: 'clamp(-22px, -2vw, -6px)', transform: 'translateY(-50%)',
    width: 46, height: 46, borderRadius: '50%',
    background: 'rgba(15,23,42,.55)', border: '1px solid rgba(255,255,255,.15)',
    backdropFilter: 'blur(6px)', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', transition: 'background-color .15s, transform .1s', zIndex: 10,
  };
}

function IncidentLightbox({ items, index, onIndexChange, onClose }) {
  const item = items[index];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;
  const wheelLockRef = useRef(false);

  const goPrev = useCallback(() => { if (hasPrev) onIndexChange(index - 1); }, [hasPrev, index, onIndexChange]);
  const goNext = useCallback(() => { if (hasNext) onIndexChange(index + 1); }, [hasNext, index, onIndexChange]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'ArrowLeft')  goPrev();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [goPrev, goNext, onClose]);

  function onWheel(e) {
    if (wheelLockRef.current) return;
    if (Math.abs(e.deltaY) < 10) return;
    wheelLockRef.current = true;
    if (e.deltaY > 0) goNext(); else goPrev();
    setTimeout(() => { wheelLockRef.current = false; }, 250);
  }

  if (!item) return null;
  const imgSrc = item.Image ? mediaUrl(item.Image) : null;
  const det    = detectionLabel(item.incidentType || item.displayName);
  const cam    = item.channelData?.name || '';
  const site   = item.nvrData?.nvrName  || item.location  || '';

  return (
    <div
      onClick={onClose}
      onWheel={onWheel}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(4,6,12,.93)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}
    >
      <div onClick={e => e.stopPropagation()} className="vq-inc-lightbox" style={{ position: 'relative', maxWidth: '86vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
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
          >
            <ChevronLeft size={22} />
          </button>
        )}

        {imgSrc && (
          <img key={item._id || item.id} src={imgSrc} alt={det} style={{ maxWidth: '86vw', maxHeight: '78vh', objectFit: 'contain', borderRadius: 10, display: 'block' }} />
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff', fontSize: 12.5, flexWrap: 'wrap', justifyContent: 'center', textAlign: 'center', maxWidth: '86vw' }}>
          <span style={{ fontWeight: 600 }}>{item.incidentName || det}</span>
          {cam && <span style={{ color: 'rgba(255,255,255,.6)' }}>· {[cam, site].filter(Boolean).join(' · ')}</span>}
          <span style={{ fontFamily: 'monospace', color: 'rgba(255,255,255,.6)' }}>{shortDateTime(item.timeOfIncident)}</span>
          <span style={{ color: 'rgba(255,255,255,.4)' }}>{index + 1} / {items.length}</span>
        </div>

        <button
          onClick={onClose}
          style={{ position: 'absolute', top: 'clamp(-14px, -2vw, -4px)', right: 'clamp(-14px, -2vw, -4px)', width: 32, height: 32, borderRadius: 8, background: 'rgba(6,8,13,.8)', border: '1px solid rgba(255,255,255,.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}
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
          >
            <ChevronRight size={22} />
          </button>
        )}
      </div>
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
  const [detTypes,   setDetTypes]   = useState(() => new Set());
  const [sevSet,     setSevSet]     = useState(() => new Set());
  const [statusSet,  setStatusSet]  = useState(() => new Set());
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');
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
              {grid.loading ? 'Loading…' : `Showing ${items.length} of ${totalCount}`}
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
            showing {items.length} of {totalCount}
          </span>
        </div>

        <AsyncBoundary loading={grid.loading} error={grid.error} onRetry={() => grid.refetch()} minH={720}>
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
        />
      )}
    </div>
  );
}
