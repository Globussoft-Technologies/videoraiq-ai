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
    <Panel style={{ overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '13px 16px 11px', borderBottom: '1px solid var(--bd)',
      }}>
        <span className="vq-glowpulse" style={{
          width: 7, height: 7, borderRadius: '50%',
          background: 'var(--ok)', boxShadow: '0 0 8px var(--ok)',
        }} />
        <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>Live Attendance</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>face check-in</span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--tx2)' }}>
            <span style={{ color: 'var(--ok)', fontWeight: 600 }}>{present}</span> present
          </span>
          <ActionLink onClick={() => navigate('attendance')}>Logs →</ActionLink>
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
          <div
            className="vq-scroll"
            style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '13px 16px' }}
          >
            {items.map((p) => (
              <div key={p.key} style={{
                flex: '0 0 auto', width: 104,
                background: 'var(--bg2)', border: '1px solid var(--bd)',
                borderRadius: 12, padding: '12px 8px', textAlign: 'center',
              }}>
                {/* Avatar wrapper */}
                <div style={{ position: 'relative', width: 46, height: 46, margin: '0 auto 8px' }}>
                  {/* status dot */}
                  <span style={{
                    position: 'absolute', top: -1, right: -1, zIndex: 2,
                    width: 8, height: 8, borderRadius: '50%',
                    background: p.hasOut ? 'var(--warn)' : 'var(--ok)',
                    boxShadow: `0 0 6px ${p.hasOut ? 'var(--warn)' : 'var(--ok)'}`,
                    border: '1.5px solid var(--bg2)',
                  }} />

                  {/* Avatar — prefer profile photo, then captured image, then initials */}
                  {(p.profilePic || p.capturedImage) ? (
                    <img
                      src={p.profilePic || p.capturedImage}
                      alt={p.name}
                      style={{
                        width: 46, height: 46,
                        borderRadius: '50%', objectFit: 'cover',
                        boxShadow: `0 0 0 2px ${getAvatarBorderColor(p.name)}`,
                      }}
                      onError={(e) => {
                        // fall through to initials if image fails
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextSibling && (e.currentTarget.nextSibling.style.display = 'flex');
                      }}
                    />
                  ) : null}
                  {/* Initials fallback (always rendered, hidden when photo is visible) */}
                  <div style={{
                    width: 46, height: 46, borderRadius: '50%',
                    background: 'linear-gradient(135deg,var(--blue),var(--violet))',
                    color: '#fff', display: (p.profilePic || p.capturedImage) ? 'none' : 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600,
                    boxShadow: `0 0 0 2px ${getAvatarBorderColor(p.name)}`,
                  }}>
                    {(p.name || '?')[0].toUpperCase()}
                  </div>
                </div>

                <div style={{
                  fontSize: 11.5, fontWeight: 600,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  color: 'var(--tx)',
                }}>
                  {p.name}
                </div>
                {p.dept && (
                  <div style={{
                    fontSize: 9.5, color: 'var(--tx3)', marginTop: 2,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    textTransform: 'capitalize',
                  }}>
                    {p.dept}
                  </div>
                )}
                {p.timeStr && (
                  <div style={{
                    fontFamily: 'var(--mono)', fontSize: 9.5,
                    color: 'var(--ok)', marginTop: 5,
                  }}>
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
