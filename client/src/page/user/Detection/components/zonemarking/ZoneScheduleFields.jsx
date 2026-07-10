import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { getTimezones, getSavedTimezone } from '../../Api/get';
import { updateSavedTimezone } from '../../Api/put';

// UI-only per-zone scheduling controls: a Timezone picker + a From–To time
// range in 12-hour format. Times are held as { hour, minute, meridiem }.
// Timezones come from GET /api/v1/admin/timezones (array of IANA strings).

// Module-level cache + in-flight promise so all schedule instances share a
// SINGLE fetch (the component renders once per zone × from/to).
let tzCache = null;
let tzPromise = null;

const fetchTimezones = () => {
  if (tzCache) return Promise.resolve(tzCache);
  if (tzPromise) return tzPromise;
  tzPromise = getTimezones()
    .then((res) => {
      const list = res?.data?.body?.data?.timezones;
      tzCache = Array.isArray(list) ? list : [];
      return tzCache;
    })
    .catch(() => {
      tzPromise = null; // allow a retry on the next mount
      return [];
    });
  return tzPromise;
};

// Shared hook: returns the cached timezone list (fetched once).
const useTimezones = () => {
  const [timezones, setTimezones] = useState(tzCache || []);
  useEffect(() => {
    if (tzCache) return;
    let alive = true;
    fetchTimezones().then((list) => alive && setTimezones(list));
    return () => {
      alive = false;
    };
  }, []);
  return timezones;
};

// Default empty value for a single time.
export const emptyTime = () => ({ hour: '', minute: '', meridiem: '' });

// Default empty schedule for one zone (or the line-crossing modal-level entry).
export const emptySchedule = () => ({
  timezone: '',
  from: emptyTime(),
  to: emptyTime(),
});

// Format a time object to a 12-hour string ("09:00 AM"), or null if the user
// hasn't fully selected hour + minute + AM/PM. Used to build the save payload:
// startTime/endTime are omitted from zone_configs when this returns null.
export const formatTime = (t) =>
  t && t.hour && t.minute && t.meridiem
    ? `${t.hour}:${t.minute} ${t.meridiem}`
    : null;

// Build the { startTime?, endTime? } fields for a zone's schedule, including
// each only when fully selected. Returns {} when neither is set.
export const buildScheduleFields = (schedule) => {
  const out = {};
  const start = formatTime(schedule?.from);
  const end = formatTime(schedule?.to);
  if (start) out.startTime = start;
  if (end) out.endTime = end;
  return out;
};

// Parse a saved "hh:mm AM" string back into a { hour, minute, meridiem } object.
// Returns an empty time when the string is missing/malformed.
export const parseTime = (str) => {
  if (typeof str !== 'string') return emptyTime();
  const m = str.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return emptyTime();
  return {
    hour: m[1].padStart(2, '0'),
    minute: m[2],
    meridiem: m[3].toUpperCase(),
  };
};

// Rebuild a schedule object from a saved zone_config (startTime/endTime).
export const scheduleFromConfig = (cfg) => ({
  timezone: '',
  from: parseTime(cfg?.startTime),
  to: parseTime(cfg?.endTime),
});

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const MERIDIEMS = ['AM', 'PM'];

const ACCENT = '#07486A';

const LIST_MAX_H = 168; // ~5 rows @ ~32px, then scroll

