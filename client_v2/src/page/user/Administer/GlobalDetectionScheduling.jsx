import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  CalendarClock,
  Calendar,
  Clock,
  CopyPlus,
  Globe,
  Info,
  Plus,
  Search,
  Server,
  Trash2,
  Loader2,
  X,
} from 'lucide-react';
import SearchableSelect from '../../../components/SearchableSelect';
import { getNvrs } from '../../../helpers/configure';
import { useTimezones } from '../Configure/ZoneScheduleFields';
import useDetectionScheduleEvents from '../../../hooks/useDetectionScheduleEvents';
import {
  createGlobalSchedule,
  deleteGlobalSchedule,
  getGlobalSchedules,
  getNvrCamerasForGlobalSchedule,
  globalScheduleErrorMessage,
  updateGlobalSchedule,
} from '../../../helpers/globalSchedule';

/**
 * Global Detection Scheduling — Settings section.
 *
 * Flow: pick an NVR -> see which of its cameras are configured for detection
 * (only those can be scheduled) -> enrol some of them -> define one schedule
 * that governs all of them.
 *
 * Two things this UI must not blur:
 *   1. Enrolling a camera is NOT the same as its detection running right now.
 *      The checkbox controls enrolment; live detection state is shown
 *      separately, as read-only context.
 *   2. Saving does not take effect instantly. The existing one-minute
 *      detection scheduler applies the change on its next tick, so the copy
 *      says so in the banner, next to Save, and in the success toast.
 */

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const SCHEDULER_LAG_NOTE =
  'Schedule changes are applied by the existing detection scheduler on its next run — normally within about 1 minute.';

const DEFAULT_TIMEZONE = 'Asia/Kolkata';
const TIME_HOURS_12 = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'));
const TIME_MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));

const emptyDays = () => DAYS.reduce((acc, day) => ({ ...acc, [day]: [] }), {});

const defaultForm = () => ({
  mode: 'custom',
  timezone: DEFAULT_TIMEZONE,
  days: emptyDays(),
});

const titleCase = (value) => value.charAt(0).toUpperCase() + value.slice(1);

function parseTime12(value = '09:00') {
  const [rawHours, rawMinutes] = String(value || '09:00').split(':');
  const hours24 = Number(rawHours);
  const minutes = Number(rawMinutes);
  const safeHours = Number.isFinite(hours24) ? Math.min(Math.max(hours24, 0), 23) : 9;
  const safeMinutes = Number.isFinite(minutes) ? Math.min(Math.max(minutes, 0), 59) : 0;
  return {
    hour: String(safeHours % 12 || 12).padStart(2, '0'),
    minute: String(safeMinutes).padStart(2, '0'),
    period: safeHours >= 12 ? 'PM' : 'AM',
  };
}

function toTime24(hour, minute, period) {
  let hours = Number(hour);
  if (period === 'PM' && hours < 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return `${String(hours).padStart(2, '0')}:${minute}`;
}

const toMinutes = (time) => {
  const [hours, minutes] = String(time || '').split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : NaN;
};

/**
 * Mirrors the server's Joi rules so an obvious mistake is caught before a round
 * trip. The server stays the authority — anything this misses still surfaces as
 * a toast from the API response.
 */
const validateForm = (form, cameraCount) => {
  if (!cameraCount) return 'Select at least one configured camera to schedule.';
  if (form.mode === 'always') return null;
  if (!form.timezone) return 'Select a time zone.';

  let total = 0;
  for (const day of DAYS) {
    const ranges = form.days?.[day] || [];
    const sorted = [...ranges].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

    for (let i = 0; i < sorted.length; i += 1) {
      const { start, end } = sorted[i];
      total += 1;
      if (!start || !end) return `${titleCase(day)}: fill in both start and end times.`;
      if (toMinutes(start) >= toMinutes(end)) {
        return `${titleCase(day)}: start time must be before end time.`;
      }
      const next = sorted[i + 1];
      if (next && toMinutes(end) > toMinutes(next.start)) {
        return `${titleCase(day)}: time ranges cannot overlap.`;
      }
    }
  }

  if (!total) return 'Custom mode needs at least one time range.';
  return null;
};

/** Strip empty days so the payload matches what the API expects. */
const buildSchedulePayload = (form) => {
  if (form.mode === 'always') return { mode: 'always' };
  return {
    mode: 'custom',
    timezone: form.timezone,
    days: DAYS.reduce((acc, day) => ({ ...acc, [day]: form.days?.[day] || [] }), {}),
  };
};

function Panel({ children, style }) {
  return (
    <section
      style={{
        background: 'var(--bg1)',
        border: '1px solid var(--bd)',
        borderRadius: 14,
        padding: 18,
        minWidth: 0,
        ...style,
      }}
    >
      {children}
    </section>
  );
}

function PanelHeader({ icon: Icon, title, sub, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
        {Icon && (
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(59,130,246,.1)',
              color: 'var(--blue)',
              flexShrink: 0,
            }}
          >
            <Icon size={16} strokeWidth={1.8} />
          </span>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14, color: 'var(--tx)' }}>{title}</div>
          {sub && <div style={{ marginTop: 3, fontSize: 11.5, color: 'var(--tx3)', lineHeight: 1.35 }}>{sub}</div>}
        </div>
      </div>
      {action}
    </div>
  );
}

function FieldLabel({ children }) {
  return <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 6 }}>{children}</div>;
}

/** The "applied within ~1 minute" note, styled as an informational callout. */
function SchedulerNote({ style }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 9,
        padding: '10px 12px',
        borderRadius: 10,
        background: 'rgba(59,130,246,.08)',
        border: '1px solid rgba(59,130,246,.22)',
        ...style,
      }}
    >
      <Info size={14} style={{ color: 'var(--blue)', flexShrink: 0, marginTop: 1 }} />
      <div style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--tx2)' }}>{SCHEDULER_LAG_NOTE}</div>
    </div>
  );
}

