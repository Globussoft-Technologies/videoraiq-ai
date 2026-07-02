import { useNavigate } from 'react-router-dom';
import { Panel, ActionLink } from '../../../components/primitives';
import { AsyncBoundary } from '../../../components/States';

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
function mapItem(item) {
  const emp = item.employee || {};
  const firstName = emp.firstName || '';
  const lastName = emp.lastName || '';
  const name = `${firstName} ${lastName}`.trim() || 'Unknown';

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
  const timeStr = item.logInTime || item.date || '';

  return {
    key: item._id || `${emp._id || 'u'}_${item.date}`,
    name,
    dept,
    profilePic,
    capturedImage,
    timeStr,
    hasOut: !!item.logOutTime,
  };
}

/** Live attendance strip — most recent face check-ins from REST API. */
export default function LiveAttendance({ people = [], loading, error, isEmpty, onRetry }) {
  const navigate = useNavigate();
  const items = (Array.isArray(people) ? people : []).map(mapItem);
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
                flex: '0 0 auto', width: 96,
                background: 'var(--bg2)', border: '1px solid var(--bd)',
                borderRadius: 12, padding: '11px 9px', textAlign: 'center', position: 'relative',
              }}>
                {/* status dot */}
                <span style={{
                  position: 'absolute', top: 8, right: 8,
                  width: 7, height: 7, borderRadius: '50%',
                  background: p.hasOut ? 'var(--warn)' : 'var(--ok)',
                  boxShadow: `0 0 6px ${p.hasOut ? 'var(--warn)' : 'var(--ok)'}`,
                }} />

                {/* Avatar — prefer profile photo, then captured image, then initials */}
                {(p.profilePic || p.capturedImage) ? (
                  <img
                    src={p.profilePic || p.capturedImage}
                    alt={p.name}
                    style={{
                      width: 46, height: 46, margin: '0 auto 8px',
                      borderRadius: '50%', objectFit: 'cover',
                      boxShadow: '0 0 0 2px var(--ok)',
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
                  width: 46, height: 46, margin: '0 auto 8px', borderRadius: '50%',
                  background: 'linear-gradient(135deg,var(--blue),var(--violet))',
                  color: '#fff', display: (p.profilePic || p.capturedImage) ? 'none' : 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600,
                }}>
                  {(p.name || '?')[0].toUpperCase()}
                </div>

                <div style={{
                  fontSize: 11, fontWeight: 600,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {p.name}
                </div>
                {p.dept && (
                  <div style={{
                    fontSize: 9, color: 'var(--tx3)', marginTop: 1,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
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
