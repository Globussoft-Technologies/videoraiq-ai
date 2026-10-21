import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import moment from 'moment-timezone';
import { useLogsConfig } from '@/context/LogsConfigContext';
import { useSocket } from '@/context/SocketContext';
import { useAuth } from '@/context/AuthContext';
import { watchPackingIncidents } from './packingLiveUpdates';
import { IS_LICENSING_ENABLED } from '@/helpers/license';
import PageLoader from '@/components/PageLoader';
import { ErrorState } from '@/components/States';
import AccessDenied from '@/components/AccessDenied';
import { ArrowDown, ArrowUp, BarChart3, ChevronLeft, ChevronRight, Boxes, CheckCircle2, ClipboardCheck, Clock3, Download, FileSpreadsheet, FileText, Filter, Info, LayoutGrid, List, Maximize2, Package, PackageCheck, RefreshCw, RotateCcw, Rows3, Search, ShieldAlert, Sparkles, X } from 'lucide-react';
import { formatPackingDuration, packingStats, packingWorkerIds, packingWorkerId, packingCompletedZone, packingDateValue, packingEndTimestamp, packingEndTimeValue, packingStartTimestamp, packingStartTimeValue } from './boxPackingData';
import { samePackingCamera, packingStationKey, packingNvrId } from './packingIdentity';
import { downloadBoxPackingCsv, downloadBoxPackingPdf, downloadBoxPackingXlsx } from './boxPackingExport';
import { BOX_PACKING_CONFIG } from '@/pages/IncidentLogs/configs';
import { fetchIncidentLogs } from '@/pages/IncidentLogs/Api';
import CameraStream from '@/components/CameraStream';
import { OK, WARN, mono, label, Panel, Kpi, KpiGrid, Chip, NoPeriodData } from '@/pages/SolderLine/ui';
import PresetDateRangePicker from '@/components/PresetDateRangePicker';
import PackingStationSummary from './PackingStationSummary';
import BoxPackingReports from './BoxPackingReports';
import PackingZoneKpi from './PackingZoneKpi';
import PackingStreamUnavailable from './PackingStreamUnavailable';
import { packingHistoryStations } from './packingHistoryStations';
import BoxPackingAlertLogs from './BoxPackingAlertLogs';
import { getChannels, getNvrs } from '@/helpers/configure';
import { mediaUrl } from '@/lib/format';
import ImagePreviewModal from '@/pages/ANPRLogs/components/ImagePreviewModal';
import { PackingSortHeader, usePackingSort } from './PackingSort';
import SolderPagination, { useSolderPagination } from '@/pages/SolderLine/SolderPagination';
import WorkerComparison from './WorkerComparison';
import DownloadButton from '@/pages/SolderLine/DownloadButton';
import { downloadBoxPackingSnapshot } from './boxPackingSnapshots';

const statusMeta = {
  completed: { label: 'COMPLETED', color: OK, icon: CheckCircle2 },
  review: { label: 'NEEDS REVIEW', color: WARN, icon: ShieldAlert },
};

const formatTime = (value) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }).format(new Date(value));
const cameraNameOf = (item) => item?.channelData?.customName || item?.channelData?.name || item?.cameraName || item?.camera || item?.channelName || 'Packing Camera';
const nvrNameOf = (item) => item?.nvrData?.nvrName || item?.nvrData?.name || item?.nvrName || item?.nvr || item?.channelData?.nvrName || 'NVR';

const apiRowToPackingRow = (item) => {
  const zones = Array.isArray(item.zones)
    ? item.zones
    : Object.entries(item.zones || {}).map(([zone, value]) => ({
      zone,
      boxNumber: value?.box_number ?? value?.boxNumber,
      timeTakenSec: value?.time_taken ?? value?.timeTakenSec,
    }));
  const completedBy = item.completedBy || '';
  const activeZone = packingCompletedZone({ completedBy, zones }) || {};
  // `zones` is a workstation snapshot, not a list of additive events. The
  // event's boxes/cycle belong to the zone that completed this box.
  const eventBoxes = Number(activeZone.boxNumber) || 0;
  const eventCycle = Number(activeZone.timeTakenSec) || 0;
  const review = item.report?.status === true || (item.resolved !== true && (item.severity === 'moderate' || item.severity === 'high' || /review|variance|awaiting/i.test(item.confirmationReason || '')));
  return {
    id: item._id,
    boxId: item.boxId || item._id,
    completedBy: completedBy || 'Completed by not provided',
    zone: activeZone.zone || '',
    boxNumber: eventBoxes,
    timeTakenSec: eventCycle,
    zones: activeZone.zone ? [activeZone] : [],
    workerZones: zones,
    activeZone: activeZone.zone || '',
    detectedVia: item.detectedVia || 'Camera',
    status: review ? 'review' : 'completed',
    camera: cameraNameOf(item),
    cameraName: cameraNameOf(item),
    nvrName: nvrNameOf(item),
    cameraId: item.cameraId || item.channelData?._id || item.channelData?.id,
    channelId: item.channelId || item.cameraId || item.channelData?._id || item.channelData?.id,
    channelData: item.channelData,
    nvrData: item.nvrData,
    nvrId: packingNvrId(item),
    time: item.timeOfIncident || item.createdAt,
    startTime: item.startTime || item.start_time,
    endTime: item.endTime || item.end_time,
    color: review ? WARN : OK,
    reason: '\u200b',
    confirmationReason: item.confirmationReason || '',
    evidence: item.endTimeSource === 'CONFIRMED' ? 'Completion confirmed' : item.endTimeSource === 'ESTIMATED' ? 'Completion time estimated' : 'Evidence unavailable',
    Image: item.Image || item.image || item.imageUrl || item.incidentImageUrl,
    image: item.image,
    imageUrl: item.imageUrl,
    videoUrl: item.videoLink || item.videoUrl || item.video,
  };
};

const boxPackingDetectionEnabled = (channel) => {
  const detections = channel?.detections;
  const isEnabled = (setting) => Boolean(setting && setting.enabled === true && setting.active !== false);
  if (Array.isArray(detections)) {
    return detections.some((entry) => (
      (entry?.settingType === 'boxPackingDetectionSettings' || entry?.id?.settingType === 'boxPackingDetectionSettings')
      && isEnabled(entry)
    ));
  }
  const setting = detections?.boxPackingDetectionSettings;
  return isEnabled(setting);
};

const channelCameraLabel = (channel, reportRows = []) => {
  const reportedName = reportRows.find((row) => sameChannel(row, channel))?.camera;
  const originalName = channel?.customName || channel?.cameraName || channel?.channelName || channel?.aliasName || channel?.name;
  const displayName = [originalName, reportedName].find((value) => value && !/^\d+$/.test(String(value).trim()));
  return channel?._boxPackingCameraName || displayName || 'Unnamed camera';
};
const channelKey = (channel) => packingStationKey(channel, true);
const sameChannel = samePackingCamera;
const channelNvrLabel = (channel) => {
  const nvr = channel?.nvrId;
  return channel?._boxPackingNvrName || (nvr && typeof nvr === 'object' ? nvr.nvrName || nvr.name || nvr.customName || nvr.ip : null) || channel?.nvrName || channel?.nvrData?.nvrName || (typeof channel?.nvr === 'object' ? channel.nvr.nvrName || channel.nvr.name : channel?.nvr) || 'NVR';
};

function StatusTag({ status }) {
  const meta = statusMeta[status] || statusMeta.review;
  const Icon = meta.icon;
  return <span style={{ ...mono, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 9.5, fontWeight: 700, letterSpacing: '.06em', color: meta.color, background: `${meta.color}1f`, border: `1px solid ${meta.color}73`, borderRadius: 5, padding: '4px 8px' }}><Icon size={12} />{meta.label}</span>;
}

function LogCard({ row }) {
  const timing = [['Date', packingDateValue(row)], ['Start time', packingStartTimeValue(row)], ['End time', packingEndTimeValue(row)], ['Time to complete', formatPackingDuration(row.timeTakenSec)]];
  return <Panel pad={false} style={{ display: 'flex', flexDirection: 'column' }}>
    <div style={{ position: 'relative', minHeight: 112, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: `radial-gradient(circle at 50% 20%, ${row.color}44, transparent 58%), linear-gradient(135deg, #111827, #0a0e15)` }}>
      <Package size={42} color={row.color} strokeWidth={1.25} />
      <span style={{ position: 'absolute', left: 10, top: 10 }}><StatusTag status={row.status} /></span>
      <span style={{ ...mono, position: 'absolute', right: 10, bottom: 9, fontSize: 10, color: '#fff', background: 'rgba(6,8,13,.76)', borderRadius: 5, padding: '4px 7px' }}>{packingDateValue(row)}</span>
    </div>
    <div style={{ padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><span style={{ ...mono, fontSize: 12, fontWeight: 700 }}>{row.boxId}</span><span style={{ fontSize: 11, color: 'var(--tx3)' }}>{row.id}</span></div>
      <div><div style={label}>Completed by</div><div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 3 }}>{row.completedBy}</div><div style={{ fontSize: 10.5, color: row.evidence === 'Completion confirmed' ? OK : 'var(--tx3)', marginTop: 3 }}>{row.evidence}</div></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingTop: 8, borderTop: '1px solid var(--bd)' }}>
        {timing.map(([name, value]) => <div key={name}><div style={label}>{name}</div><div style={{ ...mono, fontSize: 11.5, marginTop: 3 }}>{value}</div></div>)}
        <div><div style={label}>Camera</div><div style={{ fontSize: 11.5, marginTop: 3 }}>{row.camera}</div></div>
      </div><div style={{ fontSize: 11, color: row.status === 'review' ? WARN : 'var(--tx3)', lineHeight: 1.35 }}>{row.reason}</div>
    </div>
  </Panel>;
}

