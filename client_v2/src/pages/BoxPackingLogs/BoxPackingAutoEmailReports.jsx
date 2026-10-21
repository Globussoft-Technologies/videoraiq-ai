import { useEffect, useRef, useState } from 'react';
import { usePackingSort } from './PackingSort';
import { packingEmailSchedules } from './packingEmailSchedules';
import moment from 'moment-timezone';
import { buildPackingReportRecords, REPORT_COLUMNS } from './packingReportData';
import { packingWorkerDetails } from './boxPackingData';
import SnapshotCell from '@/pages/SolderLine/SnapshotCell';
import { mediaUrl } from '@/lib/format';
import { Eye, Loader2, Mail, PauseCircle, Pencil, PlayCircle, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import MultiSelect from '@/components/MultiSelect';
import SingleDatePicker from '@/components/SingleDatePicker';
import ConfirmationModal from '@/components/DeleteConfirmation';
import { getRecipients } from '@/api/administer';
import { getApiErrorMessage } from '@/helpers/client';
import {
  createAutoEmailReport,
  deleteAutoEmailReport,
  getAutoEmailReports,
  previewAutoEmailReport,
  sendAutoEmailReportNow,
  updateAutoEmailReport,
} from '@/helpers/autoEmailReports';

const button = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '9px 12px', borderRadius: 8, background: 'var(--bg2)', color: 'var(--tx)', border: '1px solid var(--bd2)', fontSize: 12, cursor: 'pointer' };
const defaults = { frequency: 'daily', time: '18:00', weekday: 1, dayOfMonth: 1, startDate: '', endDate: '' };
const reportTypeLabel = { comparison: 'Worker Comparison', hourly: 'Hourly activity', total: 'Total report' };
const removeReviewFields = (value) => {
  if (Array.isArray(value)) return value.map(removeReviewFields);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/review|status|detected via|source|notes/i.test(key)).map(([key, entry]) => [key, removeReviewFields(entry)]));
};

function toPreviewRows(rows, reportType, timezone) {
  const normalized = rows.map((row) => {
    const worker = packingWorkerDetails(row);
    return { ...row,
      timeTakenSec: worker.timeTakenSec,
      time: row.recordedAt || (row.time && moment(row.time, 'DD/MM/YYYY hh:mm A', true).isValid() ? moment.tz(row.time, 'DD/MM/YYYY hh:mm A', timezone).toISOString() : row.time),
      cameraName: row.cameraName || row.camera, nvrName: row.nvrName || row.nvr, Image: row.Image || row.image,
    };
  });
  return buildPackingReportRecords(normalized, reportType, timezone);
}

function PreviewPanel({ preview, reportType = 'comparison', timezone = 'Asia/Kolkata' }) {
  const selectedType = REPORT_COLUMNS[preview?.reportType || reportType] ? (preview?.reportType || reportType) : 'total';
  const columns = REPORT_COLUMNS[selectedType];
  const records = preview?.packingRecords || toPreviewRows(preview?.rows || [], selectedType, timezone);
  const sorting = usePackingSort(records, { key: null, direction: 'asc' }, (row, key) => key === 'Date' ? (row[key] === '—' ? null : moment.tz(row[key], 'DD MMM YYYY', timezone).valueOf()) : row[key]);
  const cell = { padding: '10px 12px', borderBottom: '1px solid var(--bd)' };
  return <div style={{ border: '1px solid var(--bd2)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg2)' }}>
    <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--bd)', background: 'linear-gradient(135deg, rgba(59,130,246,.1), rgba(168,85,247,.1))' }}><div style={{ fontWeight: 700 }}>Box Packing report preview · {reportTypeLabel[selectedType]}</div><div style={{ marginTop: 3, fontSize: 11, color: 'var(--tx3)' }}>{preview?.period || preview?.label || 'Current report period'} · {records.length} report rows</div></div>
    {!records.length ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--tx3)', fontSize: 12 }}>No Box Packing records for this period.</div> : <div style={{ maxHeight: 360, overflow: 'auto' }}><table style={{ width: '100%', minWidth: selectedType === 'total' ? 1000 : 640, borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}><thead><tr>{columns.map((column) => <th key={column} style={{ ...cell, position: 'sticky', top: 0, background: 'var(--bg1solid)', whiteSpace: 'nowrap', fontSize: 10 }}>{column === 'Snapshot' ? column : sorting.header(column, column.toUpperCase())}</th>)}</tr></thead><tbody>{sorting.rows.map((row, index) => <tr key={index}>{columns.map((column) => <td key={column} style={cell}>{column === 'Snapshot' ? <SnapshotCell value={row.Snapshot ? mediaUrl(row.Snapshot) : ''} label={`Open snapshot for ${row['Box ID']}`} /> : row[column]}</td>)}</tr>)}</tbody></table></div>}
  </div>;
}

