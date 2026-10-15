import { useEffect, useMemo, useState } from 'react';
import moment from 'moment-timezone';
import { Eye, Mail, PauseCircle, PlayCircle, RefreshCw, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { downloadBoxPackingPdf, downloadBoxPackingXlsx } from './boxPackingExport';
import { packingStats } from './boxPackingData';
import { mono, label, Panel, Chip, NoPeriodData } from '@/pages/SolderLine/ui';
import SnapshotCell from '@/pages/SolderLine/SnapshotCell';
import { mediaUrl } from '@/lib/format';
import { createAutoEmailReport, deleteAutoEmailReport, getAutoEmailReports, previewAutoEmailReport, sendAutoEmailReportNow, updateAutoEmailReport } from '@/helpers/autoEmailReports';

const TYPES = [
  ['comparison', 'Zone comparison', 'Events, boxes and cycle time by packing zone'],
  ['review', 'Review report', 'Packing events awaiting confirmation'],
  ['hourly', 'Hourly activity', 'Boxes, events and review items per hour'],
  ['total', 'Total report', 'All packing events, boxes and review totals'],
];
const SHOW_INLINE_AUTO_EMAIL_REPORTS = false;
const rangeLabel = (range, timezone) => {
  const start = moment.tz(range.startDate, timezone).format('DD MMM YYYY');
  const end = moment.tz(range.endDate, timezone).format('DD MMM YYYY');
  return start === end ? start : `${start} – ${end}`;
};
const presets = (today, timezone) => {
  const end = moment.tz(today, timezone).startOf('day');
  const make = (title, start, finish) => ({ title, startDate: start.format('YYYY-MM-DD'), endDate: finish.format('YYYY-MM-DD') });
  return [make('Today', end.clone(), end.clone()), make('Yesterday', end.clone().subtract(1, 'day'), end.clone().subtract(1, 'day')), make('Last 7 days', end.clone().subtract(6, 'days'), end.clone()), make('This month', end.clone().startOf('month'), end.clone())];
};

function TotalLogPreview({ rows, stats, timezone }) {
  const cols = '100px 150px 150px 130px 70px 95px 145px 140px 82px';
  return <>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
      {[['Events', stats.total], ['Boxes packed', stats.boxes], ['Needs review', stats.review], ['Average cycle', `${stats.avgTime}s`]].map(([name, value]) => <div key={name} style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--bd)' }}><div style={label}>{name}</div><div style={{ ...mono, fontSize: 22, fontWeight: 700, marginTop: 6 }}>{value}</div></div>)}
    </div>
    <div style={{ overflowX: 'auto', border: '1px solid var(--bd)', borderRadius: 10 }}>
      <div style={{ minWidth: 1060 }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '11px 14px', ...mono, fontSize: 9, letterSpacing: '.08em', color: 'var(--tx3)' }}>{['STATUS', 'BOX ID', 'COMPLETED BY', 'ZONE', 'BOXES', 'TIME TAKEN', 'DETECTED VIA', 'TIME', 'SNAPSHOT'].map((item) => <span key={item}>{item}</span>)}</div>
        {rows.map((row) => <div key={row.id} style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '8px 14px', alignItems: 'center', borderTop: '1px solid var(--bd)', fontSize: 12.5 }}><span style={{ ...mono, fontSize: 10, fontWeight: 700, color: row.status === 'review' ? 'var(--warn)' : 'var(--ok)' }}>{row.status === 'review' ? 'NEEDS REVIEW' : 'COMPLETED'}</span><span style={{ ...mono, fontWeight: 700 }}>{row.boxId}</span><span style={{ fontWeight: 600 }}>{row.completedBy}</span><span>{row.zone}</span><span>{row.boxNumber}</span><span style={mono}>{row.timeTakenSec}s</span><span style={{ color: 'var(--tx3)' }}>{row.detectedVia}</span><span style={mono}>{moment(row.time).tz(timezone).format('DD MMM HH:mm')}</span><SnapshotCell value={row.Image ? mediaUrl(row.Image) : ''} label={`Open snapshot for ${row.boxId}`} /></div>)}
      </div>
    </div>
  </>;
}