function LogList({ rows }) {
  const cols = { display: 'grid', gridTemplateColumns: '115px 112px 150px 135px 100px 100px 100px 125px 145px', gap: 12, padding: '12px 16px', alignItems: 'center' };
  const headings = ['STATUS', 'BOX ID', 'COMPLETED BY', 'WORKERS', 'DATE', 'START TIME', 'END TIME', 'TIME TO COMPLETE', 'DETECTED VIA'];
  return <Panel pad={false} style={{ overflowX: 'auto' }}><div style={{ minWidth: 1100 }}><div style={{ ...cols, ...mono, fontSize: 9, letterSpacing: '.08em', color: 'var(--tx3)' }}>{headings.map((item) => <span key={item}>{item}</span>)}</div>{rows.map((row) => <div key={row.id} style={{ ...cols, fontSize: 12.5, borderTop: '1px solid var(--bd)' }}><StatusTag status={row.status} /><span style={{ ...mono, fontWeight: 700 }}>{row.boxId}</span><span style={{ fontWeight: 600 }}>{row.completedBy}</span><span>{row.zone}</span><span style={mono}>{packingDateValue(row)}</span><span style={mono}>{packingStartTimeValue(row)}</span><span style={mono}>{packingEndTimeValue(row)}</span><span style={mono}>{formatPackingDuration(row.timeTakenSec)}</span><span style={{ color: 'var(--tx3)' }}>{row.detectedVia}</span></div>)}</div></Panel>;
}

function AnalyticsMetric({ icon: Icon, label: text, value, sub, color, points }) {
  return <div style={{ position: 'relative', minHeight: 96, boxSizing: 'border-box', overflow: 'hidden', padding: '11px 14px', borderRadius: 14, background: `linear-gradient(135deg, var(--bg1solid) 35%, ${color}13 100%)`, border: `1px solid ${color}38`, boxShadow: `0 6px 18px rgba(15,23,42,.07), 0 2px 6px ${color}0c` }}><div style={{ position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, borderRadius: '0 4px 4px 0', background: color }} /><div style={{ position: 'absolute', right: -18, top: -24, width: 95, height: 95, borderRadius: '50%', background: `radial-gradient(circle, ${color}24, transparent 68%)` }}><div /></div><div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}><span style={{ display: 'grid', placeItems: 'center', width: 29, height: 29, borderRadius: 9, color, background: `${color}18` }}><Icon size={15} /></span><span style={{ ...mono, fontSize: 9, letterSpacing: '.09em', color: 'var(--tx3)', textTransform: 'uppercase' }}>{text}</span></div><div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, marginTop: 5, position: 'relative' }}><div><div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 24, lineHeight: 1, color }}>{value}</div><div style={{ fontSize: 9.5, color: 'var(--tx3)', marginTop: 3 }}>{sub}</div></div><svg width="74" height="27" viewBox="0 0 94 34" aria-hidden="true" style={{ overflow: 'visible' }}><polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} /></svg></div></div>;
}

