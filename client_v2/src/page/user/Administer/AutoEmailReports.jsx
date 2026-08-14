import { useMemo, useState } from 'react';
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
import MultiSelect from '../../../components/MultiSelect';
import ConfirmationModal from '../../../components/DeleteConfirmation';
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

function frequencyLabel(schedule = {}) {
  const frequency = FREQUENCIES.find((item) => item.value === schedule.frequency)?.label || 'Not set';
  if (schedule.frequency === 'weekly') return `${frequency}, ${WEEKDAYS[Number(schedule.weekday) || 0]} ${schedule.time || '00:00'}`;
  if (schedule.frequency === 'monthly') return `${frequency}, day ${schedule.dayOfMonth || 1} ${schedule.time || '00:00'}`;
  if (schedule.frequency === 'custom') return `${frequency}, ${schedule.startDate || '-'} to ${schedule.endDate || '-'}`;
  return `${frequency}, ${schedule.time || '00:00'}`;
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

  return {
    title: report.title || '',
    recipients: Array.isArray(report.recipients) ? report.recipients : [],
    frequency: schedule.frequency || 'weekly',
    time: schedule.time || '00:00',
    weekday: Number.isInteger(schedule.weekday) ? schedule.weekday : 1,
    dayOfMonth: schedule.dayOfMonth || 1,
    startDate: schedule.startDate || '',
    endDate: schedule.endDate || '',
    scope: target.scope || 'organization',
    employeeIds: (target.employeeIds || []).map(String),
    departmentIds: (target.departmentIds || []).map(String),
    pdf: formats.includes('pdf'),
    csv: formats.includes('csv'),
    enabled: report.enabled !== false,
    sendTestMail: false,
  };
}

function buildPayload(form, { includeSendTestMail = true } = {}) {
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
  };
  if (includeSendTestMail) payload.sendTestMail = Boolean(form.sendTestMail);
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
              {!report && (
                <label style={checkboxRowStyle}>
                  <input type="checkbox" checked={form.sendTestMail} onChange={(event) => setForm((current) => ({ ...current, sendTestMail: event.target.checked }))} />
                  Send Test Mail
                </label>
              )}
            </div>
          </Section>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, padding: '13px 18px', borderTop: '1px solid var(--bd)', background: 'var(--bg1)' }}>
          <button type="button" onClick={onClose} style={{ minHeight: 36, padding: '0 14px', border: '1px solid var(--bd)', borderRadius: 8, background: 'var(--bg2)', color: 'var(--tx2)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>Cancel</button>
          <button type="button" disabled={!canSave || saving} onClick={() => onSave(buildPayload(form, { includeSendTestMail: !report }))} style={{ minHeight: 36, padding: '0 16px', border: 0, borderRadius: 8, background: canSave && !saving ? 'linear-gradient(135deg,var(--blue),var(--violet))' : 'var(--bg3)', color: canSave && !saving ? '#fff' : 'var(--tx3)', cursor: canSave && !saving ? 'pointer' : 'not-allowed', fontSize: 12.5, fontWeight: 700 }}>{saving ? 'Saving...' : report ? 'Update Report' : 'Save Report'}</button>
        </div>
      </div>
    </div>
  );
}