function TabButton({ active, disabled, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '7px 14px',
        borderRadius: 9,
        border: `1px solid ${active ? 'var(--blue)' : 'var(--bd)'}`,
        background: active ? 'rgba(59,130,246,.1)' : 'transparent',
        color: active ? 'var(--blue)' : 'var(--tx2)',
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

/**
 * The detectors actually applied to a camera, as chips.
 *
 * The API only returns applied detectors (enabled, or with zones drawn for this
 * camera) — never the merely-linked ones a camera accumulates when a detection
 * setting is saved against several channels. Even so, a busy camera can have a
 * handful, so the list collapses past MAX_VISIBLE rather than wrapping into a
 * wall of text.
 */
const MAX_VISIBLE_DETECTORS = 4;

function DetectorChips({ detectors = [] }) {
  const [expanded, setExpanded] = useState(false);

  if (!detectors.length) {
    return <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: 3 }}>No detections applied</div>;
  }

  const visible = expanded ? detectors : detectors.slice(0, MAX_VISIBLE_DETECTORS);
  const hidden = detectors.length - visible.length;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
      {visible.map((detector) => (
        <span
          key={detector.settingType}
          title={detector.enabled ? 'Running' : 'Configured, currently stopped'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10,
            padding: '2px 7px',
            borderRadius: 999,
            background: 'var(--bg1solid, var(--bg1))',
            border: '1px solid var(--bd)',
            color: 'var(--tx2)',
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: detector.enabled ? '#16a34a' : 'var(--tx3)',
              flexShrink: 0,
            }}
          />
          {detector.detectionName}
        </span>
      ))}
      {(hidden > 0 || expanded) && (
        <button
          type="button"
          onClick={(event) => {
            // The row is a <label>; without this the click toggles the checkbox.
            event.preventDefault();
            event.stopPropagation();
            setExpanded((current) => !current);
          }}
          style={{
            fontSize: 10,
            padding: '2px 7px',
            borderRadius: 999,
            background: 'transparent',
            border: '1px dashed var(--bd)',
            color: 'var(--tx3)',
            cursor: 'pointer',
          }}
        >
          {expanded ? 'Show less' : `+${hidden} more`}
        </button>
      )}
    </div>
  );
}

/**
 * Turn a DS call failure into a short, professional sentence instead of
 * surfacing the raw JSON verbatim in the UI — but built from the real API
 * response (the `detail`/`message` DS actually sent), not a canned line, so
 * the specific reason (e.g. "System at capacity: GPU 0 VRAM at 96.6%
 * (threshold: 92.0%)") is still visible, just phrased as prose and paired
 * with which camera/detector it happened for.
 */
function friendlyDsFailureMessage(event) {
  const status = Number(String(event?.dsError || '').match(/status code (\d+)/i)?.[1]) || null;
  const detail = event?.dsResponse?.detail || event?.dsResponse?.message || event?.dsError || 'No response from the detection service.';
  const who = [event?.channelName, event?.detectionName].filter(Boolean).join(' · ');
  const statusLabel = status ? ` (HTTP ${status})` : '';

  return `Could not ${event?.operation || 'update'} ${who || 'this detector'}${statusLabel}: ${detail}`;
}

/**
 * Live DS call trace. Every start/stop the backend performs shows up here with
 * the endpoint it hit and what DS replied — the quickest way to confirm the
 * scheduler is actually firing, and to see the response when it is not.
 */
