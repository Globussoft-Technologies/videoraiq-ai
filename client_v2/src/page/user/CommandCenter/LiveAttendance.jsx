import { useNavigate } from 'react-router-dom';
import moment from 'moment';
import { Panel, ActionLink } from '../../../components/primitives';
import { AsyncBoundary } from '../../../components/States';

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

const IMAGE_URL = import.meta.env.VITE_INCIDENT_URL || `${import.meta.env.VITE_BACKEND}/api/v1/uploads/`;

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
 * REST shape (from /api/v1/attendance/get, confirmed via V1 AttendanceLog.jsx):
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

  // Display time — prefer logInTime, fall back to date
  let timeStr = item.logInTime || item.date || '';
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
    key: emp._id || item._id || `${item.date}`,
    name,
    dept,
    profilePic,
    capturedImage,
    timeStr,
    hasOut: !!item.logOutTime,
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

  const captureImg =
    data?.attendance?.imageUrls?.[0]?.images?.person ||
    data?.attendance?.imageUrls?.[0]?.images?.face ||
    data?.attendance?.imageUrls?.[0]?.images?.frame ||
    event?.images?.person ||
    event?.images?.face ||
    event?.images?.frame;
  const capturedImage = captureImg ? img(captureImg) : null;

  const timeStr = event.timestamp && moment(event.timestamp).isValid()
    ? moment(event.timestamp).format('HH:mm')
    : '';

  return {
    key: emp._id || `${event.cameraType || 'u'}_${event.timestamp || ''}`,
    name,
    dept,
    profilePic,
    capturedImage,
    timeStr,
    hasOut: event.cameraType === 'checkout',
  };
}

/** Merge live socket events on top of the REST snapshot, live events win on
 * duplicate employee (same dedup key), newest first. */
function mergeAttendance(restPeople, socketLogs) {
  const restItems = (Array.isArray(restPeople) ? restPeople : []).map(mapRestItem);
  const liveItems = (Array.isArray(socketLogs) ? socketLogs : []).map(mapSocketItem);
  const seen = new Set(liveItems.map((i) => i.key));
  const merged = [...liveItems, ...restItems.filter((i) => !seen.has(i.key))];
  return merged.slice(0, 12);
}

/** Live attendance strip — REST snapshot on load, then live socket check-ins
 * (attendanceLog_<adminId>) merged on top as they arrive. */
export default function LiveAttendance({ people = [], socketLogs = [], loading, error, isEmpty, onRetry }) {
  const navigate = useNavigate();
  const items = mergeAttendance(people, socketLogs);
  const present = items.length;

  return (
    <Panel className="overflow-hidden flex-1 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-[13px] pb-[11px] border-b border-[var(--bd)]">
        <span className="vq-glowpulse w-[7px] h-[7px] rounded-full bg-[var(--ok)] shadow-[0_0_8px_var(--ok)]" />
        <span className="font-[family-name:var(--disp)] font-semibold text-sm">Live Attendance</span>
        <span className="font-[family-name:var(--mono)] text-[10px] text-[var(--tx3)]">face check-in</span>
        <span className="ml-auto flex items-center gap-3">
          <span className="font-[family-name:var(--mono)] text-[10.5px] text-[var(--tx2)]">
            <span className="text-[var(--ok)] font-semibold">{present}</span> present
          </span>
          <ActionLink onClick={() => navigate('/logs/attendance')}>Logs →</ActionLink>
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
                className="flex-none w-[104px] bg-[var(--bg2)] border border-[var(--bd)] rounded-xl px-2 py-3 text-center"
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
    </Panel>
  );
}
