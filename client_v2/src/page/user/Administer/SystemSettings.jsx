import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  Clock,
  Database,
  Loader2,
  Mail,
  MessageSquare,
  Radio,
  ShieldCheck,
  SlidersHorizontal,
  Volume2,
  Webhook,
  XCircle,
} from 'lucide-react';
import { useApi } from '../../../hooks/useApi';
import {
  fetchAdmin,
  fetchTimezone,
  getTimezones,
  updateRetention,
  updateTimezone,
} from '../../../helpers/administer';
import { useAttendanceSocket } from '../../../context/AttendanceSocketContext';
import { getDetectionSettings, getDetectionTypes } from '../../../helpers/configure';
import { getRecipients } from '../../../helpers/recipients';
import { getTelegramLinkCode } from '../../../helpers/telegram';

const RETENTION_MIN = 7;
const RETENTION_MAX = 365;

function boolText(value) {
  return value ? 'Enabled' : 'Disabled';
}

function parseRetentionDays(spec) {
  if (!spec || String(spec).toLowerCase() === 'never') return 30;
  const match = String(spec).trim().match(/^(\d+)\s*([dmy])$/i);
  if (!match) return 30;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === 'm') return value * 30;
  if (unit === 'y') return value * 365;
  return value;
}

function isNeverRetention(spec) {
  return String(spec || '').toLowerCase() === 'never';
}

function storedRetentionDays(...specs) {
  const configured = specs.find((spec) => spec && !isNeverRetention(spec));
  return Math.min(RETENTION_MAX, Math.max(RETENTION_MIN, parseRetentionDays(configured)));
}