function AnalyticsFilters({ open, setOpen, zone, setZone, zones }) {
  const activeCount = zone !== 'all' ? 1 : 0;
  return <div style={{ position: 'relative' }}>
    <button type="button" onClick={() => setOpen((value) => !value)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 15px', borderRadius: 9, border: `1px solid ${open || activeCount ? 'rgba(255,255,255,.82)' : 'rgba(255,255,255,.55)'}`, color: '#fff', background: open || activeCount ? 'rgba(255,255,255,.24)' : 'rgba(255,255,255,.13)', cursor: 'pointer', fontSize: 14, fontWeight: 700, boxShadow: open || activeCount ? '0 0 0 2px rgba(255,255,255,.12), inset 0 1px 0 rgba(255,255,255,.2)' : 'inset 0 1px 0 rgba(255,255,255,.16)', transition: 'background .18s ease, border-color .18s ease, box-shadow .18s ease' }}><Filter size={16} />Filters{activeCount ? <span style={{ minWidth: 18, height: 18, display: 'grid', placeItems: 'center', borderRadius: 99, background: '#fff', color: '#6d28d9', fontSize: 10 }}>{activeCount}</span> : null}</button>
    {open && <div style={{ position: 'absolute', zIndex: 50, right: 0, top: 45, width: 320, boxSizing: 'border-box', padding: 16, borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--bg1solid)', color: 'var(--tx)', boxShadow: '0 14px 32px rgba(15,23,42,.18)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--bd)', paddingBottom: 9, marginBottom: 13 }}><div style={{ fontSize: 14, fontWeight: 700 }}>Filters</div>{activeCount > 0 && <button type="button" onClick={() => setZone('all')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 0, background: 'transparent', color: 'var(--violet)', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}><RotateCcw size={12} />Reset all</button>}</div>
      <div style={{ display: 'grid', gap: 12 }}>
        <label style={{ display: 'grid', gap: 5, fontSize: 9, fontWeight: 700, letterSpacing: '.06em', color: 'var(--tx3)' }}>WORKER<select value={zone} onChange={(event) => setZone(event.target.value)} style={{ width: '100%', height: 40, padding: '0 10px', borderRadius: 8, border: '1px solid var(--bd2)', color: 'var(--tx)', background: 'var(--bg2)', cursor: 'pointer', fontSize: 12, outline: 'none' }}><option value="all">All workers</option>{zones.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      </div>
    </div>}
  </div>;
}

function PackingVideo({ row, channel, fill = false }) {
  const hostRef = useRef(null);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(document.fullscreenElement === hostRef.current);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);
  const toggleFullscreen = async () => {
    if (document.fullscreenElement === hostRef.current) await document.exitFullscreen?.();
    else await hostRef.current?.requestFullscreen?.();
  };
  return <div className="box-packing-camera-frame" ref={hostRef} onDoubleClick={toggleFullscreen} style={{ position: fill && !fullscreen ? 'absolute' : 'relative', inset: fill && !fullscreen ? 0 : undefined, minHeight: fullscreen ? '100vh' : 0, aspectRatio: fullscreen || fill ? 'auto' : '16 / 9', height: fullscreen || fill ? '100%' : 'auto', overflow: 'hidden', background: '#090d16', borderRadius: fullscreen ? 0 : 12, cursor: fullscreen ? 'default' : 'pointer' }}>
    {channel ? <CameraStream channel={channel} unavailableLabel="Not streaming" unavailableContent={<PackingStreamUnavailable />} rounded={false} minH={fill ? 0 : 320} fit={fill ? 'contain' : 'cover'} immediate clickToMaximize={false} showOverlay={false} cursor={fullscreen ? 'default' : 'pointer'} enableFullscreenZoom isFullscreen={fullscreen} enableZoom={fullscreen} zoomToolbarStyle={{ top: 14, right: fullscreen ? 58 : 14 }} /> : <div style={{ minHeight: 450, display: 'grid', placeItems: 'center', color: 'var(--tx3)' }}>Not streaming</div>}
    {fullscreen && <button type="button" onClick={toggleFullscreen} title="Close fullscreen" aria-label="Close fullscreen" style={{ position: 'absolute', right: 12, top: 12, zIndex: 40, width: 34, height: 34, display: 'grid', placeItems: 'center', color: '#fff', background: '#dc2626', border: '1px solid #fecaca', borderRadius: 7, cursor: 'pointer', boxShadow: '0 4px 14px rgba(127,29,29,.45)' }}><X size={17} /></button>}
    {!fullscreen && <button type="button" onClick={toggleFullscreen} title="Open fullscreen" aria-label="Open fullscreen" style={{ position: 'absolute', right: 12, bottom: 12, zIndex: 20, width: 32, height: 32, display: 'grid', placeItems: 'center', color: '#fff', background: 'rgba(6,8,13,.76)', border: '1px solid rgba(255,255,255,.28)', borderRadius: 6, cursor: 'pointer' }}><Maximize2 size={16} /></button>}
  </div>;
}

function HourlyPackingLog({ rows, dateRange }) {
  const period = packingPeriod(dateRange);
  const buckets = Object.values(rows.reduce((result, row) => {
    const bucket = packingBucket(row.time, period);
    result[bucket.key] ||= { ...bucket, boxes: 0, seconds: 0, timed: 0, zones: new Set() };
    const item = result[bucket.key];
    const seconds = Number(row.timeTakenSec) || 0;
    item.boxes += 1;
    if (Number.isFinite(seconds) && seconds > 0) { item.seconds += seconds; item.timed += 1; }
    if (packingWorkerId(row)) item.zones.add(packingWorkerId(row));
    return result;
  }, {}));
  const sorting = usePackingSort(buckets, { key: 'key', direction: 'asc' }, (row, key) => key === 'average' ? row.seconds / (row.timed || 1) : key === 'zones' ? row.zones.size : row[key]);
  const headings = [['key', period.unit === 'hour' ? 'TIME RANGE' : period.tableLabel], ['boxes', 'BOXES PACKED'], ['average', 'AVERAGE TIME TO COMPLETE'], ['zones', 'TOTAL WORKERS']];
  const exportActivity = () => {
    const periodColumn = period.unit === 'hour' ? 'Time range' : period.label[0].toUpperCase() + period.label.slice(1);
    const records = sorting.rows.map((item) => ({
      [periodColumn]: period.unit === 'hour' ? `${item.label}–${formatPackingHour((Number(item.key) + 1) % 24)}` : item.label,
      'Boxes packed': item.boxes,
      'Average time to complete': formatPackingDuration(item.seconds / (item.timed || 1)),
      'Total workers': `${item.zones.size}${item.zones.size ? ' · ' + [...item.zones].join(', ') : ''}`,
    }));
    downloadBoxPackingXlsx(rows, {
      title: `Box Packing ${period.label} Activity`, filenamePrefix: 'box-packing-activity-report',
      reportType: 'activity', timezone: PACKING_TIMEZONE,
      periodLabel: `${dateRange.startDate} – ${dateRange.endDate}`,
      columns: [periodColumn, 'Boxes packed', 'Average time to complete', 'Total workers'], records,
    });
  };
  return <Panel pad={false}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--bd)', flexWrap: 'wrap' }}>
      <strong style={{ fontSize: 15 }}>{period.unit === 'hour' ? 'Hourly' : period.label[0].toUpperCase() + period.label.slice(1)} activity log</strong>
      <span style={{ fontSize: 12, color: 'var(--tx3)' }}>Packed boxes and cycle times by {period.label}</span>
      <button type="button" disabled={!rows.length} onClick={exportActivity}
        style={{ marginLeft: 'auto', height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid var(--bd2)', background: 'var(--bg2)', color: 'var(--tx2)', ...mono, fontSize: 10, cursor: 'pointer' }}>XLSX</button>
    </div>
    <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 650, borderCollapse: 'collapse', fontSize: 12 }}>
      <thead><tr style={{ color: 'var(--tx3)', fontSize: 10, textAlign: 'left', background: 'var(--bg2)' }}>{headings.map(([key, text]) => <th key={key} aria-sort={sorting.sort.key === key ? sorting.sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'} style={{ padding: '12px 16px', fontWeight: 600 }}>{sorting.header(key, text)}</th>)}</tr></thead>
      <tbody>{sorting.rows.map((item) => <tr key={item.key} style={{ borderTop: '1px solid var(--bd)' }}>
        <td style={{ padding: '13px 16px', fontWeight: 600, ...mono }}>{period.unit === 'hour' ? item.label + '–' + formatPackingHour((Number(item.key) + 1) % 24) : item.label}</td>
        <td style={{ padding: '13px 16px', color: '#0891b2', fontWeight: 700 }}>{item.boxes}</td>
        <td style={{ padding: '13px 16px', ...mono }}>{formatPackingDuration(item.seconds / (item.timed || 1))}</td>
        <td title={[...item.zones].join(', ')} style={{ padding: '13px 16px' }}>{item.zones.size}<span style={{ marginLeft: 8, fontSize: 11, color: 'var(--tx3)' }}>{[...item.zones].join(', ')}</span></td>
      </tr>)}
      {!sorting.rows.length && <tr><td colSpan={4} style={{ padding: 20, textAlign: 'center', color: 'var(--tx3)' }}>No packing activity for this period.</td></tr>}
      </tbody>
    </table></div>
  </Panel>;
}

const PACKING_TIMEZONE = 'Asia/Kolkata';

function formatPackingHour(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

function packingPeriod(range) {
  const start = moment.tz(range?.startDate, PACKING_TIMEZONE).startOf('day');
  const end = moment.tz(range?.endDate, PACKING_TIMEZONE).startOf('day');
  const days = Math.max(1, end.diff(start, 'days') + 1);
  if (days <= 1) return { unit: 'hour', label: 'hour', tableLabel: 'HOUR' };
  if (days <= 31) return { unit: 'day', label: 'day', tableLabel: 'DAY' };
  if (days <= 366) return { unit: 'month', label: 'month', tableLabel: 'MONTH' };
  return { unit: 'year', label: 'year', tableLabel: 'YEAR' };
}

function packingBucket(value, period) {
  const date = moment.tz(value, PACKING_TIMEZONE);
  if (period.unit === 'hour') return { key: date.format('HH'), label: formatPackingHour(date.hour()) };
  if (period.unit === 'day') return { key: date.format('YYYY-MM-DD'), label: date.format('DD MMM') };
  if (period.unit === 'month') return { key: date.format('YYYY-MM'), label: date.format('MMM YYYY') };
  return { key: date.format('YYYY'), label: date.format('YYYY') };
}

function CameraStationCards({ rows, streamChannels, activeCameraIndex, setActiveCameraIndex }) {
  const [view, setView] = useState('cards');
  const stations = useMemo(() => streamChannels.map((channel, index) => {
    const stationRows = rows.filter((row) => sameChannel(row, channel));
    return {
      id: channelKey(channel, index), index, name: channelCameraLabel(channel, rows),
      nvr: channelNvrLabel(channel), workers: packingWorkerIds(stationRows),
      stats: packingStats(stationRows), timedCount: stationRows.filter((row) => Number(row.timeTakenSec) > 0).length,
    };
  }), [rows, streamChannels]);
  return <Panel pad={false} style={{ padding: 0, minHeight: 0 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', padding: '14px 16px 11px', borderBottom: '1px solid var(--bd)' }}>
      <span style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 15 }}>Camera stations</span>
      <span style={{ fontSize: 11, color: 'var(--tx3)' }}>Select a camera to view packing activity</span>
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ ...mono, fontSize: 9, color: 'var(--tx3)', whiteSpace: 'nowrap' }}>{stations.length} {stations.length === 1 ? 'STATION' : 'STATIONS'}</span><span style={{ display: 'flex', gap: 4 }}><Chip on={view === 'cards'} color="var(--blue)" onClick={() => setView('cards')}><LayoutGrid size={13} />Cards</Chip><Chip on={view === 'compare'} color="var(--blue)" onClick={() => setView('compare')}><Rows3 size={13} />Compare</Chip></span></span>
    </div>
    {view === 'cards' ? <div style={{ display: 'flex', gap: 12, padding: 14, overflowX: 'auto', overscrollBehaviorX: 'contain' }}>
      {streamChannels.length ? streamChannels.map((channel, index) => {
        const channelId = channelKey(channel, index);
        const stationRows = rows.filter((row) => sameChannel(row, channel)).sort((a, b) => new Date(b.time) - new Date(a.time));
        const latest = stationRows[0];
        const image = latest?.Image || latest?.image || latest?.imageUrl || latest?.incidentImageUrl;
        const active = index === activeCameraIndex;
        const stationName = channelCameraLabel(channel, rows);
        const stationStats = packingStats(stationRows);
        return <button key={channelId} type="button" onClick={() => setActiveCameraIndex(index)} aria-pressed={active} style={{ flex: '0 0 260px', width: 260, padding: 0, textAlign: 'left', color: 'var(--tx)', background: active ? 'linear-gradient(180deg, rgba(91,124,250,.15), var(--bg2))' : 'var(--bg2)', border: `1px solid ${active ? '#5b7cfa' : 'var(--bd)'}`, borderRadius: 13, overflow: 'hidden', cursor: 'pointer', boxShadow: active ? '0 0 0 2px rgba(91,124,250,.12)' : 'none' }}>
          <div style={{ position: 'relative', height: 132, background: 'linear-gradient(135deg, #111827, #263247)' }}>
            {image ? <img src={mediaUrl(image)} alt={`${channelCameraLabel(channel, rows)} latest packing snapshot`} style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }} /> : <div style={{ height: '100%', display: 'grid', placeItems: 'center', ...mono, fontSize: 10, color: 'rgba(255,255,255,.65)' }}>NO SNAPSHOT</div>}
            <span style={{ position: 'absolute', top: 9, left: 9, maxWidth: 'calc(100% - 70px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '4px 7px', borderRadius: 6, background: active ? '#5b7cfa' : 'rgba(10,15,28,.82)', color: '#fff', ...mono, fontSize: 9, fontWeight: 700 }}>{stationName}</span>
          </div>
          <div style={{ padding: '11px 12px 12px' }}>
            <div style={label}>Camera</div>
            <div style={{ marginTop: 4, fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={stationName}>{stationName}</div>
            <div style={{ ...label, marginTop: 10 }}>NVR</div>
            <div style={{ marginTop: 4, color: 'var(--tx2)', fontSize: 11.5 }}>{channelNvrLabel(channel)}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginTop: 11, paddingTop: 10, borderTop: '1px solid var(--bd)' }}>
              {[['BOXES PACKED', stationStats.boxes, '#5b7cfa'], ['AVG TIME', stations[index].timedCount ? formatPackingDuration(stationStats.avgTime) : '—', '#a855f7']].map(([labelText, value, color]) => <div key={labelText} style={{ minWidth: 0 }}><div style={{ ...mono, fontSize: 8, letterSpacing: '.07em', color: 'var(--tx3)' }}>{labelText}</div><div style={{ ...mono, marginTop: 4, fontSize: 13, fontWeight: 700, color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div></div>)}
            </div>
          </div>
        </button>;
      }) : <div style={{ flex: 1, padding: 22, textAlign: 'center', color: 'var(--tx3)', border: '1px dashed var(--bd2)', borderRadius: 12 }}>No enabled Box Packing camera stations.</div>}
    </div> : <PackingStationCompare stations={stations} activeCameraIndex={activeCameraIndex} setActiveCameraIndex={setActiveCameraIndex} />}
  </Panel>;
}

function PackingStationCompare({ stations, activeCameraIndex, setActiveCameraIndex }) {
  const [sort, setSort] = useState({ key: 'boxes', direction: 'desc' });
  const columns = [['name', 'CAMERA · WORKERS'], ['boxes', 'BOXES PACKED'], ['workers', 'WORKERS'], ['avgTime', 'AVG. TIME TO COMPLETE']];
  const sortValue = (station, key) => key === 'name' ? station.name : key === 'workers' ? station.workers.length : key === 'avgTime' ? (station.timedCount ? station.stats.avgTime : null) : station.stats[key];
  const sorted = [...stations].sort((left, right) => {
    const a = sortValue(left, sort.key);
    const b = sortValue(right, sort.key);
    if (a == null) return b == null ? 0 : 1;
    if (b == null) return -1;
    const result = typeof a === 'string' ? a.localeCompare(b, undefined, { numeric: true }) : a - b;
    return sort.direction === 'asc' ? result : -result;
  });
  const changeSort = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }));
  return <div style={{ padding: 14, overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 680, borderCollapse: 'separate', borderSpacing: 0, border: '1px solid var(--bd)', borderRadius: 12, overflow: 'hidden' }}>
    <thead><tr style={{ background: 'var(--bg2)', color: 'var(--tx3)', ...mono, fontSize: 9, letterSpacing: '.07em' }}>{columns.map(([key, heading]) => <th key={key} scope="col" aria-sort={sort.key === key ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'} style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--bd)' }}><PackingSortHeader column={key} sort={sort} onSort={changeSort}>{heading}</PackingSortHeader></th>)}</tr></thead>
    <tbody>{sorted.length ? sorted.map((station) => <tr key={station.id} onClick={() => setActiveCameraIndex(station.index)} style={{ cursor: 'pointer', background: station.index === activeCameraIndex ? 'color-mix(in srgb, var(--blue) 10%, var(--bg1))' : 'var(--bg1)' }}>
      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--bd)', borderLeft: station.index === activeCameraIndex ? '3px solid var(--blue)' : '3px solid transparent' }}><button type="button" onClick={() => setActiveCameraIndex(station.index)} aria-pressed={station.index === activeCameraIndex} style={{ display: 'block', width: '100%', padding: 0, border: 0, background: 'transparent', color: 'var(--tx)', textAlign: 'left', cursor: 'pointer' }}><strong style={{ display: 'block', ...mono, fontSize: 12 }}>{station.name}</strong><span style={{ display: 'block', marginTop: 3, color: 'var(--tx3)', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{station.workers.length ? station.workers.join(', ') : 'No workers recorded'} · {station.nvr}</span></button></td>
      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--bd)', ...mono, fontSize: 12, fontWeight: 700 }}>{station.stats.boxes}</td>
      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--bd)', ...mono, fontSize: 12, fontWeight: 700 }}>{station.workers.length}</td>
      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--bd)', ...mono, fontSize: 12, fontWeight: 700 }}>{station.timedCount ? formatPackingDuration(station.stats.avgTime) : '—'}</td>
    </tr>) : <tr><td colSpan={columns.length} style={{ padding: 22, textAlign: 'center', color: 'var(--tx3)' }}>No enabled Box Packing camera stations.</td></tr>}</tbody>
  </table></div>;
}