// Custom dropdown: a styled trigger button + a list rendered in a PORTAL so it
// escapes the modal's overflow clipping. The list is fixed-positioned from the
// trigger's rect and flips above when there isn't room below. Caps at ~5 rows
// then scrolls. Closes on outside-click / Escape / scroll.
const Dropdown = ({
  value,
  options,
  placeholder,
  onChange,
  disabled,
  width = 'w-16',
  searchable = false,
  // Popup can be wider than the trigger (useful for long timezone labels).
  minMenuWidth = 0,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, openUp: false });
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const searchRef = useRef(null);

  const filtered = searchable && query
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  // Compute the list position from the trigger's viewport rect.
  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const menuW = Math.max(r.width, minMenuWidth);
    // Extra height allowance for the search box so the flip decision is right.
    const menuH = LIST_MAX_H + (searchable ? 44 : 0);
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < menuH + 8 && r.top > spaceBelow;
    // Keep the (possibly wider) menu inside the viewport horizontally.
    const left = Math.min(r.left, window.innerWidth - menuW - 8);
    setCoords({
      top: openUp ? r.top : r.bottom,
      left: Math.max(8, left),
      width: menuW,
      openUp,
    });
  };

  useLayoutEffect(() => {
    if (open) place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        listRef.current && !listRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    const onResize = () => place();
    // On scroll, keep the list glued to the trigger by repositioning (fixed
    // coords would otherwise drift). Ignore scrolls that happen inside the list
    // itself, and close only if the trigger has scrolled out of view.
    const onScroll = (e) => {
      if (listRef.current && listRef.current.contains(e.target)) return;
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const offscreen = r.bottom < 0 || r.top > window.innerHeight;
      if (offscreen) setOpen(false);
      else place();
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  // On open: reset the search, scroll the selected item into view, focus search.
  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    if (listRef.current) {
      const sel = listRef.current.querySelector('[data-selected="true"]');
      if (sel) sel.scrollIntoView({ block: 'center' });
    }
    if (searchable && searchRef.current) searchRef.current.focus();
  }, [open, searchable]);

  const list = open && !disabled && createPortal(
    <div
      ref={listRef}
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        width: coords.width,
        transform: coords.openUp ? 'translateY(-100%)' : 'none',
      }}
      className="z-9999 rounded-md border border-[#07486A]/30 bg-white shadow-xl overflow-hidden"
    >
      {searchable && (
        <div className="p-1.5 border-b border-gray-100">
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search time zone…"
            className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#07486A] focus:border-[#07486A]"
          />
        </div>
      )}
      <ul
        // ~5 rows tall, then scroll. Custom thin scrollbar.
        style={{ maxHeight: LIST_MAX_H }}
        className="overflow-y-auto py-1 zsf-scroll"
      >
        {filtered.length === 0 && (
          <li className="px-3 py-2 text-sm text-gray-400">No matches</li>
        )}
        {filtered.map((opt) => {
          const selected = opt === value;
          return (
            <li key={opt} data-selected={selected}>
              <button
                type="button"
                onMouseDown={(e) => {
                  // mousedown (not click) so it fires before the outside-click handler
                  e.preventDefault();
                  onChange(opt);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-sm cursor-pointer transition-colors
                  ${selected
                    ? 'bg-[#07486A] text-white font-semibold'
                    : 'text-gray-700 hover:bg-[#07486A]/10 hover:text-[#07486A]'}`}
              >
                {opt}
              </button>
            </li>
          );
        })}
      </ul>
    </div>,
    document.body
  );

  return (
    <div className={`relative ${width}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-1 rounded-md border px-2 py-1.5 text-sm transition-colors
          ${disabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200'
            : open
              ? 'border-[#07486A] ring-1 ring-[#07486A]/30 bg-white text-gray-800'
              : 'border-gray-300 bg-white text-gray-800 hover:border-[#07486A]/60 cursor-pointer'}`}
      >
        <span className={`truncate ${value ? 'font-medium' : 'text-gray-400'}`}>
          {value || placeholder}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-[#07486A] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {list}

      {/* Thin accent scrollbar for the dropdown list. */}
      <style>{`
        .zsf-scroll::-webkit-scrollbar { width: 6px; }
        .zsf-scroll::-webkit-scrollbar-track { background: transparent; }
        .zsf-scroll::-webkit-scrollbar-thumb {
          background: ${ACCENT}66; border-radius: 9999px;
        }
        .zsf-scroll::-webkit-scrollbar-thumb:hover { background: ${ACCENT}; }
        .zsf-scroll { scrollbar-width: thin; scrollbar-color: ${ACCENT}66 transparent; }
      `}</style>
    </div>
  );
};

// One hh / mm / AM-PM group representing a single time value.
const TimeSelect = ({ value = emptyTime(), onChange, disabled }) => {
  const set = (field, v) => onChange({ ...value, [field]: v });
  return (
    <div className="flex items-center gap-1.5">
      <Dropdown
        value={value.hour}
        options={HOURS}
        placeholder="HH"
        disabled={disabled}
        onChange={(v) => set('hour', v)}
      />
      <span className="text-[#07486A] font-semibold">:</span>
      <Dropdown
        value={value.minute}
        options={MINUTES}
        placeholder="MM"
        disabled={disabled}
        onChange={(v) => set('minute', v)}
      />
      <Dropdown
        value={value.meridiem}
        options={MERIDIEMS}
        placeholder="--"
        width="w-16"
        disabled={disabled}
        onChange={(v) => set('meridiem', v)}
      />
    </div>
  );
};

// From/To time-range for one schedule entry, wrapped in a collapsible
// "Schedule" section (collapsed by default). Timezone is a separate global
// field (see TimezoneField below), not per-zone.
// `value` is a schedule object (see emptySchedule); `onChange` receives the
// full updated schedule.
const ZoneScheduleFields = ({ value = emptySchedule(), onChange, disabled }) => {
  const schedule = value || emptySchedule();
  const patch = (partial) => onChange({ ...schedule, ...partial });
  const [expanded, setExpanded] = useState(false);

  // Collapsed-header summary: "09:00 AM – 06:00 PM" when both set, else hint.
  const from = formatTime(schedule.from);
  const to = formatTime(schedule.to);
  const summary = from && to ? `${from} – ${to}` : 'Not set';

  // Any From/To sub-value picked → allow Reset (clears the whole time range).
  const hasTime = [schedule.from, schedule.to].some(
    (t) => t && (t.hour || t.minute || t.meridiem)
  );
  const resetRange = () => patch({ from: emptyTime(), to: emptyTime() });

  return (
    <div className="rounded-lg border border-[#07486A]/20 bg-[#07486A]/3 overflow-hidden">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[#07486A]/5 transition-colors"
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse schedule' : 'Expand schedule'}
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-[#07486A]">Schedule</span>
          <span className="text-[11px] text-gray-500 truncate">{summary}</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#07486A] transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Body: Time Range (collapses with the header) */}
      {expanded && (
        <div className="space-y-3 px-3 pb-3 pt-1 border-t border-[#07486A]/15">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-[#07486A]">
                Time Range
              </label>
              {!disabled && hasTime && (
                <button
                  type="button"
                  onClick={resetRange}
                  className="text-[11px] font-medium text-[#07486A] hover:underline cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
              <span className="inline-flex items-center justify-center text-[11px] font-semibold text-white bg-[#07486A] rounded-full px-2 py-0.5 w-12">
                From
              </span>
              <TimeSelect
                value={schedule.from}
                disabled={disabled}
                onChange={(from) => patch({ from })}
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
              <span className="inline-flex items-center justify-center text-[11px] font-semibold text-white bg-[#07486A] rounded-full px-2 py-0.5 w-12">
                To
              </span>
              <TimeSelect
                value={schedule.to}
                disabled={disabled}
                onChange={(to) => patch({ to })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Standalone global Time Zone field. Fetches the admin's saved timezone (GET)
// to pre-select, and saves the new choice (PUT) when changed. Shown once in the
// Save modal (below Priority), NOT per-zone.
export const TimezoneField = ({ disabled, className = '' }) => {
  const timezones = useTimezones();
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  // Load the currently-saved timezone once.
  useEffect(() => {
    let alive = true;
    getSavedTimezone()
      .then((res) => {
        const saved = res?.data?.body?.data?.timezone;
        if (alive && saved) setValue(saved);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const handleChange = async (tz) => {
    const prev = value;
    setValue(tz); // optimistic
    setSaving(true);
    try {
      await updateSavedTimezone(tz);
      toast.success(tz ? 'Time zone updated' : 'Time zone cleared');
    } catch (err) {
      setValue(prev); // revert on failure
      toast.error(
        err?.response?.data?.body?.message ||
          (tz ? 'Failed to update time zone' : 'Failed to clear time zone')
      );
    } finally {
      setSaving(false);
    }
  };

  // Reset also persists the cleared value (PUT empty) so the backend saved
  // timezone is cleared, not just the UI.
  const handleReset = () => handleChange('');

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium text-gray-700">
          Time Zone
        </label>
        {!disabled && value && (
          <button
            type="button"
            onClick={handleReset}
            disabled={saving}
            className="text-[11px] font-medium text-[#07486A] hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Reset
          </button>
        )}
      </div>
      <Dropdown
        value={value}
        options={timezones}
        placeholder={timezones.length ? 'Select time zone' : 'Loading time zones…'}
        disabled={disabled || saving || !timezones.length}
        onChange={handleChange}
        width="w-full"
        searchable
        minMenuWidth={260}
      />
    </div>
  );
};

export default ZoneScheduleFields;
