import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import moment from 'moment';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const PRESETS = [
  { key: 'today', label: 'Today', range: () => [moment(), moment()] },
  { key: 'yesterday', label: 'Yesterday', range: () => [moment().subtract(1, 'day'), moment().subtract(1, 'day')] },
  { key: 'last7', label: 'Last 7 Days', range: () => [moment().subtract(6, 'day'), moment()] },
  { key: 'last30', label: 'Last 30 Days', range: () => [moment().subtract(29, 'day'), moment()] },
  { key: 'thisMonth', label: 'This Month', range: () => [moment().startOf('month'), moment().endOf('month')] },
  { key: 'lastMonth', label: 'Last Month', range: () => [moment().subtract(1, 'month').startOf('month'), moment().subtract(1, 'month').endOf('month')] },
  { key: 'custom', label: 'Custom Range', range: null },
];

const clampRange = ([start, end], min, max) => [
  min && start.isBefore(min, 'day') ? min.clone() : start.clone(),
  max && end.isAfter(max, 'day') ? max.clone() : end.clone(),
];

const sameRange = (range, start, end) =>
  range?.[0]?.isSame(start, 'day') && range?.[1]?.isSame(end, 'day');

const getPresetKey = (start, end, min, max) => {
  if (!start || !end) return 'custom';
  return PRESETS.find((preset) => {
    if (!preset.range) return false;
    return sameRange(clampRange(preset.range(), min, max), start, end);
  })?.key || 'custom';
};

