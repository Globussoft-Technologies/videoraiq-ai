import { useEffect, useMemo, useRef, useState } from 'react';
import moment from 'moment';
import { ChevronDown, Move, ShieldAlert, Timer, UserCheck } from 'lucide-react';
import { useAttendanceSocket } from '../context/AttendanceSocketContext';

const IMAGE_BASE = import.meta.env.VITE_INCIDENT_URL || `${import.meta.env.VITE_BACKEND}/uploads/`;
const INITIALS_URL = import.meta.env.VITE_INITIALS_URL || '';

function cleanId(value) {
  if (!value) return '';
  if (typeof value === 'object') return String(value._id || value.id || value.$oid || '');
  return String(value);
}

function imageUrl(path, fallbackName = '') {
  if (!path) {
    if (!INITIALS_URL) return '';
    const sep = INITIALS_URL.endsWith('=') ? '' : '=';
    return `${INITIALS_URL}${sep}${encodeURIComponent(fallbackName || 'User')}`;
  }
  if (/^https?:\/\//i.test(path)) return path;
  const base = String(IMAGE_BASE || '').replace(/\/+$/, '');
  const cleanPath = String(path).replace(/^\/+/, '');
  return `${base}/${cleanPath}`;
}

function getAttendanceCameraId(item) {
  return cleanId(
    item?.attendance?.channelId ||
    item?.attendance?.event?.channelId ||
    item?.attendance?.event?.channel ||
    item?.channelId ||
    item?.cameraId
  );
}

function getAccessCameraId(item) {
  return cleanId(item?.cameraId || item?.channelId || item?.channel?._id || item?.channel);
}

function mapAttendance(item) {
  const employee = item?.attendance?.employee || {};
  const event = item?.attendance?.event || {};
  const firstName = employee.firstName || '';
  const lastName = employee.lastName || '';
  const name = `${firstName} ${lastName}`.trim() || employee.userName || 'Unauthorized person';
  const capture =
    item?.attendance?.imageUrls?.[0]?.images?.person ||
    item?.attendance?.imageUrls?.[0]?.images?.face ||
    item?.attendance?.imageUrls?.[0]?.images?.frame ||
    event?.images?.person ||
    event?.images?.face ||
    event?.images?.frame;

  return {
    key: `${employee._id || 'unknown'}_${event.cameraType || ''}_${event.timestamp || ''}`,
    title: name,
    subtitle: employee.departmentId?.departmentName || employee.departmentName || '',
    time: event.timestamp,
    image: imageUrl(employee.profilePics?.[0] || capture, name),
    state: event.cameraType === 'checkout' ? 'Check-out' : 'Check-in',
    known: !!employee._id,
  };
}

function mapAccess(item, index) {
  const name = item?.personName || `${item?.firstName || ''} ${item?.lastName || ''}`.trim() || 'Unauthorized person';
  const normalizedName = String(name).trim().toLowerCase();
  const isUnknownName = ['', 'unknown', 'unauthorized', 'unauthorised', 'unauthorized person', 'unauthorised person'].includes(normalizedName);
  const known = !!item?.userId && !isUnknownName;
  const capture = item?.images?.face || item?.images?.person || item?.images?.frame;
  return {
    key: `${item?.userId || name}_${item?.timestamp || index}`,
    title: known ? name : 'Unknown',
    subtitle: item?.department || '',
    time: item?.timestamp,
    image: imageUrl(item?.profilePics?.[0] || capture, name),
    state: known ? 'Known' : 'Unknown',
    known,
  };
}

function LogRow({ item, type }) {
  const Icon = type === 'attendance' ? UserCheck : ShieldAlert;
  const time = item.time && moment(item.time).isValid()
    ? moment(item.time).format('HH:mm:ss')
    : '--';

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 10, borderRadius: 10, background: 'rgba(15,23,42,.72)', border: '1px solid rgba(255,255,255,.08)' }}>
      <img
        src={item.image}
        alt={item.title}
        style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', flex: '0 0 auto', background: 'rgba(255,255,255,.08)' }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <Icon size={13} color={type === 'attendance' ? '#22c55e' : item.known ? '#60a5fa' : '#ef4444'} />
          <span style={{ color: '#fff', fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.title}
          </span>
        </div>
        {item.subtitle && (
          <div style={{ color: 'rgba(255,255,255,.62)', fontSize: 10.5, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.subtitle}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'rgba(255,255,255,.55)', fontFamily: 'var(--mono)', fontSize: 10, marginTop: 4 }}>
          <Timer size={11} />
          <span>{time}</span>
          <span style={{ marginLeft: 'auto', color: item.known ? '#22c55e' : '#ef4444' }}>{item.state}</span>
        </div>
      </div>
    </div>
  );
}