function LivePackingCameraCards({ rows, streamChannels }) {
  return <Panel pad={false} style={{ padding: 0, minHeight: 0, overflow: 'hidden' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '14px 16px 11px', borderBottom: '1px solid var(--bd)' }}><span style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 15 }}>Live packing cameras</span><span style={{ ...mono, fontSize: 9, color: 'var(--tx3)' }}>{streamChannels.length} enabled</span></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(520px, 1fr))', gap: 14, padding: 14 }}>
      {streamChannels.map((channel, index) => {
        const stationRows = rows.filter((row) => sameChannel(row, channel)).sort((a, b) => new Date(b.time) - new Date(a.time));
        const latest = stationRows[0] || null;
        const cameraStats = packingStats(stationRows);
        return <article key={channelKey(channel, index)} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.08fr) minmax(230px, .92fr)', gap: 12, padding: 12, border: '1px solid var(--bd)', borderRadius: 14, background: 'var(--bg1)', boxShadow: '0 4px 14px rgba(15,23,42,.08)' }}>
          <div style={{ minWidth: 0 }}><PackingVideo row={latest || rows[0]} channel={{ ...channel, _compactBoxPacking: true }} /><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 7, ...mono, fontSize: 9, color: 'var(--tx3)' }}><span>{channelCameraLabel(channel, rows)} · {channelNvrLabel(channel)}</span><span>CAMERA {index + 1}</span></div></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}><LiveStationHeader channel={channel} rows={rows} /><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}><div style={{ padding: '10px 9px', borderRadius: 9, background: 'var(--bg2)', border: '1px solid var(--bd)' }}><div style={{ ...mono, fontSize: 8.5, letterSpacing: '.08em', color: 'var(--tx3)' }}>COMPLETED EVENTS</div><div style={{ ...mono, fontSize: 19, fontWeight: 700, color: '#3b82f6', marginTop: 5 }}>{cameraStats.total}</div></div><div style={{ padding: '10px 9px', borderRadius: 9, background: 'var(--bg2)', border: '1px solid var(--bd)' }}><div style={{ ...mono, fontSize: 8.5, letterSpacing: '.08em', color: 'var(--tx3)' }}>BOXES PACKED</div><div style={{ ...mono, fontSize: 19, fontWeight: 700, color: OK, marginTop: 5 }}>{cameraStats.boxes}</div></div></div><CompactLatestPackingEvent event={latest} /></div>
        </article>;
      })}
    </div>
  </Panel>;
}

function LatestPackingEventCard({ event, channel, rows }) {
  const confirmed = event?.evidence === 'Completion confirmed';
  const camera = channel ? channelCameraLabel(channel, rows) : '';
  const nvr = channel ? channelNvrLabel(channel) : '';
  const statStyle = (color) => ({ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, padding: '7px 8px', borderRadius: 8, border: `1px solid ${color}33`, background: `${color}0d`, color });
  return <div style={{ minHeight: 170, padding: 14, boxSizing: 'border-box', borderRadius: 12, overflow: 'hidden', background: 'linear-gradient(135deg, rgba(79,70,229,.15), rgba(168,85,247,.08) 58%, rgba(255,255,255,.24))', border: '1px solid rgba(99,102,241,.38)', boxShadow: 'inset 3px 0 0 #6366f1, 0 8px 20px rgba(79,70,229,.08)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ display: 'grid', placeItems: 'center', width: 25, height: 25, borderRadius: 8, background: 'rgba(99,102,241,.15)', color: '#6366f1' }}><PackageCheck size={14} /></span><span style={label}>LATEST PACKING EVENT</span>{event && <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 6px', borderRadius: 99, background: confirmed ? `${OK}1c` : 'var(--bg2)', color: confirmed ? OK : 'var(--tx3)', ...mono, fontSize: 8.5, fontWeight: 700 }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />{confirmed ? 'CONFIRMED' : 'RECORDED'}</span>}</div>
    <div style={{ marginTop: 10, fontFamily: 'var(--disp)', fontSize: 20, lineHeight: 1, fontWeight: 800, color: 'var(--tx)' }}>{event?.boxId || 'No events for this camera'}</div>
    {event ? <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 7, marginTop: 11 }}>
        <div style={statStyle('#3b82f6')}><CheckCircle2 size={12} /><span style={{ ...mono, fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.completedBy}</span></div>
        <div style={statStyle('#14b8a6')}><Boxes size={12} /><span style={{ ...mono, fontSize: 9 }}>{event.boxNumber} boxes</span></div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 11, color: confirmed ? OK : 'var(--tx3)', ...mono, fontSize: 9.5 }}><CheckCircle2 size={12} />{event.evidence} <span style={{ color: 'var(--tx3)' }}>·</span> <span style={{ color: 'var(--tx3)' }}>Recorded {formatTime(event.time)}</span></div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 9 }}>{camera && <span style={{ padding: '4px 6px', borderRadius: 6, background: 'rgba(255,255,255,.5)', border: '1px solid var(--bd)', color: 'var(--tx3)', ...mono, fontSize: 8.5 }}>{camera}</span>}{nvr && <span style={{ padding: '4px 6px', borderRadius: 6, background: 'rgba(255,255,255,.5)', border: '1px solid var(--bd)', color: 'var(--tx3)', ...mono, fontSize: 8.5 }}>{nvr}</span>}</div>
    </> : <div style={{ marginTop: 9, color: 'var(--tx3)', fontSize: 12 }}>Waiting for camera data</div>}
  </div>;
}

function CompactLatestPackingEvent({ event }) {
  return <div style={{ minHeight: 104, padding: 14, boxSizing: 'border-box', borderRadius: 12, overflow: 'hidden', background: 'linear-gradient(135deg, rgba(79,70,229,.15), rgba(168,85,247,.08) 58%, rgba(255,255,255,.24))', border: '1px solid rgba(99,102,241,.38)', boxShadow: 'inset 3px 0 0 #6366f1, 0 8px 20px rgba(79,70,229,.08)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ display: 'grid', placeItems: 'center', width: 25, height: 25, borderRadius: 8, background: 'rgba(99,102,241,.15)', color: '#6366f1' }}><PackageCheck size={14} /></span><span style={label}>LATEST COMPLETED BOX</span></div>
    <div style={{ marginTop: 10, fontFamily: 'var(--disp)', fontSize: 20, lineHeight: 1, fontWeight: 800, color: 'var(--tx)' }}>{event?.boxId || 'No events for this camera'}</div>
    {event ? <div style={{ marginTop: 8, ...mono, fontSize: 9.5, color: '#3b82f6' }}>COMPLETED BY WORKER {event.completedBy}</div> : <div style={{ marginTop: 9, color: 'var(--tx3)', fontSize: 12 }}>Waiting for camera data</div>}
  </div>;
}

function ZoneCompletionCardsCarousel({ rows }) {
  const groups = packingWorkerIds(rows).map((zone) => ({
    zone,
    rows: rows.filter((row) => packingWorkerId(row) === zone),
  }));
  const [activeIndex, setActiveIndex] = useState(0);
  const totalCompleted = rows.filter((row) => row.status === 'completed').length;
  const currentIndex = groups.length ? Math.min(activeIndex, groups.length - 1) : 0;
  const group = groups[currentIndex];
  const completed = group?.rows.filter((row) => row.status === 'completed') || [];
  const average = packingStats(completed).avgTime;
  const share = totalCompleted ? completed.length / totalCompleted * 100 : 0;
  const color = ['#6366f1', '#a855f7', '#0891b2'][currentIndex % 3];
  return <Panel pad={false} style={{ padding: 16, minWidth: 0 }}><div style={{ display: 'grid', gap: 12 }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <div><div style={{ fontWeight: 600, fontSize: 15 }}>Worker completions</div><div style={{ marginTop: 4, fontSize: 11, color: 'var(--tx3)' }}>Each worker's share of this camera's completed boxes</div></div>
      {groups.length > 1 && <span style={{ marginLeft: 'auto', alignSelf: 'center', padding: '4px 8px', borderRadius: 999, background: 'var(--bg2)', border: '1px solid var(--bd2)', color: 'var(--tx3)', ...mono, fontSize: 9 }}>{currentIndex + 1} / {groups.length}</span>}
      {false && <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexShrink: 0 }}>
        <button type="button" onClick={() => setActiveIndex((index) => Math.max(0, index - 1))} disabled={currentIndex === 0} aria-label="Previous worker" title="Previous worker" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, border: '1px solid var(--bd2)', borderRadius: 7, background: currentIndex === 0 ? 'var(--bg2)' : 'var(--bg1)', color: currentIndex === 0 ? 'var(--tx3)' : 'var(--tx2)', cursor: currentIndex === 0 ? 'default' : 'pointer', fontSize: 18, lineHeight: 1 }}>‹</button>
        <span style={{ minWidth: 42, display: 'grid', placeItems: 'center', ...mono, fontSize: 9, color: 'var(--tx3)' }}>{currentIndex + 1} / {groups.length}</span>
        <button type="button" onClick={() => setActiveIndex((index) => Math.min(groups.length - 1, index + 1))} disabled={currentIndex === groups.length - 1} aria-label="Next worker" title="Next worker" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, border: '1px solid var(--bd2)', borderRadius: 7, background: currentIndex === groups.length - 1 ? 'var(--bg2)' : 'var(--bg1)', color: currentIndex === groups.length - 1 ? 'var(--tx3)' : 'var(--tx2)', cursor: currentIndex === groups.length - 1 ? 'default' : 'pointer', fontSize: 18, lineHeight: 1 }}>›</button>
      </div>}
    </div>
    {!groups.length && <div style={{ color: 'var(--tx3)', fontSize: 12 }}>No worker activity for this station.</div>}
    {group && <div role="region" aria-label="Worker completion cards" style={{ minWidth: 0 }}>
      <div key={group.zone} style={{ position: 'relative', padding: '14px 44px', minWidth: 0, boxSizing: 'border-box', border: '1px solid var(--bd)', borderRadius: 14, background: 'var(--bg2)' }}>
        {groups.length > 1 && <div style={{ position: 'absolute', top: '50%', left: -17, right: -17, transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 2, pointerEvents: 'auto' }}>
          <button type="button" onClick={() => setActiveIndex((index) => Math.max(0, index - 1))} disabled={currentIndex === 0} aria-label="Previous worker" title="Previous worker" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 42, padding: 0, border: 0, background: 'transparent', color: currentIndex === 0 ? 'var(--tx3)' : '#4f46e5', opacity: currentIndex === 0 ? 0.45 : 1, cursor: currentIndex === 0 ? 'default' : 'pointer', filter: currentIndex === 0 ? 'none' : 'drop-shadow(0 0 5px rgba(79,70,229,.35))' }}><ChevronLeft size={25} strokeWidth={3} /></button>
          <span style={{ display: 'none' }}>{currentIndex + 1} / {groups.length}</span>
          <button type="button" onClick={() => setActiveIndex((index) => Math.min(groups.length - 1, index + 1))} disabled={currentIndex === groups.length - 1} aria-label="Next worker" title="Next worker" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 42, padding: 0, border: 0, background: 'transparent', color: currentIndex === groups.length - 1 ? 'var(--tx3)' : '#4f46e5', opacity: currentIndex === groups.length - 1 ? 0.45 : 1, cursor: currentIndex === groups.length - 1 ? 'default' : 'pointer', filter: currentIndex === groups.length - 1 ? 'none' : 'drop-shadow(0 0 5px rgba(79,70,229,.35))' }}><ChevronRight size={25} strokeWidth={3} /></button>
        </div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div role="img" aria-label={`${group.zone}: ${completed.length} completed, ${Math.round(share)}% of station completions`} style={{ position: 'relative', width: 108, height: 108, flexShrink: 0 }}>
            <svg viewBox="0 0 112 112" width="108" height="108" aria-hidden="true" style={{ display: 'block' }}>
              <circle cx="56" cy="56" r="48" fill="none" stroke="var(--bd2)" strokeWidth="9" />
              <circle cx="56" cy="56" r="48" fill="none" stroke={color} strokeWidth="9" pathLength="100" strokeDasharray={`${share} ${100 - share}`} transform="rotate(-90 56 56)" />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', textAlign: 'center' }}><strong style={{ fontFamily: 'var(--disp)', fontSize: 23 }}>{Math.round(share)}%</strong><span style={{ ...mono, fontSize: 8, color: 'var(--tx3)' }}>SHARE</span></div>
          </div>
          <div style={{ flex: '1 1 160px', minWidth: 0 }}><strong style={{ color, fontSize: 14 }}>{group.zone}</strong>
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              {[['Completed boxes', completed.length], ['Average time to complete', completed.length ? formatPackingDuration(average) : '—']].map(([name, value]) => <div key={name} style={{ padding: '10px 9px', borderRadius: 9, background: 'var(--bg1)', border: '1px solid var(--bd)' }}><div style={{ ...label, fontSize: 8 }}>{name}</div><div style={{ ...mono, fontSize: 15, fontWeight: 700, marginTop: 6 }}>{value}</div></div>)}
            </div>
          </div>
        </div>
      </div>
    </div>}
  </div></Panel>;
}