const PresetDateRangePicker = ({ startDate, endDate, minDate, maxDate, onRangeChange }) => {
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [sel, setSel] = useState({ start: null, end: null });
  const [hovered, setHovered] = useState(null);
  const [viewMonth, setViewMonth] = useState(() => moment(startDate || undefined).startOf('month').subtract(1, 'month'));
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const panelRef = useRef(null);

  const min = minDate ? moment(minDate).startOf('day') : null;
  const max = maxDate ? moment(maxDate).endOf('day') : null;

  useEffect(() => {
    const start = startDate ? moment(startDate).startOf('day') : null;
    const end = endDate ? moment(endDate).startOf('day') : null;
    setSel({ start, end });
    setHovered(null);
    setViewMonth((start || moment()).clone().startOf('month').subtract(start && end && start.isSame(end, 'month') ? 1 : 0, 'month'));
    if (open) setCustomOpen(start && end ? getPresetKey(start, end, min, max) === 'custom' : false);
  }, [startDate, endDate, open, minDate, maxDate]);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event) => {
      if (ref.current?.contains(event.target)) return;
      if (panelRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKeyDown = (event) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, customOpen]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const update = () => {
      const trigger = ref.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const gutter = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = Math.min(panelRef.current?.offsetWidth || 820, vw - gutter * 2);
      const height = panelRef.current?.offsetHeight || 0;
      let left = Math.round(rect.left);
      left = Math.max(gutter, Math.min(left, vw - width - gutter));
      let top = Math.round(rect.bottom + 8);
      if (height && top + height + gutter > vh) top = Math.max(gutter, rect.top - height - 8);
      setPos({
        position: 'fixed',
        top,
        left,
        maxWidth: `calc(100vw - ${gutter * 2}px)`,
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
  }, [open]);

  const label =
    startDate && endDate
      ? `${moment(startDate).format('DD MMMM YYYY')} - ${moment(endDate).format('DD MMMM YYYY')}`
      : 'Select Date';

  const activePreset = customOpen ? 'custom' : getPresetKey(sel.start, sel.end, min, max);
  const previewing = sel.start && !sel.end && hovered;
  const lo = previewing ? moment.min(sel.start, hovered) : sel.start;
  const hi = previewing ? moment.max(sel.start, hovered) : sel.end;

  const isDisabled = (day) => (min && day.isBefore(min, 'day')) || (max && day.isAfter(max, 'day'));
  const inRange = (day) => lo && hi && day.isSameOrAfter(lo, 'day') && day.isSameOrBefore(hi, 'day');
  const isEndpoint = (day) => (lo && day.isSame(lo, 'day')) || (hi && day.isSame(hi, 'day'));

  const months = useMemo(() => [viewMonth.clone(), viewMonth.clone().add(1, 'month')], [viewMonth]);

  const pickPreset = (preset) => {
    if (!preset.range) {
      setCustomOpen(true);
      setViewMonth((sel.start || moment()).clone().startOf('month').subtract(sel.start && sel.end && sel.start.isSame(sel.end, 'month') ? 1 : 0, 'month'));
      return;
    }
    const [start, end] = clampRange(preset.range(), min, max);
    setSel({ start, end });
    setHovered(null);
    onRangeChange?.({ start: start.toDate(), end: end.toDate() });
    setOpen(false);
  };

  const pickDay = (day) => {
    if (isDisabled(day)) return;
    setHovered(null);
    setSel((current) => {
      if (!current.start || current.end) return { start: day, end: null };
      return day.isBefore(current.start, 'day')
        ? { start: day, end: current.start }
        : { start: current.start, end: day };
    });
  };

  const apply = () => {
    if (!sel.start) return;
    onRangeChange?.({ start: sel.start.toDate(), end: (sel.end || sel.start).toDate() });
    setOpen(false);
  };

  const clear = () => {
    setSel({ start: null, end: null });
    onRangeChange?.({ start: null, end: null });
    setOpen(false);
  };

  const renderMonth = (month) => {
    const gridStart = month.clone().startOf('month').startOf('week');
    const days = Array.from({ length: 42 }, (_, index) => gridStart.clone().add(index, 'day'));
    return (
      <div className="min-w-[270px]">
        <div className="mb-2 text-base font-bold text-[var(--tx)]">{month.format('MMMM YYYY')}</div>
        <div className="grid grid-cols-7 gap-y-0.5">
          {WEEKDAYS.map((weekday) => (
            <div key={weekday} className="pb-0.5 text-center text-[11px] font-semibold text-[var(--tx2)]">
              {weekday}
            </div>
          ))}
          {days.map((day) => {
            const otherMonth = !day.isSame(month, 'month');
            const disabled = isDisabled(day);
            const endpoint = !otherMonth && isEndpoint(day);
            const between = !otherMonth && inRange(day) && !endpoint;
            const classes = endpoint
              ? 'bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white rounded-full font-bold'
              : between
                ? 'bg-gradient-to-br from-[var(--blue)]/10 to-[var(--violet)]/15 text-[var(--tx)]'
                : otherMonth
                  ? 'text-[var(--tx3)]'
                  : 'text-[var(--tx)]';
            return (
              <button
                key={day.format('YYYY-MM-DD')}
                type="button"
                disabled={disabled}
                onClick={() => pickDay(day)}
                onMouseEnter={() => !disabled && sel.start && !sel.end && setHovered(day)}
                className={`mx-auto flex h-8 w-8 cursor-pointer items-center justify-center text-[13px] transition-colors hover:bg-[var(--violet)]/15 disabled:cursor-not-allowed disabled:opacity-45 ${classes}`}
              >
                {day.date()}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const panel = (
    <div
      ref={panelRef}
      style={pos || { position: 'fixed', top: -9999, left: -9999 }}
      className={`z-[10030] max-h-[calc(100vh-24px)] overflow-auto rounded-xl border border-[var(--bd)] bg-[var(--bg1solid)] text-[var(--tx)] shadow-2xl ${customOpen ? 'w-[760px]' : 'w-[150px]'}`}
    >
      <div className={customOpen ? 'grid grid-cols-[134px_minmax(0,1fr)]' : ''}>
        <div className={`${customOpen ? 'border-r border-[var(--bd)]' : ''} p-2.5`}>
          <div className="space-y-1">
            {PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => pickPreset(preset)}
                className={`h-7 w-full cursor-pointer whitespace-nowrap rounded-md px-3 text-left text-[13px] font-medium transition-colors ${
                  activePreset === preset.key
                    ? 'bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white'
                    : 'text-[var(--tx2)] hover:bg-[var(--bg2)] hover:text-[var(--tx)]'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {customOpen && (
          <div>
            <div className="relative flex gap-6 px-5 py-3" onMouseLeave={() => setHovered(null)}>
              {months.map((month) => (
                <React.Fragment key={month.format('YYYY-MM')}>{renderMonth(month)}</React.Fragment>
              ))}
              <div className="absolute right-5 top-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => setViewMonth((month) => month.clone().subtract(1, 'month'))}
                  className="cursor-pointer text-[var(--violet)] hover:opacity-75"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMonth((month) => month.clone().add(1, 'month'))}
                  className="cursor-pointer text-[var(--violet)] hover:opacity-75"
                  aria-label="Next month"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-[var(--bd)] px-4 py-2">
              <div className="flex min-w-0 items-center gap-2 text-xs text-[var(--tx2)]">
                <span className="truncate">
                  {sel.start ? sel.start.format('DD MMMM YYYY') : 'Start date'}
                  {' - '}
                  {(sel.end || sel.start)?.format('DD MMMM YYYY') || 'End date'}
                </span>
                <button type="button" onClick={clear} className="inline-flex cursor-pointer items-center gap-1 text-[var(--tx2)] hover:text-[var(--tx)]">
                  <X className="h-3 w-3" />
                  Clear
                </button>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setOpen(false)} className="h-7 cursor-pointer rounded-md border border-[var(--bd)] px-4 text-xs font-medium text-[var(--tx2)] hover:bg-[var(--bg2)]">
                  Cancel
                </button>
                <button type="button" onClick={apply} disabled={!sel.start} className="h-7 cursor-pointer rounded-md bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] px-5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
                  Apply
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="relative w-full sm:w-auto" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="h-10 w-full sm:w-[300px] flex items-center justify-between gap-2 px-3 rounded-lg border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx2)] text-xs 2xl:text-sm font-medium cursor-pointer hover:border-[var(--violet)] transition-colors"
      >
        <span className="flex items-center gap-2 overflow-hidden">
          <CalendarIcon className="w-4 h-4 shrink-0 text-[var(--tx3)]" />
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-[var(--tx3)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && createPortal(panel, document.body)}
    </div>
  );
};

export default PresetDateRangePicker;