function SchedulerActivity({ events, onClear }) {
  const [openKey, setOpenKey] = useState(null);

  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--bd)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)' }}>
            Scheduler activity {events.length ? `(${events.length})` : ''}
          </div>
          <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>
            Live DS start/stop calls. Click a row to see details.
          </div>
        </div>
        {events.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            style={{
              border: '1px solid var(--bd)',
              background: 'transparent',
              color: 'var(--tx2)',
              borderRadius: 8,
              padding: '5px 10px',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
        )}
      </div>

      {events.length === 0 ? (
        <div style={{ fontSize: 11.5, color: 'var(--tx3)', padding: '8px 0' }}>
          Nothing yet. A transition appears here the moment the scheduler starts or stops a detection — within about a
          minute of a schedule boundary.
        </div>
      ) : (
        <div className="customscrollbar" style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {events.map((event) => {
            const failed = event.status === 'failed';
            const open = openKey === event.key;
            return (
              <div
                key={event.key}
                style={{
                  flexShrink: 0,
                  borderRadius: 9,
                  border: `1px solid ${failed ? 'rgba(239,68,68,.35)' : 'var(--bd)'}`,
                  background: failed ? 'rgba(239,68,68,.06)' : 'var(--bg2)',
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpenKey(open ? null : event.key)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 10px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 4,
                      flexShrink: 0,
                      background: failed
                        ? 'rgba(239,68,68,.15)'
                        : event.enabled
                          ? 'rgba(34,197,94,.14)'
                          : 'rgba(148,163,184,.18)',
                      color: failed ? '#dc2626' : event.enabled ? '#16a34a' : 'var(--tx3)',
                    }}
                  >
                    {failed ? 'FAILED' : (event.operation || '').toUpperCase()}
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--tx)', fontWeight: 600, minWidth: 0, flex: 1 }}>
                    {event.channelName}
                    <span style={{ color: 'var(--tx3)', fontWeight: 400 }}> · {event.detectionName}</span>
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)', flexShrink: 0 }}>
                    {new Date(event.at).toLocaleTimeString()}
                  </span>
                </button>

                {open && (
                  <div style={{ padding: '0 10px 9px', fontSize: 10.5, color: 'var(--tx2)' }}>
                    {failed && (
                      <div
                        className="customscrollbar"
                        style={{
                          padding: '8px 10px',
                          borderRadius: 7,
                          background: 'rgba(239,68,68,.08)',
                          border: '1px solid rgba(239,68,68,.22)',
                          fontSize: 11,
                          lineHeight: 1.5,
                          color: 'var(--tx)',
                          maxHeight: 120,
                          overflowY: 'auto',
                        }}
                      >
                        {friendlyDsFailureMessage(event)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const TIME_INPUT_STYLE = {
  border: '1px solid var(--bd2, var(--bd))',
  borderRadius: 8,
  padding: '4px 8px',
  fontSize: 12.5,
  fontWeight: 500,
  color: 'var(--tx)',
  background: 'var(--bg1solid, var(--bg1))',
  outline: 'none',
};

function TimeInput12({ value, onChange, disabled }) {
  const MENU_WIDTH = 180;
  const MENU_HEIGHT = 216;
  const parsed = parseTime12(value);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, openUp: false });
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const update = (part, nextValue) => {
    const next = { ...parsed, [part]: nextValue };
    onChange(toTime24(next.hour, next.minute, next.period));
  };

  const place = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const maxLeft = Math.max(8, window.innerWidth - MENU_WIDTH - 8);
    const openUp = r.bottom + 6 + MENU_HEIGHT > window.innerHeight - 8 && r.top > MENU_HEIGHT;
    setCoords({
      top: openUp ? r.top - 6 : r.bottom + 6,
      left: Math.min(Math.max(8, r.left), maxLeft),
      openUp,
    });
  };

  useEffect(() => {
    if (!open) return undefined;
    place();
    const onDocClick = (event) => {
      if (
        btnRef.current && !btnRef.current.contains(event.target) &&
        menuRef.current && !menuRef.current.contains(event.target)
      ) setOpen(false);
    };
    const onKey = (event) => event.key === 'Escape' && setOpen(false);
    const onScroll = (event) => {
      if (menuRef.current && menuRef.current.contains(event.target)) return;
      const el = btnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) setOpen(false);
      else place();
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, parsed.hour, parsed.minute, parsed.period]);

  const renderColumn = (items, selected, part) => (
    <div style={{ maxHeight: MENU_HEIGHT, overflowY: 'auto', padding: 4, borderRight: part === 'period' ? 'none' : '1px solid var(--bd)' }}>
      {items.map((item) => {
        const active = item === selected;
        return (
          <button
            key={item}
            type="button"
            onClick={() => {
              update(part, item);
              if (part === 'period') setOpen(false);
            }}
            style={{
              width: '100%',
              height: 28,
              border: 'none',
              borderRadius: 2,
              background: active ? '#0b84ff' : 'transparent',
              color: active ? '#fff' : 'var(--tx)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: active ? 700 : 500,
            }}
          >
            {item}
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        style={{
          height: 30,
          minWidth: 112,
          border: '1px solid var(--bd2, var(--bd))',
          borderRadius: 8,
          padding: '0 8px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          fontSize: 12.5,
          fontWeight: 700,
          color: disabled ? 'var(--tx3)' : 'var(--tx)',
          background: 'var(--bg1solid, var(--bg1))',
          cursor: disabled ? 'not-allowed' : 'pointer',
          flexShrink: 0,
        }}
      >
        {parsed.hour}:{parsed.minute} {parsed.period}
        <Clock size={12} style={{ color: 'var(--tx2)', flexShrink: 0 }} />
      </button>

      {open && !disabled && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            transform: coords.openUp ? 'translateY(-100%)' : 'none',
            width: MENU_WIDTH,
            zIndex: 10000,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            border: '1px solid var(--bd)',
            background: 'var(--bg1solid, var(--bg1))',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.18)',
            overflow: 'hidden',
          }}
        >
          {renderColumn(TIME_HOURS_12, parsed.hour, 'hour')}
          {renderColumn(TIME_MINUTES, parsed.minute, 'minute')}
          {renderColumn(['AM', 'PM'], parsed.period, 'period')}
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * Icon-only trigger that opens a small popover listing days with a time range
 * to copy from. Replaces a native <select> so the day list can be searched
 * visually without eating horizontal space next to the ranges.
 */
function CopyFromButton({ options, onPick, disabled, title }) {
  const MENU_WIDTH = 160;
  const MENU_MAX_HEIGHT = 200;
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, openUp: false });
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const place = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const maxLeft = Math.max(8, window.innerWidth - MENU_WIDTH - 8);
    const menuHeight = Math.min(MENU_MAX_HEIGHT, options.length * 34) + 32;
    const openUp = r.bottom + 6 + menuHeight > window.innerHeight - 8 && r.top > menuHeight;
    setCoords({
      top: openUp ? r.top - 6 : r.bottom + 6,
      left: Math.min(Math.max(8, r.left), maxLeft),
      openUp,
    });
  };

  useEffect(() => {
    if (!open) return undefined;
    place();
    const onDocClick = (event) => {
      if (
        btnRef.current && !btnRef.current.contains(event.target) &&
        menuRef.current && !menuRef.current.contains(event.target)
      ) setOpen(false);
    };
    const onKey = (event) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('resize', place);
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', place);
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onScroll = (event) => {
      if (menuRef.current && menuRef.current.contains(event.target)) return;
      const el = btnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) setOpen(false);
      else place();
    };
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [open, options.length]);

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        title={title}
        style={{
          display: 'grid',
          placeItems: 'center',
          width: 28,
          height: 28,
          borderRadius: 8,
          border: `1px solid ${open ? 'var(--blue)' : 'var(--bd)'}`,
          background: open ? 'rgba(59,130,246,.1)' : 'transparent',
          color: disabled ? 'var(--tx3)' : open ? 'var(--blue)' : 'var(--tx2)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <CopyPlus size={13} />
      </button>

      {open && !disabled && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            transform: coords.openUp ? 'translateY(-100%)' : 'none',
            width: MENU_WIDTH,
            maxWidth: 'calc(100vw - 16px)',
            zIndex: 10000,
            borderRadius: 10,
            border: '1px solid var(--bd)',
            background: 'var(--bg1solid, var(--bg1))',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.18)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '7px 10px', fontSize: 10.5, fontWeight: 700, color: 'var(--tx3)', borderBottom: '1px solid var(--bd)' }}>
            Copy from…
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto', padding: 4 }}>
            {options.map((sourceDay) => (
              <button
                key={sourceDay}
                type="button"
                onClick={() => {
                  onPick(sourceDay);
                  setOpen(false);
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '7px 9px',
                  borderRadius: 7,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--tx)',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg2)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                {titleCase(sourceDay)}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function ApplyToAllDaysButton({ options, onPick, disabled, title }) {
  const MENU_WIDTH = 180;
  const MENU_MAX_HEIGHT = 200;
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, openUp: false });
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const place = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const maxLeft = Math.max(8, window.innerWidth - MENU_WIDTH - 8);
    const menuHeight = Math.min(MENU_MAX_HEIGHT, options.length * 34) + 32;
    const openUp = r.bottom + 6 + menuHeight > window.innerHeight - 8 && r.top > menuHeight;
    setCoords({
      top: openUp ? r.top - 6 : r.bottom + 6,
      left: Math.min(Math.max(8, r.right - MENU_WIDTH), maxLeft),
      openUp,
    });
  };

  useEffect(() => {
    if (!open) return undefined;
    place();
    const onDocClick = (event) => {
      if (
        btnRef.current && !btnRef.current.contains(event.target) &&
        menuRef.current && !menuRef.current.contains(event.target)
      ) setOpen(false);
    };
    const onKey = (event) => event.key === 'Escape' && setOpen(false);
    const onScroll = (event) => {
      if (menuRef.current && menuRef.current.contains(event.target)) return;
      const el = btnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) setOpen(false);
      else place();
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, options.length]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        disabled={disabled}
        title={title}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          height: 32,
          padding: '0 12px',
          borderRadius: 8,
          border: '1px solid var(--bd)',
          background: 'rgba(59,130,246,.1)',
          color: disabled ? 'var(--tx3)' : 'var(--blue)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          fontSize: 11.5,
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}
      >
        <CopyPlus size={13} />
        Apply to all days
      </button>

      {open && !disabled && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            transform: coords.openUp ? 'translateY(-100%)' : 'none',
            width: MENU_WIDTH,
            maxWidth: 'calc(100vw - 16px)',
            zIndex: 10000,
            borderRadius: 10,
            border: '1px solid var(--bd)',
            background: 'var(--bg1solid, var(--bg1))',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.18)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '7px 10px', fontSize: 10.5, fontWeight: 700, color: 'var(--tx3)', borderBottom: '1px solid var(--bd)' }}>
            Use schedule from
          </div>
          <div style={{ maxHeight: MENU_MAX_HEIGHT, overflowY: 'auto', padding: 4 }}>
            {options.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => {
                  onPick(day);
                  setOpen(false);
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '7px 9px',
                  borderRadius: 7,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--tx)',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg2)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                {titleCase(day)}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export default function GlobalDetectionScheduling({ canEdit = true }) {
  const timezones = useTimezones();
  // Subscribed panel-wide, not per NVR: transitions for any camera are
  // worth seeing while verifying.
  const { events: scheduleEvents, clear: clearScheduleEvents } = useDetectionScheduleEvents();

  const [nvrs, setNvrs] = useState([]);
  const [nvrsLoading, setNvrsLoading] = useState(true);
  const [selectedNvrId, setSelectedNvrId] = useState('');

  const [nvrData, setNvrData] = useState(null);
  const [camerasLoading, setCamerasLoading] = useState(false);
  const [cameraSearch, setCameraSearch] = useState('');
  const [debouncedCameraSearch, setDebouncedCameraSearch] = useState('');
  const [cameraSearchLoading, setCameraSearchLoading] = useState(false);

  const [existingSchedule, setExistingSchedule] = useState(null);
  // The API allows several schedules per NVR (e.g. detector-scoped ones created
  // directly against the API); this panel edits one. Tracked so we can say so
  // rather than silently appearing to be the whole picture.
  const [otherScheduleCount, setOtherScheduleCount] = useState(0);
  // Other global schedules on this NVR that also enrol a camera this one
  // does — those cameras' actual runtime state is decided by whichever
  // schedule the resolver's "most specific, then most recently updated" tie
  // break picks, which can silently disagree with the schedule shown here.
  const [overlappingSchedules, setOverlappingSchedules] = useState([]);
  const [enrolled, setEnrolled] = useState(() => new Set());
  const [form, setForm] = useState(defaultForm);

  const [tab, setTab] = useState('nvr');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    let alive = true;
    getNvrs(0, 200)
      .then((result) => alive && setNvrs(result?.nvrs || []))
      .catch((error) => alive && toast.error(globalScheduleErrorMessage(error, 'Failed to load NVRs')))
      .finally(() => alive && setNvrsLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  /**
   * With no NVR picked yet (or after closing out of one back to the picker),
   * there's no per-camera polling running — but the NVR list itself can still
   * go stale while the admin sits on this screen. Keep it current too, silent
   * so it doesn't flash the loading state under them.
   */
  useEffect(() => {
    if (selectedNvrId) return undefined;
    const interval = setInterval(() => {
      getNvrs(0, 200)
        .then((result) => setNvrs(result?.nvrs || []))
        .catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [selectedNvrId]);

  const nvrLabels = useMemo(
    () => nvrs.map((nvr) => nvr.nvrName || nvr.deviceName || nvr._id),
    [nvrs],
  );

  const selectedNvrLabel = useMemo(() => {
    const nvr = nvrs.find((item) => item._id === selectedNvrId);
    return nvr ? nvr.nvrName || nvr.deviceName || nvr._id : '';
  }, [nvrs, selectedNvrId]);

  /**
   * Load an NVR's cameras and any schedule it already has. An existing schedule
   * seeds the form and the enrolment checkboxes so this reads as "edit", not
   * "create a duplicate".
   *
   * `silent` skips the loading spinner and leaves the editable form/enrolment
   * state alone — used for background refreshes (e.g. a scheduler event
   * coming in) so an in-progress edit is never clobbered or interrupted by a
   * full reload, only the read-only running/stopped badges are refreshed.
   */
  const loadNvr = useCallback(async (nvrId, { silent = false, search = '' } = {}) => {
    if (!silent) setCamerasLoading(true);
    try {
      const [cameras, schedules] = await Promise.all([
        getNvrCamerasForGlobalSchedule(nvrId, { search }),
        getGlobalSchedules(nvrId),
      ]);

      setNvrData(cameras);
      if (silent) return;

      // The list comes back newest-first; this panel edits the most recent.
      const schedule = schedules?.[0] || null;
      setExistingSchedule(schedule);
      const others = (schedules || []).slice(1);
      setOtherScheduleCount(others.length);

      // Which of THIS schedule's enrolled cameras are also enrolled (enabled)
      // in one of those other schedules — those cameras' actual on/off state
      // is decided by the resolver's tie break, not necessarily by what's
      // shown here, so call that out by name rather than only by count.
      const nameByChannelId = new Map(
        [...(cameras?.configuredCameras || []), ...(cameras?.nonConfiguredCameras || [])]
          .map((camera) => [String(camera.channelId), camera.name]),
      );
      const thisEnrolledIds = new Set(
        (schedule?.cameras || [])
          .filter((camera) => camera.enabled !== false)
          .map((camera) => String(camera.channelId)),
      );
      const overlaps = others
        .map((other) => {
          const sharedNames = (other.cameras || [])
            .filter((camera) => camera.enabled !== false && thisEnrolledIds.has(String(camera.channelId)))
            .map((camera) => nameByChannelId.get(String(camera.channelId)) || String(camera.channelId));
          return sharedNames.length ? { schedule: other, sharedNames } : null;
        })
        .filter(Boolean);
      setOverlappingSchedules(overlaps);

      if (schedule) {
        setEnrolled(
          new Set(
            (schedule.cameras || [])
              .filter((camera) => camera.enabled !== false)
              .map((camera) => String(camera.channelId)),
          ),
        );
        setForm({
          mode: schedule.schedule?.mode || 'custom',
          timezone: schedule.schedule?.timezone || DEFAULT_TIMEZONE,
          days: { ...emptyDays(), ...(schedule.schedule?.days || {}) },
        });
      } else {
        setEnrolled(new Set());
        setForm(defaultForm());
      }
    } catch (error) {
      if (silent) return;
      toast.error(globalScheduleErrorMessage(error, 'Failed to load cameras for this NVR'));
      setNvrData(null);
      setExistingSchedule(null);
      setOtherScheduleCount(0);
      setOverlappingSchedules([]);
    } finally {
      if (!silent) setCamerasLoading(false);
    }
  }, []);

  const handleNvrChange = (label) => {
    const nvr = nvrs.find((item) => (item.nvrName || item.deviceName || item._id) === label);
    if (!nvr) return;
    setSelectedNvrId(nvr._id);
    setTab('nvr');
    setCameraSearch('');
    setDebouncedCameraSearch('');
    loadNvr(nvr._id);
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedCameraSearch(cameraSearch.trim()), 400);
    return () => clearTimeout(timer);
  }, [cameraSearch]);

  useEffect(() => {
    if (!selectedNvrId) return undefined;
    setCameraSearchLoading(true);
    let alive = true;
    loadNvr(selectedNvrId, { silent: true, search: debouncedCameraSearch })
      .catch(() => {})
      .finally(() => {
        if (alive) setCameraSearchLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selectedNvrId, debouncedCameraSearch, loadNvr]);

  /**
   * The "running"/"stopped" badges reflect detection state as of the last
   * fetch, so a schedule boundary firing in the background (the cron runner
   * starting/stopping a camera) would otherwise only show up after a manual
   * page refresh. Each scheduler event is a live signal that state changed,
   * so re-fetch the open NVR — debounced, since one boundary can flip several
   * cameras at once and each fires its own event.
   */
  useEffect(() => {
    if (!scheduleEvents.length || !selectedNvrId) return undefined;
    const timer = setTimeout(() => {
      loadNvr(selectedNvrId, { silent: true, search: debouncedCameraSearch });
    }, 600);
    return () => clearTimeout(timer);
  }, [scheduleEvents, selectedNvrId, debouncedCameraSearch, loadNvr]);

  /**
   * Primary mechanism for keeping the running/stopped badges live: the socket
   * event above depends on the connection being authenticated and the event
   * actually being delivered, which is too many moving parts to rely on
   * alone. Polling on a short, unconditional interval is what actually
   * guarantees this camera list reflects the server-side schedule runner
   * (which ticks every ~60s) without the admin needing to reload the page —
   * for both a camera starting and a camera stopping.
   */
  useEffect(() => {
    if (!selectedNvrId) return undefined;
    const interval = setInterval(() => {
      loadNvr(selectedNvrId, { silent: true, search: debouncedCameraSearch });
    }, 10000);
    return () => clearInterval(interval);
  }, [selectedNvrId, debouncedCameraSearch, loadNvr]);

  const toggleEnrolled = (channelId) => {
    setEnrolled((current) => {
      const next = new Set(current);
      if (next.has(channelId)) next.delete(channelId);
      else next.add(channelId);
      return next;
    });
  };

  const configuredCameras = nvrData?.configuredCameras || [];
  const nonConfiguredCameras = nvrData?.nonConfiguredCameras || [];

  const allConfiguredSelected =
    configuredCameras.length > 0 && configuredCameras.every((camera) => enrolled.has(String(camera.channelId)));

  const toggleAll = () => {
    setEnrolled((current) => {
      const next = new Set(current);
      const visibleIds = configuredCameras.map((camera) => String(camera.channelId));
      if (allConfiguredSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const addRange = (day) => {
    setForm((current) => ({
      ...current,
      days: { ...current.days, [day]: [...(current.days?.[day] || []), { start: '09:00', end: '18:00' }] },
    }));
  };

  const updateRange = (day, index, field, value) => {
    setForm((current) => ({
      ...current,
      days: {
        ...current.days,
        [day]: (current.days?.[day] || []).map((range, i) => (i === index ? { ...range, [field]: value } : range)),
      },
    }));
  };

  const removeRange = (day, index) => {
    setForm((current) => ({
      ...current,
      days: { ...current.days, [day]: (current.days?.[day] || []).filter((_, i) => i !== index) },
    }));
  };

  const copyRangesFromDay = (sourceDay, targetDay) => {
    if (!sourceDay || sourceDay === targetDay) return;
    setForm((current) => {
      const sourceRanges = current.days?.[sourceDay] || [];
      if (!sourceRanges.length) return current;
      return {
        ...current,
        days: {
          ...current.days,
          [targetDay]: sourceRanges.map((range) => ({ ...range })),
        },
      };
    });
    toast.success(`${titleCase(sourceDay)} schedule copied to ${titleCase(targetDay)}.`);
  };

  const copyRangesToAllDays = (sourceDay) => {
    if (!sourceDay) return;
    setForm((current) => {
      const sourceRanges = current.days?.[sourceDay] || [];
      if (!sourceRanges.length) return current;
      const nextDays = {};
      DAYS.forEach((day) => {
        nextDays[day] = sourceRanges.map((range) => ({ ...range }));
      });
      return { ...current, days: nextDays };
    });
    toast.success(`${titleCase(sourceDay)} schedule copied to all days.`);
  };

  const handleSave = async () => {
    const enrolledIds = [...enrolled];
    const validationError = validateForm(form, enrolledIds.length);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    // Cameras previously enrolled but now unchecked are kept as disabled rows
    // rather than dropped, so un-enrolling is explicit and reversible.
    const previouslyEnrolled = (existingSchedule?.cameras || []).map((camera) => String(camera.channelId));
    const unenrolled = previouslyEnrolled.filter((id) => !enrolled.has(id));

    const payload = {
      schedule: buildSchedulePayload(form),
      cameras: [
        ...enrolledIds.map((channelId) => ({ channelId, enabled: true })),
        ...unenrolled.map((channelId) => ({ channelId, enabled: false })),
      ],
    };

    setSaving(true);
    try {
      if (existingSchedule?._id) {
        await updateGlobalSchedule(existingSchedule._id, payload);
      } else {
        await createGlobalSchedule({
          ...payload,
          nvrId: selectedNvrId,
          name: `${selectedNvrLabel} global schedule`,
        });
      }
      toast.success(`Global schedule saved. ${SCHEDULER_LAG_NOTE}`);
      await loadNvr(selectedNvrId, { search: debouncedCameraSearch });
    } catch (error) {
      toast.error(globalScheduleErrorMessage(error, 'Failed to save global schedule'));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!existingSchedule?._id) return;
    setRemoving(true);
    try {
      await deleteGlobalSchedule(existingSchedule._id);
      toast.success(
        `Global schedule removed. These cameras go back to their own schedules. ${SCHEDULER_LAG_NOTE}`,
      );
      await loadNvr(selectedNvrId, { search: debouncedCameraSearch });
    } catch (error) {
      toast.error(globalScheduleErrorMessage(error, 'Failed to remove global schedule'));
    } finally {
      setRemoving(false);
    }
  };

  const busy = saving || removing;

  return (
    <Panel>
      <PanelHeader
        icon={CalendarClock}
        title="Global Detection Scheduling"
        sub="Configure one detection schedule for many cameras on an NVR, instead of editing each camera individually. A global schedule takes priority over a camera's own schedule."
        action={
          existingSchedule ? (
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                padding: '4px 9px',
                borderRadius: 999,
                background: existingSchedule.enabled ? 'rgba(34,197,94,.12)' : 'rgba(148,163,184,.16)',
                color: existingSchedule.enabled ? '#16a34a' : 'var(--tx3)',
                whiteSpace: 'nowrap',
              }}
            >
              {existingSchedule.enabled ? 'ACTIVE' : 'DISABLED'}
            </span>
          ) : null
        }
      />

      <SchedulerNote style={{ marginBottom: 14 }} />

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div style={{ flex: '1 1 260px', minWidth: 220 }}>
          <FieldLabel>NVR</FieldLabel>
          <SearchableSelect
            value={selectedNvrLabel}
            options={nvrLabels}
            onChange={handleNvrChange}
            disabled={!canEdit || nvrsLoading || !nvrLabels.length}
            placeholder={nvrsLoading ? 'Loading NVRs…' : 'Select an NVR'}
            searchPlaceholder="Search NVRs…"
            emptyLabel="No NVRs found"
          />
        </div>

        {selectedNvrId && tab === 'nvr' && (
          <div style={{ flex: '1 1 260px', minWidth: 220 }}>
            <FieldLabel>Camera</FieldLabel>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                height: 38,
                padding: '0 10px',
                borderRadius: 9,
                background: 'var(--bg2)',
                border: '1px solid var(--bd)',
                opacity: camerasLoading ? 0.7 : 1,
              }}
            >
              {cameraSearchLoading ? (
                <Loader2 size={14} className="animate-spin" style={{ color: 'var(--tx3)', flexShrink: 0 }} />
              ) : (
                <Search size={14} style={{ color: 'var(--tx3)', flexShrink: 0 }} />
              )}
              <input
                type="text"
                value={cameraSearch}
                onChange={(event) => setCameraSearch(event.target.value)}
                disabled={camerasLoading}
                placeholder="Search cameras..."
                aria-label="Search cameras"
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: 0,
                  outline: 'none',
                  background: 'transparent',
                  color: 'var(--tx)',
                  fontSize: 12.5,
                  cursor: camerasLoading ? 'not-allowed' : 'text',
                }}
              />
              {cameraSearch && (
                <button
                  type="button"
                  onClick={() => setCameraSearch('')}
                  disabled={camerasLoading}
                  title="Clear camera search"
                  aria-label="Clear camera search"
                  style={{
                    display: 'grid',
                    placeItems: 'center',
                    width: 24,
                    height: 24,
                    borderRadius: 7,
                    border: '1px solid var(--bd)',
                    background: 'transparent',
                    color: 'var(--tx3)',
                    cursor: camerasLoading ? 'not-allowed' : 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {!selectedNvrId ? (
        <div style={{ padding: '18px 4px', fontSize: 12, color: 'var(--tx3)' }}>
          Select an NVR to see its cameras and configure a global schedule.
        </div>
      ) : camerasLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '18px 4px', fontSize: 12, color: 'var(--tx3)' }}>
          <Loader2 size={14} className="animate-spin" /> Loading cameras…
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <TabButton active={tab === 'nvr'} onClick={() => setTab('nvr')}>
              1. Cameras
            </TabButton>
            <TabButton active={tab === 'schedule'} onClick={() => setTab('schedule')}>
              2. Schedule
            </TabButton>
          </div>

          {otherScheduleCount > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 9,
                padding: '10px 12px',
                borderRadius: 10,
                marginBottom: 14,
                background: overlappingSchedules.length ? 'rgba(239,68,68,.08)' : 'rgba(234,179,8,.09)',
                border: `1px solid ${overlappingSchedules.length ? 'rgba(239,68,68,.28)' : 'rgba(234,179,8,.25)'}`,
              }}
            >
              <Info size={14} style={{ color: overlappingSchedules.length ? '#dc2626' : '#ca8a04', flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--tx2)' }}>
                <div>
                  This NVR has {otherScheduleCount + 1} global schedules. You are editing the most recent one; the other
                  {otherScheduleCount === 1 ? '' : 's'} stay as they are and may also govern some of these cameras.
                </div>
                {overlappingSchedules.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <strong style={{ color: '#dc2626' }}>
                      Conflict: the following camera{overlappingSchedules.some((o) => o.sharedNames.length > 1) ? 's are' : ' is'} also enrolled in another schedule.
                      Whichever schedule actually applies is decided by priority rules, so the running/stopped state may not match this one.
                    </strong>
                    {overlappingSchedules.map(({ schedule: other, sharedNames }) => (
                      <div key={other._id} style={{ marginTop: 4 }}>
                        <span style={{ fontWeight: 700, color: 'var(--tx)' }}>
                          "{other.name || 'Untitled schedule'}"
                        </span>
                        {' '}({other.enabled ? 'active' : 'disabled'}, {other.schedule?.mode === 'always' ? 'Always' : 'Custom'}) also enrols:{' '}
                        {sharedNames.join(', ')}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'nvr' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {nvrData?.nvr && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'var(--bg2)',
                    border: '1px solid var(--bd)',
                  }}
                >
                  <Server size={15} style={{ color: 'var(--tx3)', flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--tx)' }}>{nvrData.nvr.nvrName}</div>
                    <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>
                      {[nvrData.nvr.brand, nvrData.nvr.location].filter(Boolean).join(' · ')}
                      {` · ${nvrData.nvr.cameraCount} camera${nvrData.nvr.cameraCount === 1 ? '' : 's'}`}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)' }}>
                      Configured Cameras ({configuredCameras.length})
                    </div>
                    {/* The distinction the backend is careful about, said plainly. */}
                    <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>
                      Tick a camera to put it on this global schedule. This controls which schedule applies — it does not
                      start or stop detection by itself. Only detections actually applied to a camera are listed.
                    </div>
                  </div>
                  {configuredCameras.length > 0 && canEdit && (
                    <button
                      type="button"
                      onClick={toggleAll}
                      style={{
                        border: '1px solid var(--bd)',
                        background: 'transparent',
                        color: 'var(--tx2)',
                        borderRadius: 8,
                        padding: '5px 10px',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {allConfiguredSelected ? 'Clear all' : 'Select all'}
                    </button>
                  )}
                </div>

                {configuredCameras.length === 0 ? (
                  <div style={{ fontSize: 11.5, color: 'var(--tx3)', padding: '10px 0' }}>
                    {debouncedCameraSearch
                      ? `No configured cameras match "${debouncedCameraSearch}".`
                      : 'No cameras on this NVR are configured for detection yet, so there is nothing to schedule.'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {configuredCameras.map((camera) => {
                      const id = String(camera.channelId);
                      const isEnrolled = enrolled.has(id);
                      const runningCount = (camera.configuredDetectors || []).filter((d) => d.enabled).length;
                      return (
                        <label
                          key={id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '9px 11px',
                            borderRadius: 10,
                            border: `1px solid ${isEnrolled ? 'var(--blue)' : 'var(--bd)'}`,
                            background: isEnrolled ? 'rgba(59,130,246,.06)' : 'var(--bg2)',
                            cursor: canEdit ? 'pointer' : 'not-allowed',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isEnrolled}
                            disabled={!canEdit}
                            onChange={() => toggleEnrolled(id)}
                            style={{ width: 15, height: 15, accentColor: 'var(--blue)', flexShrink: 0 }}
                          />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--tx)' }}>{camera.name}</div>
                            <DetectorChips detectors={camera.configuredDetectors} />
                          </div>
                          {/* Read-only live state, kept visually distinct from the checkbox. */}
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '3px 8px',
                              borderRadius: 999,
                              background: runningCount ? 'rgba(34,197,94,.12)' : 'rgba(148,163,184,.16)',
                              color: runningCount ? '#16a34a' : 'var(--tx3)',
                              whiteSpace: 'nowrap',
                              flexShrink: 0,
                            }}
                            title="Current detection state, reported by the detection service"
                          >
                            {runningCount ? `${runningCount} running` : 'stopped'}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {nonConfiguredCameras.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)', marginBottom: 4 }}>
                    Non-Configured Cameras ({nonConfiguredCameras.length})
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 8 }}>
                    These have no detection configured, so they cannot be added to a global schedule.
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {nonConfiguredCameras.map((camera) => (
                      <span
                        key={String(camera.channelId)}
                        style={{
                          fontSize: 11.5,
                          padding: '6px 10px',
                          borderRadius: 8,
                          border: '1px dashed var(--bd)',
                          color: 'var(--tx3)',
                        }}
                      >
                        {camera.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
                <div>
                  <FieldLabel>
                    <Globe size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
                    Time zone
                  </FieldLabel>
                  <SearchableSelect
                    value={form.timezone}
                    options={timezones}
                    onChange={(tz) => setForm((current) => ({ ...current, timezone: tz }))}
                    disabled={!canEdit || form.mode === 'always' || !timezones.length}
                    placeholder={timezones.length ? 'Select time zone' : 'Loading time zones…'}
                    searchPlaceholder="Search time zones…"
                    emptyLabel="No time zones found"
                  />
                </div>
                <div>
                  <FieldLabel>
                    <Clock size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
                    Mode
                  </FieldLabel>
                  <SearchableSelect
                    value={form.mode === 'always' ? 'Always' : 'Custom'}
                    options={['Always', 'Custom']}
                    onChange={(value) => setForm((current) => ({ ...current, mode: value.toLowerCase() }))}
                    disabled={!canEdit}
                    placeholder="Select mode"
                  />
                </div>
              </div>

              {form.mode === 'always' ? (
                <div
                  style={{
                    padding: '14px 16px',
                    borderRadius: 10,
                    background: 'var(--bg2)',
                    border: '1px solid var(--bd)',
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--tx)', marginBottom: 5 }}>Always mode</div>
                  <div style={{ fontSize: 11.5, lineHeight: 1.6, color: 'var(--tx2)' }}>
                    Detection stays on continuously for every enrolled camera. Daily time ranges are not needed. Switch to
                    Custom to define active days and times.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <ApplyToAllDaysButton
                      options={DAYS.filter((day) => (form.days?.[day] || []).length)}
                      disabled={!canEdit || !DAYS.some((day) => (form.days?.[day] || []).length)}
                      onPick={copyRangesToAllDays}
                      title="Choose a day schedule to apply to every day"
                    />
                  </div>
                  {DAYS.map((day) => {
                    const ranges = form.days?.[day] || [];
                    const copyOptions = DAYS.filter((sourceDay) => sourceDay !== day && (form.days?.[sourceDay] || []).length);
                    return (
                      <div
                        key={day}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 4,
                          padding: '10px 12px',
                          background: 'var(--bg2)',
                          border: '1px solid var(--bd)',
                          borderRadius: 10,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, width: 100, flexShrink: 0, paddingTop: 3 }}>
                          <Calendar size={14} style={{ color: 'var(--tx3)' }} />
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--tx)' }}>{titleCase(day)}</span>
                        </div>

                        {canEdit && (
                          <div style={{ paddingTop: 1, marginRight: 10, flexShrink: 0 }}>
                            <CopyFromButton
                              options={copyOptions}
                              disabled={copyOptions.length === 0}
                              onPick={(sourceDay) => copyRangesFromDay(sourceDay, day)}
                              title={copyOptions.length ? `Copy another day's schedule to ${titleCase(day)}` : 'No other day has a time range to copy'}
                            />
                          </div>
                        )}

                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {ranges.length === 0 ? (
                            <span style={{ fontSize: 11.5, color: 'var(--tx3)', paddingTop: 4 }}>No ranges — detection stays off</span>
                          ) : (
                            ranges.map((range, index) => (
                              <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <TimeInput12
                                  value={range.start || '09:00'}
                                  disabled={!canEdit}
                                  onChange={(value) => updateRange(day, index, 'start', value)}
                                />
                                <span style={{ fontSize: 12, color: 'var(--tx2)' }}>to</span>
                                <TimeInput12
                                  value={range.end || '18:00'}
                                  disabled={!canEdit}
                                  onChange={(value) => updateRange(day, index, 'end', value)}
                                />
                                {canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => removeRange(day, index)}
                                    title="Remove time range"
                                    style={{
                                      display: 'grid',
                                      placeItems: 'center',
                                      width: 28,
                                      height: 28,
                                      borderRadius: 8,
                                      border: '1px solid var(--bd)',
                                      background: 'transparent',
                                      color: '#ef4444',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            ))
                          )}
                        </div>

                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => addRange(day)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              border: '1px solid var(--bd)',
                              background: 'transparent',
                              color: 'var(--tx2)',
                              borderRadius: 8,
                              padding: '5px 10px',
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: 'pointer',
                              flexShrink: 0,
                            }}
                          >
                            <Plus size={12} /> Add
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
              marginTop: 16,
              paddingTop: 14,
              borderTop: '1px solid var(--bd)',
            }}
          >
            <div style={{ fontSize: 11, color: 'var(--tx3)', minWidth: 0 }}>
              {enrolled.size} camera{enrolled.size === 1 ? '' : 's'} on this schedule · takes effect within ~1 minute
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {existingSchedule?._id && canEdit && (
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={busy}
                  style={{
                    border: '1px solid var(--bd)',
                    background: 'transparent',
                    color: '#ef4444',
                    borderRadius: 9,
                    padding: '8px 14px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: busy ? 'not-allowed' : 'pointer',
                    opacity: busy ? 0.6 : 1,
                  }}
                >
                  {removing ? 'Removing…' : 'Remove global schedule'}
                </button>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={!canEdit || busy}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  border: 'none',
                  background: 'var(--blue)',
                  color: '#fff',
                  borderRadius: 9,
                  padding: '8px 16px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: !canEdit || busy ? 'not-allowed' : 'pointer',
                  opacity: !canEdit || busy ? 0.6 : 1,
                }}
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <CalendarClock size={13} />}
                {saving ? 'Saving…' : existingSchedule ? 'Update global schedule' : 'Save global schedule'}
              </button>
            </div>
          </div>
        </>
      )}

      <SchedulerActivity events={scheduleEvents} onClear={clearScheduleEvents} />
    </Panel>
  );
}