function ReportPreview({ type, rows, timezone }) {
  const stats = packingStats(rows);
  if (!rows.length) return <NoPeriodData minH={220} />;
  if (type === 'total') return <TotalLogPreview rows={rows} stats={stats} timezone={timezone} />;
  if (type === 'review') return <div style={{ display: 'grid', gap: 10 }}>{rows.map((row) => <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 130px 100px', gap: 12, alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--bd)' }}><span style={{ ...mono, fontWeight: 700 }}>{row.boxId}</span><span><strong>{row.zone}</strong><small style={{ display: 'block', color: 'var(--tx3)', marginTop: 3 }}>{row.completedBy}</small></span><span>{row.boxNumber} boxes</span><span style={{ color: 'var(--warn)' }}>Needs review</span></div>)}</div>;
  if (type === 'hourly') {
    const hours = Object.values(rows.reduce((out, row) => { const hour = moment(row.time).tz(timezone).hour(); out[hour] ||= { hour, events: 0, boxes: 0, review: 0 }; out[hour].events += 1; out[hour].boxes += row.boxNumber; out[hour].review += row.status === 'review' ? 1 : 0; return out; }, {})).sort((a, b) => a.hour - b.hour);
    return <div style={{ display: 'grid', gap: 0 }}>{hours.map((item) => <div key={item.hour} style={{ display: 'grid', gridTemplateColumns: '1fr repeat(3, 120px)', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--bd)' }}><strong>{String(item.hour).padStart(2, '0')}:00–{String(item.hour + 1).padStart(2, '0')}:00</strong><span>{item.events} events</span><span>{item.boxes} boxes</span><span style={{ color: item.review ? 'var(--warn)' : 'var(--tx3)' }}>{item.review} review</span></div>)}</div>;
  }
  if (type === 'total') return <><div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>{[['Events', stats.total], ['Boxes packed', stats.boxes], ['Needs review', stats.review], ['Average cycle', `${stats.avgTime}s`]].map(([name, value]) => <div key={name} style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--bd)' }}><div style={label}>{name}</div><div style={{ ...mono, fontSize: 22, fontWeight: 700, marginTop: 6 }}>{value}</div></div>)}</div><div style={{ display: 'grid', gap: 0 }}><div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(4, 120px)', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--bd)' }}><strong>All packing zones</strong><span>{stats.total} events</span><span>{stats.boxes} boxes</span><span style={{ color: stats.review ? 'var(--warn)' : 'var(--tx3)' }}>{stats.review} review</span><span>{stats.avgTime}s avg</span></div></div></>;
  const zones = Object.values(rows.reduce((out, row) => { out[row.zone] ||= { zone: row.zone, events: 0, boxes: 0, review: 0, seconds: 0 }; out[row.zone].events += 1; out[row.zone].boxes += row.boxNumber; out[row.zone].review += row.status === 'review' ? 1 : 0; out[row.zone].seconds += row.timeTakenSec; return out; }, {}));
  return <><div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>{[['Events', stats.total], ['Boxes packed', stats.boxes], ['Needs review', stats.review], ['Average cycle', `${stats.avgTime}s`]].map(([name, value]) => <div key={name} style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--bd)' }}><div style={label}>{name}</div><div style={{ ...mono, fontSize: 22, fontWeight: 700, marginTop: 6 }}>{value}</div></div>)}</div><div style={{ display: 'grid', gap: 0 }}>{zones.map((zone) => <div key={zone.zone} style={{ display: 'grid', gridTemplateColumns: '1fr repeat(4, 120px)', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--bd)' }}><strong>{zone.zone}</strong><span>{zone.events} events</span><span>{zone.boxes} boxes</span><span>{zone.review} review</span><span>{Math.round(zone.seconds / zone.events)}s avg</span></div>)}</div></>;
}

