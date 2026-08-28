import { useMemo, useState } from 'react';
import moment from 'moment-timezone';
import {
  Clock3,
  Edit3,
  Eye,
  FileText,
  Mail,
  PauseCircle,
  PlayCircle,
  Plus,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useApi } from '../../../hooks/useApi';
import { usePermissions } from '../../../context/PermissionContext';
import MultiSelect from '../../../components/MultiSelect';
import ConfirmationModal from '../../../components/DeleteConfirmation';
import AccessDenied from '../../../components/AccessDenied';
import PageLoader from '../../../components/PageLoader';
import { getRecipients } from '../../../api/administer';
import { fetchTimezone, getTimezones, updateTimezone } from '../../../helpers/administer';
import {
  createAutoEmailReport,
  deleteAutoEmailReport,
  getAttendanceAudienceOptions,
  getAutoEmailReport,
  getAutoEmailReports,
  previewAutoEmailReport,
  sendAutoEmailReportNow,
  updateAutoEmailReport,
} from '../../../helpers/autoEmailReports';

const PAGE_SIZE = 10;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'custom', label: 'Custom' },
];
const FILTERS = [
  { value: 'organization', label: 'Whole Organization' },
  { value: 'employees', label: 'Specific Employee' },
  { value: 'departments', label: 'Specific Department' },
];

const emptyForm = () => ({
  title: '',
  recipients: [],
  frequency: 'weekly',
  time: '00:00',
  weekday: 1,
  dayOfMonth: 1,
  startDate: '',
  endDate: '',
  scope: 'organization',
  employeeIds: [],
  departmentIds: [],
  pdf: true,
  csv: false,
  enabled: true,
  sendTestMail: false,
});

const errorMessage = (error, fallback) => (
  error?.response?.data?.body?.message
  || error?.response?.data?.message
  || error?.message
  || fallback
);

function recipientValue(recipient) {
  return recipient?.email || recipient?.Email || recipient?.emailId || recipient?.value || '';
}

function employeeLabel(user) {
  return user?.name || user?.userName || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'Unnamed employee';
}

function departmentLabel(department) {
  return department?.name || department?.departmentName || department?.title || 'Unnamed department';
}

function scheduleTimezone(timezone) {
  return timezone && moment.tz.zone(timezone) ? timezone : moment.tz.guess();
}

function formatCustomDate(value, timezone) {
  if (!value) return '-';
  const zone = scheduleTimezone(timezone);
  const parsed = moment.utc(value).tz(zone);
  return parsed.isValid() ? parsed.format('D MMM YYYY') : String(value);
}

function dateInputValue(value, timezone) {
  if (!value) return '';
  const zone = scheduleTimezone(timezone);
  const parsed = moment.utc(value).tz(zone);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : '';
}

function frequencyLabel(schedule = {}, timezone) {
  const frequency = FREQUENCIES.find((item) => item.value === schedule.frequency)?.label || 'Not set';
  const timeLabel = moment(schedule.time || '00:00', 'HH:mm').format('hh:mm A');
  if (schedule.frequency === 'daily') return `${frequency}, ${timeLabel}`;
  if (schedule.frequency === 'weekly') return `${frequency}, ${WEEKDAYS[Number(schedule.weekday) || 0]} ${moment(schedule.time || '00:00', 'HH:mm').format('hh:mm A')}`;
  if (schedule.frequency === 'monthly') return `${frequency}, day ${schedule.dayOfMonth || 1} ${moment(schedule.time || '00:00', 'HH:mm').format('hh:mm A')}`;
  if (schedule.frequency === 'custom') {
    const zone = scheduleTimezone(timezone);
    return `${formatCustomDate(schedule.startDate, zone)} – ${formatCustomDate(schedule.endDate, zone)}, ${moment(schedule.time || '00:00', 'HH:mm').format('hh:mm A')} (${moment.tz(zone).format('z')})`;
  }
  return `${frequency}, ${timeLabel}`;
}

function recipientsLabel(recipients = []) {
  if (!recipients.length) return 'No recipients';
  return recipients.length === 1 ? recipients[0] : `${recipients[0]} +${recipients.length - 1} more`;
}

function formatsLabel(formats = []) {
  if (!formats.length) return 'Not set';
  return formats.map((item) => item.toUpperCase()).join(', ');
}

function formFromReport(report = {}) {
  const schedule = report.schedule || {};
  const target = report.target || {};
  const formats = Array.isArray(report.formats) ? report.formats : [];
  const timezone = report.timezone;

  return {
    title: report.title || '',
    recipients: Array.isArray(report.recipients) ? report.recipients : [],
    frequency: schedule.frequency || 'weekly',
    time: schedule.time || '00:00',
    weekday: Number.isInteger(schedule.weekday) ? schedule.weekday : 1,
    dayOfMonth: schedule.dayOfMonth || 1,
    startDate: dateInputValue(schedule.startDate, timezone),
    endDate: dateInputValue(schedule.endDate, timezone),
    scope: target.scope || 'organization',
    employeeIds: (target.employeeIds || []).map(String),
    departmentIds: (target.departmentIds || []).map(String),
    pdf: formats.includes('pdf'),
    csv: formats.includes('csv'),
    enabled: report.enabled !== false,
    sendTestMail: false,
  };
}

