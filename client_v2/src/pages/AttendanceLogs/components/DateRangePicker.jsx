import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar as CalendarIcon, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import moment from 'moment';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * Themed date-range picker with a custom calendar (no native <input type=date>),
 * so month navigation and every control are fully styled and clearly visible in
 * both dark and light mode. Contract unchanged: onRangeChange({ start, end })
 * with Date objects; optional min/max constraints.
 */
const DateRangePicker = ({ startDate, endDate, minDate, maxDate, onRangeChange }) => {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState({ start: null, end: null }); // moment | null
  const [hovered, setHovered] = useState(null); // moment | null (range preview)
  const [viewMonth, setViewMonth] = useState(() => moment(startDate || undefined).startOf('month'));
  const ref = useRef(null);

  // Sync internal selection + visible month from props when opening / props change.
  useEffect(() => {
    const s = startDate ? moment(startDate) : null;
    const e = endDate ? moment(endDate) : null;
    setSel({ start: s, end: e });
    setHovered(null);
    setViewMonth((s || moment()).clone().startOf('month'));
  }, [startDate, endDate, open]);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const label =
    startDate && endDate
      ? `${moment(startDate).format('DD MMM YYYY')} - ${moment(endDate).format('DD MMM YYYY')}`
      : 'Select Date';

  const min = minDate ? moment(minDate).startOf('day') : null;
  const max = maxDate ? moment(maxDate).endOf('day') : null;

  const days = useMemo(() => {
    // Monday-first grid to match the reference calendar (M T W T F S S).
    const gridStart = viewMonth.clone().startOf('month').startOf('isoWeek');
    return Array.from({ length: 42 }, (_, i) => gridStart.clone().add(i, 'day'));
  }, [viewMonth]);

  const isDisabled = (d) => (min && d.isBefore(min, 'day')) || (max && d.isAfter(max, 'day'));

  const pickDay = (d) => {
    if (isDisabled(d)) return;
    setHovered(null);
    setSel((prev) => {
      // Start a fresh range if none in progress or a full range already picked.
      if (!prev.start || (prev.start && prev.end)) return { start: d, end: null };
      // Second pick completes the range (swap if picked before the start).
      return d.isBefore(prev.start, 'day')
        ? { start: d, end: prev.start }
        : { start: prev.start, end: d };
    });
  };

  // While choosing the second date, preview the range from the start up to the
  // day currently under the cursor so the selection reflects live in the UI.
  const previewing = sel.start && !sel.end && hovered;
  const lo = previewing ? moment.min(sel.start, hovered) : sel.start;
  const hi = previewing ? moment.max(sel.start, hovered) : sel.end;

  const inRange = (d) => lo && hi && d.isSameOrAfter(lo, 'day') && d.isSameOrBefore(hi, 'day');
  const isEndpoint = (d) =>
    (lo && d.isSame(lo, 'day')) || (hi && d.isSame(hi, 'day'));

  const apply = () => {
    if (!sel.start) return;
    const start = sel.start.toDate();
    const end = (sel.end || sel.start).toDate();
    onRangeChange?.({ start, end });
    setOpen(false);
  };

  const clear = () => {
    setSel({ start: null, end: null });
    onRangeChange?.({ start: null, end: null });
    setOpen(false);
  };

  const nextDisabled = max && viewMonth.clone().endOf('month').isSameOrAfter(max, 'day')
    && viewMonth.isSame(max, 'month');

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="h-10 flex items-center justify-between gap-2 px-3 rounded-lg border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx2)] text-xs 2xl:text-sm font-medium cursor-pointer hover:border-[var(--violet)] transition-colors min-w-[180px] max-w-[280px]"
      >
        <span className="flex items-center gap-2 overflow-hidden">
          <CalendarIcon className="w-4 h-4 shrink-0 text-[var(--tx3)]" />
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-[var(--tx3)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-[95] mt-2 left-0 w-[310px] rounded-xl border border-[var(--bd)] bg-[var(--bg1solid)] shadow-xl p-3">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setViewMonth((m) => m.clone().subtract(1, 'month'))}
              className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--tx2)] hover:bg-[var(--bg2)] hover:text-[var(--tx)] cursor-pointer transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-[var(--tx)]">{viewMonth.format('MMMM YYYY')}</span>
            <button
              type="button"
              disabled={nextDisabled}
              onClick={() => setViewMonth((m) => m.clone().add(1, 'month'))}
              className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
                nextDisabled
                  ? 'text-[var(--tx3)] cursor-not-allowed'
                  : 'text-[var(--tx2)] hover:bg-[var(--bg2)] hover:text-[var(--tx)] cursor-pointer'
              }`}
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-[10px] font-medium text-[var(--tx3)] text-center py-1">
                {w}
              </div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-y-1" onMouseLeave={() => setHovered(null)}>
            {days.map((d) => {
              const otherMonth = !d.isSame(viewMonth, 'month');
              const disabled = isDisabled(d);
              const endpoint = isEndpoint(d);
              const between = inRange(d) && !endpoint;

              const base = 'w-8 h-8 text-xs font-medium flex items-center justify-center transition-colors';
              let state;
              if (endpoint) {
                state = 'bg-[var(--brand)] text-white font-semibold rounded-full cursor-pointer';
              } else if (between) {
                state = 'bg-[var(--brand)]/25 text-[var(--tx)] rounded-md cursor-pointer';
              } else if (disabled) {
                // Future / out-of-range days: muted but still legible in both themes.
                state = 'text-[var(--tx3)] cursor-not-allowed rounded-full';
              } else if (otherMonth) {
                state = 'text-[var(--tx2)] hover:bg-[var(--bg2)] rounded-full cursor-pointer';
              } else {
                state = 'text-[var(--tx)] hover:bg-[var(--bg2)] rounded-full cursor-pointer';
              }

              return (
                <div key={d.format('YYYY-MM-DD')} className="flex items-center justify-center">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => pickDay(d)}
                    onDoubleClick={() => !disabled && setSel({ start: d, end: d })}
                    onMouseEnter={() => !disabled && sel.start && !sel.end && setHovered(d)}
                    className={`${base} ${state}`}
                  >
                    {d.date()}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2 pt-3 mt-2 border-t border-[var(--bd)]">
            <p className="text-[10px] leading-tight text-[var(--tx3)] max-w-[130px]">
              Double-tap to pick one date or select a range.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={clear}
                className="text-xs font-medium text-[var(--tx2)] hover:text-[var(--tx)] px-2.5 py-1.5 cursor-pointer transition-colors rounded-md hover:bg-[var(--bg2)]"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={!sel.start}
                className="text-xs font-semibold bg-[var(--brand)] text-white px-4 py-1.5 rounded-md hover:bg-[var(--brand-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DateRangePicker;
