import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { getTimezones, getSavedTimezone, updateSavedTimezone } from '../../../helpers/configure';

/*
 * Per-zone scheduling controls (ported from V1's zonemarking/ZoneScheduleFields),
 * restyled to the V2 token system:
 *   - TimezoneField: a single GLOBAL time zone (GET pre-fills, PUT saves).
 *   - ZoneScheduleFields: a collapsible per-zone "Schedule" with a From–To time
 *     range in 12-hour format ({ hour, minute, meridiem }).
 * On save, a zone's schedule becomes zone_configs[i].startTime / .endTime
 * ("HH:MM AM" strings), the same shape V1 persists.
 */

// Module-level cache + in-flight promise so every dropdown shares ONE fetch.
let tzCache = null;
let tzPromise = null;

const fetchTimezones = () => {
  if (tzCache) return Promise.resolve(tzCache);
  if (tzPromise) return tzPromise;
  tzPromise = getTimezones()
    .then((list) => {
      tzCache = Array.isArray(list) ? list : [];
      return tzCache;
    })
    .catch(() => {
      tzPromise = null; // allow a retry on the next mount
      return [];
    });
  return tzPromise;
};

const useTimezones = () => {
  const [timezones, setTimezones] = useState(tzCache || []);
  useEffect(() => {
    if (tzCache) return;
    let alive = true;
    fetchTimezones().then((list) => alive && setTimezones(list));
    return () => { alive = false; };
  }, []);
  return timezones;
};

// ── pure helpers (shared with DetectionZoneMarking) ──────────────────────────
export const emptyTime = () => ({ hour: '', minute: '', meridiem: '' });

export const emptySchedule = () => ({ timezone: '', from: emptyTime(), to: emptyTime() });

// "09:00 AM" when fully picked, else null (so partial times are omitted on save).
export const formatTime = (t) =>
  t && t.hour && t.minute && t.meridiem ? `${t.hour}:${t.minute} ${t.meridiem}` : null;

// { startTime?, endTime? } — each included only when fully selected.
export const buildScheduleFields = (schedule) => {
  const out = {};
  const start = formatTime(schedule?.from);
  const end = formatTime(schedule?.to);
  if (start) out.startTime = start;
  if (end) out.endTime = end;
  return out;
};

// Minutes-since-midnight for a fully-picked 12h time, else null.
const timeToMinutes = (t) => {
  if (!t || !t.hour || !t.minute || !t.meridiem) return null;
  let h = parseInt(t.hour, 10) % 12; // 12 → 0
  if (t.meridiem === 'PM') h += 12;
  return h * 60 + parseInt(t.minute, 10);
};

// Validate a zone's From–To window. Returns an error string, or null if OK.
// Only enforced once BOTH ends are fully selected: the end must be later than
// the start (a "To" at or before "From" is not a valid window).
export const scheduleError = (schedule) => {
  const from = timeToMinutes(schedule?.from);
  const to = timeToMinutes(schedule?.to);
  if (from != null && to != null && to <= from) {
    return 'End time must be later than start time.';
  }
  return null;
};

// Parse a saved "hh:mm AM" string back into { hour, minute, meridiem }.
export const parseTime = (str) => {
  if (typeof str !== 'string') return emptyTime();
  const m = str.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return emptyTime();
  return { hour: m[1].padStart(2, '0'), minute: m[2], meridiem: m[3].toUpperCase() };
};

export const scheduleFromConfig = (cfg) => ({
  timezone: '',
  from: parseTime(cfg?.startTime),
  to: parseTime(cfg?.endTime),
});

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const MERIDIEMS = ['AM', 'PM'];

const LIST_MAX_H = 168; // ~5 rows, then scroll

/**
 * Custom dropdown: styled trigger + a list rendered in a PORTAL so it escapes
 * the Save modal's overflow clipping. Fixed-positioned from the trigger's rect;
 * flips above when there's no room below. Closes on outside-click / Esc / scroll.
 */