function buildPayload(form) {
  const schedule = {
    frequency: form.frequency,
    time: form.time || '00:00',
  };
  if (form.frequency === 'weekly') schedule.weekday = Number(form.weekday);
  if (form.frequency === 'monthly') schedule.dayOfMonth = Number(form.dayOfMonth);
  if (form.frequency === 'custom') {
    schedule.startDate = form.startDate;
    schedule.endDate = form.endDate;
  }

  const target = { scope: form.scope };
  if (form.scope === 'employees') target.employeeIds = form.employeeIds;
  if (form.scope === 'departments') target.departmentIds = form.departmentIds;

  const payload = {
    title: form.title.trim(),
    recipients: form.recipients,
    schedule,
    target,
    formats: [form.pdf && 'pdf', form.csv && 'csv'].filter(Boolean),
    enabled: form.enabled,
    sendTestMail: Boolean(form.sendTestMail),
  };
  return payload;
}

function diffPayload(base, next) {
  return Object.entries(next).reduce((diff, [key, value]) => {
    if (JSON.stringify(base?.[key]) !== JSON.stringify(value)) diff[key] = value;
    return diff;
  }, {});
}

function FieldLabel({ children, required = false }) {
  return (
    <label style={{ display: 'block', marginBottom: 7, fontSize: 12, fontWeight: 700, color: 'var(--tx2)' }}>
      {children}{required && <span style={{ color: 'var(--crit)', marginLeft: 3 }}>*</span>}
    </label>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <section style={{ padding: '15px 0', borderTop: '1px solid var(--bd)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12, color: 'var(--tx)' }}>
        <Icon size={15} style={{ color: 'var(--blue)' }} />
        <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>{title}</h3>
      </div>
      {children}
    </section>
  );
}

function TimezoneSetup({ timezoneValue, setTimezoneValue, timezones, onSave, saving }) {
  const timezoneOptions = timezones.map((timezone) => ({ id: timezone, label: timezone }));
  return (
    <div style={{ margin: '10px 0 4px', padding: 12, border: '1px solid rgba(245,158,11,.35)', borderRadius: 9, background: 'rgba(245,158,11,.1)' }}>
      <FieldLabel required>Admin timezone</FieldLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8 }}>
        <MultiSelect
          options={timezoneOptions}
          value={timezoneValue ? [timezoneValue] : []}
          onChange={(value) => setTimezoneValue(value[value.length - 1] || '')}
          placeholder="Select timezone"
          searchPlaceholder="Search timezone..."
          msg="No timezones found"
          maxHeight="max-h-52"
        />
        <button
          type="button"
          disabled={!timezoneValue || saving}
          onClick={onSave}
          style={{ minHeight: 40, padding: '0 14px', border: 0, borderRadius: 8, background: timezoneValue && !saving ? 'var(--blue)' : 'var(--bg3)', color: timezoneValue && !saving ? '#fff' : 'var(--tx3)', cursor: timezoneValue && !saving ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 700 }}
        >
          {saving ? 'Saving...' : 'Save Timezone'}
        </button>
      </div>
    </div>
  );
}

