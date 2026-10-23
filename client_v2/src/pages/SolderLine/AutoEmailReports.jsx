import { useEffect, useRef, useState } from 'react';
import { Mail, Loader2, Pencil, Eye, Send } from 'lucide-react';
import { toast } from 'sonner';
import { api, getApiErrorMessage } from '@/helpers/client';
import { usePermissions } from '@/context/PermissionContext';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import MultiSelect from '@/components/MultiSelect';
import SingleDatePicker from '@/components/SingleDatePicker';
import ReportTable from './ReportTable';
import TotalReport from './TotalReport';

const endpoint = '/solder-auto-email-reports';
const button = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '9px 12px', borderRadius: 8, background: 'var(--bg2)', color: 'var(--tx)', border: '1px solid var(--bd2)', fontSize: 12, cursor: 'pointer' };

function Setup({ initial, options, station, title, reportType, onSave, onClose }) {
  const [name, setName] = useState(initial?.title || `${title} email`);
  const [schedule, setSchedule] = useState(initial?.schedule || { frequency: 'daily', time: '18:00', weekday: 1, dayOfMonth: 1, startDate: '', endDate: '' });
  const changeSchedule = (key, value) => setSchedule((current) => ({ ...current, [key]: value }));
  const [recipients, setRecipients] = useState(initial?.recipients || []);
  const [formats, setFormats] = useState(initial?.formats || ['pdf']);
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState(null);
  const [preview, setPreview] = useState(null);
  const [recipientError, setRecipientError] = useState('');
  const [validationShown, setValidationShown] = useState(false);
  const running = useRef(false);
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  const recipientOptions = [...options.recipients, ...recipients.filter((email) => !options.recipients.some((r) => r.email === email)).map((email) => ({ email, unavailable: true }))];
  const invalidRecipients = recipients.some((email) => !options.recipients.some((r) => r.email === email));
  const validName = name.trim().length >= 2 && name.trim().length <= 120;
  const validTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time || '');
  const startDateError = schedule.frequency === 'custom' && !schedule.startDate ? 'Choose a start date.' : '';
  const endDateError = schedule.frequency === 'custom'
    ? !schedule.endDate ? 'Choose an end date.' : schedule.startDate && schedule.endDate < schedule.startDate ? 'End date must be on or after the start date.' : ''
    : '';
  const validDates = !startDateError && !endDateError;
  const validDay = schedule.frequency !== 'monthly' || (Number.isInteger(schedule.dayOfMonth) && schedule.dayOfMonth >= 1 && schedule.dayOfMonth <= 28);
  const validSchedule = Boolean(validName && validTime && validDates && validDay);
  const toggle = (values, value) => values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
  const payload = () => ({ title: name.trim(), schedule: { ...schedule, startDate: schedule.frequency === 'custom' ? schedule.startDate : null, endDate: schedule.frequency === 'custom' ? schedule.endDate : null }, recipients, formats, enabled });
  useEffect(() => { setPreview(null); }, [schedule, name, formats]);
  const runDraft = async (event, kind) => {
    if (running.current || !validSchedule || !formats.length) return;
    if (kind === 'send-test' && (!recipients.length || invalidRecipients)) {
      setRecipientError('Select at least one verified email recipient.');
      return;
    }
    setRecipientError('');
    running.current = true; setSaving(true); setAction(kind);
    const controller = new AbortController();
    request.current = controller;
    const toastId = toast.loading(kind === 'preview' ? 'Preparing report preview...' : 'Sending test email...');
    try {
      const res = await api.post(`${endpoint}/${kind}`, { ...payload(), channelId: station._id, reportType, ...(kind === 'preview' ? { recipients: [] } : {}) }, { signal: controller.signal, timeout: 120000 });
      if (controller.signal.aborted) return;
      if (kind === 'preview') setPreview(res.data.body.data);
      toast.success(kind === 'preview' ? 'Report preview ready.' : 'Test email sent to the selected recipients.', { id: toastId });
    } catch (e) {
      if (controller.signal.aborted) toast.dismiss(toastId);
      else toast.error(e.code === 'ECONNABORTED' ? 'The request timed out. Please try again.' : getApiErrorMessage(e, 'Could not complete the request.'), { id: toastId });
    }
    finally { request.current = null; running.current = false; setSaving(false); setAction(null); }
  };
  const submit = async (event) => {
    event.preventDefault();
    if (running.current) return;
    setValidationShown(true);
    if (!recipients.length || invalidRecipients) {
      setRecipientError('Select at least one verified email recipient.');
      return;
    }
    if (!validSchedule || !formats.length) return;
    setRecipientError('');
    running.current = true; setSaving(true); setAction('save');
    const controller = new AbortController();
    request.current = controller;
    try { await onSave(payload(), controller.signal); }
    finally { request.current = null; running.current = false; setSaving(false); setAction(null); }
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent closeBtn="top-3 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-white opacity-100 hover:bg-white/25 hover:text-white [&_svg]:size-4" className="top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,760px)] max-w-[760px] max-h-[92vh] overflow-x-hidden overflow-y-auto p-0 border border-[var(--bd2)] bg-[var(--bg1solid)] text-[var(--tx)] shadow-2xl">
        <div className="relative flex items-center justify-between gap-4 px-6 py-4 pr-20 bg-gradient-to-r from-[var(--blue)] to-[var(--violet)] text-white">
        <div className="min-w-0 flex-1">
          <DialogTitle className="text-white">Auto email reports</DialogTitle>
          <DialogDescription className="mt-1 text-white/85">{title} · {station.name}. Choose when to email this report automatically, even when the dashboard is closed.</DialogDescription>
        </div>
        <span className="shrink-0 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold">SOLDER LINE</span>
        </div>
        <form noValidate onSubmit={submit} className="flex min-w-0 max-w-full flex-col gap-4 overflow-x-hidden p-6">
          <label className="flex flex-col gap-2 text-sm">Schedule name
            <input required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} disabled={saving} className="p-2 rounded-lg border border-[var(--bd2)] bg-[var(--bg2)]" />
            {validationShown && !validName && <span role="alert" className="text-xs text-[var(--crit)]">Enter a schedule name of 2 to 120 characters.</span>}
          </label>
          <label className="flex flex-col gap-2 text-sm">Frequency
            <select value={schedule.frequency} onChange={(e) => changeSchedule('frequency', e.target.value)} disabled={saving} className="p-2 rounded-lg border border-[var(--bd2)] bg-[var(--bg2)] text-[var(--tx)]">
              {['daily', 'weekly', 'monthly', 'custom'].map((value) => <option key={value} value={value}>{value === 'custom' ? 'Custom date range (one time)' : value[0].toUpperCase() + value.slice(1)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm">Send time
            <input type="time" required value={schedule.time} onChange={(e) => changeSchedule('time', e.target.value)} disabled={saving} className="p-2 rounded-lg border border-[var(--bd2)] bg-[var(--bg2)]" />
            {validationShown && !validTime && <span role="alert" className="text-xs text-[var(--crit)]">Choose a valid send time.</span>}
          </label>
          {schedule.frequency === 'weekly' && <label className="flex flex-col gap-2 text-sm">Day of week
            <select value={schedule.weekday} disabled={saving} onChange={(e) => changeSchedule('weekday', Number(e.target.value))} className="p-2 rounded-lg border border-[var(--bd2)] bg-[var(--bg2)]">
              {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, i) => <option key={day} value={i}>{day}</option>)}
            </select>
          </label>}
          {schedule.frequency === 'monthly' && <label className="flex flex-col gap-2 text-sm">Day of month
            <input type="number" min={1} max={28} required disabled={saving} value={schedule.dayOfMonth} onChange={(e) => changeSchedule('dayOfMonth', Number(e.target.value))} className="p-2 rounded-lg border border-[var(--bd2)] bg-[var(--bg2)]" />
            {validationShown && !validDay && <span role="alert" className="text-xs text-[var(--crit)]">Choose a day from 1 to 28.</span>}
          </label>}
          {schedule.frequency === 'custom' && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2 text-sm"><span>Start date <span className="text-[var(--crit)]">*</span></span><SingleDatePicker value={schedule.startDate || ''} maxDate={schedule.endDate || undefined} placeholder="Start date" onChange={(date) => changeSchedule('startDate', date)} />{validationShown && startDateError && <span role="alert" className="text-xs text-[var(--crit)]">{startDateError}</span>}</div>
            <div className="flex flex-col gap-2 text-sm"><span>End date <span className="text-[var(--crit)]">*</span></span><SingleDatePicker value={schedule.endDate || ''} minDate={schedule.startDate || undefined} placeholder="End date" onChange={(date) => changeSchedule('endDate', date)} />{validationShown && endDateError && <span role="alert" className="text-xs text-[var(--crit)]">{endDateError}</span>}</div>
          </div>}
          <p className="text-xs text-[var(--tx3)]">Uses {options.timezone}. {schedule.frequency === 'custom' ? 'Emails the full selected date range once, on the day after the end date at your send time.' : `Includes the previous ${schedule.frequency === 'daily' ? '24 hours' : schedule.frequency === 'weekly' ? '7 days' : 'month'} up to your send time.`} The preview date selection does not affect this schedule.</p>
          <fieldset disabled={saving} className="flex flex-col gap-2">
            <legend className="text-sm mb-2">Verified email recipients <span className="text-[var(--crit)]">*</span></legend>
            {!options.recipients.length && <p className="text-xs text-[var(--tx3)]">Add and verify an email in Recipients before scheduling.</p>}
            <div className={recipientError ? 'rounded-lg ring-1 ring-[var(--crit)]' : ''}><MultiSelect inlinePanel options={recipientOptions.map((r) => ({ id: r.email, label: `${r.email}${r.unavailable ? ' (no longer verified)' : ''}`, disabled: r.unavailable }))} value={recipients} onChange={(value) => { setRecipients(value); if (value.length) setRecipientError(''); }} placeholder="Select verified email recipients" searchPlaceholder="Search email recipients..." msg="No verified email recipients" /></div>
            {recipientError && <p role="alert" className="text-xs text-[var(--crit)]">{recipientError}</p>}
            {!recipients.length && !recipientError && <p className="text-xs text-[var(--tx3)]">Select at least one verified recipient to save a schedule or send test mail.</p>}
            {recipients.some((email) => !options.recipients.some((r) => r.email === email)) && <p role="alert" className="text-xs text-red-500">Some saved recipients are no longer verified. Use Clear all and select verified recipients again.</p>}
          </fieldset>
          <fieldset disabled={saving} className="flex gap-4">
            <legend className="text-sm mb-2">Attachments <span className="text-[var(--crit)]">*</span></legend>
            {['pdf', 'xlsx'].map((format) => <label key={format} className="flex items-center gap-2 text-sm cursor-pointer"><input className="cursor-pointer" type="checkbox" checked={formats.includes(format)} onChange={() => setFormats(toggle(formats, format))} />{format === 'pdf' ? 'PDF' : 'Excel'}</label>)}
          </fieldset>
          {!formats.length && <p role={validationShown ? 'alert' : undefined} className={`text-xs ${validationShown ? 'text-[var(--crit)]' : 'text-[var(--tx3)]'}`}>Select PDF or Excel to preview, save, or send this report.</p>}
          <label className="flex items-center gap-2 text-sm cursor-pointer"><input className="cursor-pointer" type="checkbox" disabled={saving} checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />Enable automatic emails</label>
          <div className="flex flex-wrap gap-2">
            <button type="button" style={{ ...button, color: 'var(--blue)', border: '1px solid rgba(59,130,246,.4)', background: 'rgba(59,130,246,.1)' }} disabled={saving || !formats.length || !validSchedule} onClick={(e) => runDraft(e, 'preview')}>
              {action === 'preview' ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}{action === 'preview' ? 'Preparing...' : 'Preview report'}
            </button>
            <button type="button" style={{ ...button, color: 'var(--violet)', border: '1px solid rgba(168,85,247,.4)', background: 'rgba(168,85,247,.1)' }} disabled={saving || !formats.length || !validSchedule || !recipients.length || invalidRecipients} onClick={(e) => runDraft(e, 'send-test')}>
              {action === 'send-test' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}{action === 'send-test' ? 'Sending...' : 'Send test mail'}
            </button>
          </div>
          <p className="text-xs text-[var(--tx3)]">Preview and test mail use the latest report period as of now, or your custom date range. Test mail sends immediately to the selected recipients without saving the schedule.</p>
          {preview && <section aria-label="Report preview" className="border border-[var(--bd)] rounded-lg p-3">
            <div className="text-sm font-semibold">{title} preview</div>
            <p className="text-xs text-[var(--tx3)] my-2">{preview.period} · {preview.total} rows{preview.total > preview.rows.length ? ` (showing first ${preview.rows.length})` : ''}</p>
            {!preview.rows.length ? <p className="text-sm">No records for this period.</p> : reportType === 'total' ? <div className="max-h-60 overflow-auto"><TotalReport rows={preview.rows} /></div> : <div className="max-h-60 overflow-auto">
              <ReportTable rows={preview.rows} label={`${title} email preview`} />
            </div>}
          </section>}
          <div className="flex justify-end gap-2">
            <button type="button" style={{ ...button, color: 'var(--crit)', border: '1px solid rgba(239,68,68,.35)', background: 'rgba(239,68,68,.08)' }} onClick={onClose}>Cancel</button>
            <button type="submit" style={{ ...button, border: 0, background: 'linear-gradient(135deg,var(--blue),var(--violet))', color: '#fff', opacity: saving ? 0.6 : 1 }} disabled={saving}>
              {action === 'save' && <Loader2 size={14} className="animate-spin" />}{action === 'save' ? 'Saving...' : 'Save schedule'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AutoEmailReports({ station, reportType, title }) {
  const { permissions } = usePermissions();
  const access = permissions?.autoEmailReports || {};
  const [reports, setReports] = useState([]);
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [reload, setReload] = useState(0);
  const stationId = station?._id;
  useEffect(() => {
    let cancelled = false;
    setModal(null); setReports([]); setOptions(null); setError('');
    if (!stationId || !access.view) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      api.get(endpoint, { params: { channelId: stationId, reportType } }),
      api.get(`${endpoint}/form-options`),
    ]).then(([list, opts]) => {
      if (!cancelled) { setReports(list.data.body.data); setOptions(opts.data.body.data); }
    }).catch((e) => { if (!cancelled) setError(getApiErrorMessage(e, 'Could not load email schedules.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [stationId, reportType, access.view, reload]);
  const save = async (data, signal) => {
    try {
      const payload = { ...data, channelId: stationId, reportType };
      const config = { signal, timeout: 30000 };
      if (modal._id) await api.put(`${endpoint}/${modal._id}`, payload, config);
      else await api.post(endpoint, payload, config);
      if (signal.aborted) return;
      toast.success(data.enabled ? 'Email schedule saved.' : 'Email schedule saved and disabled.');
      setModal(null); setReload((r) => r + 1);
    } catch (e) {
      if (!signal.aborted) toast.error(e.code === 'ECONNABORTED' ? 'Saving the schedule timed out. Please try again.' : getApiErrorMessage(e, 'Could not save the email schedule.'));
    }
  };
  const toggleEnabled = async (report) => {
    if (busyId) return;
    setBusyId(report._id);
    try {
      await api.patch(`${endpoint}/${report._id}`, { enabled: !report.enabled });
      toast.success(report.enabled ? 'Email schedule disabled.' : 'Email schedule enabled.');
      setReload((r) => r + 1);
    } catch (e) { toast.error(getApiErrorMessage(e, 'Could not update the email schedule.')); }
    finally { setBusyId(null); }
  };
  if (!access.view) return null;
  return (
    <div className="flex w-full max-w-full flex-col gap-2" style={{ marginTop: 14, alignSelf: 'stretch', minWidth: 0 }}>
      <button type="button" style={{ ...button, width: '100%', boxSizing: 'border-box', color: 'var(--blue)', border: '1px solid rgba(59,130,246,.35)', background: 'linear-gradient(135deg, rgba(59,130,246,.1), rgba(168,85,247,.12))', opacity: loading || !station || !access.create ? 0.5 : 1 }} disabled={loading || !station || !access.create || !options} onClick={() => setModal({})}>
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}Auto email reports
      </button>
      {error && <div role="alert" className="text-xs text-red-500">{error} <button type="button" onClick={() => setReload((r) => r + 1)} className="underline cursor-pointer">Retry</button></div>}
      <div style={{ fontSize: 11, color: 'var(--tx3)' }}>{title} · {reports.length} saved schedule{reports.length === 1 ? '' : 's'}</div>
      {!loading && !reports.length && !error && <p style={{ margin: 0, fontSize: 11, color: 'var(--tx3)' }}>No email schedules for {title.toLowerCase()} yet.</p>}
      {reports.map((report) => <div key={report._id} style={{ fontSize: 11, padding: 9, border: '1px solid var(--bd)', borderRadius: 8, color: 'var(--tx2)' }}>
        <div>{report.enabled ? 'Enabled' : 'Disabled'} · {report.title || 'Configure this schedule'} · {report.schedule ? `${report.schedule.frequency} at ${report.schedule.time}` : 'Choose frequency and time'} · {report.recipients.length} recipient{report.recipients.length === 1 ? '' : 's'}</div>
        {report.lastSentAt && <div className="mt-1 text-[var(--tx3)]">Last sent: {new Intl.DateTimeFormat('en-GB', { timeZone: options.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(report.lastSentAt))}</div>}
        {report.lastError && <div role="alert" className="mt-1 text-red-500">Last delivery failed. Check the email configuration and recipients.</div>}
        {access.edit && <div className="flex gap-2 mt-2">
          <button type="button" style={{ ...button, padding: '4px 8px', fontSize: 11 }} disabled={Boolean(busyId)} onClick={() => setModal(report)}><Pencil size={11} />Edit</button>
          <button type="button" style={{ ...button, padding: '4px 8px', fontSize: 11 }} disabled={Boolean(busyId)} onClick={() => toggleEnabled(report)}>{busyId === report._id && <Loader2 size={11} className="animate-spin" />}{report.enabled ? 'Disable' : 'Enable'}</button>
        </div>}
      </div>)}
      {modal && options && station && <Setup key={modal._id || 'new'} initial={modal} options={options} station={station} title={title} reportType={reportType} onSave={save} onClose={() => setModal(null)} />}
    </div>
  );
}