function ScheduleForm({ initial, recipients, timezone, previewRows, periodLabel, reportType, onSave, onClose }) {
  const selectedReportType = initial?.reportType || reportType;
  const [title, setTitle] = useState(initial?.title || `Box Packing - ${reportTypeLabel[selectedReportType]}`);
  const [schedule, setSchedule] = useState({ ...defaults, ...(initial?.schedule || {}) });
  const [selected, setSelected] = useState(initial?.recipients || []);
  const [formats, setFormats] = useState(initial?.formats || ['pdf']);
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState(null);
  const [recipientError, setRecipientError] = useState('');
  const request = useRef(null);
  const recipientOptions = recipients.map((item) => ({ id: item.value || item.email, label: item.fullName ? `${item.fullName} · ${item.value || item.email}` : (item.value || item.email) }));
  const setScheduleValue = (key, value) => setSchedule((current) => ({ ...current, [key]: value }));
  const payload = () => ({
    title: title.trim(), contentTypes: ['incidents'], contentType: 'incidents', incidentTypes: ['boxPackingDetection'],
    reportType: selectedReportType,
    pdfLayout: 'list', recipients: selected, schedule: { ...schedule, startDate: schedule.frequency === 'custom' ? schedule.startDate : null, endDate: schedule.frequency === 'custom' ? schedule.endDate : null },
    target: { scope: 'organization' }, formats, enabled,
  });
  useEffect(() => () => request.current?.abort(), []);
  const run = async (kind) => {
    if ((kind === 'send-test' || kind === 'save') && selected.length === 0) {
      setRecipientError('Select at least one verified email recipient.');
      toast.error('Select at least one verified email recipient.');
      return;
    }
    setRecipientError('');
    setBusy(kind);
    try {
      const result = kind === 'preview'
        ? (initial?._id
          ? await previewAutoEmailReport(initial._id)
          : { packingRecords: toPreviewRows(previewRows, selectedReportType, timezone), rowCount: selectedReportType === 'hourly' || selectedReportType === 'comparison' ? toPreviewRows(previewRows, selectedReportType, timezone).length : previewRows.length, total: previewRows.length, reportType: selectedReportType, aggregated: selectedReportType === 'hourly' || selectedReportType === 'comparison', period: periodLabel || 'Current report period' })
        : await sendAutoEmailReportNow(initial._id, { recipients: selected });
      if (kind === 'preview') setPreview(result);
      toast.success(kind === 'preview' ? 'Report preview ready.' : 'Test email sent to the selected recipients.');
    } catch (error) { toast.error(getApiErrorMessage(error, 'Could not complete the request.')); }
    finally { setBusy(''); }
  };
  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!title || formats.length === 0) return;
    if (selected.length === 0) {
      setRecipientError('Select at least one verified email recipient.');
      toast.error('Select at least one verified email recipient.');
      return;
    }
    setRecipientError('');
    setBusy('save');
    try { await onSave(payload(), initial?._id); }
    finally { setBusy(''); }
  };
  const toggleFormat = (format) => setFormats((current) => current.includes(format) ? current.filter((item) => item !== format) : [...current, format]);
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent closeBtn="top-3 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-white opacity-100 hover:bg-white/25 hover:text-white [&_svg]:size-4" className="top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,760px)] max-w-[760px] max-h-[92vh] overflow-x-hidden overflow-y-auto p-0 border border-[var(--bd2)] bg-[var(--bg1solid)] text-[var(--tx)] shadow-2xl">
      <div className="relative flex items-center justify-between gap-4 px-6 py-4 pr-20 bg-gradient-to-r from-[var(--blue)] to-[var(--violet)] text-white">
        <div><DialogTitle className="text-white">Auto email reports</DialogTitle><DialogDescription className="mt-1 text-white/80">{reportTypeLabel[selectedReportType]} · Scheduled delivery and report attachments</DialogDescription></div>
        <span className="shrink-0 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold">BOX PACKING</span>
      </div>
      <form onSubmit={submit} className="flex min-w-0 max-w-full flex-col gap-4 overflow-x-hidden p-6">
        <label className="flex flex-col gap-2 text-sm"><span>Schedule name <span className="text-[var(--crit)]">*</span></span><input required minLength={2} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} disabled={Boolean(busy)} className="p-2 rounded-lg border border-[var(--bd2)] bg-[var(--bg2)]" /></label>
        <label className="flex flex-col gap-2 text-sm"><span>Frequency <span className="text-[var(--crit)]">*</span></span><select required value={schedule.frequency} onChange={(event) => setScheduleValue('frequency', event.target.value)} disabled={Boolean(busy)} className="p-2 rounded-lg border border-[var(--bd2)] bg-[var(--bg2)] text-[var(--tx)]">{['daily', 'weekly', 'monthly', 'custom'].map((value) => <option key={value} value={value}>{value === 'custom' ? 'Custom date range (one time)' : value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
        <label className="flex flex-col gap-2 text-sm"><span>Send time <span className="text-[var(--crit)]">*</span></span><input type="time" required value={schedule.time} onChange={(event) => setScheduleValue('time', event.target.value)} disabled={Boolean(busy)} className="p-2 rounded-lg border border-[var(--bd2)] bg-[var(--bg2)]" /></label>
        {schedule.frequency === 'weekly' && <label className="flex flex-col gap-2 text-sm">Day of week <span className="text-[var(--crit)]">*</span><select required value={schedule.weekday} onChange={(event) => setScheduleValue('weekday', Number(event.target.value))} className="p-2 rounded-lg border border-[var(--bd2)] bg-[var(--bg2)]">{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>}
        {schedule.frequency === 'monthly' && <label className="flex flex-col gap-2 text-sm">Day of month <span className="text-[var(--crit)]">*</span><input type="number" min="1" max="28" required value={schedule.dayOfMonth} onChange={(event) => setScheduleValue('dayOfMonth', Number(event.target.value))} className="p-2 rounded-lg border border-[var(--bd2)] bg-[var(--bg2)]" /></label>}
        {schedule.frequency === 'custom' && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="flex flex-col gap-2 text-sm">Start date <span className="text-[var(--crit)]">*</span><SingleDatePicker value={schedule.startDate || ''} minDate={undefined} maxDate={schedule.endDate && schedule.endDate < moment.tz(timezone).format('YYYY-MM-DD') ? schedule.endDate : moment.tz(timezone).format('YYYY-MM-DD')} placeholder="Start date" onChange={(date) => setScheduleValue('startDate', date)} /></label><label className="flex flex-col gap-2 text-sm">End date <span className="text-[var(--crit)]">*</span><SingleDatePicker value={schedule.endDate || ''} minDate={schedule.startDate || undefined} maxDate={moment.tz(timezone).format('YYYY-MM-DD')} placeholder="End date" onChange={(date) => setScheduleValue('endDate', date)} /></label></div>}
        <p className="text-xs text-[var(--tx3)]">Uses {timezone}. The preview date selection does not affect this schedule.</p>
        <fieldset disabled={Boolean(busy)} className="flex flex-col gap-2"><legend className="text-sm mb-2">Verified email recipients <span className="text-[var(--crit)]">*</span></legend><div className={recipientError ? 'rounded-lg ring-1 ring-[var(--crit)]' : ''}><MultiSelect inlinePanel options={recipientOptions} value={selected} onChange={(value) => { setSelected(value); if (value.length) setRecipientError(''); }} placeholder="Select verified email recipients" searchPlaceholder="Search email recipients..." msg="No verified email recipients" /></div>{recipientError ? <p className="text-xs text-[var(--crit)]">{recipientError}</p> : !selected.length && <p className="text-xs text-[var(--tx3)]">Select at least one verified recipient to save a schedule or send test mail.</p>}</fieldset>
        <fieldset disabled={Boolean(busy)} className="flex gap-4"><legend className="text-sm mb-2">Attachments <span className="text-[var(--crit)]">*</span></legend>{[['pdf', 'PDF'], ['xlsx', 'Excel']].map(([format, labelText]) => <label key={format} className="flex cursor-pointer items-center gap-2 text-sm"><input className="cursor-pointer" type="checkbox" checked={formats.includes(format)} onChange={() => toggleFormat(format)} />{labelText}</label>)}</fieldset>
        <label className="flex cursor-pointer items-center gap-2 text-sm"><input className="cursor-pointer" type="checkbox" disabled={Boolean(busy)} checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />Enable automatic emails</label>
        <div className="flex flex-wrap gap-2"><button type="button" style={{ ...button, border: '1px solid rgba(59,130,246,.4)', background: 'rgba(59,130,246,.1)', color: 'var(--blue)', cursor: Boolean(busy) || !formats.length ? 'not-allowed' : 'pointer' }} disabled={Boolean(busy) || !formats.length} onClick={() => run('preview')}>{busy === 'preview' ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}Preview report</button><button type="button" style={{ ...button, border: '1px solid rgba(168,85,247,.4)', background: 'rgba(168,85,247,.1)', color: 'var(--violet)', cursor: !initial?._id || Boolean(busy) || !formats.length || !selected.length ? 'not-allowed' : 'pointer' }} disabled={!initial?._id || Boolean(busy) || !formats.length || !selected.length} onClick={() => run('send-test')}>{busy === 'send-test' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}Send test mail</button></div>
        {preview && <PreviewPanel preview={preview} reportType={preview.reportType || selectedReportType} timezone={timezone} />}
        <div className="flex justify-end gap-2"><button type="button" style={{ ...button, border: '1px solid rgba(239,68,68,.35)', background: 'rgba(239,68,68,.08)', color: 'var(--crit)' }} onClick={onClose}>Cancel</button><button type="submit" style={{ ...button, border: 0, background: 'linear-gradient(135deg,var(--blue),var(--violet))', color: '#fff', boxShadow: '0 6px 16px rgba(99,102,241,.24)', opacity: busy ? 0.6 : 1, cursor: busy ? 'not-allowed' : 'pointer' }} disabled={Boolean(busy) || title.trim().length < 2 || !formats.length || !schedule.time || (schedule.frequency === 'custom' && (!schedule.startDate || !schedule.endDate))}>{busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : null}{busy === 'save' ? 'Saving...' : 'Save schedule'}</button></div>
      </form>
    </DialogContent>
  </Dialog>;
}

export default function BoxPackingAutoEmailReports({ previewRows = [], periodLabel = '', reportType = 'comparison' }) {
  const [reports, setReports] = useState([]);
  const [recipients, setRecipients] = useState([]);
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [modal, setModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const visibleReports = packingEmailSchedules(reports, reportType);
  useEffect(() => { setModal(null); setDeleteTarget(null); }, [reportType]);
  const load = async () => { setLoading(true); try { const [reportResult, recipientResult] = await Promise.all([getAutoEmailReports({ page: 1, limit: 100 }), getRecipients({ alertType: 'email', filterByStatus: 'All', limit: 1000 })]); const recipientRows = Array.isArray(recipientResult.recipients) ? recipientResult.recipients : []; const isVerified = (item) => item?.verified === true || item?.verified === 'true' || item?.isVerified === true || String(item?.status || '').toLowerCase() === 'verified'; setReports((reportResult.reports || []).filter((report) => (report.incidentTypes || []).includes('boxPackingDetection'))); setRecipients(recipientRows.filter(isVerified)); } catch (error) { toast.error(getApiErrorMessage(error, 'Could not load Box Packing email schedules.')); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (modal) load(); }, [modal]);
  const save = async (data, id) => { try { if (id) await updateAutoEmailReport(id, data); else await createAutoEmailReport(data); toast.success('Box Packing email schedule saved.'); setModal(null); await load(); } catch (error) { toast.error(getApiErrorMessage(error, 'Could not save the email schedule.')); throw error; } };
  const action = async (id, callback, message) => { setBusyId(id); try { await callback(); toast.success(message); await load(); } catch (error) { toast.error(getApiErrorMessage(error, 'Could not update the email schedule.')); } finally { setBusyId(null); } };
  return <div className="flex w-full max-w-full flex-col gap-2" style={{ marginTop: 14, alignSelf: 'stretch', minWidth: 0 }}>
    <button type="button" style={{ ...button, width: '100%', boxSizing: 'border-box', color: 'var(--blue)', border: '1px solid rgba(59,130,246,.35)', background: 'linear-gradient(135deg, rgba(59,130,246,.1), rgba(168,85,247,.12))', opacity: loading ? 0.6 : 1 }} disabled={loading} onClick={() => setModal({})}><Mail size={14} />Auto email reports</button>
    <div style={{ fontSize: 11, color: 'var(--tx3)', overflowWrap: 'anywhere' }}>{reportTypeLabel[reportType]} · {visibleReports.length} saved schedule{visibleReports.length === 1 ? '' : 's'}</div>
    {!loading && !visibleReports.length && <p style={{ margin: 0, fontSize: 11, color: 'var(--tx3)' }}>No email schedules for {reportTypeLabel[reportType].toLowerCase()} yet.</p>}
    {visibleReports.map((report) => <div key={report._id} style={{ width: '100%', boxSizing: 'border-box', padding: 10, border: `1px solid ${report.enabled ? 'rgba(99,102,241,.28)' : 'var(--bd)'}`, borderRadius: 10, color: 'var(--tx2)', background: report.enabled ? 'linear-gradient(135deg, rgba(59,130,246,.1), rgba(168,85,247,.08))' : 'var(--bg2)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, minWidth: 0, color: 'var(--tx)', fontSize: 11 }}><span style={{ width: 7, height: 7, flex: '0 0 auto', marginTop: 5, borderRadius: '50%', background: report.enabled ? 'var(--ok)' : 'var(--tx3)' }} /><strong>{report.enabled ? 'Enabled' : 'Disabled'}</strong><span style={{ color: 'var(--tx3)' }}>·</span><strong style={{ minWidth: 0, lineHeight: 1.25, overflowWrap: 'anywhere' }}>{report.title}</strong></div>
      <div style={{ marginTop: 5, color: 'var(--tx3)', fontSize: 10.5 }}>{reportTypeLabel[report.reportType || 'total']} · {report.schedule?.frequency || 'daily'} at {report.schedule?.time || '—'} · {report.recipients?.length || 0} recipient{report.recipients?.length === 1 ? '' : 's'}</div>
      <div className="flex flex-nowrap items-center gap-2 mt-3"><button type="button" title="Send test mail" aria-label="Send test mail" style={{ ...button, width: 32, height: 32, padding: 0, flex: '0 0 auto', color: 'var(--violet)', background: 'rgba(168,85,247,.08)', cursor: 'pointer' }} disabled={Boolean(busyId)} onClick={() => action(report._id, () => sendAutoEmailReportNow(report._id), 'Test email sent to the configured recipients.')}><Send size={14} /></button><button type="button" title="Edit report" aria-label="Edit report" style={{ ...button, width: 32, height: 32, padding: 0, flex: '0 0 auto', color: 'var(--blue)', background: 'rgba(59,130,246,.08)', cursor: 'pointer' }} disabled={Boolean(busyId)} onClick={() => setModal(report)}><Pencil size={14} /></button><button type="button" title={report.enabled ? 'Disable report' : 'Enable report'} aria-label={report.enabled ? 'Disable report' : 'Enable report'} style={{ ...button, width: 32, height: 32, padding: 0, flex: '0 0 auto', color: 'var(--warn)', background: 'rgba(245,158,11,.08)', cursor: 'pointer' }} disabled={Boolean(busyId)} onClick={() => action(report._id, () => updateAutoEmailReport(report._id, { enabled: !report.enabled }), report.enabled ? 'Email schedule disabled.' : 'Email schedule enabled.')}>{report.enabled ? <PauseCircle size={14} /> : <PlayCircle size={14} />}</button><button type="button" title="Delete report" aria-label="Delete report" style={{ ...button, width: 32, height: 32, padding: 0, flex: '0 0 auto', color: 'var(--crit)', background: 'rgba(239,68,68,.08)', cursor: 'pointer' }} disabled={Boolean(busyId)} onClick={() => setDeleteTarget(report)}><Trash2 size={14} /></button></div>
    </div>)}
    {modal && <ScheduleForm key={modal._id || 'new'} initial={modal} recipients={recipients} timezone={timezone} previewRows={previewRows} periodLabel={periodLabel} reportType={reportType} onSave={save} onClose={() => setModal(null)} />}
    <ConfirmationModal open={Boolean(deleteTarget)} title="Delete auto email report?" icon={<Trash2 className="h-6 w-6 text-[var(--crit)]" />} message={<>This will permanently remove <strong>{deleteTarget?.title}</strong> and its schedule.</>} confirmLabel="Delete report" loading={busyId === deleteTarget?._id} onClose={() => setDeleteTarget(null)} onConfirm={() => action(deleteTarget._id, () => deleteAutoEmailReport(deleteTarget._id), 'Email schedule deleted.').then(() => setDeleteTarget(null))} />
  </div>;
}