function ZoneCompletionCards({ rows }) {
  const groups = packingWorkerIds(rows).map((zone) => ({
    zone,
    rows: rows.filter((row) => packingWorkerId(row) === zone),
  }));
  const totalCompleted = rows.filter((row) => row.status === 'completed').length;
  return <Panel pad={false} className="flex min-h-0 flex-1 flex-col" style={{ padding: 16, minWidth: 0, minHeight: 0, flex: '1 1 0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div>
        <div style={{ fontWeight: 600, fontSize: 15 }}>Worker completions</div>
        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--tx3)' }}>Each worker's share of this camera's completed boxes</div>
      </div>
      {!groups.length && <div style={{ color: 'var(--tx3)', fontSize: 12 }}>No worker activity for this station.</div>}
      <div role="region" aria-label="Worker completion cards" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-1.5" style={{ display: 'grid', gap: 12, scrollbarGutter: 'stable', overscrollBehavior: 'contain', minWidth: 0 }}>
        {groups.map((group, index) => {
          const completed = group.rows.filter((row) => row.status === 'completed');
          const average = packingStats(completed).avgTime;
          const share = totalCompleted ? completed.length / totalCompleted * 100 : 0;
          const color = ['#6366f1', '#a855f7', '#0891b2'][index % 3];
          return <div key={group.zone} style={{ padding: 14, minWidth: 0, boxSizing: 'border-box', border: '1px solid var(--bd)', borderRadius: 14, background: 'var(--bg2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div role="img" aria-label={`${group.zone}: ${completed.length} completed, ${Math.round(share)}% of station completions`} style={{ position: 'relative', width: 108, height: 108, flexShrink: 0 }}>
                <svg viewBox="0 0 112 112" width="108" height="108" aria-hidden="true" style={{ display: 'block' }}>
                  <circle cx="56" cy="56" r="48" fill="none" stroke="var(--bd2)" strokeWidth="9" />
                  <circle cx="56" cy="56" r="48" fill="none" stroke={color} strokeWidth="9" pathLength="100" strokeDasharray={`${share} ${100 - share}`} transform="rotate(-90 56 56)" />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', textAlign: 'center' }}><strong style={{ fontFamily: 'var(--disp)', fontSize: 23 }}>{Math.round(share)}%</strong><span style={{ ...mono, fontSize: 8, color: 'var(--tx3)' }}>SHARE</span></div>
              </div>
              <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                <strong style={{ color, fontSize: 14 }}>{group.zone}</strong>
                <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                  {[['Completed boxes', completed.length], ['Average time to complete', completed.length ? formatPackingDuration(average) : '—']].map(([name, value]) => <div key={name} style={{ padding: '10px 9px', borderRadius: 9, background: 'var(--bg1)', border: '1px solid var(--bd)' }}><div style={{ ...label, fontSize: 8 }}>{name}</div><div style={{ ...mono, fontSize: 15, fontWeight: 700, marginTop: 6 }}>{value}</div></div>)}
                </div>
              </div>
            </div>
          </div>;
        })}
      </div>
    </div>
  </Panel>;
}

function RecentPackingActivity({ rows, onOpen, onOpenAlerts }) {
  const recent = [...rows].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 1);
  const latest = recent[0];
  const latestImage = latest?.Image || latest?.image || latest?.imageUrl || latest?.incidentImageUrl;
  return <Panel pad={false} className="flex min-h-[300px] flex-col" style={{ padding: 0, overflow: 'hidden', background: 'linear-gradient(135deg, rgba(79,70,229,.15), rgba(168,85,247,.08) 58%, var(--bg2))', border: '1px solid rgba(99,102,241,.38)', boxShadow: 'inset 3px 0 0 #6366f1, 0 8px 20px rgba(79,70,229,.08)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: '1px solid var(--bd)', flexWrap: 'wrap' }}>
      <span style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, flexShrink: 0, borderRadius: 9, background: 'rgba(99,102,241,.15)', color: '#6366f1' }}><PackageCheck size={16} /></span>
      <span style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 15 }}>Latest packing activity</span>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
        {latestImage && <DownloadButton action={() => downloadBoxPackingSnapshot(latest)} description="image" aria-label={`Download packing image for ${latest.boxId}`} style={{ height: 32, padding: '0 12px', border: 0, color: '#fff', background: 'linear-gradient(135deg, #3b82f6, #a855f7)', fontSize: 12, fontWeight: 600 }}>Image</DownloadButton>}
        <button type="button" onClick={onOpenAlerts} style={{ height: 32, padding: '0 12px', border: '1px solid var(--bd2)', borderRadius: 8, background: 'var(--bg2)', color: 'var(--tx2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>All alert logs →</button>
      </div>
    </div>
    {!recent.length && <div className="min-h-0 flex-1" style={{ padding: 20, display: 'grid', placeItems: 'center', color: 'var(--tx3)', fontSize: 13 }}>No packing activity for this station.</div>}
    {recent.map((row) => {
      const image = row.Image || row.image || row.imageUrl || row.incidentImageUrl;
      return <div key={row.id} className="min-h-0 flex-1" style={{ display: 'flex', gap: 18, padding: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {image ? <button type="button" onClick={() => onOpen(row)} aria-label={`Open packing snapshot for ${row.boxId}`} style={{ flex: '1 1 170px', maxWidth: '100%', minWidth: 0, padding: 0, border: '1px solid var(--bd2)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg2)', cursor: 'pointer' }}><img src={mediaUrl(image)} alt={`Packing snapshot for ${row.boxId}`} style={{ width: '100%', aspectRatio: '16 / 10', objectFit: 'cover', display: 'block' }} /></button> : <div style={{ flex: '1 1 170px', minHeight: 160, display: 'grid', placeItems: 'center', borderRadius: 10, background: 'var(--bg2)', color: 'var(--tx3)', fontSize: 12 }}>No snapshot</div>}
        <div style={{ flex: '2 1 230px', minWidth: 0 }}>
          <div style={label}>Box ID</div><div style={{ marginTop: 5, fontFamily: 'var(--disp)', fontSize: 23, fontWeight: 800, overflowWrap: 'anywhere' }}>{row.boxId}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '15px 12px', marginTop: 17 }}>
            {[['Completed by', row.completedBy], ['Start time', packingStartTimeValue(row, PACKING_TIMEZONE)], ['Time to complete', row.timeTakenSec > 0 ? formatPackingDuration(row.timeTakenSec) : 'Not available'], ['End time', packingEndTimeValue(row, PACKING_TIMEZONE)]].map(([name, value]) => <div key={name} style={{ minWidth: 0, padding: '10px 11px', border: '1px solid var(--bd)', borderRadius: 9, background: 'var(--bg2)' }}><div style={label}>{name}</div><div style={{ ...mono, fontSize: 13, fontWeight: 600, lineHeight: 1.5, marginTop: 5, overflowWrap: 'anywhere' }}>{value ?? '—'}</div></div>)}
          </div>
        </div>
      </div>;
    })}
  </Panel>;
}

function LatestAbsenceSnapshot({ rows }) {
  const absence = rows.find((row) => row.type === 'absence' || row.eventType === 'absence' || row.absence === true);
  const image = absence?.Image || absence?.image || absence?.imageUrl || absence?.incidentImageUrl;
  return <Panel pad={false}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', borderBottom: '1px solid var(--bd)' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: WARN }} />
      <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>Latest absence snapshot</span>
    </div>
    {!absence ? <div style={{ padding: 16, color: 'var(--tx3)', fontSize: 12 }}>No absence events for this station.</div> : (
      <div style={{ display: 'flex', gap: 12, padding: 12, alignItems: 'flex-start' }}>
        <div style={{ width: 150, aspectRatio: '16 / 9', borderRadius: 8, overflow: 'hidden', background: '#0a0e15' }}>{image ? <img src={mediaUrl(image)} alt="Latest absence snapshot" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--tx3)', fontSize: 10 }}>No snapshot</div>}</div>
        <div style={{ minWidth: 0 }}><div style={{ fontWeight: 700 }}>{absence.completedBy || absence.operator || absence.zone || 'Absence event'}</div><div style={{ marginTop: 5, color: 'var(--tx3)', fontSize: 11 }}>{absence.reason || absence.description || 'Operator absence detected'}</div></div>
      </div>
    )}
  </Panel>;
}

function LiveStationHeader({ channel, rows }) {
  const camera = channel ? channelCameraLabel(channel, rows) : 'No camera selected';
  const nvr = channel ? channelNvrLabel(channel) : '';
  return <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', borderRadius: 12, background: 'var(--bg2)', border: '1px solid var(--bd)' }}>
    <span style={{ width: 8, height: 8, borderRadius: '50%', background: OK }} />
    <div style={{ minWidth: 0 }}><div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15 }}>Live packing station</div><div style={{ marginTop: 2, ...mono, fontSize: 8.5, color: 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{camera}{nvr ? ` · ${nvr}` : ''}</div></div>
    <span style={{ marginLeft: 'auto', ...mono, fontSize: 9, color: OK }}>PRESENT</span>
  </div>;
}

function PackingOverview({ rows: allRows, streamChannels, activeCameraIndex, setActiveCameraIndex, periodLabel, dateRange, onOpenAlerts }) {
  const activeChannel = streamChannels[activeCameraIndex];
  const rows = useMemo(() => allRows.filter((row) => activeChannel && sameChannel(row, activeChannel)).sort((a, b) => new Date(b.time) - new Date(a.time)), [allRows, activeChannel]);
  const zones = packingWorkerIds(rows);
  const [activitySort, setActivitySort] = useState({ key: 'startTime', direction: 'desc' });
  const zoneRows = [...rows].sort((a, b) => {
    const key = activitySort.key;
    const sortValue = (row) => key === 'snapshot' ? (row.Image || row.image || row.imageUrl || row.incidentImageUrl ? 1 : 0)
      : key === 'timeTakenSec' ? Number(row[key]) || 0
      : key === 'date' || key === 'startTime' ? new Date(packingStartTimestamp(row) || 0).getTime()
      : key === 'endTime' ? new Date(packingEndTimestamp(row) || 0).getTime()
      : String(row[key] || '').toLowerCase();
    const left = sortValue(a);
    const right = sortValue(b);
    const result = left < right ? -1 : left > right ? 1 : 0;
    return activitySort.direction === 'asc' ? result : -result;
  });
  const changeActivitySort = (key) => setActivitySort((current) => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }));
  const sortHeader = (key, text) => key === 'snapshot' ? <span>{text}</span> : <PackingSortHeader column={key} sort={activitySort} onSort={changeActivitySort}>{text}</PackingSortHeader>;
  const activityPagination = useSolderPagination(zoneRows, JSON.stringify([activeChannel && channelKey(activeChannel), activitySort.key, activitySort.direction, zoneRows.map((row) => row.id)]), 5);
  const completedStats = packingStats(allRows.filter((row) => row.status === 'completed'));
  const activeCameraRows = rows;
  const activeCameraStats = packingStats(activeCameraRows);
  const latestPackingEvent = activeCameraRows[0] || null;
  const stations = useMemo(() => streamChannels.map((channel, index) => {
    const stationRows = allRows.filter((row) => sameChannel(row, channel));
    return {
      id: channelKey(channel, index),
      name: channelCameraLabel(channel, allRows),
      nvrName: channelNvrLabel(channel),
      workers: packingWorkerIds(stationRows),
    };
  }), [streamChannels, allRows]);
  const [activityPreview, setActivityPreview] = useState(null);
  const moveCamera = (offset) => setActiveCameraIndex((index) => streamChannels.length ? (index + offset + streamChannels.length) % streamChannels.length : 0);
  return <>
    <KpiGrid>
      <PackingZoneKpi stations={stations} color="#3b82f6" style={{ minHeight: 122 }} />
      <Kpi label="Boxes packed" value={completedStats.boxes} sub="Across all cameras" title={`Boxes packed across all cameras during ${periodLabel}.`} color={OK} style={{ minHeight: 122 }} />
      <Kpi label="Average time to complete" value={formatPackingDuration(completedStats.avgTime)} sub="Across all cameras" title={`Average time to complete across completed packing records from all cameras during ${periodLabel}.`} color="#a855f7" style={{ minHeight: 122 }} />
    </KpiGrid>
    <CameraStationCards rows={allRows} streamChannels={streamChannels} activeCameraIndex={activeCameraIndex} setActiveCameraIndex={setActiveCameraIndex} />
    <PackingStationSummary stations={stations} selected={activeCameraIndex} onSelect={setActiveCameraIndex} />
    <KpiGrid>
      <PackingZoneKpi stations={stations[activeCameraIndex] ? [stations[activeCameraIndex]] : []} />
      <Kpi label="Boxes packed" value={activeCameraStats.boxes} sub="Selected camera" title="Packed box records for this camera in the selected period." color={OK} />
      <Kpi label="Average time to complete" value={activeCameraRows.length ? formatPackingDuration(activeCameraStats.avgTime) : '—'} sub="Selected camera" title="Average recorded packing duration for this camera." color="#3b82f6" />
    </KpiGrid>
    <div className="box-border grid min-h-0 items-stretch gap-3.5 min-[901px]:h-[560px] min-[901px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] min-[901px]:overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-[var(--bd)] bg-[var(--bg1)] p-3.5">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>Live packing cameras</span><span style={{ ...mono, fontSize: 9, color: 'var(--tx3)' }}>{streamChannels.filter((channel) => !channel._packingHistoryOnly).length} enabled</span></div>
          {activeChannel ? <>
            <div className="relative min-h-[340px] min-w-0 flex-1 min-[901px]:min-h-0" style={{ width: '100%', border: '1px solid var(--bd)', borderRadius: 10, overflow: 'hidden' }}>
              {activeChannel._packingHistoryOnly ? <PackingStreamUnavailable /> : <PackingVideo fill row={latestPackingEvent || rows[0]} channel={{ ...activeChannel, _compactBoxPacking: true }} />}

            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0 0', minWidth: 0 }}>
              <span style={{ fontSize: 11, color: 'var(--tx3)', minWidth: 0, overflowWrap: 'anywhere' }}>{channelCameraLabel(activeChannel, rows)} · {channelNvrLabel(activeChannel)}</span>
              {streamChannels.length > 1 && <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <button type="button" onClick={() => moveCamera(-1)} aria-label="Previous Box Packing camera" style={{ width: 28, height: 28, border: '1px solid var(--bd2)', borderRadius: 6, background: 'var(--bg2)', color: 'var(--tx2)', cursor: 'pointer', fontSize: 18 }}>‹</button>
                <span style={{ fontSize: 11, color: 'var(--tx3)' }}>{activeCameraIndex + 1} / {streamChannels.length}</span>
                <button type="button" onClick={() => moveCamera(1)} aria-label="Next Box Packing camera" style={{ width: 28, height: 28, border: '1px solid var(--bd2)', borderRadius: 6, background: 'var(--bg2)', color: 'var(--tx2)', cursor: 'pointer', fontSize: 18 }}>›</button>
              </div>}
            </div>
          </> : <div style={{ minHeight: 220, display: 'grid', placeItems: 'center', padding: 24, borderRadius: 12, border: '1px dashed var(--bd2)', color: 'var(--tx3)', textAlign: 'center' }}>No Box Packing cameras match the selected filters.</div>}
        </div>
        <div className="flex min-h-0 min-w-0 flex-col gap-3">
          <ZoneCompletionCards rows={activeCameraRows} />
          <RecentPackingActivity rows={activeCameraRows} onOpen={setActivityPreview} onOpenAlerts={onOpenAlerts} />
        </div>
    </div>
    <WorkerComparison rows={rows} cameraName={activeChannel ? channelCameraLabel(activeChannel, rows) : 'the selected camera'} dateRange={dateRange} />
     <HourlyPackingLog rows={rows} dateRange={dateRange} />
    <Panel pad={false}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 18px', borderBottom: '1px solid var(--bd)' }}><span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>Latest packing activity</span><span style={{ fontSize: 11, color: 'var(--tx3)' }}>{zones.length ? zones.length + ' workers' : 'All workers'}</span></div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 1180, borderCollapse: 'collapse', ...mono, fontSize: 11.5 }}>
          <thead><tr style={{ color: 'var(--tx3)', fontSize: 9, letterSpacing: '.07em', textAlign: 'left' }}>
            {[
              ['snapshot', 'SNAPSHOT'], ['boxId', 'BOX ID'], ['completedBy', 'COMPLETED BY'],
              ['nvrName', 'NVR'], ['camera', 'CAMERA NAME'],
              ['date', 'DATE'], ['startTime', 'START TIME'], ['endTime', 'END TIME'],
              ['timeTakenSec', 'TIME TO COMPLETE'],
            ].map(([key, label]) => <th key={key} style={{ padding: '7px 14px', fontWeight: 500, whiteSpace: 'nowrap' }}>{sortHeader(key, label)}</th>)}
          </tr></thead>
          <tbody>{zoneRows.length ? activityPagination.pageRows.map((row) => {
            const channel = streamChannels.find((item) => sameChannel(row, item));
            const cameraName = channel ? channelCameraLabel(channel, rows) : (row.camera || 'Packing camera');
            const nvrName = channel ? channelNvrLabel(channel) : (row.nvrName || 'NVR');
            const image = row.Image || row.image || row.imageUrl || row.incidentImageUrl;
            return <tr key={row.id} style={{ borderTop: '1px solid var(--bd)' }}>
              <td style={{ padding: '5px 14px' }}>{image ? <button type="button" onClick={() => setActivityPreview(row)} aria-label={`Open snapshot for ${row.boxId}`} style={{ display: 'block', padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}><img src={mediaUrl(image)} alt={`Snapshot for ${row.boxId}`} style={{ width: 104, height: 58, display: 'block', objectFit: 'cover', borderRadius: 6, background: '#0b1120', cursor: 'pointer' }} /></button> : <span style={{ color: 'var(--tx3)' }}>No snapshot</span>}</td>
              <td style={{ padding: '8px 14px', fontWeight: 700 }}>{row.boxId}</td>
              <td style={{ padding: '8px 14px', fontFamily: 'var(--disp)', fontWeight: 600 }}>{row.completedBy}</td>
              <td style={{ padding: '8px 14px' }}>{nvrName}</td>
              <td style={{ padding: '8px 14px' }}>{cameraName}</td>
              <td style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>{packingDateValue(row, PACKING_TIMEZONE)}</td>
              <td style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>{packingStartTimeValue(row, PACKING_TIMEZONE)}</td>
              <td style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>{packingEndTimeValue(row, PACKING_TIMEZONE)}</td>
              <td style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>{formatPackingDuration(row.timeTakenSec)}</td>
            </tr>;
          }) : <tr><td colSpan={9} style={{ padding: 18, textAlign: 'center', color: 'var(--tx3)' }}>No packing activity in this period.</td></tr>}</tbody>
        </table>
      </div>
      <div style={{ padding: '0 18px' }}><SolderPagination pagination={activityPagination} label="Latest packing activity" pageSizes={[5, 10, 25, 50, 100]} /></div>
    </Panel>
    {activityPreview && <ImagePreviewModal previewImage={mediaUrl(activityPreview.Image || activityPreview.image || activityPreview.imageUrl || activityPreview.incidentImageUrl)} imageKey={activityPreview.id} loading={false} setLoading={() => {}} hasPrevious={false} hasNext={false} onClose={() => setActivityPreview(null)} initialFullscreen={false} />}
  </>;
}

function AnalyticsPanel({ rows, stats }) {
  const zones = Object.values(rows.reduce((result, row) => {
    const worker = packingWorkerId(row);
    if (!worker) return result;
    result[worker] ||= { zone: worker, events: 0, boxes: 0, seconds: 0 };
    result[worker].events += 1;
    result[worker].boxes += 1;
    result[worker].seconds += Number(row.timeTakenSec) || 0;
    return result;
  }, {}));
  const maxBoxes = Math.max(...zones.map((zone) => zone.boxes), 1);
  return <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(280px, 1fr)', gap: 14 }}>
    <Panel><div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 15 }}><BarChart3 size={17} color="#4f46e5" /><span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15 }}>Worker throughput</span><span style={{ marginLeft: 'auto', ...mono, fontSize: 10, color: 'var(--tx3)' }}>{stats.boxes} BOXES</span></div>{zones.map((zone, index) => { const zoneColor = ['#3b82f6', '#14b8a6', '#8b5cf6'][index % 3]; return <div key={zone.zone} style={{ marginBottom: 14 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, marginBottom: 6 }}><span style={{ fontWeight: 600 }}>{zone.zone}</span><span style={{ ...mono, color: 'var(--tx3)' }}>{zone.boxes} boxes · {zone.events} events</span></div><div style={{ height: 9, borderRadius: 99, background: 'var(--bg2)', overflow: 'hidden' }}><div style={{ width: `${(zone.boxes / maxBoxes) * 100}%`, height: '100%', borderRadius: 99, background: `linear-gradient(90deg, ${zoneColor}, ${zoneColor}b8)`, boxShadow: `0 0 12px ${zoneColor}35` }} /></div><div style={{ display: 'flex', gap: 16, marginTop: 5, color: 'var(--tx3)', fontSize: 10.5 }}><span>Avg {Math.round(zone.seconds / zone.events)}s</span><span>{zone.review} review</span></div></div>; })}</Panel>
    <Panel><div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15, marginBottom: 14 }}>Shift summary</div><div style={{ display: 'grid', gap: 10 }}>{[['Completion rate', `${Math.round(((stats.total - stats.review) / Math.max(stats.total, 1)) * 100)}%`, OK], ['Boxes per event', `${(stats.boxes / Math.max(stats.total, 1)).toFixed(1)}`, '#22d3ee'], ['Average time to complete', `${stats.avgTime}s`, '#a855f7'], ['Review queue', `${stats.review} events`, WARN]].map(([name, value, color]) => <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--bd)' }}><span style={{ color: 'var(--tx3)', fontSize: 12 }}>{name}</span><span style={{ ...mono, fontWeight: 700, color }}>{value}</span></div>)}</div></Panel>
  </div>;
}