function ReportFormModal({
  form,
  setForm,
  report,
  onClose,
  onSave,
  saving,
  recipients,
  employees,
  departments,
  adminTimezone,
  timezoneValue,
  setTimezoneValue,
  timezones,
  onSaveTimezone,
  savingTimezone,
}) {
  const employeeOptions = employees.map((user) => ({ id: String(user._id || user.id), label: employeeLabel(user) })).filter((item) => item.id);
  const departmentOptions = departments.map((department) => ({ id: String(department._id || department.id), label: departmentLabel(department) })).filter((item) => item.id);
  const recipientOptions = recipients.map((recipient) => ({ id: recipientValue(recipient), label: recipientValue(recipient) })).filter((item) => item.id);
  const targetCount = form.scope === 'employees' ? form.employeeIds.length : form.departmentIds.length;
  const needsTarget = form.scope !== 'organization';
  const needsCustomRange = form.frequency === 'custom';
  const canSave = Boolean(adminTimezone)
    && form.title.trim().length >= 2
    && form.title.trim().length <= 120
    && form.recipients.length
    && (form.pdf || form.csv)
    && (!needsTarget || targetCount > 0)
    && (!needsCustomRange || (form.startDate && form.endDate));

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="auto-report-title" style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(2,6,23,.68)', backdropFilter: 'blur(5px)' }}>
      <div style={{ width: 'min(100%, 760px)', maxHeight: 'min(900px, calc(100vh - 32px))', display: 'flex', flexDirection: 'column', background: 'var(--bg1solid)', border: '1px solid var(--bd2)', borderRadius: 14, boxShadow: '0 24px 70px rgba(0,0,0,.42)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '15px 18px', background: 'linear-gradient(135deg,var(--blue),var(--violet))', color: '#fff' }}>
          <div>
            <h2 id="auto-report-title" style={{ margin: 0, fontFamily: 'var(--disp)', fontSize: 17, fontWeight: 700 }}>{report ? 'Edit Attendance Email Report' : 'New Attendance Email Report'}</h2>
            <p style={{ margin: '3px 0 0', fontSize: 11.5, opacity: .86 }}>Attendance logs are delivered using the saved admin timezone.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close report form" title="Close" style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', padding: 0, border: 0, borderRadius: 8, background: 'rgba(255,255,255,.16)', color: '#fff', cursor: 'pointer' }}><X size={17} /></button>
        </div>

        <div className="vq-scroll" style={{ padding: '8px 20px 18px', overflowY: 'auto' }}>
          {!adminTimezone && (
            <TimezoneSetup
              timezoneValue={timezoneValue}
              setTimezoneValue={setTimezoneValue}
              timezones={timezones}
              onSave={onSaveTimezone}
              saving={savingTimezone}
            />
          )}

          {adminTimezone && (
            <div style={{ margin: '10px 0 4px', padding: '10px 12px', border: '1px solid rgba(59,130,246,.28)', borderRadius: 9, background: 'rgba(59,130,246,.08)', color: 'var(--tx2)', fontSize: 11.5, lineHeight: 1.5 }}>
              Timezone: <strong style={{ color: 'var(--tx)' }}>{adminTimezone}</strong>
            </div>
          )}

          <div style={{ padding: '15px 0' }}>
            <FieldLabel required>Reports Title</FieldLabel>
            <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Enter report title" maxLength={120} style={{ width: '100%', height: 38, padding: '0 11px', border: '1px solid var(--bd)', borderRadius: 8, background: 'var(--bg2)', color: 'var(--tx)', outline: 'none', fontSize: 12.5 }} />
          </div>

          <Section title="Frequency" icon={Clock3}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 8 }}>
              {FREQUENCIES.map((frequency) => (
                <label key={frequency.value} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 38, padding: '0 11px', border: `1px solid ${form.frequency === frequency.value ? 'rgba(59,130,246,.5)' : 'var(--bd)'}`, borderRadius: 8, background: form.frequency === frequency.value ? 'rgba(59,130,246,.1)' : 'var(--bg2)', color: form.frequency === frequency.value ? 'var(--blue)' : 'var(--tx2)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>
                  <input type="radio" name="auto-report-frequency" checked={form.frequency === frequency.value} onChange={() => setForm((current) => ({ ...current, frequency: frequency.value }))} />
                  {frequency.label}
                </label>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: form.frequency === 'custom' ? 'repeat(3,minmax(0,1fr))' : 'repeat(2,minmax(0,1fr))', gap: 10, marginTop: 12 }}>
              <div>
                <FieldLabel required>Send time</FieldLabel>
                <input type="time" value={form.time} onChange={(event) => setForm((current) => ({ ...current, time: event.target.value }))} style={inputStyle} />
              </div>
              {form.frequency === 'weekly' && (
                <div>
                  <FieldLabel required>Weekly day</FieldLabel>
                  <select value={form.weekday} onChange={(event) => setForm((current) => ({ ...current, weekday: Number(event.target.value) }))} style={inputStyle}>
                    {WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}
                  </select>
                </div>
              )}
              {form.frequency === 'monthly' && (
                <div>
                  <FieldLabel required>Monthly day</FieldLabel>
                  <input type="number" min="1" max="28" value={form.dayOfMonth} onChange={(event) => setForm((current) => ({ ...current, dayOfMonth: event.target.value }))} style={inputStyle} />
                </div>
              )}
              {form.frequency === 'custom' && (
                <>
                  <div>
                    <FieldLabel required>Start date</FieldLabel>
                    <input type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <FieldLabel required>End date</FieldLabel>
                    <input type="date" value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} style={inputStyle} />
                  </div>
                </>
              )}
            </div>
          </Section>

          <Section title="Recipients" icon={Mail}>
            <FieldLabel required>Verified email recipients</FieldLabel>
            <MultiSelect options={recipientOptions} value={form.recipients} onChange={(value) => setForm((current) => ({ ...current, recipients: value }))} placeholder="Select verified recipients" searchPlaceholder="Search verified recipients..." msg="No verified email recipients found" maxHeight="max-h-48" />
          </Section>

          <Section title="Content" icon={FileText}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 42, padding: '0 12px', border: '1px solid rgba(59,130,246,.3)', borderRadius: 8, background: 'rgba(59,130,246,.09)', color: 'var(--tx)' }}>
              <input type="checkbox" checked readOnly aria-label="Attendance logs included" />
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>Attendance logs</span>
            </div>
          </Section>

          <Section title="Report format" icon={FileText}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }}>
              {[['pdf', 'PDF'], ['csv', 'CSV']].map(([key, label]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 38, padding: '0 11px', border: `1px solid ${form[key] ? 'rgba(59,130,246,.5)' : 'var(--bd)'}`, borderRadius: 8, background: form[key] ? 'rgba(59,130,246,.1)' : 'var(--bg2)', color: 'var(--tx2)', cursor: 'pointer', fontSize: 12.5 }}>
                  <input type="checkbox" checked={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.checked }))} />
                  {label}
                </label>
              ))}
            </div>
          </Section>

          <Section title="Filter" icon={Search}>
            <div style={{ display: 'grid', gap: 7 }}>
              {FILTERS.map((filter) => (
                <div key={filter.value}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 38, padding: '0 11px', border: `1px solid ${form.scope === filter.value ? 'rgba(59,130,246,.4)' : 'var(--bd)'}`, borderRadius: form.scope === filter.value && filter.value !== 'organization' ? '8px 8px 0 0' : 8, background: form.scope === filter.value ? 'rgba(59,130,246,.09)' : 'var(--bg2)', color: 'var(--tx2)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>
                    <input type="radio" name="auto-report-filter" checked={form.scope === filter.value} onChange={() => setForm((current) => ({ ...current, scope: filter.value }))} />
                    {filter.label}
                  </label>
                  {form.scope === filter.value && filter.value === 'employees' && <div style={{ padding: 10, border: '1px solid var(--bd)', borderTop: 0, borderRadius: '0 0 8px 8px', background: 'var(--bg1)' }}><MultiSelect options={employeeOptions} value={form.employeeIds} onChange={(value) => setForm((current) => ({ ...current, employeeIds: value }))} placeholder="Select employees" searchPlaceholder="Search employees..." msg="No employees found" maxHeight="max-h-48" /></div>}
                  {form.scope === filter.value && filter.value === 'departments' && <div style={{ padding: 10, border: '1px solid var(--bd)', borderTop: 0, borderRadius: '0 0 8px 8px', background: 'var(--bg1)' }}><MultiSelect options={departmentOptions} value={form.departmentIds} onChange={(value) => setForm((current) => ({ ...current, departmentIds: value }))} placeholder="Select departments" searchPlaceholder="Search departments..." msg="No departments found" maxHeight="max-h-48" /></div>}
                </div>
              ))}
            </div>
          </Section>

          <Section title="Delivery" icon={Send}>
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={checkboxRowStyle}>
                <input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} />
                Enabled
              </label>
              <label style={checkboxRowStyle}>
                <input type="checkbox" checked={form.sendTestMail} onChange={(event) => setForm((current) => ({ ...current, sendTestMail: event.target.checked }))} />
                Send Test Mail
              </label>
            </div>
          </Section>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, padding: '13px 18px', borderTop: '1px solid var(--bd)', background: 'var(--bg1)' }}>
          <button type="button" onClick={onClose} style={{ minHeight: 36, padding: '0 14px', border: '1px solid var(--bd)', borderRadius: 8, background: 'var(--bg2)', color: 'var(--tx2)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>Cancel</button>
          <button type="button" disabled={!canSave || saving} onClick={() => onSave(buildPayload(form))} style={{ minHeight: 36, padding: '0 16px', border: 0, borderRadius: 8, background: canSave && !saving ? 'linear-gradient(135deg,var(--blue),var(--violet))' : 'var(--bg3)', color: canSave && !saving ? '#fff' : 'var(--tx3)', cursor: canSave && !saving ? 'pointer' : 'not-allowed', fontSize: 12.5, fontWeight: 700 }}>{saving ? 'Saving...' : report ? 'Update Report' : 'Save Report'}</button>
        </div>
      </div>
    </div>
  );
}