function PreviewModal({ preview, onClose }) {
  const rows = Array.isArray(preview?.rows) ? preview.rows : [];
  const keys = rows[0] ? Object.keys(rows[0]).slice(0, 8) : [];
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
                <tr>{keys.map((key) => <th key={key} style={tableHeadStyle}>{key}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row?._id || index}>{keys.map((key) => <td key={key} style={tableCellStyle}>{String(row?.[key] ?? '')}</td>)}</tr>
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

  const reportsApi = useApi(() => getAutoEmailReports({ page, limit: PAGE_SIZE, search }), [page, search]);
  const recipientsApi = useApi(() => getRecipients({ alertType: 'email', filterByStatus: 'verified', skip: 0, limit: 100 }), []);
  const timezoneApi = useApi(() => fetchTimezone(), []);
  const timezonesApi = useApi(() => getTimezones('asia'), [], { enabled: !timezoneApi.data });
  const audienceApi = useApi(() => getAttendanceAudienceOptions({ search: '' }), [formOpen], { enabled: formOpen });

  const reports = reportsApi.data?.reports || [];
  const total = reportsApi.data?.total || 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const recipients = recipientsApi.data?.recipients || [];
  const employees = audienceApi.data?.employees || [];
  const departments = audienceApi.data?.departments || [];
  const adminTimezone = timezoneApi.data || '';
  const timezones = Array.isArray(timezonesApi.data) ? timezonesApi.data : [];

  const openCreate = () => {
    setEditingReport(null);
    setEditingBasePayload(null);
    setForm(emptyForm());
    setTimezoneValue('');
    setFormOpen(true);
  };

  const openEdit = async (report) => {
    setBusyActionId(`edit:${report._id}`);
    try {
      const detail = await getAutoEmailReport(report._id);
      const hydratedReport = detail?.report || detail;
      const nextForm = formFromReport(hydratedReport);
      setEditingReport(hydratedReport);
      setEditingBasePayload(buildPayload(nextForm, { includeSendTestMail: false }));
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
    if (!adminTimezone) {
      toast.error('Timezone setup required.');
      return;
    }
    setSaving(true);
    try {
      if (editingReport?._id) {
        const changes = diffPayload(editingBasePayload, payload);
        if (!Object.keys(changes).length) {
          toast.info('No report changes to save.');
          setSaving(false);
          return;
        }
        await updateAutoEmailReport(editingReport._id, changes);
      } else {
        await createAutoEmailReport(payload);
      }
      toast.success(editingReport ? 'Attendance email report updated.' : 'Attendance email report created.');
      setFormOpen(false);
      await reportsApi.refetch();
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to save attendance email report.'));
    } finally {
      setSaving(false);
    }
  };

  const deleteReport = async () => {
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
    frequencyLabel: frequencyLabel(report.schedule),
    recipientsLabel: recipientsLabel(report.recipients),
    attendanceLabel: formatsLabel(report.formats),
  })), [reports]);

  return (
    <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      <div className="vq-auto-report-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={openCreate} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 36, padding: '0 15px', border: 0, borderRadius: 9, background: 'linear-gradient(135deg,var(--blue),var(--violet))', color: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, boxShadow: '0 8px 18px rgba(59,130,246,.22)' }}><Plus size={15} /> Create New Report</button>
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
                  <IconButton title="Send test mail" busy={busyActionId === `send:${report._id}`} onClick={() => sendNow(report)}><Send size={14} /></IconButton>
                  <IconButton title={report.enabled ? 'Pause report' : 'Enable report'} busy={busyActionId === `toggle:${report._id}`} onClick={() => toggleReport(report)}>{report.enabled ? <PauseCircle size={14} /> : <PlayCircle size={14} />}</IconButton>
                  <IconButton title="Edit report" busy={busyActionId === `edit:${report._id}`} onClick={() => openEdit(report)}><Edit3 size={14} /></IconButton>
                  <button type="button" onClick={() => setDeleteTarget(report)} title="Delete report" aria-label={`Delete ${report.title}`} style={{ ...iconButtonStyle, border: '1px solid rgba(255,77,77,.25)', background: 'rgba(255,77,77,.08)', color: 'var(--crit)' }}><Trash2 size={14} /></button>
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
      <ConfirmationModal open={!!deleteTarget} title="Delete Attendance Email Report" message={<>Delete <strong>{deleteTarget?.title}</strong>? This action cannot be undone.</>} confirmLabel="Delete" onClose={() => setDeleteTarget(null)} onConfirm={deleteReport} loading={deleting} />
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
