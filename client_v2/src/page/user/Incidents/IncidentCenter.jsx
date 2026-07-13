import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Search, Calendar, X, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, SlidersHorizontal } from 'lucide-react';
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
  { key: 'high',     label: 'Critical' },
  { key: 'moderate', label: 'High'     },
  { key: 'medium',   label: 'Medium'   },
  { key: 'low',      label: 'Low'      },
];

const STATUSES = [
  { key: 'new',          label: 'New'      },
  { key: 'acknowledged', label: 'Ack'      },
  { key: 'resolved',     label: 'Resolved' },
];

function statusKey(item) {
  if (item.resolved) return 'resolved';
  if (item.report?.status === true) return 'acknowledged';
  return 'new';
}

// Static chip styling lives in a className; the runtime severity/status color
// (`color`) and active-state background stay inline since they're data-driven.
const CHIP =
  'text-[12px] font-medium py-[5px] px-[14px] rounded-[7px] cursor-pointer transition-all duration-150 select-none';

const chip = (active, color = 'var(--blue)') => ({
  background: active ? color : 'transparent',
  color: active ? '#fff' : 'var(--tx2)',
  border: `1px solid ${active ? color : 'var(--bd2)'}`,
});

// Base classes shared by the filter trigger/inputs. Background and border-color
// are applied per-usage (several toggle conditionally on open/active state).
const FILTER_INPUT =
  'h-[36px] rounded-[8px] border text-[12.5px] text-[var(--tx)] outline-none cursor-pointer';

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
    <div ref={ref} className="relative select-none">
      <div
        onClick={() => setOpen((o) => !o)}
        className={`${FILTER_INPUT} bg-[var(--bg1solid)] flex items-center justify-between min-w-[180px] gap-[8px] pl-[12px] pr-[10px] ${open ? 'border-[var(--blue)] shadow-[0_0_0_3px_rgba(59,130,246,.15)]' : 'border-[var(--bd2)]'}`}
      >
        <span className={`text-[12.5px] overflow-hidden text-ellipsis whitespace-nowrap ${selected.size ? 'text-[var(--tx)]' : 'text-[var(--tx3)]'}`}>
          {label}
        </span>
        {open ? <ChevronUp size={14} className="text-[var(--blue)] shrink-0" />
               : <ChevronDown size={14} className="text-[var(--tx3)] shrink-0" />}
      </div>

      {open && (
        <div className="vq-inc-multiselect absolute top-[calc(100%_+_6px)] left-0 z-[200] w-[240px] max-w-[min(240px,calc(100vw_-_24px))] bg-[var(--bg1solid)] border border-[var(--bd)] rounded-[10px] shadow-[0_8px_24px_rgba(0,0,0,.18)] overflow-hidden">
          <div className="flex justify-between pt-[10px] px-[14px] pb-[6px] border-b border-[var(--bd)]">
            <button onClick={selectAll} className="text-[12px] text-[var(--blue)] font-semibold bg-transparent border-none cursor-pointer p-0">
              Select All
            </button>
            <button onClick={clearAll} className="text-[12px] text-[var(--crit)] font-semibold bg-transparent border-none cursor-pointer p-0">
              Clear All
            </button>
          </div>

          <div className="py-[8px] px-[10px] border-b border-[var(--bd)]">
            <div className="flex items-center gap-[7px] bg-[var(--bg2)] rounded-[7px] py-[6px] px-[10px] border border-[var(--bd)]">
              <Search size={13} className="text-[var(--tx3)] shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="border-0 outline-none bg-transparent text-[12px] text-[var(--tx)] w-full"
              />
            </div>
          </div>

          <div className="max-h-[220px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="py-[12px] px-[14px] text-[12px] text-[var(--tx3)] text-center">No results</div>
            ) : (
              filtered.map((opt) => {
                const checked = selected.has(opt.value);
                return (
                  <div
                    key={opt.value}
                    onClick={() => toggle(opt.value)}
                    className={`flex items-start gap-[10px] py-[9px] px-[14px] cursor-pointer transition-[background] duration-100 ${checked ? 'bg-[rgba(59,130,246,.08)]' : 'bg-transparent'}`}
                    onMouseEnter={e => { if (!checked) e.currentTarget.style.background = 'var(--bg2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = checked ? 'rgba(59,130,246,.08)' : 'transparent'; }}
                  >
                    <div className={`w-[16px] h-[16px] rounded-[4px] shrink-0 mt-[1px] border-[1.5px] flex items-center justify-center ${checked ? 'border-[var(--blue)] bg-[var(--blue)]' : 'border-[var(--bd2)] bg-[var(--bg1solid)]'}`}>
                      {checked && (
                        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                          <path d="M1 3.5L3.5 6L8 1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span className="text-[12.5px] text-[var(--tx2)] leading-[1.4]">{opt.label}</span>
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
    <div className="relative inline-flex items-center">
      <select
        value={value}
        onChange={onChange}
        className={`${FILTER_INPUT} bg-[var(--bg1solid)] border-[var(--bd2)] pl-[12px] pr-[30px] appearance-none min-w-[150px]`}
        style={style}
      >
        {children}
      </select>
      <ChevronDown size={14} className="absolute right-[10px] pointer-events-none text-[var(--tx3)]" />
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
    <div ref={ref} className="relative select-none">
      <div
        onClick={() => { setOpen(o => !o); if (!open) { setPendingFrom(null); setHover(null); } }}
        className={`${FILTER_INPUT} flex items-center gap-[7px] pl-[12px] pr-[10px] min-w-[155px] ${open || hasRange ? 'border-[var(--blue)]' : 'border-[var(--bd2)]'} ${hasRange ? 'bg-[rgba(59,130,246,.08)]' : 'bg-[var(--bg1solid)]'} ${open ? 'shadow-[0_0_0_3px_rgba(59,130,246,.15)]' : ''}`}
      >
        <Calendar size={14} className={`shrink-0 ${hasRange ? 'text-[var(--blue)]' : 'text-[var(--tx3)]'}`} />
        <span className={`text-[12.5px] flex-1 whitespace-nowrap ${hasRange ? 'text-[var(--blue)]' : 'text-[var(--tx3)]'}`}>
          {pendingFrom ? `${fmt(pendingFrom)} → …` : triggerLabel}
        </span>
        {hasRange
          ? <X size={13} className="text-[var(--tx3)] shrink-0"
              onClick={(e) => { e.stopPropagation(); onClear(); setPendingFrom(null); setHover(null); setOpen(false); }} />
          : <ChevronDown size={13} className="text-[var(--tx3)] shrink-0" />
        }
      </div>

      {open && (
        <div className="vq-inc-datepicker absolute top-[calc(100%_+_6px)] left-0 z-[300] bg-[var(--bg1solid)] border border-[var(--bd)] rounded-[12px] shadow-[0_10px_32px_rgba(0,0,0,.22)] pt-[16px] px-[18px] pb-[14px] w-[280px] max-w-[min(280px,calc(100vw_-_24px))]">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-[14px]">
            <button onClick={prevMonth} className="w-[28px] h-[28px] border-none bg-transparent cursor-pointer rounded-[6px] flex items-center justify-center text-[var(--tx2)]">
              <ChevronDown size={15} className="rotate-90" />
            </button>
            <span className="text-[13.5px] font-semibold text-[var(--tx)]">
              {MONTH_NAMES[viewM]} {viewY}
            </span>
            <button
              onClick={nextMonth}
              disabled={isCurrentMonth}
              className={`w-[28px] h-[28px] border-none bg-transparent rounded-[6px] flex items-center justify-center ${isCurrentMonth ? 'cursor-default text-[var(--bd2)]' : 'cursor-pointer text-[var(--tx2)]'}`}
            >
              <ChevronDown size={15} className="-rotate-90" />
            </button>
          </div>

          {/* Day labels */}
          <div className="grid grid-cols-[repeat(7,1fr)] mb-[4px]">
            {DAY_LABELS.map((l, i) => (
              <div key={i} className="text-center text-[11px] font-bold text-[var(--tx3)] pb-[6px]">{l}</div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-[repeat(7,1fr)]">
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
                  className={`relative h-[36px] flex items-center justify-center ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
                >
                  {range && <div className="absolute inset-0 bg-[rgba(59,130,246,.12)]" />}
                  {start && hasStrip && <div className="absolute top-0 bottom-0 left-1/2 right-0 bg-[rgba(59,130,246,.12)]" />}
                  {end   && hasStrip && <div className="absolute top-0 bottom-0 left-0 right-1/2 bg-[rgba(59,130,246,.12)]" />}

                  <div className={`relative z-[1] w-[30px] h-[30px] rounded-full flex items-center justify-center text-[13px] transition-[background] duration-100 ${active ? 'font-bold' : today_ ? 'font-semibold' : 'font-normal'} ${active ? 'bg-[var(--blue)]' : 'bg-transparent'} ${active ? 'text-white' : disabled ? 'text-[var(--bd2)]' : today_ ? 'text-[var(--blue)]' : 'text-[var(--tx2)]'} ${today_ && !active ? 'border-[1.5px] border-[var(--blue)]' : 'border-none'}`}>
                    {cell.day}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Hint + Reset */}
          <div className="flex items-end justify-between mt-[10px] border-t border-[var(--bd)] pt-[10px]">
            <span className="text-[11px] text-[var(--tx3)] leading-[1.4] max-w-[170px] whitespace-pre-line">{hintText}</span>
            <button
              onClick={() => { onClear(); setPendingFrom(null); setHover(null); setOpen(false); }}
              className="text-[12px] font-semibold text-[var(--tx2)] bg-[var(--bg2)] border border-[var(--bd)] rounded-[7px] py-[5px] px-[14px] cursor-pointer"
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
    `${import.meta.env.VITE_BACKEND}/api/v1/departments/get`,
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
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const nvrs  = nvrsApi.data?.nvrs  ?? [];
  const depts = deptsApi.data ?? [];
  const locs  = locsApi.data  ?? [];

  const activeCount = [nvrIds, channelIds, deptIds, locIds].filter(a => a.length > 0).length;
  const resetAll    = () => { setNvrIds([]); setChannelIds([]); setDeptIds([]); setLocIds([]); };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-[6px] h-[36px] px-[14px] border rounded-[8px] cursor-pointer text-[12.5px] font-semibold transition-all duration-150 ${activeCount > 0 ? 'border-[var(--blue)] bg-[rgba(59,130,246,.08)] text-[var(--blue)]' : 'border-[var(--bd2)] bg-[var(--bg1solid)] text-[var(--tx2)]'} ${open ? 'shadow-[0_0_0_3px_rgba(59,130,246,.15)]' : ''}`}
      >
        <SlidersHorizontal size={14} />
        Filters
        {activeCount > 0 && (
          <span className="bg-[var(--blue)] text-white text-[10px] font-bold rounded-full w-[18px] h-[18px] flex items-center justify-center">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="vq-inc-filterspopover absolute top-[calc(100%_+_6px)] right-0 z-[300] w-[280px] max-w-[min(280px,calc(100vw_-_24px))] bg-[var(--bg1solid)] border border-[var(--bd)] rounded-[12px] shadow-[0_10px_32px_rgba(0,0,0,.22)] p-[16px] flex flex-col gap-[12px]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--bd)] pb-[10px]">
            <span className="text-[13.5px] font-bold text-[var(--tx)]">Additional Filters</span>
            {activeCount > 0 && (
              <button
                onClick={resetAll}
                className="text-[11px] text-[var(--crit)] bg-transparent border-none cursor-pointer font-semibold"
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
            options={locs.map(o => ({ id: o._id || o.locationName || o.name || String(o), label: o.locationName || o.name || String(o) }))}
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
  const cam    = item.channelData?.name || item.cameraId || '';
  const site   = item.nvrData?.nvrName  || item.location  || '';

  return (
    <div
      onClick={onClose}
      onWheel={onWheel}
      className="fixed inset-0 z-[9999] bg-[rgba(4,6,12,.93)] flex items-center justify-center backdrop-blur-[8px]"
    >
      <div onClick={e => e.stopPropagation()} className="vq-inc-lightbox relative max-w-[86vw] max-h-[90vh] flex flex-col items-center gap-[12px]">
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
          <img key={item._id || item.id} src={imgSrc} alt={det} className="max-w-[86vw] max-h-[78vh] object-contain rounded-[10px] block" />
        )}

        <div className="flex items-center gap-[10px] text-white text-[12.5px] flex-wrap justify-center text-center max-w-[86vw]">
          <span className="font-semibold">{item.incidentName || det}</span>
          {cam && <span className="text-[rgba(255,255,255,.6)]">· {[cam, site].filter(Boolean).join(' · ')}</span>}
          <span className="font-mono text-[rgba(255,255,255,.6)]">{shortDateTime(item.timeOfIncident)}</span>
          <span className="text-[rgba(255,255,255,.4)]">{index + 1} / {items.length}</span>
        </div>

        <button
          onClick={onClose}
          className="absolute top-[clamp(-14px,-2vw,-4px)] right-[clamp(-14px,-2vw,-4px)] w-[32px] h-[32px] rounded-[8px] bg-[rgba(6,8,13,.8)] border border-[rgba(255,255,255,.2)] cursor-pointer flex items-center justify-center text-white"
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
    <div className="flex items-center gap-[6px] ml-[8px] text-[12.5px] text-[var(--tx3)]">
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
        className="w-[48px] h-[34px] rounded-[8px] border border-[var(--bd)] bg-[var(--bg1solid)] text-[var(--tx)] text-[12.5px] text-center outline-none"
      />
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────────────────────── */
export default function IncidentCenter() {
  const ctx    = useOutletContext() || {};
  const ctxLoc = ctx.location || '';

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
    return f;
  }, [ctxLoc, detTypes, dateFrom, dateTo, nvrIds, channelIds, deptIds, locIds]);

  const stats = useApi(() => fetchIncidentStats(serverFilter), [JSON.stringify(serverFilter)], { pollMs: 60000 });
  const types = useApi(() => fetchDetectionTypes(), []);
  const grid  = useApi(
    () => fetchIncidents({ skip: page * pageSize, limit: pageSize }, serverFilter),
    [page, pageSize, JSON.stringify(serverFilter)]
  );

  const items = useMemo(() => {
    let list = grid.data?.items || [];
    if (sevSet.size)    list = list.filter((i) => sevSet.has((i.severity || '').toLowerCase()));
    if (statusSet.size) list = list.filter((i) => statusSet.has(statusKey(i)));
    return list;
  }, [grid.data, sevSet, statusSet]);

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
    { label: 'Critical',              value: num(s.criticalAlerts   ?? 0), color: 'var(--crit)' },
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
    <div className="vq-inc-page py-[22px] px-[24px] flex flex-col gap-[20px] bg-[var(--bg0)] min-h-full">
      <style>{`
        @media (max-width: 1024px) {
          .vq-inc-kpis { grid-template-columns: repeat(2,1fr) !important; }
          .vq-inc-cards { grid-template-columns: repeat(2,1fr) !important; }
        }
        @media (max-width: 640px) {
          .vq-inc-page { padding: 14px 12px !important; }
          .vq-inc-kpis { grid-template-columns: 1fr !important; }
          .vq-inc-cards { grid-template-columns: 1fr !important; }
          /* These popovers are position:absolute inside their tiny trigger
             wrapper, so widening them to the viewport left them anchored at the
             trigger's edge and clipping off-screen (the right-anchored Filters
             popover overflowed the left edge). On phones, detach them into a
             centered, viewport-contained panel that can't clip regardless of
             where the trigger sits or which side it was anchored to. */
          .vq-inc-datepicker, .vq-inc-multiselect, .vq-inc-filterspopover {
            position: fixed !important;
            top: 50% !important; left: 50% !important; right: auto !important; bottom: auto !important;
            transform: translate(-50%, -50%) !important;
            width: calc(100vw - 24px) !important; max-width: 360px !important;
            max-height: 82vh !important; overflow-y: auto !important;
            z-index: 1000 !important;
          }
        }
        @media (max-width: 480px) {
          .vq-inc-navbtn { width: 36px !important; height: 36px !important; }
        }
      `}</style>

      {/* ── KPI row ─────────────────────────────────────────────────────────── */}
      <div className="vq-inc-kpis grid grid-cols-[repeat(4,1fr)] gap-[16px]">
        {kpis.map((k) => (
          <div key={k.label} className="bg-[var(--bg1solid)] border border-[var(--bd)] rounded-[12px] py-[20px] px-[22px] flex flex-col gap-[6px] shadow-[0_1px_3px_rgba(0,0,0,.07)] min-w-0">
            <div className="text-[12px] text-[var(--tx2)] font-medium">{k.label}</div>
            <div className="text-[36px] font-bold leading-none" style={{ color: k.color }}>
              {stats.loading ? '—' : k.value}
            </div>
            <div className="h-[3px] bg-[var(--bg3)] rounded-[2px] mt-[4px]">
              <div className="w-[60%] h-full rounded-[2px] opacity-70" style={{ background: k.color }} />
            </div>
          </div>
        ))}
      </div>

      {/* ── Filter bar ──────────────────────────────────────────────────────── */}
      <div className="bg-[var(--bg1solid)] border border-[var(--bd)] rounded-[12px] py-[14px] px-[16px] flex flex-col gap-[12px] shadow-[0_1px_3px_rgba(0,0,0,.07)]">
        {/* Row 1 */}
        <div className="flex items-center gap-[10px] flex-wrap">
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
            <button onClick={clearAll} className="flex items-center gap-[4px] text-[12px] font-semibold text-white bg-[var(--crit)] border border-[var(--crit)] rounded-[7px] cursor-pointer py-[5px] px-[10px]">
              <X size={13} /> Clear
            </button>
          )}

          <div className="ml-auto">
            <RefreshControl
              storageKey="incident_center"
              onManualRefresh={() => { stats.refetch(); grid.refetch(); }}
            />
          </div>
        </div>

        {/* Row 2: severity + status chips */}
        <div className="flex items-center gap-[14px] flex-wrap">
          <div className="flex gap-[6px] items-center">
            <button
              onClick={() => { setSevSet(new Set()); setStatusSet(new Set()); setPage(0); }}
              className={CHIP}
              style={{ ...chip(!sevSet.size && !statusSet.size), padding: '5px 16px' }}
            >
              All
            </button>
            {SEVERITIES.map((x) => (
              <button key={x.key}
                onClick={() => { toggleSet(setSevSet)(x.key); setPage(0); }}
                className={CHIP}
                style={chip(sevSet.has(x.key), x.key === 'high' ? 'var(--crit)' : x.key === 'moderate' ? 'var(--warn)' : '#6b7796')}
              >
                {x.label}
              </button>
            ))}
          </div>

          <div className="w-px h-[20px] bg-[var(--bd2)]" />

          <div className="flex gap-[6px] items-center">
            <button onClick={() => { setStatusSet(new Set()); setPage(0); }} className={CHIP} style={chip(!statusSet.size)}>All</button>
            {STATUSES.map((x) => (
              <button key={x.key}
                onClick={() => { toggleSet(setStatusSet)(x.key); setPage(0); }}
                className={CHIP}
                style={chip(statusSet.has(x.key), x.key === 'new' ? 'var(--crit)' : x.key === 'acknowledged' ? 'var(--warn)' : 'var(--ok)')}
              >
                {x.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-[12px]">
            <div className="text-[12px] text-[var(--tx3)]">
              {grid.loading ? 'Loading…' : `Showing ${items.length} of ${totalCount}`}
            </div>
            <div className="flex items-center gap-[6px] text-[12px] text-[var(--tx3)]">
              <span>Show</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
                className="py-[5px] px-[8px] rounded-[7px] border border-[var(--bd)] bg-[var(--bg1solid)] text-[var(--tx2)] text-[12.5px] cursor-pointer"
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
        <div className="mb-[14px] flex items-baseline gap-[8px]">
          <span className="text-[14px] font-semibold text-[var(--tx)]">
            {detTypes.size === 1 ? detectionLabel([...detTypes][0]) : detTypes.size > 1 ? `${detTypes.size} detection types` : 'All detections'}
          </span>
          <span className="text-[12px] text-[var(--tx3)]">
            showing {items.length} of {totalCount}
          </span>
        </div>

        <AsyncBoundary loading={grid.loading} error={grid.error} onRetry={() => grid.refetch()} minH={720}>
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-[56px] px-[24px] gap-[12px]">
              <div className="w-[56px] h-[56px] rounded-full bg-[var(--bg2)] flex items-center justify-center">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75"/>
                </svg>
              </div>
              <div className="text-[15px] font-semibold text-[var(--tx)]">
                {dateFrom && dateTo
                  ? `No incidents found for ${dateFrom === dateTo ? fmt(dateFrom) : `${fmt(dateFrom)} – ${fmt(dateTo)}`}`
                  : hasFilters
                    ? 'No incidents match your filters'
                    : 'No incidents yet'}
              </div>
              <div className="text-[12.5px] text-[var(--tx3)] text-center max-w-[320px] leading-[1.6]">
                {dateFrom && dateTo
                  ? 'There are no recorded incidents for the selected date range. Try a different date or clear the filter to see all incidents.'
                  : hasFilters
                    ? 'Try adjusting or clearing your filters to see more results.'
                    : 'Incidents will appear here once detections are recorded.'}
              </div>
              {(dateFrom || hasFilters) && (
                <button
                  onClick={clearAll}
                  className="mt-[4px] text-[12.5px] font-semibold text-[var(--blue)] bg-[rgba(59,130,246,.08)] border border-[rgba(59,130,246,.25)] rounded-[8px] py-[7px] px-[18px] cursor-pointer"
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <div className="vq-inc-cards grid grid-cols-[repeat(4,1fr)] gap-[16px]">
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
        <div className="vq-inc-pagination flex items-center justify-center gap-[6px] pb-[8px] flex-wrap">
          <button
            onClick={() => setPage(0)}
            disabled={page === 0}
            title="First page"
            className={`w-[34px] h-[34px] rounded-[8px] border border-[var(--bd)] flex items-center justify-center ${page === 0 ? 'bg-[var(--bg2)] text-[var(--tx3)] cursor-default' : 'bg-[var(--bg1solid)] text-[var(--tx2)] cursor-pointer'}`}
          >
            <ChevronsLeft size={15} />
          </button>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className={`py-[6px] px-[16px] rounded-[8px] border border-[var(--bd)] text-[12.5px] ${page === 0 ? 'bg-[var(--bg2)] text-[var(--tx3)] cursor-default' : 'bg-[var(--bg1solid)] text-[var(--tx2)] cursor-pointer'}`}
          >
            Previous
          </button>
          {Array.from({ length: Math.min(7, pages) }, (_, i) => {
            const p = pages <= 7 ? i : Math.max(0, Math.min(page - 3, pages - 7)) + i;
            return (
              <button key={p} onClick={() => setPage(p)} className={`w-[34px] h-[34px] rounded-[8px] border border-[var(--bd)] text-[12.5px] cursor-pointer ${p === page ? 'bg-[var(--blue)] text-white font-semibold' : 'bg-[var(--bg1solid)] text-[var(--tx2)] font-normal'}`}>
                {p + 1}
              </button>
            );
          })}
          <button
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            disabled={page >= pages - 1}
            className={`py-[6px] px-[16px] rounded-[8px] border border-[var(--bd)] text-[12.5px] ${page >= pages - 1 ? 'bg-[var(--bg2)] text-[var(--tx3)] cursor-default' : 'bg-[var(--bg1solid)] text-[var(--tx2)] cursor-pointer'}`}
          >
            Next
          </button>
          <button
            onClick={() => setPage(pages - 1)}
            disabled={page >= pages - 1}
            title="Last page"
            className={`w-[34px] h-[34px] rounded-[8px] border border-[var(--bd)] flex items-center justify-center ${page >= pages - 1 ? 'bg-[var(--bg2)] text-[var(--tx3)] cursor-default' : 'bg-[var(--bg1solid)] text-[var(--tx2)] cursor-pointer'}`}
          >
            <ChevronsRight size={15} />
          </button>
          <GoToPage pages={pages} page={page} onGo={setPage} />
          <span className="text-[12px] text-[var(--tx3)] ml-[4px] whitespace-nowrap">
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