function InlineAutoEmailReports() {
  const [open, setOpen] = useState(false);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [title, setTitle] = useState('Box Packing Report');
  const [recipients, setRecipients] = useState('');
  const [frequency, setFrequency] = useState('daily');
  const [time, setTime] = useState('18:00');
  const [pdf, setPdf] = useState(true);
  const [xlsx, setXlsx] = useState(true);
  const loadReports = async () => { setLoading(true); try { const result = await getAutoEmailReports({ limit: 50, search: 'Box Packing' }); setReports((result.reports || []).filter((report) => (report.incidentTypes || []).includes('boxPackingDetection'))); } catch (error) { toast.error(error?.response?.data?.message || 'Could not load Box Packing email reports.'); } finally { setLoading(false); } };
  useEffect(() => { if (open) loadReports(); }, [open]);
  const save = async () => { const emailList = recipients.split(',').map((email) => email.trim()).filter(Boolean); const formats = [pdf && 'pdf', xlsx && 'xlsx'].filter(Boolean); if (title.trim().length < 2) return toast.error('Enter a report title.'); if (!emailList.length) return toast.error('Enter at least one recipient email.'); if (!formats.length) return toast.error('Select PDF or Excel.'); setBusy('save'); try { await createAutoEmailReport({ title: title.trim(), contentTypes: ['incidents'], contentType: 'incidents', incidentTypes: ['boxPackingDetection'], pdfLayout: 'list', recipients: emailList, schedule: { frequency, time }, target: { scope: 'organization' }, formats, enabled: true, sendTestMail: false }); toast.success('Box Packing auto email report created.'); setRecipients(''); await loadReports(); } catch (error) { toast.error(error?.response?.data?.message || 'Could not create the email report.'); } finally { setBusy(''); } };
  const action = async (key, callback, message) => { setBusy(key); try { await callback(); toast.success(message); await loadReports(); } catch (error) { toast.error(error?.response?.data?.message || 'Auto email action failed.'); } finally { setBusy(''); } };
  return <div style={{ marginTop: 16 }}>
    <button type="button" onClick={() => setOpen((value) => !value)} style={{ height: 40, padding: '0 16px', borderRadius: 10, border: '1px solid rgba(168,85,247,.45)', color: '#7c3aed', background: 'linear-gradient(135deg, rgba(59,130,246,.08), rgba(168,85,247,.12))', cursor: 'pointer', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8 }}><Mail size={15} />{open ? 'Close auto email reports' : 'Auto email reports'}</button>
    {open && <Panel style={{ marginTop: 12, padding: 16, background: 'linear-gradient(135deg, rgba(59,130,246,.06), rgba(168,85,247,.08))' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}><div><div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 16 }}>Box Packing Auto Email Reports</div><div style={{ color: 'var(--tx3)', fontSize: 11.5, marginTop: 3 }}>Only Box Packing incidents are included.</div></div><button type="button" onClick={loadReports} title="Refresh reports" style={{ marginLeft: 'auto', border: 0, background: 'transparent', color: 'var(--tx3)', cursor: 'pointer' }}><RefreshCw size={15} /></button></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr 130px 110px', gap: 10, alignItems: 'end' }}>
        <label style={{ ...label, display: 'grid', gap: 6 }}>TITLE<input value={title} onChange={(event) => setTitle(event.target.value)} style={{ height: 36, padding: '0 10px', borderRadius: 7, border: '1px solid var(--bd2)', background: 'var(--bg2)', color: 'var(--tx)' }} /></label>
        <label style={{ ...label, display: 'grid', gap: 6 }}>RECIPIENT EMAILS<input value={recipients} onChange={(event) => setRecipients(event.target.value)} placeholder="name@company.com, team@company.com" style={{ height: 36, padding: '0 10px', borderRadius: 7, border: '1px solid var(--bd2)', background: 'var(--bg2)', color: 'var(--tx)' }} /></label>
        <label style={{ ...label, display: 'grid', gap: 6 }}>FREQUENCY<select value={frequency} onChange={(event) => setFrequency(event.target.value)} style={{ height: 36, borderRadius: 7, border: '1px solid var(--bd2)', background: 'var(--bg2)', color: 'var(--tx)' }}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
        <label style={{ ...label, display: 'grid', gap: 6 }}>SEND TIME<input type="time" value={time} onChange={(event) => setTime(event.target.value)} style={{ height: 36, borderRadius: 7, border: '1px solid var(--bd2)', background: 'var(--bg2)', color: 'var(--tx)' }} /></label>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}><span style={label}>FORMAT</span><label style={{ fontSize: 12 }}><input type="checkbox" checked={pdf} onChange={(event) => setPdf(event.target.checked)} /> PDF</label><label style={{ fontSize: 12 }}><input type="checkbox" checked={xlsx} onChange={(event) => setXlsx(event.target.checked)} /> Excel</label><button type="button" onClick={save} disabled={busy === 'save'} style={{ marginLeft: 'auto', height: 36, padding: '0 14px', border: 0, borderRadius: 8, color: '#fff', background: 'linear-gradient(135deg,var(--blue),var(--violet))', cursor: busy === 'save' ? 'wait' : 'pointer', fontWeight: 700 }}>{busy === 'save' ? 'Saving...' : 'Create report'}</button></div>
      <div style={{ marginTop: 16, borderTop: '1px solid var(--bd)', paddingTop: 12 }}><div style={{ ...label, marginBottom: 8 }}>EXISTING BOX PACKING REPORTS</div>{loading ? <div style={{ color: 'var(--tx3)', fontSize: 12 }}>Loading reports...</div> : !reports.length ? <div style={{ color: 'var(--tx3)', fontSize: 12 }}>No Box Packing auto email reports configured.</div> : reports.map((report) => <div key={report._id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1.5fr auto', gap: 10, alignItems: 'center', padding: '9px 0', borderTop: '1px solid var(--bd)', fontSize: 12 }}><span style={{ fontWeight: 700 }}>{report.title}</span><span>{report.schedule?.frequency || '—'} · {report.schedule?.time || '—'}</span><span style={{ color: 'var(--tx3)' }}>{(report.recipients || []).join(', ') || 'No recipients'}</span><span style={{ display: 'flex', gap: 5 }}><button type="button" title="Preview" onClick={() => action('preview:' + report._id, () => previewAutoEmailReport(report._id), 'Preview generated.')} style={{ border: 0, background: 'transparent', color: 'var(--blue)', cursor: 'pointer' }}><Eye size={14} /></button><button type="button" title="Send now" onClick={() => action('send:' + report._id, () => sendAutoEmailReportNow(report._id), 'Test email sent.')} style={{ border: 0, background: 'transparent', color: 'var(--violet)', cursor: 'pointer' }}><Send size={14} /></button><button type="button" title={report.enabled === false ? 'Enable' : 'Pause'} onClick={() => action('toggle:' + report._id, () => updateAutoEmailReport(report._id, { enabled: report.enabled === false }), report.enabled === false ? 'Report enabled.' : 'Report paused.')} style={{ border: 0, background: 'transparent', color: 'var(--tx3)', cursor: 'pointer' }}>{report.enabled === false ? <PlayCircle size={14} /> : <PauseCircle size={14} />}</button><button type="button" title="Delete" onClick={() => action('delete:' + report._id, () => deleteAutoEmailReport(report._id), 'Report deleted.')} style={{ border: 0, background: 'transparent', color: 'var(--crit)', cursor: 'pointer' }}><Trash2 size={14} /></button></span></div>)}</div>
    </Panel>}
  </div>;
}


export default function BoxPackingReports({ rows, range, onRangeChange, today, timezone = 'Asia/Kolkata' }) {
  const [type, setType] = useState('comparison');
  const meta = TYPES.find(([value]) => value === type) || TYPES[0];
  const reportRows = useMemo(() => rows.filter((row) => type !== 'review' || row.status === 'review').sort((a, b) => new Date(b.time) - new Date(a.time)), [rows, type]);
  const stats = packingStats(reportRows);
  const periodLabel = rangeLabel(range, timezone);
  const exportOptions = { title: `Box Packing Report · ${meta[1]}`, periodLabel, timezone, filenamePrefix: `box-packing-${type}-report` };
  const rangePresets = presets(today, timezone);
  return <>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}><span style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 20 }}>Box Packing Reports</span><span style={{ fontSize: 12.5, color: 'var(--tx3)' }}>Choose a report and date range, preview the exact data, then export it</span></div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 260px', maxWidth: 340, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Panel style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 14 }}><div style={label}>Report</div>{TYPES.map(([value, reportTitle, description]) => <button key={value} type="button" onClick={() => setType(value)} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '11px 12px', borderRadius: 11, cursor: 'pointer', textAlign: 'left', color: 'var(--tx)', background: type === value ? 'linear-gradient(135deg, rgba(59,130,246,.16), rgba(168,85,247,.08))' : 'transparent', border: `1px solid ${type === value ? 'rgba(59,130,246,.45)' : 'var(--bd)'}` }}><span style={{ width: 16, height: 16, flex: '0 0 auto', marginTop: 2, borderRadius: '50%', boxSizing: 'border-box', border: type === value ? '5px solid var(--blue)' : '2px solid var(--bd2)', background: type === value ? '#fff' : 'transparent' }} /><span><span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>{reportTitle}</span><span style={{ display: 'block', fontSize: 11.5, color: 'var(--tx3)', marginTop: 2 }}>{description}</span></span></button>)}</Panel>
        <Panel style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14 }}><div style={label}>Period</div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>{rangePresets.map((preset) => <Chip key={preset.title} on={range.startDate === preset.startDate && range.endDate === preset.endDate} color="var(--blue)" onClick={() => onRangeChange(preset)}>{preset.title}</Chip>)}</div><div style={{ fontSize: 11.5, color: 'var(--tx3)', padding: '3px 1px' }}>{periodLabel} · {timezone}</div><div style={{ ...label, marginTop: 4 }}>Download</div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}><button type="button" disabled={!reportRows.length} onClick={() => downloadBoxPackingPdf(reportRows, stats, { ...exportOptions, reportType: type })} style={{ height: 40, border: 0, borderRadius: 10, color: '#fff', background: 'linear-gradient(135deg, #3b82f6, #a855f7)', cursor: reportRows.length ? 'pointer' : 'not-allowed' }}>PDF</button><button type="button" disabled={!reportRows.length} onClick={() => downloadBoxPackingXlsx(reportRows, { ...exportOptions, reportType: type })} style={{ height: 40, border: '1px solid var(--bd2)', borderRadius: 10, color: 'var(--tx)', background: 'var(--bg2)', cursor: reportRows.length ? 'pointer' : 'not-allowed' }}>Excel</button></div></Panel>
      </div>
      <Panel pad={false} style={{ flex: '999 1 560px', minWidth: 'min(100%, 560px)' }}><div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 22px', borderBottom: '1px solid var(--bd)', background: 'linear-gradient(135deg, rgba(59,130,246,.1), rgba(168,85,247,.06))', flexWrap: 'wrap' }}><div><div style={{ ...label, fontSize: 9.5 }}>Preview · Box packing</div><div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 22, marginTop: 4 }}>{meta[1]}</div><div style={{ ...mono, fontSize: 11, color: 'var(--tx3)', marginTop: 3 }}>{periodLabel} · {timezone}</div></div><span style={{ marginLeft: 'auto', ...mono, fontSize: 10, color: 'var(--tx3)', border: '1px solid var(--bd2)', borderRadius: 6, padding: '4px 9px' }}>{reportRows.length} EVENTS</span></div><div style={{ padding: '18px 22px' }}><ReportPreview type={type} rows={reportRows} timezone={timezone} /></div></Panel>
    </div>
    {SHOW_INLINE_AUTO_EMAIL_REPORTS && <InlineAutoEmailReports />}
  </>;
}