export default function BoxPackingLogs() {
  const { logs, loading, refresh } = useLogsConfig();
  const { socket } = useSocket() || {};
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isAnalyticsRoute = pathname.endsWith('/analytics');
  const isAlertRoute = pathname.endsWith('/alerts');
  const isReportsRoute = pathname.endsWith('/reports');
  const routeView = isAnalyticsRoute ? 'analytics' : isAlertRoute ? 'alerts' : isReportsRoute ? 'reports' : 'overview';
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [grid, setGrid] = useState(true);
  const [analytics, setAnalytics] = useState(isAnalyticsRoute);
  const today = moment.tz('Asia/Kolkata').format('YYYY-MM-DD');
  const [dateRange, setDateRange] = useState({ startDate: today, endDate: today });
  const [timeRange, setTimeRange] = useState({ fromTime: '', toTime: '' });
  const selectedPeriodLabel = dateRange.startDate === dateRange.endDate
    ? moment.tz(dateRange.startDate, 'Asia/Kolkata').format('DD MMM YYYY')
    : `${moment.tz(dateRange.startDate, 'Asia/Kolkata').format('DD MMM YYYY')} – ${moment.tz(dateRange.endDate, 'Asia/Kolkata').format('DD MMM YYYY')}`;
  const [analyticsRange, setAnalyticsRange] = useState({ startDate: today, endDate: today });
  const [analyticsRefresh, setAnalyticsRefresh] = useState(0);
  const [analyticsFiltersOpen, setAnalyticsFiltersOpen] = useState(false);
  const [analyticsStatus, setAnalyticsStatus] = useState('all');
  const [analyticsZone, setAnalyticsZone] = useState('all');
  const [view, setView] = useState(routeView);
  const [dbRows, setDbRows] = useState([]);
  const [streamChannels, setStreamChannels] = useState([]);
  const [activeCameraIndex, setActiveCameraIndex] = useState(0);
  const [dbLoading, setDbLoading] = useState(true);
  const [dbError, setDbError] = useState(null);
  useEffect(() => {
    // The shell remains mounted when the sidebar changes route. Keep its
    // internal view in lockstep with the URL so the sidebar and top tabs never
    // highlight different Box Packing pages.
    setView(routeView);
    setAnalytics(routeView === 'analytics');
  }, [routeView]);
  useEffect(() => {
    let active = true;
    setDbLoading(true);
    let hasData = false;
    const stop = watchPackingIncidents({
      socket, adminId: user?.adminId,
      isLive: () => {
        const now = moment.tz('Asia/Kolkata').format('YYYY-MM-DD');
        return dateRange.startDate <= now && dateRange.endDate >= now;
      },
      refresh: () => fetchIncidentLogs({ endpoint: BOX_PACKING_CONFIG.endpoint, skip: 0, limit: 500, startDate: dateRange.startDate, endDate: dateRange.endDate, fromTime: timeRange.fromTime && timeRange.toTime ? timeRange.fromTime : '', toTime: timeRange.fromTime && timeRange.toTime ? timeRange.toTime : '', sortField: 'timeOfIncident', sortOrder: 'desc' })
      .then((res) => {
        if (!active) return;
        const payload = res?.data?.body?.data;
        const list = Array.isArray(payload) ? payload : payload?.data;
        setDbRows((Array.isArray(list) ? list : []).map(apiRowToPackingRow));
        hasData = true;
        setDbError(null);
      })
      .catch((error) => {
        if (!active) return;
        // A transient background error must not replace a valid live view.
        if (hasData) return;
        setDbRows([]);
        setDbError(error?.response?.data?.body?.message || error?.response?.data?.message || error?.message || 'Unable to load Box Packing data.');
      })
      .finally(() => { if (active) setDbLoading(false); }),
    });
    return () => { active = false; stop(); };
  }, [dateRange.startDate, dateRange.endDate, timeRange.fromTime, timeRange.toTime, socket, user?.adminId]);
  useEffect(() => {
    let active = true;
    Promise.allSettled([getChannels({ limit: 500, engines: 'boxPackingDetectionSettings' }), getNvrs(0, 500)])
      .then(([channelResult, nvrResult]) => {
        if (!active) return;
        const res = channelResult.status === 'fulfilled' ? channelResult.value : null;
        const channels = Array.isArray(res) ? res : res?.channels || res?.data?.channels || res?.data || [];
        const nvrs = nvrResult.status === 'fulfilled' ? (nvrResult.value?.nvrs || []) : [];
        const nvrNames = new Map(nvrs.map((nvr) => [String(nvr?._id || nvr?.id), nvr?.nvrName || nvr?.name || 'NVR']));
        // The API filters by the enabled Box Packing engine. Respect explicit
        // settings when supplied; historical incidents cannot enable a camera.
        const mergedChannels = (Array.isArray(channels) ? channels : []).filter((channel) => (
          channel.detections == null || boxPackingDetectionEnabled(channel)
        ));
        const baseCameraNames = mergedChannels.map((channel) => {
          const name = channel?.customName || channel?.cameraName || channel?.channelName || channel?.aliasName || channel?.name;
          return name && !/^\d+$/.test(String(name).trim()) ? String(name).trim() : 'Unnamed camera';
        });
        setStreamChannels(mergedChannels.map((channel, index) => {
          const nvrId = channel?.nvrId && typeof channel.nvrId === 'object' ? channel.nvrId._id : channel?.nvrId || channel?.nvr?._id || channel?.nvrData?._id;
          const baseCameraName = baseCameraNames[index];
          return { ...channel, _boxPackingCameraName: baseCameraName === 'Unnamed camera' ? channelCameraLabel(channel, []) : baseCameraName, _boxPackingNvrName: nvrNames.get(String(nvrId)) || channelNvrLabel(channel) };
        }));
      }).catch(() => { if (active) setStreamChannels([]); });
    return () => { active = false; };
  }, []);
  const rows = useMemo(() => dbRows.filter((row) => (filter === 'all' || row.status === filter) && `${row.boxId} ${row.completedBy} ${row.zone} ${row.camera}`.toLowerCase().includes(query.toLowerCase())), [dbRows, filter, query]);
  // Camera stations are the source of selection on the overview. Keep every
  // enabled station available so selecting a card never hides another camera.
  const filteredStreamChannels = useMemo(() => packingHistoryStations(streamChannels, dbRows), [streamChannels, dbRows]);
  useEffect(() => {
    setActiveCameraIndex((index) => filteredStreamChannels.length ? Math.min(index, filteredStreamChannels.length - 1) : 0);
  }, [filteredStreamChannels.length]);
  const stats = packingStats(dbRows);
  const showAnalytics = view === 'analytics' || isAnalyticsRoute || analytics;
  const analyticsZones = useMemo(() => [...new Set(dbRows.map(packingWorkerId))], [dbRows]);
  const analyticsRows = useMemo(() => dbRows.filter((row) => moment(row.time).isBetween(moment(analyticsRange.startDate).startOf('day'), moment(analyticsRange.endDate).endOf('day'), undefined, '[]')).filter((row) => analyticsStatus === 'all' || row.status === analyticsStatus).filter((row) => analyticsZone === 'all' || packingWorkerId(row) === analyticsZone), [dbRows, analyticsRange, analyticsRefresh, analyticsStatus, analyticsZone]);
  const analyticsStats = packingStats(analyticsRows);
  if (loading) return <PageLoader />;
  // With licensing disabled, the provider intentionally leaves logs null.
  if (IS_LICENSING_ENABLED && !logs) return <ErrorState error={new Error('Unable to load detection access.')} onRetry={refresh} minH={360} />;
  if (logs?.boxPackingLogs === false) return <AccessDenied message="Box Packing alerts are not enabled for your account." />;
  if (dbLoading) return <PageLoader />;
  if (dbError) return <ErrorState error={new Error(dbError)} onRetry={() => window.location.reload()} minH={360} />;
  // The shared page supplies the production alert table, date range, filters,
  // auto-refresh, pagination and Excel/PDF export behavior.
  const showAlerts = isAlertRoute || view === 'alerts' || view === 'logs';
  return <div style={{ width: '100%' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '0 clamp(12px, 3vw, 22px)', position: 'sticky', top: 0, zIndex: 40, background: 'var(--bg1solid)', borderBottom: '1px solid var(--bd)' }}>
      {[['overview', 'Overview', '/box-packing'], ['alerts', 'Alert Logs', '/box-packing/alerts'], ['reports', 'Reports', '/box-packing/reports']].map(([key, text, to]) => { const active = routeView === key || (key === 'overview' && routeView === 'analytics'); const reviewCount = dbRows.filter((row) => row.status === 'review').length; return <button key={key} type="button" onClick={() => { setView(key); navigate(to); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px 10px', fontSize: 13.5, fontWeight: 600, color: active ? 'var(--tx)' : 'var(--tx3)', border: 0, borderBottom: `2px solid ${active ? 'var(--blue)' : 'transparent'}`, background: 'transparent', cursor: 'pointer' }}>{text}{key === 'alerts' && reviewCount > 0 && <span style={{ ...mono, fontSize: 10, fontWeight: 700, color: '#fff', background: WARN, borderRadius: 8, padding: '1px 6px' }}>{reviewCount}</span>}</button>; })}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', flexWrap: 'wrap', minWidth: 0, maxWidth: '100%', gap: 12, padding: '5px 0' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 11px', borderRadius: 999, border: `1px solid ${OK}66`, background: `${OK}1a` }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: OK }} /><span style={{ ...mono, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: OK }}>LIVE</span></span><PresetDateRangePicker startDate={dateRange.startDate} endDate={dateRange.endDate} maxDate={today} onRangeChange={({ start, end }) => { const nextStart = start ? moment(start).format('YYYY-MM-DD') : today; const nextEnd = end ? moment(end).format('YYYY-MM-DD') : nextStart; setDateRange({ startDate: nextStart, endDate: nextEnd }); }} /></div>
    </div>
    <div style={{ width: '100%', padding: 'clamp(12px, 3vw, 22px)', boxSizing: 'border-box' }}><div style={{ maxWidth: 1560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
     {showAlerts ? <BoxPackingAlertLogs rows={dbRows} periodLabel={selectedPeriodLabel} timezone="Asia/Kolkata" timeRange={timeRange} onTimeRangeChange={setTimeRange} startDate={dateRange.startDate} endDate={dateRange.endDate} maxDate={today} onDateRangeChange={({ start, end }) => { const nextStart = start ? moment(start).format('YYYY-MM-DD') : today; const nextEnd = end ? moment(end).format('YYYY-MM-DD') : nextStart; setDateRange({ startDate: nextStart, endDate: nextEnd }); }} /> : view === 'reports' || isReportsRoute ? <BoxPackingReports rows={dbRows} channels={filteredStreamChannels} range={dateRange} today={today} timezone="Asia/Kolkata" timeRange={timeRange} onTimeRangeChange={setTimeRange} onRangeChange={({ startDate, endDate }) => setDateRange({ startDate, endDate })} /> : <>
     {!showAnalytics && <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}><span style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 21 }}>Box Packing Overview</span><span style={{ fontSize: 12.5, color: 'var(--tx3)' }}>Completed packing activity, box counts and confirmation evidence</span></div>}
     {view === 'overview' ? <PackingOverview rows={rows} streamChannels={filteredStreamChannels} activeCameraIndex={activeCameraIndex} setActiveCameraIndex={setActiveCameraIndex} periodLabel={selectedPeriodLabel} dateRange={dateRange} onOpenAlerts={() => { setView('alerts'); navigate('/box-packing/alerts'); }} /> : null}
     {showAnalytics && view === 'analytics' ? <>
       <div style={{ display: 'flex', alignItems: 'center', gap: 13, flexWrap: 'wrap', padding: '14px 20px', borderRadius: 18, color: '#fff', background: 'linear-gradient(125deg, #2563eb 0%, #4f46e5 52%, #7c3aed 100%)', boxShadow: '0 12px 28px rgba(79,70,229,.22)', position: 'relative', overflow: 'visible' }}><div style={{ position: 'absolute', width: 300, height: 300, right: 90, top: -205, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,.22), transparent 68%)' }} /><div style={{ position: 'absolute', width: 200, height: 200, left: -70, bottom: -155, borderRadius: '50%', background: 'radial-gradient(circle, rgba(34,211,238,.22), transparent 70%)' }} /><div style={{ flex: 1, minWidth: 280, position: 'relative' }}><div style={{ ...mono, fontSize: 9, letterSpacing: '.14em', color: '#e0e7ff', display: 'flex', alignItems: 'center', gap: 6 }}><Sparkles size={12} /> PACKING OPERATIONS INTELLIGENCE</div><div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 21, marginTop: 4 }}>Box Packing Analytics</div><div style={{ fontSize: 11, color: '#eef2ff', marginTop: 2 }}>Throughput, cycle time and review queue across packing workers.</div></div><div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', position: 'relative' }}><PresetDateRangePicker startDate={analyticsRange.startDate} endDate={analyticsRange.endDate} maxDate={today} onRangeChange={({ start, end }) => { const nextStart = start ? moment(start).format('YYYY-MM-DD') : today; const nextEnd = end ? moment(end).format('YYYY-MM-DD') : nextStart; setAnalyticsRange({ startDate: nextStart, endDate: nextEnd }); }} /><AnalyticsFilters open={analyticsFiltersOpen} setOpen={setAnalyticsFiltersOpen} status={analyticsStatus} setStatus={setAnalyticsStatus} zone={analyticsZone} setZone={setAnalyticsZone} zones={analyticsZones} /><button type="button" onClick={() => setAnalyticsRefresh((value) => value + 1)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 15px', borderRadius: 9, border: '1px solid rgba(255,255,255,.38)', color: '#fff', background: 'rgba(255,255,255,.13)', cursor: 'pointer', fontSize: 14, fontWeight: 700, boxShadow: 'inset 0 1px 0 rgba(255,255,255,.15)' }}><RefreshCw size={16} />Refresh</button></div></div>
       <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 }}><AnalyticsMetric icon={PackageCheck} label="Completed events" value={analyticsStats.total - analyticsStats.review} sub="Confirmed packing cycles" color="#2563eb" points="0,19 11,19 20,11 29,16 39,8 49,13 58,4 64,4" /><AnalyticsMetric icon={Boxes} label="Boxes packed" value={analyticsStats.boxes} sub="Across all workers" color="#00a878" points="0,20 10,20 18,14 27,17 37,8 46,13 55,5 64,3" /><AnalyticsMetric icon={ShieldAlert} label="Review queue" value={analyticsStats.review} sub="Events needing attention" color="#f97316" points="0,7 10,10 19,8 29,16 38,12 47,19 56,14 64,18" /><AnalyticsMetric icon={Clock3} label="Average time to complete" value={`${analyticsStats.avgTime}s`} sub="Average time to complete" color="#7c3aed" points="0,17 10,16 19,18 29,11 38,14 47,8 56,12 64,5" /></div>
     </> : null}
     {view === 'analytics' && <Panel style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '12px 14px' }}><span style={label}>Status</span>{[['all', 'ALL', '#475569'], ['completed', 'COMPLETED', OK], ['review', 'NEEDS REVIEW', WARN]].map(([value, text, color]) => <Chip key={value} on={filter === value} color={color} onClick={() => setFilter(value)}>{text}<span style={{ opacity: .7 }}>{value === 'all' ? dbRows.length : dbRows.filter((row) => row.status === value).length}</span></Chip>)}</Panel>}
    {showAnalytics && <AnalyticsPanel rows={analyticsRows} stats={analyticsStats} />}
     {view === 'analytics' && (!rows.length ? <Panel><NoPeriodData minH={200} /></Panel> : grid ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 14 }}>{rows.map((row) => <LogCard key={row.id} row={row} />)}</div> : <LogList rows={rows} />)}
     {view === 'analytics' && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--tx3)', fontSize: 11.5 }}><ClipboardCheck size={14} /> Dummy records are shown for UI validation.</div>}
     </>}
  </div></div></div>;
}
