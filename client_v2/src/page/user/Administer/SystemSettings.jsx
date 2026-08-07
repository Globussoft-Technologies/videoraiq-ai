import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  Clock,
  Database,
  ListOrdered,
  Loader2,
  Mail,
  MessageSquare,
  Monitor,
  Radio,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Volume2,
  Webhook,
  XCircle,
} from 'lucide-react';
import { useApi } from '../../../hooks/useApi';
import { setLogOrderEnabled, useLogOrder } from '../../../lib/logOrder';
import {
  fetchAdmin,
  fetchTimezone,
  getAttendanceSettings,
  getTimezones,
  updateAttendanceSettings,
  updateRetention,
  updateTimezone,
} from '../../../helpers/administer';
import { useAttendanceSocket } from '../../../context/AttendanceSocketContext';
import { usePermissions } from '../../../context/PermissionContext';
import { getChannels, getDetectionSettings, getDetectionTypes } from '../../../helpers/configure';
import { getRecipients } from '../../../helpers/recipients';
import { getTelegramLinkCode } from '../../../helpers/telegram';
import { DESKTOP_NOTIFICATIONS_KEY, desktopNotificationsEnabled } from '../../../context/DetectionNotificationContext';

// Data retention is capped at 6 months and offered as three fixed options —
// the slider snaps between them rather than accepting any duration. Values are
// month counts, saved to the API as an "Nm" spec (the sweeper's own format).
const RETENTION_OPTIONS = [
  { months: 1, tick: '1m' },
  { months: 3, tick: '3m' },
  { months: 6, tick: '6m' },
];
const RETENTION_MIN_MONTHS = RETENTION_OPTIONS[0].months;
const RETENTION_MAX_MONTHS = RETENTION_OPTIONS[RETENTION_OPTIONS.length - 1].months;
const RETENTION_DEFAULT_MONTHS = RETENTION_MIN_MONTHS;

function boolText(value) {
  return value ? 'Enabled' : 'Disabled';
}

function parseRetentionMonths(spec) {
  if (!spec || String(spec).toLowerCase() === 'never') return RETENTION_DEFAULT_MONTHS;
  const match = String(spec).trim().match(/^(\d+)\s*([dmy])$/i);
  if (!match) return RETENTION_DEFAULT_MONTHS;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === 'y') return value * 12;
  if (unit === 'd') return value / 30;
  return value;
}

function isNeverRetention(spec) {
  return String(spec || '').toLowerCase() === 'never';
}

// Anything already stored outside the three options — a legacy "1y" or "90d",
// say — is shown as the closest supported one, so the panel never displays a
// policy it can no longer save. The stored spec itself is left alone until the
// admin saves.
function snapToRetentionOption(months) {
  const wanted = Number(months) || RETENTION_DEFAULT_MONTHS;
  const clamped = Math.min(RETENTION_MAX_MONTHS, Math.max(RETENTION_MIN_MONTHS, wanted));
  return RETENTION_OPTIONS.reduce((best, option) =>
    Math.abs(option.months - clamped) < Math.abs(best.months - clamped) ? option : best
  ).months;
}

function storedRetentionMonths(...specs) {
  const configured = specs.find((spec) => spec && !isNeverRetention(spec));
  return snapToRetentionOption(parseRetentionMonths(configured));
}

function formatRetentionDuration(months) {
  const value = Number(months) || RETENTION_DEFAULT_MONTHS;
  return `${value} month${value === 1 ? '' : 's'}`;
}

function retentionLabel(spec, fallbackMonths) {
  if (!spec) return formatRetentionDuration(fallbackMonths);
  if (isNeverRetention(spec)) return 'Never purge';
  return formatRetentionDuration(snapToRetentionOption(parseRetentionMonths(spec)));
}

function formatTimezone(timezone) {
  if (!timezone) return 'Not configured';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date());
    const offset = parts.find((p) => p.type === 'timeZoneName')?.value || '';
    return offset ? `${timezone} (${offset.replace('GMT', 'UTC')})` : timezone;
  } catch {
    return timezone;
  }
}

function normalizeDetectionRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.settings)) return payload.settings;
  if (Array.isArray(payload?.detectionSettings)) return payload.detectionSettings;
  return [];
}

function detectionName(row, typeLabels) {
  const setting = row?.detectionSetting || row;
  return setting?.detectionName || typeLabels?.[setting?.settingType] || setting?.name || setting?.settingType || 'Detection';
}

function countEnabledDetectionToggles(channels) {
  if (!Array.isArray(channels)) return 0;
  return channels.reduce((sum, channel) => {
    const detections = channel?.detections;
    if (!detections || typeof detections !== 'object') return sum;
    return sum + Object.values(detections).filter((entry) => entry?.enabled === true).length;
  }, 0);
}

function getRecipientValue(recipient) {
  return recipient?.value || recipient?.email || recipient?.phone || recipient?.phoneNumber || '';
}

function isVerified(recipient) {
  return recipient?.verified === true || recipient?.status === 'verified';
}

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