const PREVIEW_COLUMNS = [
  { key: 'index', label: 'ID' },
  { key: 'employee', label: 'Name' },
  { key: 'department', label: 'Department' },
  { key: 'date', label: 'Date' },
  { key: 'location', label: 'Location' },
  { key: 'checkIn', label: 'Check in' },
  { key: 'checkOut', label: 'Check out' },
  { key: 'duration', label: 'Duration' },
  { key: 'workingHoursDay', label: 'Total Working Hrs (Day)' },
  { key: 'breakHoursDay', label: 'Total Break Hrs (Day)' },
  { key: 'workingHoursPeriod', label: 'Total Working Hrs (Period)' },
  { key: 'checkInCamera', label: 'Checkin Camera' },
  { key: 'checkOutCamera', label: 'Checkout Camera' },
  { key: 'viewImage', label: 'View Image' },
];

const IMAGE_KEY = 'viewImage';

function imageLink(value) {
  return value && value !== '-'
    ? <a href={String(value)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)', fontWeight: 600 }}>View Image</a>
    : '-';
}

function cellText(value) {
  return value === null || value === undefined || value === '' || value === '-' ? '-' : String(value);
}

/**
 * Expand one employee-day preview row into the same block the PDF/CSV render:
 *   - summary row: identity + first check-in / last check-out + period total
 *   - one row per session: check-in / check-out / duration / cameras / image
 *   - day-totals row: Total Working Hrs (Day) + Total Break Hrs (Day)
 * Each returned entry is { cells: {colKey: node}, kind }.
 */
