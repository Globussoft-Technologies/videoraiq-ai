import { useEffect, useRef, useState } from 'react';
import moment from 'moment';
import { LogIn, LogOut, Clock, X, Mail, Building2, MapPin, ImageOff } from 'lucide-react';
import { Panel } from '../../../components/primitives';
import { AsyncBoundary } from '../../../components/States';
import { useAttendanceSocket } from '../../../context/AttendanceSocketContext';

// Matches v1's AttendanceLogsLive: the Dubai deployment says "golf premise".
// Unset (the default) falls back to the generic wording.
const IS_DUBAI = import.meta.env.VITE_ORGANISATION_ID === 'dubai';

/** Announce an event via the Web Speech API. Silent where unsupported. */
function speak(text) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  try {
    const utter = new window.SpeechSynthesisUtterance(text);
    utter.rate = 1;
    utter.pitch = 1;
    utter.volume = 1;
    utter.lang = 'en-US';
    window.speechSynthesis.speak(utter);
  } catch {
    // speech is best-effort — never break the feed over it
  }
}

function buildMessage(it) {
  const action = it.cameraType === 'checkin' ? 'Entered' : 'Exited';
  const time = it.timestamp && moment(it.timestamp).isValid()
    ? moment(it.timestamp).format('HH:mm:ss')
    : '';
  const where = IS_DUBAI ? 'golf premise' : 'premise';
  return `${it.fullName || it.name} ${action} ${where}${time ? ` at ${time}` : ''}`;
}

const DEPT_COLORS = [
  'var(--cyan)',
  'var(--blue)',
  'var(--violet)',
  'var(--ok)',
  'var(--warn)',
  'var(--magenta)'
];

function getAvatarBorderColor(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('padma')) return 'var(--cyan)';
  if (n.includes('shalini')) return 'var(--cyan)';
  if (n.includes('rajashekhar')) return 'var(--warn)';
  if (n.includes('ajanya')) return 'var(--ok)';
  if (n.includes('bharathi')) return 'var(--blue)';
  if (n.includes('soni')) return 'var(--violet)';

  // Fallback to name hash
  let hash = 0;
  for (let i = 0; i < n.length; i++) {
    hash = n.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % DEPT_COLORS.length;
  return DEPT_COLORS[index];
}

const IMAGE_URL = import.meta.env.VITE_INCIDENT_URL || `${import.meta.env.VITE_BACKEND}/uploads/`;

/**
 * Prepend the uploads base URL to a relative path.
 * Absolute URLs (https://...) pass through unchanged.
 */
function img(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return `${IMAGE_URL}${path}`;
}

/**
 * Map one REST attendance log item to display fields.
 *
 * REST shape (from /attendance/get, confirmed via V1 AttendanceLog.jsx):
 *   item.employee.firstName / lastName / profilePics[0] / departmentId.departmentName
 *   item.logInTime   — "09:00:00" or null
 *   item.logOutTime  — "17:00:00" or null
 *   item.date        — "2024-01-15"
 *   item.imageUrls[0].images.{person|face|frame}
 */