const ATTENDANCE_INPUT_STYLE = {
  width: '100%',
  height: 38,
  padding: '8px 12px',
  borderRadius: 9,
  background: 'var(--bg2)',
  border: '1px solid var(--bd)',
  color: 'var(--tx)',
  fontSize: 12.5,
  fontFamily: 'var(--mono)',
};

/** "9h", "7h 30m", "45m" — hours entered as decimals read badly otherwise. */
function formatHours(value) {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0) return '0h';
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  if (!whole) return `${minutes}m`;
  return minutes ? `${whole}h ${minutes}m` : `${whole}h`;
}

function StatusRule({ color, label, detail }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
      <span style={{ fontWeight: 700, color: 'var(--tx)', minWidth: 74 }}>{label}</span>
      <span style={{ color: 'var(--tx3)' }}>{detail}</span>
    </div>
  );
}

function ReadOnlyField({ value, mono = false }) {
  return (
    <div
      style={{
        minHeight: 38,
        display: 'flex',
        alignItems: 'center',
        padding: '8px 12px',
        borderRadius: 9,
        background: 'var(--bg2)',
        border: '1px solid var(--bd)',
        fontSize: 12.5,
        color: 'var(--tx2)',
        lineHeight: 1.35,
        fontFamily: mono ? 'var(--mono)' : undefined,
        overflowWrap: 'anywhere',
      }}
    >
      {value || '-'}
    </div>
  );
}