function LogSection({ title, items, type }) {
  const [open, setOpen] = useState(true);
  if (!items.length) return null;

  return (
    <div style={{ borderRadius: 12, overflow: 'hidden' }}>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setOpen((v) => !v)}
        style={{ width: '100%', height: 38, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', border: '1px solid rgba(255,255,255,.10)', borderRadius: 10, background: 'rgba(7,10,17,.9)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
      >
        <span>{title}</span>
        <ChevronDown size={15} style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .15s' }} />
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto', paddingTop: 8 }}>
          {items.map((item) => <LogRow key={item.key} item={item} type={type} />)}
        </div>
      )}
    </div>
  );
}

export default function LiveCameraLogsOverlay({ channel }) {
  const { attendanceLogs = [], accessAllDetections = [] } = useAttendanceSocket() || {};
  const panelRef = useRef(null);
  const dragRef = useRef(null);
  const [position, setPosition] = useState({ x: 18, y: 68 });
  const [dragging, setDragging] = useState(false);

  const cameraId = cleanId(channel?._id || channel?.id || channel?.channelId);

  const attendanceItems = useMemo(() => (
    (Array.isArray(attendanceLogs) ? attendanceLogs : [])
      .filter((item) => getAttendanceCameraId(item) === cameraId)
      .map(mapAttendance)
      .slice(0, 5)
  ), [attendanceLogs, cameraId]);

  const accessItems = useMemo(() => (
    (Array.isArray(accessAllDetections) ? accessAllDetections : [])
      .filter((item) => getAccessCameraId(item) === cameraId)
      .map(mapAccess)
      .slice(0, 5)
  ), [accessAllDetections, cameraId]);

  useEffect(() => {
    const onMove = (e) => {
      const drag = dragRef.current;
      if (!drag) return;
      const width = panelRef.current?.offsetWidth || 320;
      const height = panelRef.current?.offsetHeight || 260;
      const maxX = Math.max(0, window.innerWidth - width - 8);
      const maxY = Math.max(0, window.innerHeight - height - 8);
      setPosition({
        x: Math.min(maxX, Math.max(8, drag.x + e.clientX - drag.startX)),
        y: Math.min(maxY, Math.max(8, drag.y + e.clientY - drag.startY)),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      setDragging(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  if (!cameraId || (!attendanceItems.length && !accessItems.length)) return null;

  const startDrag = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, ...position };
    setDragging(true);
  };

  return (
    <div
      ref={panelRef}
      onPointerDown={startDrag}
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        zIndex: 35,
        width: 316,
        maxWidth: 'calc(100vw - 24px)',
        borderRadius: 16,
        padding: 12,
        background: 'rgba(35,39,48,.46)',
        border: '1px solid rgba(255,255,255,.16)',
        boxShadow: '0 18px 50px rgba(0,0,0,.42)',
        backdropFilter: 'blur(18px)',
        cursor: dragging ? 'grabbing' : 'grab',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,.78)', fontSize: 11, fontWeight: 700, marginBottom: 10 }}>
        <Move size={13} />
        <span>Live Logs</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <LogSection title="Attendance Log" items={attendanceItems} type="attendance" />
        <LogSection title="Access Log" items={accessItems} type="access" />
      </div>
    </div>
  );
}
