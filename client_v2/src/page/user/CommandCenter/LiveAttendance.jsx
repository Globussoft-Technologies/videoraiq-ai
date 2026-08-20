import { useEffect, useRef, useState } from 'react';
import moment from 'moment';
import { LogIn, LogOut, Clock, X, Mail, Building2, MapPin, ImageOff, Settings, Check } from 'lucide-react';
import { Panel } from '../../../components/primitives';
import { AsyncBoundary } from '../../../components/States';
import { useAttendanceSocket } from '../../../context/AttendanceSocketContext';

// Matches v1's AttendanceLogsLive: the Dubai deployment says "golf premise".
// Unset (the default) falls back to the generic wording.
const IS_DUBAI = import.meta.env.VITE_ORGANISATION_ID === 'dubai';
const ANNOUNCEMENT_MODE_KEY = 'vq_live_attendance_announcement_mode';
const ANNOUNCEMENT_MODES = {
  department: 'department',
  person: 'person',
};

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

function initialAnnouncementMode() {
  if (typeof window === 'undefined') return ANNOUNCEMENT_MODES.department;
  try {
    const saved = window.localStorage.getItem(ANNOUNCEMENT_MODE_KEY);
    return saved === ANNOUNCEMENT_MODES.person ? ANNOUNCEMENT_MODES.person : ANNOUNCEMENT_MODES.department;
  } catch {
    return ANNOUNCEMENT_MODES.department;
  }
}

function buildAnnouncement(item, mode) {
  const isCheckIn = item.cameraType === 'checkin';
  const action = isCheckIn ? 'entered' : 'exit';
  if (mode === ANNOUNCEMENT_MODES.person) {
    const name = item.fullName || item.name || 'Employee';
    return `${name} ${action}`;
  }
  const dept = item.dept && item.dept !== '--' ? item.dept : 'Employee';
  return `${dept} ${action}`;
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

/** Live attendance strip — purely live socket check-ins (attendanceLog_<adminId>),
 * matching v1's AttendanceLogsLive.jsx: no REST snapshot, so the panel is empty
 * until the first live event arrives after mount. */
export default function LiveAttendance() {
  const { attendanceLogs, isMuted } = useAttendanceSocket() || {};
  const items = (Array.isArray(attendanceLogs) ? attendanceLogs : []).map(mapSocketItem).slice(0, 12);
  const present = items.length;
  const [announcementMode, setAnnouncementMode] = useState(initialAnnouncementMode);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(null);
  const announcementModeRef = useRef(announcementMode);

  const isMutedRef = useRef(isMuted);
  useEffect(() => {
    isMutedRef.current = isMuted;
    // Cut off anything already queued the moment the user mutes.
    if (isMuted && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, [isMuted]);

  useEffect(() => {
    announcementModeRef.current = announcementMode;
    try {
      window.localStorage.setItem(ANNOUNCEMENT_MODE_KEY, announcementMode);
    } catch {
      // Local storage can be unavailable in restricted browser modes.
    }
  }, [announcementMode]);

  useEffect(() => {
    if (!settingsOpen) return undefined;
    const onPointerDown = (event) => {
      if (!settingsRef.current?.contains(event.target)) setSettingsOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [settingsOpen]);

  const [selected, setSelected] = useState(null);

  // Announce live arrivals only. `null` until the first run so any events
  // already buffered by the context before mount aren't replayed.
  const seenIdsRef = useRef(null);
  useEffect(() => {
    if (seenIdsRef.current === null) {
      seenIdsRef.current = new Set(items.map(i => i.key));
      return;
    }
    const seen = seenIdsRef.current;
    const fresh = items.filter(i => !seen.has(i.key));
    // attendanceLogs is newest-first; announce in arrival order.
    fresh.slice().reverse().forEach((it) => {
      if (!isMutedRef.current) {
        speak(buildAnnouncement(it, announcementModeRef.current));
      }
      seen.add(it.key);
    });
  }, [items]);

  return (
    <Panel className="overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-[13px] pb-[11px] border-b border-[var(--bd)]">
        <span className="vq-glowpulse w-[7px] h-[7px] rounded-full bg-[var(--ok)] shadow-[0_0_8px_var(--ok)]" />
        <span className="font-[family-name:var(--disp)] font-semibold text-sm">
          {IS_DUBAI ? 'Live Notifications' : 'Live Attendance'}
        </span>
        <span className="font-[family-name:var(--mono)] text-[10px] text-[var(--tx3)]">
          {IS_DUBAI ? 'live events' : ''}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <span ref={settingsRef} style={{ position: 'relative', display: 'inline-flex', flex: '0 0 auto' }}>
            <button
              type="button"
              onClick={() => setSettingsOpen((open) => !open)}
              aria-label="Attendance announcement settings"
              title="Attendance announcement settings"
              style={{
                height: 26,
                padding: '0 10px',
                borderRadius: 8,
                border: '1px solid var(--bd)',
                background: 'var(--bg2)',
                color: 'var(--tx2)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                cursor: 'pointer',
              }}
            >
              <Settings size={14} strokeWidth={1.8} />
              <span style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                Announcement settings
              </span>
            </button>
            {settingsOpen && (
              <div
                className="absolute right-0 top-[34px] z-20 w-[230px] rounded-xl border border-[var(--bd)] bg-[var(--bg1solid)] shadow-[0_18px_44px_rgba(15,23,42,.22)] p-2"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <div className="px-2 pt-1 pb-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[.08em] text-[var(--tx3)]">
                  Announcement settings
                </div>
                {[
                  { key: ANNOUNCEMENT_MODES.department, label: 'Department Based' },
                  { key: ANNOUNCEMENT_MODES.person, label: 'Person Name Based' },
                ].map((option) => {
                  const active = announcementMode === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => {
                        setAnnouncementMode(option.key);
                        setSettingsOpen(false);
                      }}
                      className="w-full h-9 px-2 rounded-lg flex items-center justify-between gap-2 text-left text-[12px] font-semibold transition-colors hover:bg-[var(--bg2)] cursor-pointer"
                      style={{ color: active ? 'var(--blue)' : 'var(--tx2)' }}
                    >
                      <span>{option.label}</span>
                      {active && <Check size={14} strokeWidth={2} />}
                    </button>
                  );
                })}
              </div>
            )}
          </span>
          {/* <span className="font-[family-name:var(--mono)] text-[10.5px] text-[var(--tx2)]">
            <span className="text-[var(--ok)] font-semibold">{present}</span> present
          </span> */}
        </span>
      </div>

      {/* Cards */}
      <AsyncBoundary
        isEmpty={items.length === 0}
        minH={120}
        emptyLabel="No attendance events yet"
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