function SelectField({ value, options, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
        setQuery('');
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
      setQuery('');
    }
  }, [disabled]);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;
    return options.filter((option) => option.toLowerCase().includes(normalizedQuery));
  }, [options, query]);

  const selectOption = (option) => {
    setOpen(false);
    setQuery('');
    onChange(option);
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative', zIndex: open ? 20 : 1 }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((current) => !current)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          width: '100%',
          height: 38,
          padding: '0 34px 0 12px',
          boxSizing: 'border-box',
          borderRadius: 9,
          background: 'var(--bg2)',
          border: `1px solid ${open ? 'var(--brand)' : 'var(--bd)'}`,
          fontSize: 12.5,
          color: 'var(--tx)',
          outline: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.7 : 1,
          textAlign: 'left',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value || 'Select timezone'}
      </button>
      <ChevronDown
        size={14}
        style={{
          position: 'absolute',
          right: 12,
          top: 19,
          transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`,
          transition: 'transform .18s ease',
          pointerEvents: 'none',
          color: 'var(--tx3)',
        }}
      />
      {open && (
        <div
          role="listbox"
          aria-label="Timezones"
          style={{
            position: 'absolute',
            top: 'calc(100% + 5px)',
            left: 0,
            right: 0,
            borderRadius: 10,
            background: 'var(--bg1solid, var(--bg1))',
            border: '1px solid var(--bd)',
            boxShadow: '0 12px 30px rgba(15,23,42,.16)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: 8, borderBottom: '1px solid var(--bd)' }}>
            <div style={{ position: 'relative' }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--tx3)',
                  pointerEvents: 'none',
                }}
              />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setOpen(false);
                    setQuery('');
                  }
                }}
                placeholder="Search timezone..."
                aria-label="Search timezone"
                style={{
                  width: '100%',
                  height: 34,
                  boxSizing: 'border-box',
                  padding: '0 10px 0 32px',
                  borderRadius: 8,
                  background: 'var(--bg2)',
                  border: '1px solid var(--bd)',
                  color: 'var(--tx)',
                  fontSize: 12,
                  outline: 'none',
                }}
              />
            </div>
          </div>
          <div className="customscrollbar" style={{ maxHeight: 240, overflowY: 'auto', padding: '5px 0' }}>
            {filteredOptions.length === 0 ? (
              <div style={{ padding: '12px', color: 'var(--tx3)', fontSize: 12, textAlign: 'center' }}>
                No timezones found
              </div>
            ) : (
              filteredOptions.map((option) => {
                const selected = option === value;
                return (
                  <button
                    key={option}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => selectOption(option)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      width: '100%',
                      padding: '8px 12px',
                      border: 0,
                      background: selected ? 'rgba(79,105,255,.12)' : 'transparent',
                      color: selected ? 'var(--brand)' : 'var(--tx)',
                      fontSize: 12.5,
                      fontWeight: selected ? 600 : 400,
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{option}</span>
                    {selected && <CheckCircle2 size={14} style={{ flexShrink: 0 }} />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({ value, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange?.(!value)}
      disabled={disabled}
      aria-pressed={value}
      style={{
        width: 44,
        height: 24,
        borderRadius: 13,
        background: value ? 'linear-gradient(90deg,var(--blue),var(--violet))' : 'var(--toggleoff,var(--bg3,#c8cedb))',
        position: 'relative',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'background .2s, opacity .2s',
        flexShrink: 0,
        border: '1px solid var(--bd)',
        opacity: disabled ? 0.65 : 1,
        padding: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: value ? 22 : 2,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left .2s',
          boxShadow: '0 1px 3px rgba(0,0,0,.35)',
        }}
      />
    </button>
  );
}

function ToggleRow({ icon: Icon, label, desc, value, onChange, disabled, loading, action, last }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 0',
        borderBottom: last ? 'none' : '1px solid var(--bd)',
      }}
    >
      {Icon && (
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: value ? 'rgba(34,197,94,.11)' : 'var(--bg2)',
            color: value ? 'var(--ok)' : 'var(--tx3)',
            flexShrink: 0,
          }}
        >
          <Icon size={15} strokeWidth={1.8} />
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>{label}</div>
        {desc && <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 2, lineHeight: 1.35 }}>{desc}</div>}
      </div>
      {action}
      {loading ? (
        <Loader2 size={16} className="animate-spin" style={{ color: 'var(--blue)', flexShrink: 0 }} />
      ) : (
        <Toggle value={value} onChange={onChange} disabled={disabled} />
      )}
    </div>
  );
}

function StatusPill({ value, tone = 'neutral' }) {
  const palette = {
    ok: ['rgba(34,197,94,.12)', 'rgba(34,197,94,.38)', 'var(--ok)'],
    warn: ['rgba(245,166,35,.12)', 'rgba(245,166,35,.38)', 'var(--warn)'],
    off: ['var(--bg2)', 'var(--bd)', 'var(--tx3)'],
    neutral: ['rgba(59,130,246,.09)', 'rgba(59,130,246,.3)', 'var(--blue)'],
  };
  const [bg, border, color] = palette[tone] || palette.neutral;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        borderRadius: 20,
        border: `1px solid ${border}`,
        background: bg,
        color,
        padding: '4px 9px',
        fontFamily: 'var(--mono)',
        fontSize: 10.5,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {value}
    </span>
  );
}

function Metric({ label, value, icon: Icon, tone = 'neutral' }) {
  const color = tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : tone === 'crit' ? 'var(--crit)' : 'var(--blue)';
  return (
    <div
      style={{
        background: 'var(--bg2)',
        border: '1px solid var(--bd)',
        borderRadius: 10,
        padding: 12,
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--tx3)', fontSize: 11, marginBottom: 8 }}>
        {Icon && <Icon size={14} strokeWidth={1.8} style={{ color }} />}
        {label}
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function ActionButton({ children, onClick, disabled, icon: Icon, variant = 'secondary' }) {
  const primary = variant === 'primary';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 32,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        borderRadius: 8,
        border: primary ? 'none' : '1px solid var(--bd)',
        background: primary ? 'linear-gradient(135deg,var(--blue),var(--violet))' : 'var(--bg2)',
        color: primary ? '#fff' : 'var(--blue)',
        padding: '0 12px',
        fontSize: 12,
        fontWeight: 700,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.65 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {Icon && <Icon size={14} strokeWidth={1.8} />}
      {children}
    </button>
  );
}

function IntegrationRow({ icon: Icon, title, desc, status, tone, onManage, last }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 0',
        borderBottom: last ? 'none' : '1px solid var(--bd)',
      }}
    >
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: 9,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: tone === 'ok' ? 'rgba(34,197,94,.1)' : 'var(--bg2)',
          color: tone === 'ok' ? 'var(--ok)' : 'var(--blue)',
          flexShrink: 0,
        }}
      >
        <Icon size={16} strokeWidth={1.8} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)' }}>{title}</span>
          <StatusPill value={status} tone={tone} />
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 3, lineHeight: 1.35 }}>{desc}</div>
      </div>
      {onManage && <ActionButton onClick={onManage}>Manage</ActionButton>}
    </div>
  );
}

function ComplianceRow({ label, desc, enabled, last }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 0',
        borderBottom: last ? 'none' : '1px solid var(--bd)',
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: enabled ? 'rgba(34,197,94,.1)' : 'var(--bg2)',
          color: enabled ? 'var(--ok)' : 'var(--tx3)',
          flexShrink: 0,
        }}
      >
        {enabled ? <CheckCircle2 size={15} strokeWidth={1.8} /> : <XCircle size={15} strokeWidth={1.8} />}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>{label}</div>
        <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 2, lineHeight: 1.35 }}>{desc}</div>
      </div>
      <StatusPill value={boolText(enabled)} tone={enabled ? 'ok' : 'off'} />
    </div>
  );
}

/**
 * Sidebar log ordering — the switch only. The reordering itself happens in the
 * sidebar: while this is on, the LOGS & RECORDS items become draggable in
 * place.
 *
 * Switching it off does NOT discard the arrangement, it just parks it — the
 * sidebar returns to the shipped order and can be switched back on unchanged.
 * That doubles as the way back to the default, so there's no separate reset.
 *
 * Not gated on canEditSettings: this is a browser-local display preference
 * (see lib/logOrder.js), reaching this page already requires `settings` view,
 * and an operator rearranging their own sidebar affects nobody else.
 */
function LogOrderPanel() {
  const { enabled } = useLogOrder();

  const handleToggle = (next) => {
    setLogOrderEnabled(next);
    toast.success(
      next
        ? 'Drag the sidebar logs to rearrange them'
        : 'Sidebar logs are back to the default order',
      { id: 'log-order-toggle' },
    );
  };

  return (
    <Panel>
      <PanelHeader
        icon={ListOrdered}
        title="Log Order"
        sub="Rearrange the LOGS & RECORDS section of the sidebar. Saved in this browser only."
      />
      <ToggleRow
        icon={ListOrdered}
        label="Customize log order"
        desc={enabled ? 'Drag the logs in the sidebar to reorder them' : 'Sidebar logs use the default order'}
        value={enabled}
        onChange={handleToggle}
        last
      />
    </Panel>
  );
}

export default function SystemSettings() {
  const navigate = useNavigate();
  const audio = useAttendanceSocket() || {};
  const { permissions } = usePermissions();
  const settingsPermissions = permissions?.settings || {};
  const canCreateSettings = settingsPermissions.create === true;
  const canEditSettings = settingsPermissions.edit === true;
  const canDeleteSettings = settingsPermissions.delete === true;
  const canEnableSetting = canCreateSettings || canEditSettings;
  const canDisableSetting = canDeleteSettings || canEditSettings;
  const adminApi = useApi(() => fetchAdmin(), []);
  const timezoneApi = useApi(() => fetchTimezone(), []);
  const timezonesApi = useApi(() => getTimezones(), []);
  const emailRecipientsApi = useApi(() => getRecipients('email', '', 'All', 0, 100), []);
  const phoneRecipientsApi = useApi(() => getRecipients('phone', '', 'All', 0, 100), []);
  const telegramApi = useApi(() => getTelegramLinkCode(), [], { pollMs: 10000 });
  const detectionTypesApi = useApi(() => getDetectionTypes(), []);
  const detectionSettingsApi = useApi(() => getDetectionSettings({ skip: 0, limit: 500 }), []);
  const channelsApi = useApi(() => getChannels({ skip: 0, limit: 1000 }), []);

  const attendanceSettingsApi = useApi(() => getAttendanceSettings(), []);

  const [timezoneSaving, setTimezoneSaving] = useState(false);
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [fullDayHours, setFullDayHours] = useState('');
  const [halfDayHours, setHalfDayHours] = useState('');
  const [retentionSaving, setRetentionSaving] = useState(false);
  const [retentionEnabled, setRetentionEnabled] = useState(true);
  const [retentionMonths, setRetentionMonths] = useState(RETENTION_DEFAULT_MONTHS);
  const [retentionTooltipVisible, setRetentionTooltipVisible] = useState(false);
  const [desktopNotifications, setDesktopNotifications] = useState(() => desktopNotificationsEnabled());

  const admin = adminApi.data || {};
  const adminName = [admin.name_f, admin.name_l].filter(Boolean).join(' ') || admin.login || 'Admin account';
  const orgName = admin.orgName || admin.organizationName || admin.orgId || adminName;
  const email = admin.email || '-';
  const savedTimezone = timezoneApi.data || admin.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  const timezones = Array.isArray(timezonesApi.data) ? timezonesApi.data : [];
  const timezoneOptions = useMemo(() => {
    const set = new Set([savedTimezone, 'Asia/Kolkata', 'UTC', ...timezones].filter(Boolean));
    return Array.from(set);
  }, [savedTimezone, timezones]);

  const adminUserId = admin.user_id;
  const retention = admin.retention || {};
  const storedIncidentRetention = retention.incidents || '';
  const storedAttendanceRetention = retention.attendance || '';
  const storedAccessRetention = retention.accessLogs || '';
  const storedRetentionSpecs = [storedIncidentRetention, storedAttendanceRetention, storedAccessRetention].filter(Boolean);
  const storedRetentionEnabled = retention.enabled !== false
    && !(storedRetentionSpecs.length > 0 && storedRetentionSpecs.every(isNeverRetention));

  useEffect(() => {
    setRetentionEnabled(storedRetentionEnabled);
    setRetentionMonths(storedRetentionMonths(storedIncidentRetention, storedAttendanceRetention, storedAccessRetention));
  }, [storedRetentionEnabled, storedIncidentRetention, storedAttendanceRetention, storedAccessRetention]);

  const savedFullDayHours = attendanceSettingsApi.data?.fullDayHours;
  const savedHalfDayHours = attendanceSettingsApi.data?.halfDayHours;

  useEffect(() => {
    if (savedFullDayHours != null) setFullDayHours(String(savedFullDayHours));
    if (savedHalfDayHours != null) setHalfDayHours(String(savedHalfDayHours));
  }, [savedFullDayHours, savedHalfDayHours]);

  const fullDayValue = Number(fullDayHours);
  const halfDayValue = Number(halfDayHours);
  // Mirrors the server's Joi rules so the button explains itself before a
  // round-trip; the server still validates independently.
  const attendanceError = (() => {
    if (fullDayHours === '' || halfDayHours === '') return 'Both thresholds are required';
    if (!Number.isFinite(fullDayValue) || !Number.isFinite(halfDayValue)) return 'Enter a number of hours';
    if (fullDayValue < 0 || halfDayValue < 0) return 'Hours cannot be negative';
    if (fullDayValue > 24 || halfDayValue > 24) return 'Hours cannot exceed 24';
    if (halfDayValue > fullDayValue) return 'Half day cannot be longer than a full day';
    return null;
  })();
  const attendanceChanged = fullDayValue !== savedFullDayHours || halfDayValue !== savedHalfDayHours;

  const handleSaveAttendance = async () => {
    if (!canEditSettings) {
      toast.error("You don't have permission to edit settings");
      return;
    }
    if (attendanceError) {
      toast.error(attendanceError);
      return;
    }
    setAttendanceSaving(true);
    try {
      await updateAttendanceSettings({ fullDayHours: fullDayValue, halfDayHours: halfDayValue });
      await attendanceSettingsApi.refetch();
      toast.success('Attendance rules updated');
    } catch (err) {
      toast.error(err?.response?.data?.body?.message || 'Failed to update attendance rules');
    } finally {
      setAttendanceSaving(false);
    }
  };

  const soundEnabled = !!audio.audioEnabled;
  const emailRecipients = Array.isArray(emailRecipientsApi.data) ? emailRecipientsApi.data : [];
  const phoneRecipients = Array.isArray(phoneRecipientsApi.data) ? phoneRecipientsApi.data : [];
  const verifiedEmails = emailRecipients.filter(isVerified).length;
  const verifiedPhones = phoneRecipients.filter(isVerified).length;
  const telegramLinked = !!telegramApi.data?.linked;
  const telegramChatId = telegramApi.data?.chatId || admin.telegramChatId || '';

  const typeLabels = detectionTypesApi.data || {};
  const detectionRows = normalizeDetectionRows(detectionSettingsApi.data);
  const enabledDetectionRows = detectionRows.filter((row) => (row?.detectionSetting || row)?.enabled === true);
  const channels = Array.isArray(channelsApi.data?.channels) ? channelsApi.data.channels : [];
  const enabledDetectionToggleCount = countEnabledDetectionToggles(channels);
  const linkedCameraCount = useMemo(() => {
    const ids = new Set();
    detectionRows.forEach((row) => {
      (row.linkedCameras || []).forEach((camera) => {
        const id = camera?._id || camera?.id || camera?.name;
        if (id) ids.add(id);
      });
    });
    return ids.size;
  }, [detectionRows]);
  const recipientLinkedCount = detectionRows.reduce((sum, row) => {
    const setting = row?.detectionSetting || row;
    return sum + (Array.isArray(setting?.alerts) ? setting.alerts.length : 0);
  }, 0);
  const firstEnabledDetection = enabledDetectionRows[0];
  const selectedRetentionLabel = formatRetentionDuration(retentionMonths);
  const savedRetentionMonths = storedRetentionMonths(storedIncidentRetention, storedAttendanceRetention, storedAccessRetention);
  const savedRetentionLabel = formatRetentionDuration(savedRetentionMonths);

  const retentionSummaryLabel = (spec) => (spec ? String(spec) : '-');

  // The slider addresses RETENTION_OPTIONS by index, so its stops line up
  // exactly with the tick labels beneath it.
  const retentionIndex = Math.max(0, RETENTION_OPTIONS.findIndex((option) => option.months === retentionMonths));
  const retentionSliderPercent = (retentionIndex / (RETENTION_OPTIONS.length - 1)) * 100;

  const retentionModeChanged = retentionEnabled !== storedRetentionEnabled;
  const canApplyRetention = retentionModeChanged
    ? (retentionEnabled ? canEnableSetting : canDisableSetting)
    : canEditSettings;
  const canAdjustRetention = canEditSettings
    || (!storedRetentionEnabled && retentionEnabled && canCreateSettings);
  const canSaveRetention = !!adminUserId && !retentionSaving && canApplyRetention;

  const handleSoundToggle = async (next) => {
    const allowed = next ? canEnableSetting : canDisableSetting;
    if (!allowed) {
      toast.error(`You don't have permission to ${next ? 'enable' : 'disable'} settings`);
      return;
    }
    await audio.setAudioEnabled?.(next, {
      successMessage: `Detection audio alerts ${next ? 'enabled' : 'disabled'}`,
      syncLineCrossing: true,
    });
  };
  const handleDesktopNotificationToggle = async (next) => {
    const allowed = next ? canEnableSetting : canDisableSetting;
    if (!allowed) {
      toast.error(`You don't have permission to ${next ? 'enable' : 'disable'} settings`);
      return;
    }

    if (next) {
      if (!('Notification' in window)) {
        toast.error('Desktop notifications are not supported in this browser');
        return;
      }
      if (Notification.permission === 'denied') {
        toast.error('Desktop notifications are blocked in browser settings');
        return;
      }
      if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          toast.error('Desktop notification permission was not granted');
          return;
        }
      }
    }

    window.localStorage.setItem(DESKTOP_NOTIFICATIONS_KEY, next ? 'true' : 'false');
    setDesktopNotifications(next);
    toast.success(`Desktop notifications ${next ? 'enabled' : 'disabled'}`);
  };

  const handleTimezoneChange = async (next) => {
    if (!canEditSettings) {
      toast.error("You don't have permission to edit settings");
      return;
    }
    if (!next || next === savedTimezone) return;
    setTimezoneSaving(true);
    try {
      await updateTimezone(next);
      await timezoneApi.refetch({ silent: true });
      await adminApi.refetch({ silent: true });
      toast.success('Timezone updated');
    } catch (err) {
      toast.error(err?.response?.data?.body?.message || 'Failed to update timezone');
    } finally {
      setTimezoneSaving(false);
    }
  };

  const notifyRetentionPendingSave = () => {
    toast.warning('Not saved yet. Click Save to apply the data retention change.', {
      id: 'retention-pending-save',
    });
  };

  const handleRetentionToggle = (next) => {
    setRetentionEnabled(next);
    notifyRetentionPendingSave();
  };

  const handleRetentionMonthsChange = (next) => {
    setRetentionMonths(next);
    notifyRetentionPendingSave();
  };

  const handleRetentionSave = async () => {
    if (!canApplyRetention) {
      toast.error("You don't have permission to change retention settings");
      return;
    }
    if (!adminUserId) {
      toast.error('Admin user id is not available yet');
      return;
    }
    setRetentionSaving(true);
    try {
      const spec = retentionEnabled ? `${retentionMonths}m` : 'never';
      await updateRetention({
        userId: adminUserId,
        enabled: retentionEnabled,
        incidents: spec,
        attendance: spec,
        accessLogs: spec,
      });
      await adminApi.refetch({ silent: true });
      toast.success('Retention settings updated');
    } catch (err) {
      toast.error(err?.response?.data?.body?.message || 'Failed to update retention settings');
    } finally {
      setRetentionSaving(false);
    }
  };

  const loadingMain = adminApi.loading || audio.audioLoading || timezoneApi.loading;

  return (
    <div
      style={{
        padding: 22,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit,minmax(360px,1fr))',
        gap: 18,
        alignItems: 'start',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
        <Panel>
          <PanelHeader
            icon={ShieldCheck}
            title="General"
            sub={loadingMain ? 'Loading admin settings...' : ''}
            action={loadingMain ? <Loader2 size={16} className="animate-spin" style={{ color: 'var(--blue)' }} /> : null}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            <div>
              <FieldLabel>Organization / Account</FieldLabel>
              <ReadOnlyField value={orgName} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 11 }}>
              <div>
                <FieldLabel>Admin Name</FieldLabel>
                <ReadOnlyField value={adminName} />
              </div>
              <div>
                <FieldLabel>Email</FieldLabel>
                <ReadOnlyField value={email} mono />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 11 }}>
              <div>
                <FieldLabel>Timezone</FieldLabel>
                <SelectField value={savedTimezone} options={timezoneOptions} onChange={handleTimezoneChange} disabled={!canEditSettings || timezoneSaving || timezonesApi.loading} />
              </div>
              <div>
                <FieldLabel>Timezone Preview</FieldLabel>
                <ReadOnlyField value={formatTimezone(savedTimezone)} />
              </div>
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            icon={Bell}
            title="Alert Channels"
            sub="Configured from recipients, Telegram link status, and Detection audio."
            action={<ActionButton onClick={() => navigate('/recipients')}>Recipients</ActionButton>}
          />
          <ToggleRow
            icon={Mail}
            label="Email Alerts"
            desc={`${verifiedEmails}/${emailRecipients.length} verified recipient${emailRecipients.length === 1 ? '' : 's'}`}
            value={emailRecipients.length > 0}
            disabled
          />
          {/* <ToggleRow
            icon={MessageSquare}
            label="SMS Alerts"
            desc={`${verifiedPhones}/${phoneRecipients.length} verified phone recipient${phoneRecipients.length === 1 ? '' : 's'}`}
            value={phoneRecipients.length > 0}
            disabled
          /> */}
          <ToggleRow
            icon={Radio}
            label="Telegram Alerts"
            desc={telegramLinked ? `Linked channel ${telegramChatId || ''}` : 'Not linked'}
            value={telegramLinked}
            disabled
          />
          <ToggleRow
            icon={Volume2}
            label="Detection Audio Alerts"
            desc="Control audible alert notifications for live attendance and line crossing"
            value={soundEnabled}
            onChange={handleSoundToggle}
            disabled={soundEnabled ? !canDisableSetting : !canEnableSetting}
            loading={audio.audioSaving}
          />
          <ToggleRow
            icon={Monitor}
            label="Desktop Notifications"
            desc="Show browser notifications when this tab is not active"
            value={desktopNotifications}
            onChange={handleDesktopNotificationToggle}
            disabled={desktopNotifications ? !canDisableSetting : !canEnableSetting}
            last
          />
          {/* <ToggleRow
            icon={Webhook}
            label="Webhook / API"
            desc="No webhook endpoint is available in the current API set"
            value={false}
            disabled
            last
          /> */}
        </Panel>

        <Panel>
          <PanelHeader
            icon={Database}
            title="Data Retention"
            sub="Keep incidents, attendance, and access logs for 1, 3, or 6 months"
            action={
              <ActionButton onClick={handleRetentionSave} disabled={!canSaveRetention} icon={retentionSaving ? Loader2 : null} variant="primary">
                Save
              </ActionButton>
            }
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)' }}>Automatic cleanup</div>
              <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 2 }}>{retentionEnabled ? `${selectedRetentionLabel} policy` : 'Keep data forever'}</div>
            </div>
            <Toggle
              value={retentionEnabled}
              onChange={handleRetentionToggle}
              disabled={retentionSaving || (retentionEnabled ? !canDisableSetting : !canEnableSetting)}
            />
          </div>
          <div
            style={{ position: 'relative', paddingTop: 22 }}
            onMouseEnter={() => setRetentionTooltipVisible(true)}
            onMouseLeave={() => setRetentionTooltipVisible(false)}
          >
            {retentionEnabled && retentionTooltipVisible && (
              <div
                style={{
                  position: 'absolute',
                  left: `clamp(48px, ${retentionSliderPercent}%, calc(100% - 48px))`,
                  top: 0,
                  transform: 'translateX(-50%)',
                  padding: '4px 8px',
                  borderRadius: 7,
                  background: 'var(--tx)',
                  color: 'var(--bg1)',
                  fontSize: 10.5,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  zIndex: 2,
                }}
              >
                {selectedRetentionLabel}
              </div>
            )}
            <input
              type="range"
              min={0}
              max={RETENTION_OPTIONS.length - 1}
              step={1}
              value={retentionIndex}
              title={selectedRetentionLabel}
              disabled={!retentionEnabled || retentionSaving || !canAdjustRetention}
              onFocus={() => setRetentionTooltipVisible(true)}
              onBlur={() => setRetentionTooltipVisible(false)}
              onMouseDown={() => setRetentionTooltipVisible(true)}
              onMouseUp={() => setRetentionTooltipVisible(false)}
              onTouchStart={() => setRetentionTooltipVisible(true)}
              onTouchEnd={() => setRetentionTooltipVisible(false)}
              onChange={(e) => handleRetentionMonthsChange(
                RETENTION_OPTIONS[Number(e.target.value)]?.months ?? RETENTION_DEFAULT_MONTHS
              )}
              style={{ width: '100%', accentColor: 'var(--blue)', height: 5, cursor: retentionEnabled && canAdjustRetention ? 'pointer' : 'default', opacity: retentionEnabled && canAdjustRetention ? 1 : 0.55 }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--tx3)', marginTop: 6 }}>
            {RETENTION_OPTIONS.map((option) => (
              <span key={option.months}>{option.tick}</span>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 9, marginTop: 14 }}>
            <Metric label="Incidents" value={retentionSummaryLabel(storedIncidentRetention)} icon={Database} />
            <Metric label="Attendance" value={retentionSummaryLabel(storedAttendanceRetention)} icon={Clock} tone="ok" />
            <Metric label="Access Logs" value={retentionSummaryLabel(storedAccessRetention)} icon={ShieldCheck} tone="warn" />
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            icon={Clock}
            title="Attendance Rules"
            sub="Hours on site that count as a full or half day. Applies to every employee in this organisation."
            action={attendanceSettingsApi.loading ? <Loader2 size={16} className="animate-spin" style={{ color: 'var(--blue)' }} /> : null}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 11 }}>
            <div>
              <FieldLabel>Full day (hours)</FieldLabel>
              <input
                type="number"
                min={0}
                max={24}
                step={0.25}
                value={fullDayHours}
                onChange={(e) => setFullDayHours(e.target.value)}
                disabled={!canEditSettings || attendanceSaving || attendanceSettingsApi.loading}
                style={ATTENDANCE_INPUT_STYLE}
              />
            </div>
            <div>
              <FieldLabel>Half day (hours)</FieldLabel>
              <input
                type="number"
                min={0}
                max={24}
                step={0.25}
                value={halfDayHours}
                onChange={(e) => setHalfDayHours(e.target.value)}
                disabled={!canEditSettings || attendanceSaving || attendanceSettingsApi.loading}
                style={ATTENDANCE_INPUT_STYLE}
              />
            </div>
          </div>

          <div style={{ marginTop: 13, padding: 12, borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--bd)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx3)', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8 }}>
              How days will be graded
            </div>
            <div style={{ display: 'grid', gap: 5, fontSize: 11.5, color: 'var(--tx2)' }}>
              <StatusRule color="var(--ok)" label="Present" detail={`On site ${formatHours(fullDayValue)} or more`} />
              <StatusRule color="var(--warn)" label="Half Day" detail={`${formatHours(halfDayValue)} up to ${formatHours(fullDayValue)}`} />
              <StatusRule color="var(--crit)" label="Absent" detail={`Under ${formatHours(halfDayValue)}`} />
              <StatusRule color="var(--blue)" label="Checked In" detail="Checked in, no check-out yet" />
            </div>
            <div style={{ marginTop: 9, fontSize: 11, color: 'var(--tx3)', lineHeight: 1.4 }}>
              Time on site is the last check-out minus the first check-in. Changing these re-grades existing
              attendance logs the next time they're loaded.
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 13, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, color: attendanceError ? 'var(--crit)' : 'var(--tx3)' }}>
              {attendanceError || (attendanceChanged ? 'Unsaved changes' : 'Saved')}
            </span>
            <ActionButton
              variant="primary"
              icon={attendanceSaving ? Loader2 : CheckCircle2}
              onClick={handleSaveAttendance}
              disabled={!canEditSettings || attendanceSaving || !!attendanceError || !attendanceChanged}
            >
              {attendanceSaving ? 'Saving...' : 'Save'}
            </ActionButton>
          </div>
        </Panel>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
        <Panel>
          <PanelHeader
            icon={SlidersHorizontal}
            title="AI Detection Defaults"
            // sub="Summary from the detection settings and detection types APIs."
            action={<ActionButton onClick={() => navigate('/detection-settings')}>Manage</ActionButton>}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 9 }}>
            <Metric label="Types Available" value={Object.keys(typeLabels || {}).length || '-'} icon={SlidersHorizontal} />
            <Metric label="Enabled Configs" value={enabledDetectionToggleCount} icon={CheckCircle2} tone="ok" />
            <Metric label="Linked Cameras" value={linkedCameraCount} icon={Radio} tone="warn" />
          </div>
          <div style={{ marginTop: 13, padding: 12, borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--bd)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--tx)' }}>Primary active detection</span>
              {(detectionSettingsApi.loading || channelsApi.loading) && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--blue)' }} />}
            </div>
            <div style={{ fontSize: 12, color: 'var(--tx2)', lineHeight: 1.4 }}>
              {firstEnabledDetection ? detectionName(firstEnabledDetection, typeLabels) : 'No enabled detection configuration found'}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 5 }}>
              {recipientLinkedCount} recipient link{recipientLinkedCount === 1 ? '' : 's'} across {detectionRows.length} configuration{detectionRows.length === 1 ? '' : 's'}
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            icon={ShieldCheck}
            title="System Configuration"
            sub="Current configuration and operational settings."
            // action={<StatusPill value="API backed" tone="ok" />}
          />
          <ComplianceRow
            label="Timezone-aware schedules"
            desc={`Detection schedules use ${savedTimezone || 'the saved admin timezone'}.`}
            enabled={!!savedTimezone}
          />
          <ComplianceRow
            label="Data retention policy"
            desc={storedRetentionEnabled ? `Automatic cleanup after ${savedRetentionLabel}.` : 'Automatic cleanup is disabled.'}
            enabled={storedRetentionEnabled}
          />
          <ComplianceRow
            label="Verified notification recipients"
            desc={`${verifiedEmails + verifiedPhones} verified contact${verifiedEmails + verifiedPhones === 1 ? '' : 's'} available for alerts.`}
            enabled={verifiedEmails + verifiedPhones > 0}
          />
          <ComplianceRow
            label="Telegram incident channel"
            desc={telegramLinked ? 'Telegram incident delivery is linked.' : 'Telegram is available but not linked.'}
            enabled={telegramLinked}
          />
          {/* <ComplianceRow
            label="Privacy masking"
            desc="No privacy-masking API is available in this build."
            enabled={false}
            last
          /> */}
        </Panel>

        <Panel>
          <PanelHeader icon={Webhook} title="Integrations" sub="Existing integrations which are configured." />
          <IntegrationRow
            icon={Mail}
            title="Email Recipients"
            desc={emailRecipients[0] ? `First recipient: ${getRecipientValue(emailRecipients[0])}` : 'No email recipients configured'}
            status={`${emailRecipients.length} configured`}
            tone={emailRecipients.length > 0 ? 'ok' : 'off'}
            onManage={() => navigate('/recipients')}
          />
          {/* <IntegrationRow
            icon={MessageSquare}
            title="SMS Recipients"
            desc={phoneRecipients[0] ? `First recipient: ${getRecipientValue(phoneRecipients[0])}` : 'No phone recipients configured'}
            status={`${phoneRecipients.length} configured`}
            tone={phoneRecipients.length > 0 ? 'ok' : 'off'}
            onManage={() => navigate('/recipients')}
          /> */}
          <IntegrationRow
            icon={Radio}
            title="Telegram"
            desc={telegramLinked ? `Chat id ${telegramChatId || 'linked'}` : telegramApi.loading ? 'Checking link status' : 'Use Alert Recipients to link a channel'}
            status={telegramLinked ? 'Linked' : 'Not linked'}
            tone={telegramLinked ? 'ok' : 'off'}
            onManage={() => navigate('/recipients')}
          />
          <IntegrationRow
            icon={SlidersHorizontal}
            title="Detection Settings"
            desc={`${linkedCameraCount} camera${linkedCameraCount === 1 ? '' : 's'} connected to detection configs`}
            status={`${enabledDetectionToggleCount} enabled`}
            tone={enabledDetectionToggleCount > 0 ? 'ok' : 'off'}
            onManage={() => navigate('/detection-settings')}
          />
          <IntegrationRow
            icon={Database}
            title="Retention Service"
            desc={storedRetentionEnabled ? `Incidents, attendance, and access logs set to ${savedRetentionLabel}` : 'Retention sweep disabled for this admin'}
            status={storedRetentionEnabled ? 'Active' : 'Paused'}
            tone={storedRetentionEnabled ? 'ok' : 'warn'}
            last
          />
        </Panel>

        <LogOrderPanel />
      </div>
    </div>
  );
}