function mapRestItem(item) {
  const emp = item.employee || {};
  const firstName = emp.firstName || '';
  const lastName = emp.lastName || '';

  let name = firstName.trim();
  if (!name) {
    const fullName = emp.name || `${firstName} ${lastName}`.trim() || 'Unknown';
    name = fullName.split(' ')[0];
  }

  const dept =
    emp.departmentId?.departmentName ||
    emp.departmentName ||
    emp.designation ||
    '';

  // Profile photo
  const profilePic = emp.profilePics?.[0] ? img(emp.profilePics[0]) : null;

  // Captured frame from the check-in event
  const captureImg =
    item.imageUrls?.[0]?.images?.person ||
    item.imageUrls?.[0]?.images?.face ||
    item.imageUrls?.[0]?.images?.frame;
  const capturedImage = captureImg ? img(captureImg) : null;

  // A REST row covers a whole day. Show the time of the event the card is
  // actually reporting — the checkout if there is one, otherwise the check-in —
  // so the time can't contradict the status dot and the modal.
  const isOut = !!item.logOutTime;
  const eventTime = isOut ? item.logOutTime : item.logInTime;

  // logInTime/logOutTime are bare "HH:mm:ss" strings with no date. Feeding one
  // straight to moment() yields today-at-that-time (or invalid), which showed
  // the wrong date in the modal for historical rows — combine with item.date.
  let timestamp = null;
  if (eventTime && item.date && /^\d{2}:\d{2}(:\d{2})?$/.test(eventTime)) {
    const m = moment(`${item.date} ${eventTime}`, ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD HH:mm']);
    if (m.isValid()) timestamp = m.toISOString();
  } else if (eventTime) {
    const m = moment(eventTime);
    if (m.isValid()) timestamp = m.toISOString();
  } else if (item.date) {
    const m = moment(item.date);
    if (m.isValid()) timestamp = m.toISOString();
  }

  let timeStr = eventTime || item.date || '';
  if (timeStr) {
    if (/^\d{2}:\d{2}:\d{2}$/.test(timeStr)) {
      timeStr = timeStr.substring(0, 5);
    } else if (/^\d{2}:\d{2}$/.test(timeStr)) {
      // already HH:mm
    } else {
      const m = moment(timeStr);
      if (m.isValid()) {
        timeStr = m.format('HH:mm');
      }
    }
  }

  return {
    key: `${emp._id || item._id || 'unknown'}_${item.date || ''}`,
    empKey: emp._id || '',
    name,
    fullName: `${firstName} ${lastName}`.trim() || name,
    dept,
    profilePic,
    capturedImage,
    timeStr,
    hasOut: isOut,
    cameraType: isOut ? 'checkout' : 'checkin',
    timestamp,
    premise: emp.locationId?.locationName || emp.locationId?.name || emp.location || '',
    email: emp.email || '',
    empId: emp.employeeId || emp.empId || '',
    designation: emp.designation || emp.role || '',
  };
}

/**
 * Map one live socket event to display fields.
 *
 * Socket shape (attendanceLog_<adminId>, confirmed via V1 AttendanceLogsLive.jsx):
 *   data.attendance.employee.firstName / lastName / profilePics[0] / departmentId.departmentName
 *   data.attendance.event.cameraType — "checkin" | "checkout"
 *   data.attendance.event.timestamp
 *   data.attendance.imageUrls[0].images.{person|face|frame}
 */
function mapSocketItem(data) {
  const emp = data?.attendance?.employee || {};
  const event = data?.attendance?.event || {};
  const firstName = emp.firstName || '';
  const lastName = emp.lastName || '';

  let name = firstName.trim();
  if (!name) {
    const fullName = emp.name || `${firstName} ${lastName}`.trim() || 'Unknown';
    name = fullName.split(' ')[0];
  }

  const dept =
    emp.departmentId?.departmentName ||
    emp.departmentName ||
    emp.designation ||
    '';

  const profilePic = emp.profilePics?.[0] ? img(emp.profilePics[0]) : null;

  // Same candidate order as v1's resolveCapturedImage, including the event-level
  // `image` and root `imageUrls` paths that were previously missed — without
  // them the captured frame came back empty for several payload shapes.
  const captureImg =
    data?.attendance?.imageUrls?.[0]?.images?.person ||
    data?.attendance?.imageUrls?.[0]?.images?.face ||
    data?.attendance?.imageUrls?.[0]?.images?.frame ||
    event?.images?.person ||
    event?.images?.face ||
    event?.images?.frame ||
    event?.image ||
    data?.imageUrls?.[0]?.images?.person ||
    data?.imageUrls?.[0]?.images?.face ||
    data?.imageUrls?.[0]?.images?.frame;
  const capturedImage = captureImg ? img(captureImg) : null;

  const timeStr = event.timestamp && moment(event.timestamp).isValid()
    ? moment(event.timestamp).format('HH:mm')
    : '';

  return {
    // Keying on employee alone collapsed a person's check-in and check-out into
    // one card, so the later event silently replaced the earlier one. v1 keys on
    // employee + cameraType + timestamp; match it so both events survive.
    key: `${emp._id || 'unknown'}_${event.cameraType || ''}_${event.timestamp || ''}`,
    // Separate from `key`: used to suppress the REST row for someone who
    // already has a live event. The two mappers build `key` in different
    // formats, so matching on `key` would never hit and both would render.
    empKey: emp._id || '',
    name,
    fullName: `${firstName} ${lastName}`.trim() || name,
    dept,
    profilePic,
    capturedImage,
    timeStr,
    hasOut: event.cameraType === 'checkout',
    cameraType: event.cameraType || '',
    timestamp: event.timestamp,
    premise:
      data?.nvrData?.nvrName ||
      data?.attendance?.nvrData?.nvrName ||
      event?.nvrData?.nvrName ||
      emp.locationId?.locationName ||
      emp.locationId?.name ||
      (IS_DUBAI ? 'Golf Premise' : ''),
    email: emp.email || '',
    empId: emp.employeeId || emp.empId || '',
    designation: emp.designation || emp.role || '',
  };
}

/** Merge live socket events on top of the REST snapshot, live events win on
 * duplicate employee (same dedup key), newest first. */
function mergeAttendance(restPeople, socketLogs) {
  const restItems = (Array.isArray(restPeople) ? restPeople : []).map(mapRestItem);
  const liveItems = (Array.isArray(socketLogs) ? socketLogs : []).map(mapSocketItem);
  // Match on employee, not on `key` — the two mappers build `key` differently
  // (socket includes cameraType+timestamp), so a key-based check never matched
  // and the same person rendered as two cards with contradictory status dots.
  const seen = new Set(liveItems.map((i) => i.empKey).filter(Boolean));
  const merged = [...liveItems, ...restItems.filter((i) => !i.empKey || !seen.has(i.empKey))];
  return merged.slice(0, 12);
}

/* ── Detail modal ─────────────────────────────────────────────────────────── */
function DetailModal({ item, onClose }) {
  const [capState, setCapState]   = useState(item.capturedImage ? 'loading' : 'empty');
  const [profState, setProfState] = useState(item.profilePic ? 'loading' : 'empty');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isCheckIn = item.cameraType === 'checkin';
  const time = item.timestamp && moment(item.timestamp).isValid()
    ? moment(item.timestamp).format('DD MMM YYYY, HH:mm:ss')
    : '--';

  const rows = [
    { icon: isCheckIn ? <LogIn size={14} style={{ color: 'var(--ok)' }} /> : <LogOut size={14} style={{ color: 'var(--warn)' }} />,
      text: `${isCheckIn ? 'Entered' : 'Exited'} ${IS_DUBAI ? 'golf premise' : 'premise'}` },
    { icon: <Clock size={14} style={{ color: 'var(--tx3)' }} />, text: time },
    IS_DUBAI && item.premise ? { icon: <MapPin size={14} style={{ color: 'var(--tx3)' }} />, text: item.premise } : null,
    item.designation ? { icon: <Building2 size={14} style={{ color: 'var(--tx3)' }} />, text: item.designation } : null,
    item.email ? { icon: <Mail size={14} style={{ color: 'var(--tx3)' }} />, text: item.email } : null,
  ].filter(Boolean);

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(4,6,12,.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, boxSizing: 'border-box' }}
    >
      <style>{`
        @media (max-width: 720px) {
          .vq-att-modal-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{ width: 'min(820px, 96vw)', maxHeight: '92vh', overflowY: 'auto', background: 'var(--bg1solid)', border: '1px solid var(--bd)', borderRadius: 14, boxShadow: '0 24px 64px rgba(0,0,0,.4)', boxSizing: 'border-box' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--bd)' }}>
          <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--tx)' }}>
            {IS_DUBAI ? 'Details' : 'Attendance Details'}
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--bd)', background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--tx3)' }}
          >
            <X size={14} />
          </button>
        </div>

        <div className="vq-att-modal-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr)', gap: 18, padding: 18 }}>
          {/* Captured frame */}
          <div style={{ position: 'relative', background: '#000', borderRadius: 12, border: '1px solid var(--bd)', overflow: 'hidden', minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {item.capturedImage ? (
              <>
                {capState !== 'loaded' && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'rgba(255,255,255,.7)' }}>
                    {capState === 'error'
                      ? <><ImageOff size={26} /><span style={{ fontSize: 11 }}>Image unavailable</span></>
                      : <><span style={{ width: 26, height: 26, borderRadius: '50%', border: '2px solid rgba(255,255,255,.8)', borderTopColor: 'transparent', animation: 'vq-spin .7s linear infinite' }} /><span style={{ fontSize: 11 }}>Loading image…</span></>}
                  </div>
                )}
                <img
                  src={item.capturedImage}
                  alt={`${item.fullName || item.name} captured`}
                  onLoad={() => setCapState('loaded')}
                  onError={() => setCapState('error')}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: capState === 'loaded' ? 1 : 0, transition: 'opacity .2s' }}
                />
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,.6)' }}>
                <ImageOff size={26} />
                <span style={{ fontSize: 11 }}>No captured image</span>
              </div>
            )}
          </div>

          {/* Identity + facts */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 12, padding: 14 }}>
              <div style={{ position: 'relative', width: 116, height: 150, borderRadius: 8, overflow: 'hidden', background: 'var(--bg3)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {item.profilePic && profState !== 'error' ? (
                  <img
                    src={item.profilePic}
                    alt={item.fullName || item.name}
                    onLoad={() => setProfState('loaded')}
                    onError={() => setProfState('error')}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 34, fontWeight: 700, color: 'var(--tx3)' }}>
                    {(item.name || '?')[0].toUpperCase()}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx)', textAlign: 'center', wordBreak: 'break-word' }}>
                {item.fullName || item.name}
              </div>
              {item.dept && (
                <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--blue)', background: 'rgba(59,130,246,.12)', border: '1px solid rgba(59,130,246,.25)', borderRadius: 20, padding: '3px 10px', textTransform: 'capitalize' }}>
                  {item.dept}
                </span>
              )}
            </div>

            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rows.map((r, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12.5, color: 'var(--tx2)' }}>
                  <span style={{ flexShrink: 0, marginTop: 1 }}>{r.icon}</span>
                  <span style={{ minWidth: 0, wordBreak: 'break-word' }}>{r.text}</span>
                </li>
              ))}
              {item.empId && (
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: 'var(--tx3)' }}>
                  <span style={{ fontWeight: 600, flexShrink: 0 }}>Employee ID:</span>
                  <span style={{ minWidth: 0, wordBreak: 'break-word' }}>{item.empId}</span>
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Live attendance strip — REST snapshot on load, then live socket check-ins
 * (attendanceLog_<adminId>) merged on top as they arrive. */
export default function LiveAttendance({ people = [], socketLogs = [], loading, error, isEmpty, onRetry }) {
  const items = mergeAttendance(people, socketLogs);
  const present = items.length;

  const { isMuted } = useAttendanceSocket() || {};
  const isMutedRef = useRef(isMuted);
  useEffect(() => {
    isMutedRef.current = isMuted;
    // Cut off anything already queued the moment the user mutes.
    if (isMuted && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, [isMuted]);

  const [selected, setSelected] = useState(null);

  // Announce live arrivals only. Deliberately driven by `socketLogs`, NOT the
  // merged `items`: the REST snapshot resolves asynchronously after mount, so
  // seeding from `items` captured an empty list and then read out the entire
  // day's history on every page load. REST rows are past events by definition —
  // only socket events are new. `null` until the first run so any events
  // already buffered by the context aren't replayed.
  const seenIdsRef = useRef(null);
  useEffect(() => {
    const live = (Array.isArray(socketLogs) ? socketLogs : []).map(mapSocketItem);
    if (seenIdsRef.current === null) {
      seenIdsRef.current = new Set(live.map(i => i.key));
      return;
    }
    const seen = seenIdsRef.current;
    const fresh = live.filter(i => !seen.has(i.key));
    // socketLogs is newest-first; announce in arrival order.
    fresh.slice().reverse().forEach((it) => {
      if (!isMutedRef.current) {
        const dept = it.dept && it.dept !== '--' ? it.dept : 'Employee';
        speak(`${dept} ${it.cameraType === 'checkin' ? 'entered' : 'exit'}`);
      }
      seen.add(it.key);
    });
  }, [socketLogs]);

  return (
    <Panel className="overflow-hidden flex-1 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-[13px] pb-[11px] border-b border-[var(--bd)]">
        <span className="vq-glowpulse w-[7px] h-[7px] rounded-full bg-[var(--ok)] shadow-[0_0_8px_var(--ok)]" />
        <span className="font-[family-name:var(--disp)] font-semibold text-sm">
          {IS_DUBAI ? 'Live Notifications' : 'Live Attendance'}
        </span>
        <span className="font-[family-name:var(--mono)] text-[10px] text-[var(--tx3)]">
          {IS_DUBAI ? 'live events' : 'face check-in'}
        </span>
        <span className="ml-auto flex items-center gap-3">
          <span className="font-[family-name:var(--mono)] text-[10.5px] text-[var(--tx2)]">
            <span className="text-[var(--ok)] font-semibold">{present}</span> present
          </span>
        </span>
      </div>

      {/* Cards */}
      <AsyncBoundary
        loading={loading}
        error={error}
        isEmpty={isEmpty}
        onRetry={onRetry}
        minH={120}
        emptyLabel="No check-ins yet today"
      >
        {() => (
          <div className="vq-scroll flex gap-2.5 overflow-x-auto px-2.5 py-[13px]">
            {items.map((p) => (
              <div
                key={p.key}
                onClick={() => setSelected(p)}
                title={buildMessage(p)}
                className="flex-none w-[104px] bg-[var(--bg2)] border border-[var(--bd)] rounded-xl px-2 py-3 text-center cursor-pointer hover:border-[var(--blue)] transition-colors"
              >
                {/* Avatar wrapper */}
                <div className="relative w-[46px] h-[46px] mx-auto mb-2">
                  {/* status dot */}
                  <span
                    className="absolute -top-px -right-px z-[2] w-2 h-2 rounded-full border-[1.5px] border-[var(--bg2)]"
                    style={{
                      background: p.hasOut ? 'var(--warn)' : 'var(--ok)',
                      boxShadow: `0 0 6px ${p.hasOut ? 'var(--warn)' : 'var(--ok)'}`,
                    }}
                  />

                  {/* Avatar — prefer profile photo, then captured image, then initials */}
                  {(p.profilePic || p.capturedImage) ? (
                    <img
                      src={p.profilePic || p.capturedImage}
                      alt={p.name}
                      className="w-[46px] h-[46px] rounded-full object-cover"
                      style={{ boxShadow: `0 0 0 2px ${getAvatarBorderColor(p.name)}` }}
                      onError={(e) => {
                        // fall through to initials if image fails
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextSibling && (e.currentTarget.nextSibling.style.display = 'flex');
                      }}
                    />
                  ) : null}
                  {/* Initials fallback (always rendered, hidden when photo is visible) */}
                  <div
                    className="w-[46px] h-[46px] rounded-full bg-[linear-gradient(135deg,var(--blue),var(--violet))] text-white items-center justify-center font-[family-name:var(--mono)] text-[13px] font-semibold"
                    style={{
                      display: (p.profilePic || p.capturedImage) ? 'none' : 'flex',
                      boxShadow: `0 0 0 2px ${getAvatarBorderColor(p.name)}`,
                    }}
                  >
                    {(p.name || '?')[0].toUpperCase()}
                  </div>
                </div>

                <div className="text-[11.5px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis text-[var(--tx)]">
                  {p.name}
                </div>
                {p.dept && (
                  <div className="text-[9.5px] text-[var(--tx3)] mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis capitalize">
                    {p.dept}
                  </div>
                )}
                {p.timeStr && (
                  <div className="font-[family-name:var(--mono)] text-[9.5px] text-[var(--ok)] mt-[5px]">
                    {p.timeStr}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </AsyncBoundary>

      {selected && <DetailModal item={selected} onClose={() => setSelected(null)} />}
    </Panel>
  );
}