function expandPreviewRow(row, displayIndex) {
  const blank = () => Object.fromEntries(PREVIEW_COLUMNS.map((c) => [c.key, '']));

  const summary = blank();
  summary.index = displayIndex;
  summary.employee = cellText(row.employee);
  summary.department = cellText(row.department);
  summary.date = cellText(row.date);
  summary.location = cellText(row.location);
  summary.checkIn = cellText(row.checkIn);
  summary.checkOut = cellText(row.checkOut);
  summary.duration = cellText(row.duration);
  summary.workingHoursPeriod = cellText(row.workingHoursPeriod);
  summary.checkInCamera = cellText(row.checkInCamera);
  summary.checkOutCamera = cellText(row.checkOutCamera);
  summary[IMAGE_KEY] = imageLink(row.viewImage);

  const sessions = (Array.isArray(row.sessions) ? row.sessions : []).map((session) => {
    const line = blank();
    line.checkIn = cellText(session.checkIn);
    line.checkOut = cellText(session.checkOut);
    line.duration = cellText(session.duration);
    line.checkInCamera = cellText(session.checkInCamera);
    line.checkOutCamera = cellText(session.checkOutCamera);
    line[IMAGE_KEY] = imageLink(session.viewImage);
    return { cells: line, kind: 'session' };
  });

  const dayTotals = blank();
  dayTotals.workingHoursDay = cellText(row.workingHoursDay);
  dayTotals.breakHoursDay = cellText(row.breakHoursDay);

  return [
    { cells: summary, kind: 'summary' },
    ...sessions,
    { cells: dayTotals, kind: 'totals' },
  ];
}

