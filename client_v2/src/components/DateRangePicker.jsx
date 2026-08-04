import { useEffect, useRef, useState } from 'react';
import { Calendar, X, ChevronDown } from 'lucide-react';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS  = ['S','M','T','W','T','F','S'];

const filterInput = {
  height: 36,
  padding: '0 12px',
  borderRadius: 8,
  background: 'var(--bg2)',
  border: '1px solid var(--bd2)',
  fontSize: 12.5,
  color: 'var(--tx)',
  outline: 'none',
  cursor: 'pointer',
};

export function fmt(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${MONTH_NAMES[+m - 1].slice(0, 3)} ${+d}`;
}

function toStr(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Single-date / date-range picker trigger + popover calendar. Ported out of
 * IncidentCenter.jsx so Alerts & Events (and anywhere else) can reuse it —
 * behavior unchanged: click a day for a single date, click a second day for a
 * range; future dates are disabled.
 */
export default function DateRangePicker({ from, to, onFrom, onTo, onClear }) {
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
          background: hasRange ? 'rgba(59,130,246,.08)' : 'var(--bg2)',
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
