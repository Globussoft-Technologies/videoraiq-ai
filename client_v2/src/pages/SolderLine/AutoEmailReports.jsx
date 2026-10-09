import { useEffect, useRef, useState } from 'react';
import { Mail, Loader2, Pencil, Eye, Send } from 'lucide-react';
import { toast } from 'sonner';
import { api, getApiErrorMessage } from '@/helpers/client';
import { usePermissions } from '@/context/PermissionContext';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import MultiSelect from '@/components/MultiSelect';

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
  const running = useRef(false);
  const recipientOptions = [...options.recipients, ...recipients.filter((email) => !options.recipients.some((r) => r.email === email)).map((email) => ({ email, unavailable: true }))];
  const toggle = (values, value) => values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
  const payload = () => ({ title: name.trim(), schedule: { ...schedule, startDate: schedule.frequency === 'custom' ? schedule.startDate : null, endDate: schedule.frequency === 'custom' ? schedule.endDate : null }, recipients, formats, enabled });
  useEffect(() => { setPreview(null); }, [schedule, name, formats]);
  const runDraft = async (event, kind) => {
    if (running.current || !event.currentTarget.form.reportValidity()) return;
    running.current = true; setSaving(true); setAction(kind);
    const toastId = toast.loading(kind === 'preview' ? 'Preparing report preview...' : 'Sending test email...');
    try {
      const res = await api.post(`${endpoint}/${kind}`, { ...payload(), channelId: station._id, reportType, ...(kind === 'preview' ? { recipients: [] } : {}) });
      if (kind === 'preview') setPreview(res.data.body.data);
      toast.success(kind === 'preview' ? 'Report preview ready.' : 'Test email sent to the selected recipients.', { id: toastId });
    } catch (e) { toast.error(getApiErrorMessage(e, 'Could not complete the request.'), { id: toastId }); }
    finally { running.current = false; setSaving(false); setAction(null); }
  };
  const submit = async (event) => {
    event.preventDefault();
    if (running.current) return;
    running.current = true; setSaving(true); setAction('save');
    try { await onSave(payload()); }
    finally { running.current = false; setSaving(false); setAction(null); }
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,500px)] max-h-[85vh] overflow-y-auto p-6 border border-[var(--bd)] bg-[var(--bg1solid)] text-[var(--tx)]">
        <DialogTitle>Auto email reports</DialogTitle>
        <DialogDescription className="text-[var(--tx3)]">{title} · {station.name}. Choose when to email this report automatically, even when the dashboard is closed.</DialogDescription>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm">Schedule name
            <input required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} disabled={saving} className="p-2 rounded-lg border border-[var(--bd2)] bg-[var(--bg2)]" />
          </label>
          <label className="flex flex-col gap-2 text-sm">Frequency
            <select value={schedule.frequency} onChange={(e) => changeSchedule('frequency', e.target.value)} disabled={saving} className="p-2 rounded-lg border border-[var(--bd2)] bg-[var(--bg2)] text-[var(--tx)]">
              {['daily', 'weekly', 'monthly', 'custom'].map((value) => <option key={value} value={value}>{value === 'custom' ? 'Custom date range (one time)' : value[0].toUpperCase() + value.slice(1)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm">Send time
            <input type="time" required value={schedule.time} onChange={(e) => changeSchedule('time', e.target.value)} disabled={saving} className="p-2 rounded-lg border border-[var(--bd2)] bg-[var(--bg2)]" />
          </label>
          {schedule.frequency === 'weekly' && <label className="flex flex-col gap-2 text-sm">Day of week
            <select value={schedule.weekday} disabled={saving} onChange={(e) => changeSchedule('weekday', Number(e.target.value))} className="p-2 rounded-lg border border-[var(--bd2)] bg-[var(--bg2)]">
              {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, i) => <option key={day} value={i}>{day}</option>)}
            </select>
          </label>}
          {schedule.frequency === 'monthly' && <label className="flex flex-col gap-2 text-sm">Day of month
            <input type="number" min={1} max={28} required disabled={saving} value={schedule.dayOfMonth} onChange={(e) => changeSchedule('dayOfMonth', Number(e.target.value))} className="p-2 rounded-lg border border-[var(--bd2)] bg-[var(--bg2)]" />
          </label>}
          {schedule.frequency === 'custom' && <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-2 text-sm">Start date<input type="date" required disabled={saving} value={schedule.startDate || ''} max={schedule.endDate || undefined} onChange={(e) => changeSchedule('startDate', e.target.value)} className="p-2 rounded-lg border border-[var(--bd2)] bg-[var(--bg2)]" /></label>
            <label className="flex flex-col gap-2 text-sm">End date<input type="date" required disabled={saving} value={schedule.endDate || ''} min={schedule.startDate || undefined} onChange={(e) => changeSchedule('endDate', e.target.value)} className="p-2 rounded-lg border border-[var(--bd2)] bg-[var(--bg2)]" /></label>
          </div>}
          <p className="text-xs text-[var(--tx3)]">Uses {options.timezone}. {schedule.frequency === 'custom' ? 'Emails the full selected date range once, on the day after the end date at your send time.' : `Includes the previous ${schedule.frequency === 'daily' ? '24 hours' : schedule.frequency === 'weekly' ? '7 days' : 'month'} up to your send time.`} The preview date selection does not affect this schedule.</p>
          <fieldset disabled={saving} className="flex flex-col gap-2">
            <legend className="text-sm mb-2">Verified email recipients</legend>
            {!options.recipients.length && <p className="text-xs text-[var(--tx3)]">Add and verify an email in Recipients before scheduling.</p>}
            <MultiSelect options={recipientOptions.map((r) => ({ id: r.email, label: `${r.email}${r.unavailable ? ' (no longer verified)' : ''}`, disabled: r.unavailable }))} value={recipients} onChange={setRecipients} placeholder="Select verified email recipients" searchPlaceholder="Search email recipients..." msg="No verified email recipients" />
            {recipients.some((email) => !options.recipients.some((r) => r.email === email)) && <p role="alert" className="text-xs text-red-500">Some saved recipients are no longer verified. Use Clear all and select verified recipients again.</p>}
          </fieldset>
          <fieldset disabled={saving} className="flex gap-4">
            <legend className="text-sm mb-2">Attachments</legend>
            {['pdf', 'xlsx'].map((format) => <label key={format} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formats.includes(format)} onChange={() => setFormats(toggle(formats, format))} />{format === 'pdf' ? 'PDF' : 'Excel'}</label>)}
          </fieldset>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={saving} checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />Enable automatic emails</label>
          <div className="flex flex-wrap gap-2">
            <button type="button" style={button} disabled={saving || !formats.length} onClick={(e) => runDraft(e, 'preview')}>
              {action === 'preview' ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}{action === 'preview' ? 'Preparing...' : 'Preview report'}
            </button>
            <button type="button" style={button} disabled={saving || !formats.length || !recipients.length || recipients.some((email) => !options.recipients.some((r) => r.email === email))} onClick={(e) => runDraft(e, 'send-test')}>
              {action === 'send-test' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}{action === 'send-test' ? 'Sending...' : 'Send test mail'}
            </button>
          </div>
          <p className="text-xs text-[var(--tx3)]">Preview and test mail use the latest report period as of now, or your custom date range. Test mail sends immediately to the selected recipients without saving the schedule.</p>
          {preview && <section aria-label="Report preview" className="border border-[var(--bd)] rounded-lg p-3">
            <div className="text-sm font-semibold">{title} preview</div>
            <p className="text-xs text-[var(--tx3)] my-2">{preview.period} · {preview.total} rows{preview.total > preview.rows.length ? ` (showing first ${preview.rows.length})` : ''}</p>
            {!preview.rows.length ? <p className="text-sm">No records for this period.</p> : <div className="max-h-60 overflow-auto">
              <table className="text-xs w-full border-collapse"><thead><tr>{Object.keys(preview.rows[0]).map((key) => <th key={key} className="text-left p-2 border-b border-[var(--bd)] whitespace-nowrap">{key}</th>)}</tr></thead>
                <tbody>{preview.rows.map((row, i) => <tr key={i}>{Object.keys(preview.rows[0]).map((key) => <td key={key} className="p-2 border-b border-[var(--bd)] whitespace-nowrap">{String(row[key] ?? '')}</td>)}</tr>)}</tbody>
              </table>
            </div>}
          </section>}
          <div className="flex justify-end gap-2">
            <button type="button" style={button} disabled={saving} onClick={onClose}>Cancel</button>
            <button type="submit" style={{ ...button, background: 'var(--blue)', color: '#fff', opacity: saving ? 0.6 : 1 }} disabled={saving || name.trim().length < 2 || !recipients.length || !formats.length || !schedule.time || (schedule.frequency === 'custom' && (!schedule.startDate || !schedule.endDate || schedule.endDate < schedule.startDate)) || recipients.some((email) => !options.recipients.some((r) => r.email === email))}>
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
  const save = async (data) => {
    try {
      const payload = { ...data, channelId: stationId, reportType };
      if (modal._id) await api.put(`${endpoint}/${modal._id}`, payload);
      else await api.post(endpoint, payload);
      toast.success(data.enabled ? 'Email schedule saved.' : 'Email schedule saved and disabled.');
      setModal(null); setReload((r) => r + 1);
    } catch (e) { toast.error(getApiErrorMessage(e, 'Could not save the email schedule.')); }
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <button type="button" style={{ ...button, borderStyle: 'dashed', width: '100%', opacity: loading || !station || !access.create ? 0.5 : 1 }} disabled={loading || !station || !access.create || !options} onClick={() => setModal({})}>
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}Auto email reports
      </button>
      {error && <div role="alert" className="text-xs text-red-500">{error} <button type="button" onClick={() => setReload((r) => r + 1)} className="underline cursor-pointer">Retry</button></div>}
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