function retentionLabel(spec, fallbackDays) {
  if (!spec) return `${fallbackDays} days`;
  if (isNeverRetention(spec)) return 'Never purge';
  return `${parseRetentionDays(spec)} days`;
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
  return (
    <div style={{ position: 'relative' }}>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{
          width: '100%',
          height: 38,
          padding: '0 34px 0 12px',
          boxSizing: 'border-box',
          borderRadius: 9,
          background: 'var(--bg2)',
          border: '1px solid var(--bd)',
          fontSize: 12.5,
          color: 'var(--tx)',
          outline: 'none',
          appearance: 'none',
          cursor: disabled ? 'wait' : 'pointer',
          opacity: disabled ? 0.7 : 1,
        }}
      >
        {!value && <option value="">Select timezone</option>}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        style={{
          position: 'absolute',
          right: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
          color: 'var(--tx3)',
        }}
      />
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

export default function SystemSettings() {
  const navigate = useNavigate();
  const audio = useAttendanceSocket() || {};
  const adminApi = useApi(() => fetchAdmin(), []);
  const timezoneApi = useApi(() => fetchTimezone(), []);
  const timezonesApi = useApi(() => getTimezones(), []);
  const emailRecipientsApi = useApi(() => getRecipients('email', '', 'All', 0, 100), []);
  const phoneRecipientsApi = useApi(() => getRecipients('phone', '', 'All', 0, 100), []);
  const telegramApi = useApi(() => getTelegramLinkCode(), [], { pollMs: 10000 });
  const detectionTypesApi = useApi(() => getDetectionTypes(), []);
  const detectionSettingsApi = useApi(() => getDetectionSettings({ skip: 0, limit: 500 }), []);

  const [timezoneSaving, setTimezoneSaving] = useState(false);
  const [retentionSaving, setRetentionSaving] = useState(false);
  const [retentionEnabled, setRetentionEnabled] = useState(true);
  const [retentionDays, setRetentionDays] = useState(30);

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

  const retention = admin.retention || {};
  const storedIncidentRetention = retention.incidents || '';
  const storedAttendanceRetention = retention.attendance || '';
  const storedAccessRetention = retention.accessLogs || '';

  useEffect(() => {
    const specs = [storedIncidentRetention, storedAttendanceRetention, storedAccessRetention].filter(Boolean);
    const allStoredSpecsNever = specs.length > 0 && specs.every(isNeverRetention);
    setRetentionEnabled(retention.enabled !== false && !allStoredSpecsNever);
    setRetentionDays(storedRetentionDays(storedIncidentRetention, storedAttendanceRetention, storedAccessRetention));
  }, [retention.enabled, storedIncidentRetention, storedAttendanceRetention, storedAccessRetention]);

  const soundEnabled = !!audio.audioEnabled;
  const emailRecipients = Array.isArray(emailRecipientsApi.data) ? emailRecipientsApi.data : [];
  const phoneRecipients = Array.isArray(phoneRecipientsApi.data) ? phoneRecipientsApi.data : [];
  const verifiedEmails = emailRecipients.filter(isVerified).length;
  const verifiedPhones = phoneRecipients.filter(isVerified).length;
  const telegramLinked = !!telegramApi.data?.linked;
  const telegramChatId = telegramApi.data?.chatId || admin.telegramChatId || '';

  const typeLabels = detectionTypesApi.data || {};
  const detectionRows = normalizeDetectionRows(detectionSettingsApi.data);
  const enabledDetectionRows = detectionRows.filter((row) => (row?.detectionSetting || row)?.enabled !== false);
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

  const canSaveRetention = !!admin.user_id && !retentionSaving;

  const handleSoundToggle = async (next) => {
    await audio.setAudioEnabled?.(next, {
      successMessage: `Detection audio alerts ${next ? 'enabled' : 'disabled'}`,
    });
  };

  const handleTimezoneChange = async (next) => {
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

  const handleRetentionSave = async () => {
    if (!admin.user_id) {
      toast.error('Admin user id is not available yet');
      return;
    }
    setRetentionSaving(true);
    try {
      const spec = retentionEnabled ? `${retentionDays}d` : 'never';
      await updateRetention({
        userId: admin.user_id,
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
            sub={loadingMain ? 'Loading admin settings...' : 'Admin profile and platform defaults from /admin APIs.'}
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
                <SelectField value={savedTimezone} options={timezoneOptions} onChange={handleTimezoneChange} disabled={timezoneSaving || timezonesApi.loading} />
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
            sub="Configured from recipients, Telegram link status, and logs sound APIs."
            action={<ActionButton onClick={() => navigate('/recipients')}>Recipients</ActionButton>}
          />
          <ToggleRow
            icon={Mail}
            label="Email Alerts"
            desc={`${verifiedEmails}/${emailRecipients.length} verified recipient${emailRecipients.length === 1 ? '' : 's'}`}
            value={emailRecipients.length > 0}
            disabled
          />
          <ToggleRow
            icon={MessageSquare}
            label="SMS Alerts"
            desc={`${verifiedPhones}/${phoneRecipients.length} verified phone recipient${phoneRecipients.length === 1 ? '' : 's'}`}
            value={phoneRecipients.length > 0}
            disabled
          />
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
            desc="Control audible alert notifications for live attendance"
            value={soundEnabled}
            onChange={handleSoundToggle}
            loading={audio.audioSaving}
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
            sub="Saved through the existing /admin/retention endpoint for incidents, attendance, and access logs."
            action={
              <ActionButton onClick={handleRetentionSave} disabled={!canSaveRetention} icon={retentionSaving ? Loader2 : null} variant="primary">
                Save
              </ActionButton>
            }
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)' }}>Automatic cleanup</div>
              <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 2 }}>{retentionEnabled ? `${retentionDays} day policy` : 'Keep data forever'}</div>
            </div>
            <Toggle value={retentionEnabled} onChange={setRetentionEnabled} disabled={retentionSaving} />
          </div>
          <input
            type="range"
            min={RETENTION_MIN}
            max={RETENTION_MAX}
            value={retentionDays}
            disabled={!retentionEnabled || retentionSaving}
            onChange={(e) => setRetentionDays(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--blue)', height: 5, cursor: retentionEnabled ? 'pointer' : 'default', opacity: retentionEnabled ? 1 : 0.55 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--tx3)', marginTop: 6 }}>
            <span>7d</span>
            <span>90d</span>
            <span>180d</span>
            <span>365d</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 9, marginTop: 14 }}>
            <Metric label="Incidents" value={retentionLabel(storedIncidentRetention, retentionDays)} icon={Database} />
            <Metric label="Attendance" value={retentionLabel(storedAttendanceRetention, retentionDays)} icon={Clock} tone="ok" />
            <Metric label="Access Logs" value={retentionLabel(storedAccessRetention, retentionDays)} icon={ShieldCheck} tone="warn" />
          </div>
        </Panel>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
        <Panel>
          <PanelHeader
            icon={SlidersHorizontal}
            title="AI Detection Defaults"
            sub="Summary from the detection settings and detection types APIs."
            action={<ActionButton onClick={() => navigate('/engines')}>Manage</ActionButton>}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 9 }}>
            <Metric label="Types Available" value={Object.keys(typeLabels || {}).length || '-'} icon={SlidersHorizontal} />
            <Metric label="Enabled Configs" value={enabledDetectionRows.length} icon={CheckCircle2} tone="ok" />
            <Metric label="Linked Cameras" value={linkedCameraCount} icon={Radio} tone="warn" />
          </div>
          <div style={{ marginTop: 13, padding: 12, borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--bd)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--tx)' }}>Primary active detection</span>
              {detectionSettingsApi.loading && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--blue)' }} />}
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
            desc={retentionEnabled ? `Automatic cleanup after ${retentionDays} days.` : 'Automatic cleanup is disabled.'}
            enabled={retentionEnabled}
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
          <PanelHeader icon={Webhook} title="Integrations" sub="Existing integrations detected from configured APIs." />
          <IntegrationRow
            icon={Mail}
            title="Email Recipients"
            desc={emailRecipients[0] ? `First recipient: ${getRecipientValue(emailRecipients[0])}` : 'No email recipients configured'}
            status={`${emailRecipients.length} configured`}
            tone={emailRecipients.length > 0 ? 'ok' : 'off'}
            onManage={() => navigate('/recipients')}
          />
          <IntegrationRow
            icon={MessageSquare}
            title="SMS Recipients"
            desc={phoneRecipients[0] ? `First recipient: ${getRecipientValue(phoneRecipients[0])}` : 'No phone recipients configured'}
            status={`${phoneRecipients.length} configured`}
            tone={phoneRecipients.length > 0 ? 'ok' : 'off'}
            onManage={() => navigate('/recipients')}
          />
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
            status={`${enabledDetectionRows.length} enabled`}
            tone={enabledDetectionRows.length > 0 ? 'ok' : 'off'}
            onManage={() => navigate('/engines')}
          />
          <IntegrationRow
            icon={Database}
            title="Retention Service"
            desc={retentionEnabled ? `Incidents, attendance, and access logs set to ${retentionDays} days` : 'Retention sweep disabled for this admin'}
            status={retentionEnabled ? 'Active' : 'Paused'}
            tone={retentionEnabled ? 'ok' : 'warn'}
            last
          />
        </Panel>
      </div>
    </div>
  );
}