function PreviewModal({ preview, onClose }) {
  const rows = Array.isArray(preview?.rows) ? preview.rows : [];
  const gridRows = rows.flatMap((row, index) => expandPreviewRow(row, index + 1));
  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(2,6,23,.68)' }}>
      <div style={{ width: 'min(100%, 780px)', maxHeight: 'min(820px, calc(100vh - 32px))', display: 'flex', flexDirection: 'column', background: 'var(--bg1solid)', border: '1px solid var(--bd2)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--bd)' }}>
          <div>
            <div style={{ fontFamily: 'var(--disp)', fontSize: 16, fontWeight: 700, color: 'var(--tx)' }}>{preview?.label || 'Preview'}</div>
            <div style={{ marginTop: 3, color: 'var(--tx3)', fontSize: 11.5 }}>{preview?.timezone || 'Timezone not set'} - {rows.length} row{rows.length === 1 ? '' : 's'}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close preview" style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', border: '1px solid var(--bd)', borderRadius: 8, background: 'var(--bg2)', color: 'var(--tx2)', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        <div style={{ overflow: 'auto', padding: 16 }}>
          {!rows.length ? (
            <div style={{ padding: 34, textAlign: 'center', color: 'var(--tx3)', fontSize: 12.5 }}>No preview rows returned.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', color: 'var(--tx)', fontSize: 12 }}>
              <thead>
                <tr>{PREVIEW_COLUMNS.map((column) => <th key={column.key} style={tableHeadStyle}>{column.label}</th>)}</tr>
              </thead>
              <tbody>
                {gridRows.map((line, index) => (
                  <tr
                    key={index}
                    style={line.kind === 'summary'
                      ? { background: 'var(--bg2)', fontWeight: 600 }
                      : line.kind === 'totals'
                        ? { color: 'var(--tx2)', fontStyle: 'italic' }
                        : undefined}
                  >
                    {PREVIEW_COLUMNS.map((column) => (
                      <td key={column.key} style={tableCellStyle}>{line.cells[column.key] === '' ? '' : line.cells[column.key]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AutoEmailReports() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingReport, setEditingReport] = useState(null);
  const [editingBasePayload, setEditingBasePayload] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [timezoneValue, setTimezoneValue] = useState('');
  const [savingTimezone, setSavingTimezone] = useState(false);
  const [preview, setPreview] = useState(null);
  const [busyActionId, setBusyActionId] = useState('');

  const { permissions, loading: permissionsLoading } = usePermissions();
  const canViewReports = permissions?.autoEmailReports?.view === true;
  const canCreateReports = permissions?.autoEmailReports?.create === true;
  const canEditReports = permissions?.autoEmailReports?.edit === true;
  const canDeleteReports = permissions?.autoEmailReports?.delete === true;

  const reportsApi = useApi(() => getAutoEmailReports({ page, limit: PAGE_SIZE, search }), [page, search], { enabled: canViewReports });
  const recipientsApi = useApi(() => getRecipients({ alertType: 'email', filterByStatus: 'verified', skip: 0, limit: 100 }), [], { enabled: canViewReports });
  const timezoneApi = useApi(() => fetchTimezone(), [], { enabled: canViewReports });
  const timezonesApi = useApi(() => getTimezones('asia'), [], { enabled: canViewReports && !timezoneApi.data });
  const audienceApi = useApi(() => getAttendanceAudienceOptions({ search: '' }), [formOpen], { enabled: formOpen && (canCreateReports || canEditReports) });

  const reports = reportsApi.data?.reports || [];
  const total = reportsApi.data?.total || 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const recipients = recipientsApi.data?.recipients || [];
  const employees = audienceApi.data?.employees || [];
  const departments = audienceApi.data?.departments || [];
  const adminTimezone = timezoneApi.data || '';
  const timezones = Array.isArray(timezonesApi.data) ? timezonesApi.data : [];

  if (permissionsLoading) return <PageLoader />;
  if (!canViewReports) return <AccessDenied message="You don't have permission to view Auto Email Reports." />;

  const openCreate = () => {
    if (!canCreateReports) return;
    setEditingReport(null);
    setEditingBasePayload(null);
    setForm(emptyForm());
    setTimezoneValue('');
    setFormOpen(true);
  };

  const openEdit = async (report) => {
    if (!canEditReports) return;
    setBusyActionId(`edit:${report._id}`);
    try {
      const detail = await getAutoEmailReport(report._id);
      const hydratedReport = detail?.report || detail;
      const nextForm = formFromReport(hydratedReport);
      setEditingReport(hydratedReport);
      setEditingBasePayload(buildPayload(nextForm));
      setForm(nextForm);
      setTimezoneValue('');
      setFormOpen(true);
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to load report details.'));
    } finally {
      setBusyActionId('');
    }
  };

  const saveTimezone = async () => {
    if (!canCreateReports && !canEditReports) return;
    if (!timezoneValue) return;
    setSavingTimezone(true);
    try {
      await updateTimezone(timezoneValue);
      await timezoneApi.refetch();
      toast.success('Timezone saved.');
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to save timezone.'));
    } finally {
      setSavingTimezone(false);
    }
  };

  const saveReport = async (payload) => {
    if (editingReport?._id ? !canEditReports : !canCreateReports) return;
    if (!adminTimezone) {
      toast.error('Timezone setup required.');
      return;
    }
    setSaving(true);
    try {
      let result;
      if (editingReport?._id) {
        const changes = diffPayload(editingBasePayload, payload);
        if (!Object.keys(changes).length) {
          toast.info('No report changes to save.');
          setSaving(false);
          return;
        }
        result = await updateAutoEmailReport(editingReport._id, changes);
      } else {
        result = await createAutoEmailReport(payload);
      }
      if (result?.data?.testMailError) {
        toast.warning(result.message);
      } else {
        toast.success(result?.message);
      }
      setFormOpen(false);
      await reportsApi.refetch();
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to save attendance email report.'));
    } finally {
      setSaving(false);
    }
  };

  const deleteReport = async () => {
    if (!canDeleteReports) return;
    if (!deleteTarget?._id) return;
    setDeleting(true);
    try {
      await deleteAutoEmailReport(deleteTarget._id);
      toast.success('Attendance email report deleted.');
      setDeleteTarget(null);
      if (reports.length === 1 && page > 1) setPage((current) => current - 1);
      else await reportsApi.refetch();
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to delete attendance email report.'));
    } finally {
      setDeleting(false);
    }
  };

  const toggleReport = async (report) => {
    if (!canEditReports) return;
    setBusyActionId(`toggle:${report._id}`);
    try {
      await updateAutoEmailReport(report._id, { enabled: !report.enabled });
      toast.success(report.enabled ? 'Report paused.' : 'Report enabled.');
      await reportsApi.refetch({ silent: true });
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to update report status.'));
    } finally {
      setBusyActionId('');
    }
  };

  const sendNow = async (report) => {
    if (!canEditReports) return;
    setBusyActionId(`send:${report._id}`);
    try {
      await sendAutoEmailReportNow(report._id);
      toast.success('Test mail sent.');
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to send test mail.'));
    } finally {
      setBusyActionId('');
    }
  };

  const previewReport = async (report) => {
    if (!canViewReports) return;
    setBusyActionId(`preview:${report._id}`);
    try {
      const data = await previewAutoEmailReport(report._id);
      setPreview(data?.preview || data);
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to load preview.'));
    } finally {
      setBusyActionId('');
    }
  };

  const tableRows = useMemo(() => reports.map((report) => ({
    ...report,
    frequencyLabel: frequencyLabel(report.schedule, report.timezone || adminTimezone),
    recipientsLabel: recipientsLabel(report.recipients),
    attendanceLabel: formatsLabel(report.formats),
  })), [reports]);

  return (
    <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      <div className="vq-auto-report-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {canCreateReports && (
          <button type="button" onClick={openCreate} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 36, padding: '0 15px', border: 0, borderRadius: 9, background: 'linear-gradient(135deg,var(--blue),var(--violet))', color: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, boxShadow: '0 8px 18px rgba(59,130,246,.22)' }}>
            <Plus size={15} /> Create New Report
          </button>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, width: 'min(100%, 330px)', height: 36, padding: '0 11px', border: '1px solid var(--bd)', borderRadius: 9, background: 'var(--bg2)' }}>
          <Search size={14} style={{ color: 'var(--tx3)', flexShrink: 0 }} />
          <input value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} placeholder="Search by title or recipients..." style={{ width: '100%', border: 0, outline: 0, background: 'transparent', color: 'var(--tx)', fontSize: 12.5 }} />
        </div>
      </div>

      <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 13, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--bd)' }}>
          <div><div style={{ fontFamily: 'var(--disp)', fontSize: 15, fontWeight: 700, color: 'var(--tx)' }}>Auto Email Reports</div><div style={{ marginTop: 3, fontSize: 11, color: 'var(--tx3)' }}>Attendance logs delivered on a schedule.</div></div>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--tx3)' }}>{total} report{total === 1 ? '' : 's'}</span>
        </div>

        <div className="vq-auto-report-table-scroll" style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 780 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1.1fr 1.5fr .8fr 180px', gap: 12, alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--bd)', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.07em', color: 'var(--tx3)' }}>
              <span>TITLE</span><span>FREQUENCY</span><span>RECIPIENTS</span><span>ATTENDANCE</span><span>ACTION</span>
            </div>
            {reportsApi.loading ? <div style={{ padding: 38, textAlign: 'center', color: 'var(--tx3)', fontSize: 12.5 }}>Loading reports...</div> : reportsApi.error ? <div style={{ padding: 38, textAlign: 'center', color: 'var(--crit)', fontSize: 12.5 }}>Failed to load reports. <button type="button" onClick={reportsApi.refetch} style={{ border: 0, background: 'transparent', color: 'var(--blue)', cursor: 'pointer', fontWeight: 700 }}>Retry</button></div> : tableRows.length === 0 ? <div style={{ padding: 44, textAlign: 'center', color: 'var(--tx3)', fontSize: 12.5 }}>No auto email reports found.</div> : tableRows.map((report) => (
              <div key={report._id} style={{ display: 'grid', gridTemplateColumns: '1.35fr 1.1fr 1.5fr .8fr 180px', gap: 12, alignItems: 'center', minHeight: 64, padding: '10px 16px', borderBottom: '1px solid var(--bd)', color: 'var(--tx)', fontSize: 12.5 }}>
                <div style={{ minWidth: 0 }}><div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}><span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={report.title}>{report.title}</span><span style={{ flexShrink: 0, padding: '2px 7px', borderRadius: 999, background: report.enabled ? 'rgba(34,197,94,.12)' : 'rgba(148,163,184,.16)', color: report.enabled ? 'var(--ok)' : 'var(--tx3)', fontSize: 10, fontWeight: 700 }}>{report.enabled ? 'Enabled' : 'Paused'}</span></div><div style={{ marginTop: 3, fontSize: 10.5, color: 'var(--tx3)' }}>{report.timezone || adminTimezone || 'Timezone not set'}</div></div>
                <span style={{ color: 'var(--tx2)' }}>{report.frequencyLabel}</span>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--tx2)' }} title={Array.isArray(report.recipients) ? report.recipients.join(', ') : ''}>{report.recipientsLabel}</span>
                <span style={{ color: 'var(--tx2)' }}>{report.attendanceLabel}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <IconButton title="Preview" busy={busyActionId === `preview:${report._id}`} onClick={() => previewReport(report)}><Eye size={14} /></IconButton>
                  {canEditReports && (
                    <>
                      <IconButton title="Send test mail" busy={busyActionId === `send:${report._id}`} onClick={() => sendNow(report)}><Send size={14} /></IconButton>
                      <IconButton title={report.enabled ? 'Pause report' : 'Enable report'} busy={busyActionId === `toggle:${report._id}`} onClick={() => toggleReport(report)}>{report.enabled ? <PauseCircle size={14} /> : <PlayCircle size={14} />}</IconButton>
                      <IconButton title="Edit report" busy={busyActionId === `edit:${report._id}`} onClick={() => openEdit(report)}><Edit3 size={14} /></IconButton>
                    </>
                  )}
                  {canDeleteReports && (
                    <button type="button" onClick={() => setDeleteTarget(report)} title="Delete report" aria-label={`Delete ${report.title}`} style={{ ...iconButtonStyle, border: '1px solid rgba(255,77,77,.25)', background: 'rgba(255,77,77,.08)', color: 'var(--crit)', cursor: 'pointer' }}><Trash2 size={14} /></button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '12px 16px', color: 'var(--tx3)', fontSize: 11.5 }}>
          <span>{total ? `Showing ${(page - 1) * PAGE_SIZE + 1} to ${Math.min(page * PAGE_SIZE, total)} of ${total}` : 'Showing 0 to 0 of 0'}</span>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <button type="button" disabled={page === 1} onClick={() => setPage(1)} title="First page" style={{ ...paginationButton, opacity: page === 1 ? .45 : 1 }}>{'<<'}</button>
            <button type="button" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))} title="Previous page" style={{ ...paginationButton, opacity: page === 1 ? .45 : 1 }}>{'<'}</button>
            <span style={{ minWidth: 76, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 10.5 }}>Page {page} of {pages}</span>
            <button type="button" disabled={page >= pages} onClick={() => setPage((current) => Math.min(pages, current + 1))} title="Next page" style={{ ...paginationButton, opacity: page >= pages ? .45 : 1 }}>{'>'}</button>
            <button type="button" disabled={page >= pages} onClick={() => setPage(pages)} title="Last page" style={{ ...paginationButton, opacity: page >= pages ? .45 : 1 }}>{'>>'}</button>
          </div>
        </div>
      </div>

      {formOpen && (
        <ReportFormModal
          form={form}
          setForm={setForm}
          report={editingReport}
          onClose={() => setFormOpen(false)}
          onSave={saveReport}
          saving={saving}
          recipients={recipients}
          employees={employees}
          departments={departments}
          adminTimezone={adminTimezone}
          timezoneValue={timezoneValue}
          setTimezoneValue={setTimezoneValue}
          timezones={timezones}
          onSaveTimezone={saveTimezone}
          savingTimezone={savingTimezone}
        />
      )}
      {preview && <PreviewModal preview={preview} onClose={() => setPreview(null)} />}
      {canDeleteReports && (
        <ConfirmationModal open={!!deleteTarget} title="Delete Attendance Email Report" message={<>Delete <strong>{deleteTarget?.title}</strong>? This action cannot be undone.</>} confirmLabel="Delete" onClose={() => setDeleteTarget(null)} onConfirm={deleteReport} loading={deleting} />
      )}
    </div>
  );
}

