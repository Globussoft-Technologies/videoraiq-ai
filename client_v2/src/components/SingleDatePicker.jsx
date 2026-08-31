import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import moment from 'moment';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * Themed single-date picker with a custom calendar (no native <input type=date>),
 * so month navigation and every control are fully styled and clearly visible in
 * both dark and light mode. Contract: value/onChange use 'YYYY-MM-DD' strings.
 * Optional minDate / maxDate ('YYYY-MM-DD') cap selectable days.
 * Optional placeholder overrides the empty-state label.
 */
const SingleDatePicker = ({ value, minDate, maxDate, placeholder = 'Select Date', onChange }) => {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() =>
    moment(value || undefined).startOf('month')
  );
  const ref = useRef(null);
  const panelRef = useRef(null);
  const [pos, setPos] = useState(null);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const onResize = () => setIsMobile(mq.matches);
    onResize();
    mq.addEventListener('change', onResize);
    return () => mq.removeEventListener('change', onResize);
  }, []);

  useEffect(() => {
    setViewMonth(moment(value || undefined).startOf('month'));
  }, [value, open]);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useLayoutEffect(() => {
    if (!open || isMobile) return undefined;
    const GUTTER = 8;
    const update = () => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const w = Math.min(panelRef.current?.offsetWidth || 320, vw - GUTTER * 2);
      let left = Math.round(r.left);
      left = Math.max(GUTTER, Math.min(left, vw - w - GUTTER));
      setPos({
        position: 'fixed',
        top: Math.round(r.bottom + 8),
        left,
        maxWidth: `calc(100vw - ${GUTTER * 2}px)`,
      });
    };
    update();
    const raf = requestAnimationFrame(update);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, isMobile]);

  const selected = value ? moment(value, 'YYYY-MM-DD') : null;
  const min = minDate ? moment(minDate, 'YYYY-MM-DD').startOf('day') : null;
  const max = maxDate ? moment(maxDate, 'YYYY-MM-DD').endOf('day') : null;
  const label = selected ? selected.format('DD MMM YYYY') : placeholder;

  const days = useMemo(() => {
    const gridStart = viewMonth.clone().startOf('month').startOf('isoWeek');
    return Array.from({ length: 42 }, (_, i) => gridStart.clone().add(i, 'day'));
  }, [viewMonth]);

  const isDisabled = (d) =>
    (max && d.isAfter(max, 'day')) || (min && d.isBefore(min, 'day'));

  const pickDay = (d) => {
    if (isDisabled(d)) return;
    onChange?.(d.format('YYYY-MM-DD'));
    setOpen(false);
  };

  const nextDisabled =
    max &&
    viewMonth.isSame(max, 'month') &&
    viewMonth.clone().endOf('month').isSameOrAfter(max, 'day');
  const prevDisabled =
    min &&
    viewMonth.isSame(min, 'month') &&
    viewMonth.clone().startOf('month').isSameOrBefore(min, 'day');

  const today = moment();

  const calendarBody = (
    <>
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          disabled={prevDisabled}
          onClick={() => setViewMonth((m) => m.clone().subtract(1, 'month'))}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${
            prevDisabled
              ? 'text-[var(--tx3)] cursor-not-allowed'
              : 'text-[var(--tx2)] hover:bg-[var(--bg2)] hover:text-[var(--tx)] active:scale-95 cursor-pointer'
          }`}
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-[var(--tx)] tracking-tight">
          {viewMonth.format('MMMM YYYY')}
        </span>
        <button
          type="button"
          disabled={nextDisabled}
          onClick={() => setViewMonth((m) => m.clone().add(1, 'month'))}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${
            nextDisabled
              ? 'text-[var(--tx3)] cursor-not-allowed'
              : 'text-[var(--tx2)] hover:bg-[var(--bg2)] hover:text-[var(--tx)] active:scale-95 cursor-pointer'
          }`}
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1.5">
        {WEEKDAYS.map((w, i) => (
          <div
            key={`${w}-${i}`}
            className="text-[10px] font-semibold uppercase tracking-wider text-[var(--tx3)] text-center py-1"
          >
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((d) => {
          const otherMonth = !d.isSame(viewMonth, 'month');
          const disabled = isDisabled(d);
          const isSelected = selected && d.isSame(selected, 'day');
          const isToday = d.isSame(today, 'day');

          const base =
            'w-9 h-9 text-[13px] font-medium flex items-center justify-center transition-all duration-100';
          let state;
          if (isSelected) {
            state =
              'bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white font-semibold rounded-full shadow-sm cursor-pointer';
          } else if (disabled) {
            state = 'text-[var(--tx3)] opacity-60 cursor-not-allowed rounded-full';
          } else if (otherMonth) {
            state =
              'text-[var(--tx3)] hover:bg-[var(--bg2)] hover:text-[var(--tx2)] rounded-full cursor-pointer';
          } else {
            state = 'text-[var(--tx)] hover:bg-[var(--bg2)] rounded-full cursor-pointer';
          }
          if (isToday && !isSelected) {
            state += ' ring-1 ring-inset ring-[var(--brand)]/50';
          }

          return (
            <div key={d.format('YYYY-MM-DD')} className="flex items-center justify-center">
              <button
                type="button"
                disabled={disabled}
                onClick={() => pickDay(d)}
                className={`${base} ${state}`}
              >
                {d.date()}
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 pt-3 mt-3 border-t border-[var(--bd)]">
        <span className="text-[11px] font-medium text-[var(--tx2)] truncate">
          {selected ? selected.format('DD MMM YYYY') : 'No date selected'}
        </span>
        <button
          type="button"
          onClick={() => {
            let t = today;
            if (max && t.isAfter(max, 'day')) t = max.clone();
            if (min && t.isBefore(min, 'day')) t = min.clone();
            onChange?.(t.format('YYYY-MM-DD'));
            setOpen(false);
          }}
          className="text-xs font-semibold bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white px-4 py-1.5 rounded-lg shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
        >
          Today
        </button>
      </div>
    </>
  );

  return (
    <div className="relative w-full sm:w-auto" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`h-10 w-full sm:w-auto flex items-center justify-between gap-2 px-3 rounded-lg border bg-[var(--bg2)] text-[var(--tx2)] text-xs 2xl:text-sm font-medium cursor-pointer transition-colors sm:min-w-[160px] ${
          open
            ? 'border-[var(--violet)] ring-2 ring-[var(--violet)]/15'
            : 'border-[var(--bd)] hover:border-[var(--violet)]'
        }`}
      >
        <span className="flex items-center gap-2 overflow-hidden">
          <CalendarIcon className="w-4 h-4 shrink-0 text-[var(--tx3)]" />
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 text-[var(--tx3)] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open &&
        createPortal(
          isMobile ? (
            <div className="fixed inset-0 z-[10030] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <div
                ref={panelRef}
                className="w-[328px] max-w-full max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] shadow-2xl p-4"
              >
                {calendarBody}
              </div>
            </div>
          ) : (
            <div
              ref={panelRef}
              style={pos || { position: 'fixed', top: -9999, left: -9999 }}
              className="z-[10030] w-[320px] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] shadow-2xl p-4"
            >
              {calendarBody}
            </div>
          ),
          document.body
        )}
    </div>
  );
};

export default SingleDatePicker;