function Dropdown({ value, options, placeholder, onChange, disabled, width = 62, searchable = false, minMenuWidth = 0 }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, openUp: false });
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const searchRef = useRef(null);

  const filtered = searchable && query
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const menuW = Math.max(r.width, minMenuWidth);
    const menuH = LIST_MAX_H + (searchable ? 44 : 0);
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < menuH + 8 && r.top > spaceBelow;
    const left = Math.min(r.left, window.innerWidth - menuW - 8);
    setCoords({ top: openUp ? r.top : r.bottom, left: Math.max(8, left), width: menuW, openUp });
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
      ) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    const onResize = () => place();
    const onScroll = (e) => {
      if (listRef.current && listRef.current.contains(e.target)) return;
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) setOpen(false);
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

  useEffect(() => {
    if (!open) { setQuery(''); return; }
    if (listRef.current) {
      const sel = listRef.current.querySelector('[data-selected="true"]');
      if (sel) sel.scrollIntoView({ block: 'center' });
    }
    if (searchable && searchRef.current) searchRef.current.focus();
  }, [open, searchable]);

  const inputStyle = {
    width: '100%', height: 34, padding: '0 10px', borderRadius: 8, boxSizing: 'border-box',
    background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12.5, color: 'var(--tx)', outline: 'none',
  };

  const list = open && !disabled && createPortal(
    <div
      ref={listRef}
      style={{
        position: 'fixed', top: coords.top, left: coords.left, width: coords.width,
        transform: coords.openUp ? 'translateY(-100%)' : 'none', zIndex: 9999,
        borderRadius: 10, border: '1px solid var(--bd2)', background: 'var(--bg1solid)',
        boxShadow: '0 18px 50px rgba(0,0,0,.4)', overflow: 'hidden',
      }}
    >
      {searchable && (
        <div style={{ padding: 6, borderBottom: '1px solid var(--bd)' }}>
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search time zone…"
            style={{ ...inputStyle, height: 32 }}
          />
        </div>
      )}
      <ul className="vq-scroll" style={{ maxHeight: LIST_MAX_H, overflowY: 'auto', margin: 0, padding: 4, listStyle: 'none' }}>
        {filtered.length === 0 && (
          <li style={{ padding: '8px 10px', fontSize: 12.5, color: 'var(--tx3)' }}>No matches</li>
        )}
        {filtered.map((opt) => {
          const selected = opt === value;
          return (
            <li key={opt} data-selected={selected}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onChange(opt); setOpen(false); }}
                style={{
                  width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 7, border: 'none',
                  cursor: 'pointer', fontSize: 12.5,
                  background: selected ? 'var(--blue)' : 'transparent',
                  color: selected ? '#fff' : 'var(--tx)',
                }}
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
    <div style={{ position: 'relative', width }}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        style={{
          width: '100%', height: 34, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
          padding: '0 8px', borderRadius: 8, boxSizing: 'border-box', fontSize: 12.5, textAlign: 'left',
          background: disabled ? 'var(--bg1)' : 'var(--bg2)',
          border: `1px solid ${open ? 'var(--blue)' : 'var(--bd)'}`,
          color: disabled ? 'var(--tx3)' : 'var(--tx)',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: value ? 'var(--tx)' : 'var(--tx3)' }}>
          {value || placeholder}
        </span>
        <ChevronDown size={14} style={{ flexShrink: 0, color: 'var(--blue)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {list}
    </div>
  );
}

// One hh / mm / AM-PM group representing a single time value.
function TimeSelect({ value = emptyTime(), onChange, disabled }) {
  const set = (field, v) => onChange({ ...value, [field]: v });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <Dropdown value={value.hour} options={HOURS} placeholder="HH" disabled={disabled} onChange={(v) => set('hour', v)} />
      <span style={{ color: 'var(--blue)', fontWeight: 600 }}>:</span>
      <Dropdown value={value.minute} options={MINUTES} placeholder="MM" disabled={disabled} onChange={(v) => set('minute', v)} />
      <Dropdown value={value.meridiem} options={MERIDIEMS} placeholder="--" disabled={disabled} onChange={(v) => set('meridiem', v)} />
    </div>
  );
}

/**
 * Collapsible per-zone "Schedule" with a From–To time range. `value` is a
 * schedule object (see emptySchedule); `onChange` receives the full updated one.
 */
export default function ZoneScheduleFields({ value = emptySchedule(), onChange, disabled }) {
  const schedule = value || emptySchedule();
  const patch = (partial) => onChange({ ...schedule, ...partial });
  const [expanded, setExpanded] = useState(false);

  const from = formatTime(schedule.from);
  const to = formatTime(schedule.to);
  const summary = from && to ? `${from} – ${to}` : 'Not set';
  const rangeError = scheduleError(schedule);

  const hasTime = [schedule.from, schedule.to].some((t) => t && (t.hour || t.minute || t.meridiem));
  const resetRange = () => patch({ from: emptyTime(), to: emptyTime() });

  return (
    <div style={{ borderRadius: 10, border: '1px solid var(--bd)', overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          padding: '8px 11px', textAlign: 'left', background: 'var(--bg2)', border: 'none', cursor: 'pointer',
        }}
        aria-expanded={expanded}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--blue)' }}>Schedule</span>
          <span style={{ fontSize: 10.5, color: 'var(--tx3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span>
        </span>
        <ChevronDown size={15} style={{ flexShrink: 0, color: 'var(--blue)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>

      {expanded && (
        <div style={{ padding: '10px 11px', borderTop: '1px solid var(--bd)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--blue)' }}>Time Range</label>
            {!disabled && hasTime && (
              <button type="button" onClick={resetRange} style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer' }}>
                Reset
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, fontSize: 10.5, fontWeight: 600, color: '#fff', background: 'var(--blue)', borderRadius: 20, padding: '3px 0' }}>
              From
            </span>
            <TimeSelect value={schedule.from} disabled={disabled} onChange={(f) => patch({ from: f })} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, fontSize: 10.5, fontWeight: 600, color: 'var(--blue)', background: 'rgba(59,130,246,.12)', border: '1px solid rgba(59,130,246,.32)', borderRadius: 20, padding: '3px 0' }}>
              To
            </span>
            <TimeSelect value={schedule.to} disabled={disabled} onChange={(t) => patch({ to: t })} />
          </div>
          {rangeError && (
            <div style={{ fontSize: 10.5, color: '#ef4444', marginTop: -2 }}>{rangeError}</div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Standalone GLOBAL Time Zone field. Fetches the admin's saved timezone (GET) to
 * pre-select, saves the new choice (PUT) on change. Shown once per Zone Settings
 * panel / Save modal, NOT per-zone.
 */
export function TimezoneField({ disabled }) {
  const timezones = useTimezones();
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    getSavedTimezone()
      .then((saved) => { if (alive && saved) setValue(saved); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const handleChange = async (tz) => {
    const prev = value;
    setValue(tz); // optimistic
    setSaving(true);
    try {
      await updateSavedTimezone(tz);
      toast.success(tz ? 'Time zone updated' : 'Time zone cleared');
    } catch (err) {
      setValue(prev);
      toast.error(err?.response?.data?.body?.message || (tz ? 'Failed to update time zone' : 'Failed to clear time zone'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx2)' }}>Time Zone</label>
        {!disabled && value && (
          <button
            type="button"
            onClick={() => handleChange('')}
            disabled={saving}
            style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--blue)', background: 'none', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.5 : 1 }}
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
        width="100%"
        searchable
        minMenuWidth={260}
      />
    </div>
  );
}