function IconButton({ children, title, onClick, busy }) {
  return (
    <button type="button" disabled={busy} onClick={onClick} title={title} aria-label={title} style={{ ...iconButtonStyle, opacity: busy ? .55 : 1, cursor: busy ? 'wait' : 'pointer' }}>
      {children}
    </button>
  );
}

const inputStyle = {
  width: '100%',
  height: 38,
  padding: '0 11px',
  border: '1px solid var(--bd)',
  borderRadius: 8,
  background: 'var(--bg2)',
  color: 'var(--tx)',
  outline: 'none',
  fontSize: 12.5,
};

const checkboxRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minHeight: 38,
  padding: '0 11px',
  border: '1px solid var(--bd)',
  borderRadius: 8,
  background: 'var(--bg2)',
  color: 'var(--tx2)',
  cursor: 'pointer',
  fontSize: 12.5,
  fontWeight: 600,
};

const iconButtonStyle = {
  width: 28,
  height: 28,
  display: 'grid',
  placeItems: 'center',
  border: '1px solid var(--bd)',
  borderRadius: 7,
  background: 'var(--bg2)',
  color: 'var(--blue)',
};

const paginationButton = {
  width: 28,
  height: 28,
  border: '1px solid var(--bd)',
  borderRadius: 7,
  background: 'var(--bg2)',
  color: 'var(--tx2)',
  cursor: 'pointer',
  fontSize: 12,
  lineHeight: 1,
};

const tableHeadStyle = {
  padding: 9,
  border: '1px solid var(--bd)',
  background: 'var(--bg2)',
  color: 'var(--tx2)',
  textAlign: 'left',
  fontWeight: 700,
};

const tableCellStyle = {
  padding: 9,
  border: '1px solid var(--bd)',
  color: 'var(--tx2)',
  whiteSpace: 'nowrap',
};
