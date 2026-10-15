import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import moment from 'moment-timezone';
import { useLogsConfig } from '@/context/LogsConfigContext';
import { IS_LICENSING_ENABLED } from '@/helpers/license';
import PageLoader from '@/components/PageLoader';
import { ErrorState } from '@/components/States';
import AccessDenied from '@/components/AccessDenied';
import { BarChart3, Boxes, CheckCircle2, ClipboardCheck, Clock3, Download, FileSpreadsheet, FileText, Filter, Info, LayoutGrid, List, Maximize2, Package, PackageCheck, RefreshCw, RotateCcw, Search, ShieldAlert, Sparkles, X } from 'lucide-react';
import { packingStats } from './boxPackingData';
import { downloadBoxPackingCsv, downloadBoxPackingPdf, downloadBoxPackingXlsx } from './boxPackingExport';
import { BOX_PACKING_CONFIG } from '@/pages/IncidentLogs/configs';
import { fetchIncidentLogs, getchannels } from '@/pages/IncidentLogs/Api';
import CameraStream from '@/components/CameraStream';
import { OK, WARN, mono, label, Panel, Kpi, KpiGrid, Chip, NoPeriodData } from '@/pages/SolderLine/ui';
import PresetDateRangePicker from '@/components/PresetDateRangePicker';
import BoxPackingReports from './BoxPackingReports';
import BoxPackingAlertLogs from './BoxPackingAlertLogs';

const statusMeta = {
  completed: { label: 'COMPLETED', color: OK, icon: CheckCircle2 },
  review: { label: 'NEEDS REVIEW', color: WARN, icon: ShieldAlert },
};

const formatTime = (value) => new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }).format(new Date(value));

const apiRowToPackingRow = (item) => {
  const zones = Array.isArray(item.zones)
    ? item.zones
    : Object.entries(item.zones || {}).map(([zone, value]) => ({
      zone,
      boxNumber: value?.box_number ?? value?.boxNumber,
      timeTakenSec: value?.time_taken ?? value?.timeTakenSec,
    }));
  const zone = zones[0] || {};
  const totalBoxes = zones.reduce((sum, value) => sum + (Number(value.boxNumber) || 0), 0);
  const totalCycle = zones.reduce((sum, value) => sum + (Number(value.timeTakenSec) || 0), 0);
  const completedBy = item.completedBy || '';
  const review = item.resolved !== true && (item.severity === 'moderate' || item.severity === 'high' || /review|variance|awaiting/i.test(item.confirmationReason || ''));
  return {
    id: item._id,
    boxId: item.boxId || item._id,
    completedBy: completedBy || 'Completed by not provided',
    zone: zones.map((value) => value.zone).filter(Boolean).join(' · ') || 'Packing Zone',
    boxNumber: totalBoxes || Number(zone.boxNumber) || 0,
    timeTakenSec: totalCycle || Number(zone.timeTakenSec) || 0,
    zones,
    detectedVia: item.detectedVia || 'Camera',
    status: review ? 'review' : 'completed',
    camera: item.channelData?.customName || item.channelData?.name || 'Packing Camera',
    time: item.timeOfIncident || item.createdAt,
    color: review ? WARN : OK,
    reason: item.confirmationReason || item.description || '',
    Image: item.Image || item.image || item.imageUrl || item.incidentImageUrl,
    image: item.image,
    imageUrl: item.imageUrl,
    videoUrl: item.videoLink || item.videoUrl || item.video,
  };
};

function StatusTag({ status }) {
  const meta = statusMeta[status] || statusMeta.review;
  const Icon = meta.icon;
  return <span style={{ ...mono, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 9.5, fontWeight: 700, letterSpacing: '.06em', color: meta.color, background: `${meta.color}1f`, border: `1px solid ${meta.color}73`, borderRadius: 5, padding: '4px 8px' }}><Icon size={12} />{meta.label}</span>;
}

function LogCard({ row }) {
  return <Panel pad={false} style={{ display: 'flex', flexDirection: 'column' }}>
    <div style={{ position: 'relative', minHeight: 112, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: `radial-gradient(circle at 50% 20%, ${row.color}44, transparent 58%), linear-gradient(135deg, #111827, #0a0e15)` }}>
      <Package size={42} color={row.color} strokeWidth={1.25} />
      <span style={{ position: 'absolute', left: 10, top: 10 }}><StatusTag status={row.status} /></span>
      <span style={{ ...mono, position: 'absolute', right: 10, bottom: 9, fontSize: 10, color: '#fff', background: 'rgba(6,8,13,.76)', borderRadius: 5, padding: '4px 7px' }}>{formatTime(row.time)}</span>
    </div>
    <div style={{ padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><span style={{ ...mono, fontSize: 12, fontWeight: 700 }}>{row.boxId}</span><span style={{ fontSize: 11, color: 'var(--tx3)' }}>{row.id}</span></div>
      <div><div style={label}>Completed by</div><div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 3 }}>{row.completedBy}</div></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingTop: 8, borderTop: '1px solid var(--bd)' }}>
        <div><div style={label}>Zones</div><div style={{ fontSize: 11.5, marginTop: 3, display: 'grid', gap: 3 }}>{(row.zones?.length ? row.zones : [{ zone: row.zone, boxNumber: row.boxNumber, timeTakenSec: row.timeTakenSec }]).map((zone) => <span key={`${zone.zone}-${zone.boxNumber}`}>{zone.zone}: {zone.boxNumber} boxes · {zone.timeTakenSec}s</span>)}</div></div><div><div style={label}>Total boxes</div><div style={{ fontSize: 11.5, marginTop: 3 }}>{row.boxNumber}</div></div><div><div style={label}>Total time</div><div style={{ fontSize: 11.5, marginTop: 3 }}>{row.timeTakenSec}s</div></div><div><div style={label}>Camera</div><div style={{ fontSize: 11.5, marginTop: 3 }}>{row.camera}</div></div>
      </div><div style={{ fontSize: 11, color: row.status === 'review' ? WARN : 'var(--tx3)', lineHeight: 1.35 }}>{row.reason}</div>
    </div>
  </Panel>;
}

function LogList({ rows }) {
  const cols = { display: 'grid', gridTemplateColumns: '132px 112px 150px 135px 60px 95px 145px 130px', gap: 12, padding: '12px 16px', alignItems: 'center' };
  return <Panel pad={false} style={{ overflowX: 'auto' }}><div style={{ minWidth: 920 }}><div style={{ ...cols, ...mono, fontSize: 9, letterSpacing: '.08em', color: 'var(--tx3)' }}>{['STATUS', 'BOX ID', 'COMPLETED BY', 'ZONES', 'BOXES', 'TIME TAKEN', 'DETECTED VIA', 'TIME'].map((item) => <span key={item}>{item}</span>)}</div>{rows.map((row) => <div key={row.id} style={{ ...cols, fontSize: 12.5, borderTop: '1px solid var(--bd)' }}><StatusTag status={row.status} /><span style={{ ...mono, fontWeight: 700 }}>{row.boxId}</span><span style={{ fontWeight: 600 }}>{row.completedBy}</span><span>{row.zone}</span><span>{row.boxNumber}</span><span style={mono}>{row.timeTakenSec}s</span><span style={{ color: 'var(--tx3)' }}>{row.detectedVia}</span><span style={{ ...mono, fontWeight: 600 }}>{formatTime(row.time)}</span></div>)}</div></Panel>;
}

function AnalyticsMetric({ icon: Icon, label: text, value, sub, color, points }) {
  return <div style={{ position: 'relative', minHeight: 96, boxSizing: 'border-box', overflow: 'hidden', padding: '11px 14px', borderRadius: 14, background: `linear-gradient(135deg, var(--bg1solid) 35%, ${color}13 100%)`, border: `1px solid ${color}38`, boxShadow: `0 6px 18px rgba(15,23,42,.07), 0 2px 6px ${color}0c` }}><div style={{ position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, borderRadius: '0 4px 4px 0', background: color }} /><div style={{ position: 'absolute', right: -18, top: -24, width: 95, height: 95, borderRadius: '50%', background: `radial-gradient(circle, ${color}24, transparent 68%)` }}><div /></div><div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}><span style={{ display: 'grid', placeItems: 'center', width: 29, height: 29, borderRadius: 9, color, background: `${color}18` }}><Icon size={15} /></span><span style={{ ...mono, fontSize: 9, letterSpacing: '.09em', color: 'var(--tx3)', textTransform: 'uppercase' }}>{text}</span></div><div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, marginTop: 5, position: 'relative' }}><div><div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 24, lineHeight: 1, color }}>{value}</div><div style={{ fontSize: 9.5, color: 'var(--tx3)', marginTop: 3 }}>{sub}</div></div><svg width="74" height="27" viewBox="0 0 94 34" aria-hidden="true" style={{ overflow: 'visible' }}><polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} /></svg></div></div>;
}

function AnalyticsFilters({ open, setOpen, status, setStatus, zone, setZone, zones }) {
  const activeCount = (status !== 'all' ? 1 : 0) + (zone !== 'all' ? 1 : 0);
  return <div style={{ position: 'relative' }}>
    <button type="button" onClick={() => setOpen((value) => !value)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 15px', borderRadius: 9, border: `1px solid ${open || activeCount ? 'rgba(255,255,255,.82)' : 'rgba(255,255,255,.55)'}`, color: '#fff', background: open || activeCount ? 'rgba(255,255,255,.24)' : 'rgba(255,255,255,.13)', cursor: 'pointer', fontSize: 14, fontWeight: 700, boxShadow: open || activeCount ? '0 0 0 2px rgba(255,255,255,.12), inset 0 1px 0 rgba(255,255,255,.2)' : 'inset 0 1px 0 rgba(255,255,255,.16)', transition: 'background .18s ease, border-color .18s ease, box-shadow .18s ease' }}><Filter size={16} />Filters{activeCount ? <span style={{ minWidth: 18, height: 18, display: 'grid', placeItems: 'center', borderRadius: 99, background: '#fff', color: '#6d28d9', fontSize: 10 }}>{activeCount}</span> : null}</button>
    {open && <div style={{ position: 'absolute', zIndex: 50, right: 0, top: 45, width: 320, boxSizing: 'border-box', padding: 16, borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--bg1solid)', color: 'var(--tx)', boxShadow: '0 14px 32px rgba(15,23,42,.18)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--bd)', paddingBottom: 9, marginBottom: 13 }}><div style={{ fontSize: 14, fontWeight: 700 }}>Filters</div>{activeCount > 0 && <button type="button" onClick={() => { setStatus('all'); setZone('all'); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 0, background: 'transparent', color: 'var(--violet)', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}><RotateCcw size={12} />Reset all</button>}</div>
      <div style={{ display: 'grid', gap: 12 }}>
        <label style={{ display: 'grid', gap: 5, fontSize: 9, fontWeight: 700, letterSpacing: '.06em', color: 'var(--tx3)' }}>STATUS<select value={status} onChange={(event) => setStatus(event.target.value)} style={{ width: '100%', height: 40, padding: '0 10px', borderRadius: 8, border: '1px solid var(--bd2)', color: 'var(--tx)', background: 'var(--bg2)', cursor: 'pointer', fontSize: 12, outline: 'none' }}><option value="all">All statuses</option><option value="completed">Completed</option><option value="review">Needs review</option></select></label>
        <label style={{ display: 'grid', gap: 5, fontSize: 9, fontWeight: 700, letterSpacing: '.06em', color: 'var(--tx3)' }}>ZONE<select value={zone} onChange={(event) => setZone(event.target.value)} style={{ width: '100%', height: 40, padding: '0 10px', borderRadius: 8, border: '1px solid var(--bd2)', color: 'var(--tx)', background: 'var(--bg2)', cursor: 'pointer', fontSize: 12, outline: 'none' }}><option value="all">All zones</option>{zones.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      </div>
    </div>}
  </div>;
}

function PackingVideo({ row, channel }) {
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
  return <div ref={hostRef} onDoubleClick={toggleFullscreen} style={{ position: fullscreen ? 'relative' : 'relative', minHeight: 450, height: '100%', overflow: 'hidden', background: '#090d16', borderRadius: fullscreen ? 0 : 12, cursor: fullscreen ? 'default' : 'pointer' }}>
    {channel ? <CameraStream channel={channel} rounded={false} minH={450} immediate clickToMaximize={false} showOverlay={false} cursor={fullscreen ? 'default' : 'pointer'} enableFullscreenZoom isFullscreen={fullscreen} enableZoom={fullscreen} zoomToolbarStyle={{ top: 14, right: fullscreen ? 58 : 14 }} /> : row?.videoUrl ? <video src={row.videoUrl} poster={row.Image} autoPlay muted loop controls style={{ width: '100%', height: '100%', minHeight: 450, objectFit: 'cover', cursor: fullscreen ? 'default' : 'pointer' }} /> : row?.Image ? <img src={row.Image} alt="Packing camera preview" style={{ width: '100%', height: '100%', minHeight: 450, objectFit: 'cover', cursor: fullscreen ? 'default' : 'pointer', opacity: .8 }} /> : <div style={{ minHeight: 450, display: 'grid', placeItems: 'center', color: 'var(--tx3)' }}>Camera stream connecting…</div>}
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(3,7,18,.6), transparent 34%, rgba(3,7,18,.7))' }} />
    <div style={{ position: 'absolute', left: 12, top: 12, display: 'flex', alignItems: 'center', gap: 7, color: '#fff', ...mono, fontSize: 10.5, fontWeight: 700 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff5b5b', boxShadow: '0 0 8px #ff5b5b' }} />Live · {row?.camera || 'Packing Camera 01'}</div>
    <div style={{ position: 'absolute', left: 12, bottom: 12, color: '#fff', ...mono, fontSize: 10 }}>Packing zone stream · camera + sensor</div>
    {fullscreen && <button type="button" onClick={toggleFullscreen} title="Close fullscreen" aria-label="Close fullscreen" style={{ position: 'absolute', right: 12, top: 12, zIndex: 40, width: 34, height: 34, display: 'grid', placeItems: 'center', color: '#fff', background: '#dc2626', border: '1px solid #fecaca', borderRadius: 7, cursor: 'pointer', boxShadow: '0 4px 14px rgba(127,29,29,.45)' }}><X size={17} /></button>}
    {!fullscreen && <button type="button" onClick={toggleFullscreen} title="Open fullscreen" aria-label="Open fullscreen" style={{ position: 'absolute', right: 12, bottom: 12, zIndex: 20, width: 32, height: 32, display: 'grid', placeItems: 'center', color: '#fff', background: 'rgba(6,8,13,.76)', border: '1px solid rgba(255,255,255,.28)', borderRadius: 6, cursor: 'pointer' }}><Maximize2 size={16} /></button>}
  </div>;
}

function MissedPackingAlerts({ rows }) {
  const missed = rows.filter((row) => row.status === 'review');
  return <Panel pad={false}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--bd)' }}><span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15 }}>Missed packing alerts</span><span style={{ ...mono, fontSize: 10, color: WARN, border: `1px solid ${WARN}88`, borderRadius: 5, padding: '3px 7px' }}>{missed.length}</span><span style={{ marginLeft: 'auto', ...mono, fontSize: 10, color: 'var(--tx3)' }}>Across all zones</span></div>
    <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 620, borderCollapse: 'collapse', ...mono, fontSize: 11.5 }}><thead><tr style={{ color: 'var(--tx3)', fontSize: 9, letterSpacing: '.07em', textAlign: 'left' }}>{['BOX', 'ZONE', 'COMPLETED BY', 'BOXES', 'TIME', 'EVIDENCE'].map((item) => <th key={item} style={{ padding: '10px 14px', fontWeight: 500 }}>{item}</th>)}</tr></thead><tbody>{missed.map((row) => <tr key={row.id} style={{ borderTop: '1px solid var(--bd)' }}><td style={{ padding: '11px 14px', fontWeight: 700 }}>{row.boxId}</td><td style={{ padding: '11px 14px' }}>{row.zone}</td><td style={{ padding: '11px 14px', fontFamily: 'var(--disp)', fontWeight: 600 }}>{row.completedBy}</td><td style={{ padding: '11px 14px', color: WARN }}>{row.boxNumber}</td><td style={{ padding: '11px 14px' }}>{formatTime(row.time)}</td><td style={{ padding: '11px 14px', color: 'var(--tx3)' }}>{row.reason}</td></tr>)}</tbody></table></div>
  </Panel>;
}

function HourlyPackingLog({ rows }) {
  const hourly = Object.values(rows.reduce((result, row) => { const hour = new Date(row.time).getHours(); result[hour] ||= { hour, events: 0, boxes: 0, review: 0 }; result[hour].events += 1; result[hour].boxes += row.boxNumber; result[hour].review += row.status === 'review' ? 1 : 0; return result; }, {}));
  return <Panel pad={false}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--bd)' }}><span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15 }}>Hourly activity log</span><span style={{ fontSize: 12, color: 'var(--tx3)' }}>Box counts, completed events and review events per hour</span><button type="button" style={{ marginLeft: 'auto', height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid var(--bd2)', background: 'var(--bg2)', color: 'var(--tx2)', ...mono, fontSize: 10, cursor: 'pointer' }}>⇩ XLSX</button></div>
    <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 620, borderCollapse: 'collapse', ...mono, fontSize: 11.5 }}><thead><tr style={{ color: 'var(--tx3)', fontSize: 9, letterSpacing: '.07em', textAlign: 'left' }}>{['HOUR', 'EVENTS', 'BOXES PACKED', 'NEEDS REVIEW', 'AVG CYCLE'].map((item) => <th key={item} style={{ padding: '10px 14px', fontWeight: 500 }}>{item}</th>)}</tr></thead><tbody>{hourly.map((item) => { const source = rows.filter((row) => new Date(row.time).getHours() === item.hour); return <tr key={item.hour} style={{ borderTop: '1px solid var(--bd)' }}><td style={{ padding: '11px 14px', fontWeight: 700 }}>{String(item.hour).padStart(2, '0')}:00–{String(item.hour + 1).padStart(2, '0')}:00</td><td style={{ padding: '11px 14px' }}>{item.events}</td><td style={{ padding: '11px 14px' }}>{item.boxes}</td><td style={{ padding: '11px 14px', color: item.review ? WARN : OK }}>{item.review}</td><td style={{ padding: '11px 14px' }}>{Math.round(source.reduce((sum, row) => sum + row.timeTakenSec, 0) / source.length)}s</td></tr>; })}</tbody></table></div>
  </Panel>;
}

const PACKING_TIMEZONE = 'Asia/Kolkata';

function packingHour(value) {
  return moment.tz(value, PACKING_TIMEZONE).hour();
}

function formatPackingHour(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

function PackingActivityCharts({ rows, stats }) {
  const [hovered, setHovered] = useState(null);
  const hourly = Object.values(rows.reduce((result, row) => {
    const hour = packingHour(row.time);
    result[hour] ||= { hour, boxes: 0, events: 0, completed: 0, review: 0 };
    result[hour].boxes += Number(row.boxNumber) || 0;
    result[hour].events += 1;
    result[hour][row.status === 'review' ? 'review' : 'completed'] += 1;
    return result;
  }, {})).sort((a, b) => a.hour - b.hour);
  const maxBoxes = Math.max(...hourly.map((item) => item.boxes), 1);
  const maxEvents = Math.max(...hourly.map((item) => Math.max(item.completed, item.review)), 1);
  const barHeight = (value, max) => value ? `${Math.max(8, (value / max) * 100)}%` : '0%';

  const chartCard = (title, children, right, description) => (
    <Panel style={{ minHeight: 320, minWidth: 0, boxSizing: 'border-box', overflow: 'hidden' }} title={description}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 10, marginBottom: 12, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
          <span title={description} style={{ color: 'var(--tx3)', display: 'inline-flex', flexShrink: 0 }}><Info size={13} /></span>
        </div>
        {right}
      </div>
      {children}
    </Panel>
  );

  if (!hourly.length) return <div style={{ gridColumn: '1 / -1' }}><NoPeriodData minH={220} /></div>;

  return <>
    {chartCard('Boxes counted per hour',
      <div style={{ height: 238, display: 'flex', alignItems: 'stretch', gap: 12, minWidth: 0, padding: '0 4px' }}>
        {hourly.map((item) => <div key={item.hour} title={`${formatPackingHour(item.hour)}–${formatPackingHour((item.hour + 1) % 24)} · ${item.boxes} boxes · ${item.events} events`} onMouseEnter={() => setHovered(`boxes-${item.hour}`)} onMouseLeave={() => setHovered(null)} style={{ position: 'relative', flex: 1, minWidth: 0, display: 'grid', gridTemplateRows: '20px minmax(0, 1fr) 20px', justifyItems: 'center', gap: 5 }}>
          {hovered === `boxes-${item.hour}` && <div style={{ position: 'absolute', zIndex: 5, top: 8, left: '50%', transform: 'translateX(-50%)', minWidth: 145, padding: '8px 10px', borderRadius: 8, background: 'var(--tx)', color: 'var(--bg1)', boxShadow: '0 8px 20px rgba(15,23,42,.2)', fontSize: 11, lineHeight: 1.45, pointerEvents: 'none', textAlign: 'left' }}><strong>{formatPackingHour(item.hour)}–{formatPackingHour((item.hour + 1) % 24)}</strong><br />{item.boxes} boxes · {item.events} events</div>}
          <span style={{ ...mono, fontSize: 9, whiteSpace: 'nowrap' }}>{item.boxes}</span>
          <div style={{ width: 'min(48px, 82%)', alignSelf: 'end', height: barHeight(item.boxes, maxBoxes), minHeight: item.boxes ? 8 : 0, borderRadius: '7px 7px 2px 2px', background: 'linear-gradient(180deg, #4cc9e8, #147b9b)', transition: 'height .2s ease' }} />
          <span style={{ ...mono, fontSize: 9, color: 'var(--tx3)', whiteSpace: 'nowrap' }}>{formatPackingHour(item.hour)}</span>
        </div>)}
      </div>,
      <span style={{ ...mono, fontSize: 10, color: 'var(--tx3)', whiteSpace: 'nowrap' }}>AVG {stats.total ? Math.round(stats.boxes / stats.total) : 0} / EVENT</span>,
      'Total boxes grouped by local hour in Asia/Kolkata.'
    )}
    {chartCard('Packing events per hour',
      <div style={{ height: 238, display: 'flex', alignItems: 'stretch', gap: 12, minWidth: 0, padding: '0 4px' }}>
        {hourly.map((item) => <div key={item.hour} title={`${formatPackingHour(item.hour)}–${formatPackingHour((item.hour + 1) % 24)} · ${item.completed} completed · ${item.review} review`} onMouseEnter={() => setHovered(`events-${item.hour}`)} onMouseLeave={() => setHovered(null)} style={{ position: 'relative', flex: 1, minWidth: 0, display: 'grid', gridTemplateRows: 'minmax(0, 1fr) 20px', gap: 5, justifyItems: 'center' }}>
          {hovered === `events-${item.hour}` && <div style={{ position: 'absolute', zIndex: 5, top: 8, left: '50%', transform: 'translateX(-50%)', minWidth: 170, padding: '8px 10px', borderRadius: 8, background: 'var(--tx)', color: 'var(--bg1)', boxShadow: '0 8px 20px rgba(15,23,42,.2)', fontSize: 11, lineHeight: 1.45, pointerEvents: 'none', textAlign: 'left' }}><strong>{formatPackingHour(item.hour)}–{formatPackingHour((item.hour + 1) % 24)}</strong><br />Completed: {item.completed}<br />Review: {item.review}</div>}
          <div style={{ width: '100%', minWidth: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 5 }}>
            <div aria-label={`${item.completed} completed events`} style={{ width: 'min(22px, 42%)', height: barHeight(item.completed, maxEvents), minHeight: item.completed ? 8 : 0, borderRadius: '6px 6px 2px 2px', background: '#5b7cfa', transition: 'height .2s ease' }} />
            <div aria-label={`${item.review} review events`} style={{ width: 'min(22px, 42%)', height: barHeight(item.review, maxEvents), minHeight: item.review ? 8 : 0, borderRadius: '6px 6px 2px 2px', background: '#a855f7', transition: 'height .2s ease' }} />
          </div>
          <span style={{ ...mono, fontSize: 9, color: 'var(--tx3)', whiteSpace: 'nowrap' }}>{formatPackingHour(item.hour)}</span>
        </div>)}
      </div>,
      <span style={{ display: 'flex', gap: 9, ...mono, fontSize: 9, color: 'var(--tx3)', whiteSpace: 'nowrap' }}><span><i style={{ display: 'inline-block', width: 8, height: 8, background: '#5b7cfa', borderRadius: 2 }} /> COMPLETED</span><span><i style={{ display: 'inline-block', width: 8, height: 8, background: '#a855f7', borderRadius: '50%' }} /> REVIEW</span></span>,
      'Completed and review packing events grouped by local hour in Asia/Kolkata.'
    )}
  </>;
}

function PackingOverview({ rows, stats, selectedZone, setSelectedZone, streamChannel, periodLabel }) {
  const zones = [...new Set(rows.map((row) => row.zone))];
  const zoneRows = rows.filter((row) => row.zone === selectedZone);
  const zoneStats = packingStats(zoneRows);
  return <>
    {rows.some((row) => row.status === 'review') && <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderRadius: 12, background: 'linear-gradient(90deg, rgba(245,166,35,.18), rgba(245,166,35,.04) 70%)', border: '1px solid rgba(245,166,35,.45)' }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: WARN, boxShadow: `0 0 8px ${WARN}` }} />
      <span style={{ ...mono, fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', color: WARN }}>REVIEW ALERT</span>
      <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14.5 }}>{stats.review} packing events need supervisor confirmation</span>
    </div>}
    <KpiGrid>
      <Kpi label="Packing events" value={stats.total} sub={`Recorded ${periodLabel} · all zones`} title={`Total packing events recorded for ${periodLabel}.`} color="#22d3ee" style={{ minHeight: 122 }} />
      <Kpi label="Boxes packed" value={stats.boxes} sub="Across completed events" title={`Total boxes packed across ${stats.total} event${stats.total === 1 ? '' : 's'} for ${periodLabel}.`} color={OK} style={{ minHeight: 122 }} />
      <Kpi label="Needs review" value={stats.review} sub="Count variance or confirmation" title="Packing events requiring supervisor confirmation because the reported count differs or the event is unresolved." color={WARN} valueColor={WARN} style={{ minHeight: 122 }} />
      <Kpi label="Average cycle" value={stats.avgTime} unit="sec" sub="Per packing event" title={`Average packing cycle across the selected ${periodLabel} period.`} color="#a855f7" style={{ minHeight: 122 }} />
    </KpiGrid>
    <Panel pad={false} style={{ padding: 0, minHeight: 480 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(280px, .85fr)', gap: 14, padding: 14, minHeight: 452, boxSizing: 'border-box' }}>
        <PackingVideo row={rows[0]} channel={streamChannel} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 14px', borderRadius: 12, background: 'var(--bg2)', border: '1px solid var(--bd)' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: OK }} /><span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15 }}>Live packing station</span><span style={{ marginLeft: 'auto', ...mono, fontSize: 9, color: OK }}>PRESENT</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>{[['EVENTS', stats.total, '#3b82f6'], ['BOXES', stats.boxes, OK], ['REVIEW', stats.review, WARN]].map(([name, value, color]) => <div key={name} style={{ padding: '12px 11px', borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--bd)' }}><div style={{ ...mono, fontSize: 8.5, letterSpacing: '.08em', color: 'var(--tx3)' }}>{name}</div><div style={{ ...mono, fontSize: 20, fontWeight: 700, color, marginTop: 6 }}>{value}</div></div>)}</div>
          <div style={{ flex: '0 0 150px', minHeight: 150, padding: 14, boxSizing: 'border-box', borderRadius: 12, background: 'linear-gradient(135deg, rgba(59,130,246,.12), rgba(168,85,247,.1))', border: '1px solid rgba(99,102,241,.3)' }}><div style={label}>LATEST PACKING EVENT</div><div style={{ fontFamily: 'var(--disp)', fontSize: 18, fontWeight: 700, marginTop: 7 }}>{rows[0]?.boxId || 'No events'}</div><div style={{ color: 'var(--tx3)', fontSize: 12, marginTop: 4 }}>{rows[0]?.completedBy || 'Waiting for camera data'} · {rows[0]?.boxNumber || 0} boxes</div><div style={{ marginTop: 18, ...mono, fontSize: 10, color: OK }}>● CAMERA + SENSOR VERIFIED</div></div>
        </div>
      </div>
    </Panel>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginTop: 8 }}><span style={{ ...mono, fontSize: 11, fontWeight: 700, color: '#a855f7' }}>02</span><span style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 19 }}>Conveyor Count &amp; Packing Activity</span><span style={{ fontSize: 12.5, color: 'var(--tx3)' }}>Boxes counted per hour · operators share the work</span></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14, alignItems: 'stretch' }}>
      <PackingActivityCharts rows={rows} stats={stats} />
    </div>
    <MissedPackingAlerts rows={rows} />
    <HourlyPackingLog rows={rows} />
    <Panel pad={false}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '16px 18px 13px' }}>
        <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15 }}>Packing zones</span>
        <span style={{ fontSize: 12, color: 'var(--tx3)' }}>Select a zone to inspect its latest packing activity</span>
        <span style={{ marginLeft: 'auto', ...mono, fontSize: 10, color: 'var(--tx3)' }}>{zones.length} ACTIVE ZONES</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12, padding: '0 18px 18px' }}>
        {zones.map((zone, index) => {
          const zoneData = packingStats(rows.filter((row) => row.zone === zone));
          const active = selectedZone === zone;
          const color = ['#3b82f6', '#a855f7', '#14b8a6'][index % 3];
          return <button key={zone} type="button" onClick={() => setSelectedZone(zone)} style={{ textAlign: 'left', cursor: 'pointer', padding: 14, borderRadius: 14, color: 'var(--tx)', background: active ? `linear-gradient(180deg, ${color}18, var(--bg2))` : 'var(--bg2)', border: `1px solid ${active ? color : 'var(--bd)'}`, boxShadow: active ? `0 0 0 2px ${color}22` : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} /><span style={{ fontWeight: 700, fontSize: 13 }}>{zone}</span><span style={{ marginLeft: 'auto', ...mono, fontSize: 9, color: OK }}>ONLINE</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 16 }}>
              <div><div style={label}>Events</div><div style={{ ...mono, fontSize: 16, fontWeight: 700, marginTop: 4 }}>{zoneData.total}</div></div>
              <div><div style={label}>Boxes</div><div style={{ ...mono, fontSize: 16, fontWeight: 700, marginTop: 4 }}>{zoneData.boxes}</div></div>
              <div><div style={label}>Review</div><div style={{ ...mono, fontSize: 16, fontWeight: 700, color: zoneData.review ? WARN : OK, marginTop: 4 }}>{zoneData.review}</div></div>
            </div>
          </button>;
        })}
      </div>
    </Panel>
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '13px 16px', borderRadius: 13, background: 'linear-gradient(100deg, rgba(59,130,246,.16), rgba(168,85,247,.08))', border: '1px solid rgba(99,102,241,.35)' }}>
      <div><div style={label}>VIEWING ZONE</div><div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 18, marginTop: 3 }}>{selectedZone}</div></div>
      <div style={{ width: 1, height: 35, background: 'var(--bd2)' }} />
      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}><span><span style={{ ...mono, color: '#3b82f6', fontWeight: 700 }}>EVENTS</span> {zoneStats.total}</span><span><span style={{ ...mono, color: OK, fontWeight: 700 }}>BOXES</span> {zoneStats.boxes}</span><span><span style={{ ...mono, color: WARN, fontWeight: 700 }}>AVG CYCLE</span> {zoneStats.avgTime}s</span></div>
      <span style={{ marginLeft: 'auto', ...mono, fontSize: 10, color: OK }}>● LIVE · CAMERA + SENSOR</span>
    </div>
    <Panel pad={false}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--bd)' }}><span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15 }}>Latest packing activity</span><span style={{ fontSize: 12, color: 'var(--tx3)' }}>{selectedZone}</span></div>
      <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse', ...mono, fontSize: 11.5 }}><thead><tr style={{ color: 'var(--tx3)', fontSize: 9, letterSpacing: '.07em', textAlign: 'left' }}>{['BOX ID', 'COMPLETED BY', 'BOXES', 'CYCLE', 'STATUS', 'DETECTED VIA'].map((item) => <th key={item} style={{ padding: '10px 14px', fontWeight: 500 }}>{item}</th>)}</tr></thead><tbody>{zoneRows.slice(0, 5).map((row) => <tr key={row.id} style={{ borderTop: '1px solid var(--bd)' }}><td style={{ padding: '11px 14px', fontWeight: 700 }}>{row.boxId}</td><td style={{ padding: '11px 14px', fontFamily: 'var(--disp)', fontWeight: 600 }}>{row.completedBy}</td><td style={{ padding: '11px 14px' }}>{row.boxNumber}</td><td style={{ padding: '11px 14px' }}>{row.timeTakenSec}s</td><td style={{ padding: '11px 14px' }}><StatusTag status={row.status} /></td><td style={{ padding: '11px 14px', color: 'var(--tx3)' }}>{row.detectedVia}</td></tr>)}</tbody></table></div>
    </Panel>
  </>;
}

function AnalyticsPanel({ rows, stats }) {
  const zones = Object.values(rows.reduce((result, row) => {
    result[row.zone] ||= { zone: row.zone, events: 0, boxes: 0, review: 0, seconds: 0 };
    result[row.zone].events += 1;
    result[row.zone].boxes += row.boxNumber;
    result[row.zone].review += row.status === 'review' ? 1 : 0;
    result[row.zone].seconds += row.timeTakenSec;
    return result;
  }, {}));
  const maxBoxes = Math.max(...zones.map((zone) => zone.boxes), 1);
  return <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(280px, 1fr)', gap: 14 }}>
    <Panel><div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 15 }}><BarChart3 size={17} color="#4f46e5" /><span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15 }}>Zone throughput</span><span style={{ marginLeft: 'auto', ...mono, fontSize: 10, color: 'var(--tx3)' }}>{stats.boxes} BOXES</span></div>{zones.map((zone, index) => { const zoneColor = ['#3b82f6', '#14b8a6', '#8b5cf6'][index % 3]; return <div key={zone.zone} style={{ marginBottom: 14 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, marginBottom: 6 }}><span style={{ fontWeight: 600 }}>{zone.zone}</span><span style={{ ...mono, color: 'var(--tx3)' }}>{zone.boxes} boxes · {zone.events} events</span></div><div style={{ height: 9, borderRadius: 99, background: 'var(--bg2)', overflow: 'hidden' }}><div style={{ width: `${(zone.boxes / maxBoxes) * 100}%`, height: '100%', borderRadius: 99, background: `linear-gradient(90deg, ${zoneColor}, ${zoneColor}b8)`, boxShadow: `0 0 12px ${zoneColor}35` }} /></div><div style={{ display: 'flex', gap: 16, marginTop: 5, color: 'var(--tx3)', fontSize: 10.5 }}><span>Avg {Math.round(zone.seconds / zone.events)}s</span><span>{zone.review} review</span></div></div>; })}</Panel>
    <Panel><div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15, marginBottom: 14 }}>Shift summary</div><div style={{ display: 'grid', gap: 10 }}>{[['Completion rate', `${Math.round(((stats.total - stats.review) / Math.max(stats.total, 1)) * 100)}%`, OK], ['Boxes per event', `${(stats.boxes / Math.max(stats.total, 1)).toFixed(1)}`, '#22d3ee'], ['Average cycle time', `${stats.avgTime}s`, '#a855f7'], ['Review queue', `${stats.review} events`, WARN]].map(([name, value, color]) => <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--bd)' }}><span style={{ color: 'var(--tx3)', fontSize: 12 }}>{name}</span><span style={{ ...mono, fontWeight: 700, color }}>{value}</span></div>)}</div></Panel>
  </div>;
}

export default function BoxPackingLogs() {
  const { logs, loading, refresh } = useLogsConfig();
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
  const selectedPeriodLabel = dateRange.startDate === dateRange.endDate
    ? moment.tz(dateRange.startDate, 'Asia/Kolkata').format('DD MMM YYYY')
    : `${moment.tz(dateRange.startDate, 'Asia/Kolkata').format('DD MMM YYYY')} – ${moment.tz(dateRange.endDate, 'Asia/Kolkata').format('DD MMM YYYY')}`;
  const [analyticsRange, setAnalyticsRange] = useState({ startDate: today, endDate: today });
  const [analyticsRefresh, setAnalyticsRefresh] = useState(0);
  const [analyticsFiltersOpen, setAnalyticsFiltersOpen] = useState(false);
  const [analyticsStatus, setAnalyticsStatus] = useState('all');
  const [analyticsZone, setAnalyticsZone] = useState('all');
  const [view, setView] = useState(routeView);
  const [selectedZone, setSelectedZone] = useState('Packing Zone A');
  const [dbRows, setDbRows] = useState([]);
  const [streamChannel, setStreamChannel] = useState(null);
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
    fetchIncidentLogs({ endpoint: BOX_PACKING_CONFIG.endpoint, skip: 0, limit: 500, startDate: dateRange.startDate, endDate: dateRange.endDate, sortField: 'timeOfIncident', sortOrder: 'desc' })
      .then((res) => {
        if (!active) return;
        const payload = res?.data?.body?.data;
        const list = Array.isArray(payload) ? payload : payload?.data;
        setDbRows((Array.isArray(list) ? list : []).map(apiRowToPackingRow));
        setDbError(null);
      })
      .catch((error) => {
        if (!active) return;
        setDbRows([]);
        setDbError(error?.response?.data?.body?.message || error?.response?.data?.message || error?.message || 'Unable to load Box Packing data.');
      })
      .finally(() => { if (active) setDbLoading(false); });
    return () => { active = false; };
  }, [dateRange.startDate, dateRange.endDate]);
  useEffect(() => {
    let active = true;
    getchannels({ nvrIds: [] }).then((res) => {
      if (!active) return;
      const channels = res?.data?.body?.data;
      setStreamChannel(Array.isArray(channels) ? channels.find((channel) => channel?.streamingUrl || channel?.StreamingUrl || (channel?.nvrId && channel?._id)) || channels[0] : null);
    }).catch(() => { if (active) setStreamChannel(null); });
    return () => { active = false; };
  }, []);
  const rows = useMemo(() => dbRows.filter((row) => (filter === 'all' || row.status === filter) && `${row.boxId} ${row.completedBy} ${row.zone} ${row.camera}`.toLowerCase().includes(query.toLowerCase())), [dbRows, filter, query]);
  const stats = packingStats(dbRows);
  const showAnalytics = view === 'analytics' || isAnalyticsRoute || analytics;
  const analyticsZones = useMemo(() => [...new Set(dbRows.map((row) => row.zone))], [dbRows]);
  const analyticsRows = useMemo(() => dbRows.filter((row) => moment(row.time).isBetween(moment(analyticsRange.startDate).startOf('day'), moment(analyticsRange.endDate).endOf('day'), undefined, '[]')).filter((row) => analyticsStatus === 'all' || row.status === analyticsStatus).filter((row) => analyticsZone === 'all' || row.zone === analyticsZone), [dbRows, analyticsRange, analyticsRefresh, analyticsStatus, analyticsZone]);
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '0 22px', position: 'sticky', top: 0, zIndex: 40, background: 'var(--bg1solid)', borderBottom: '1px solid var(--bd)' }}>
      {[['overview', 'Overview', '/box-packing'], ['alerts', 'Alert Logs', '/box-packing/alerts'], ['reports', 'Reports', '/box-packing/reports']].map(([key, text, to]) => { const active = routeView === key || (key === 'overview' && routeView === 'analytics'); return <button key={key} type="button" onClick={() => { setView(key); navigate(to); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px 10px', fontSize: 13.5, fontWeight: 600, color: active ? 'var(--tx)' : 'var(--tx3)', border: 0, borderBottom: `2px solid ${active ? 'var(--blue)' : 'transparent'}`, background: 'transparent', cursor: 'pointer' }}>{text}{key === 'alerts' && <span style={{ ...mono, fontSize: 10, fontWeight: 700, color: '#fff', background: WARN, borderRadius: 8, padding: '1px 6px' }}>{rows.length}</span>}</button>; })}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, padding: '5px 0' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 11px', borderRadius: 999, border: `1px solid ${OK}66`, background: `${OK}1a` }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: OK }} /><span style={{ ...mono, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: OK }}>LIVE</span></span><PresetDateRangePicker startDate={dateRange.startDate} endDate={dateRange.endDate} maxDate={today} onRangeChange={({ start, end }) => { const nextStart = start ? moment(start).format('YYYY-MM-DD') : today; const nextEnd = end ? moment(end).format('YYYY-MM-DD') : nextStart; setDateRange({ startDate: nextStart, endDate: nextEnd }); }} /></div>
    </div>
    <div style={{ width: '100%', padding: 22, boxSizing: 'border-box' }}><div style={{ maxWidth: 1560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
     {showAlerts ? <BoxPackingAlertLogs rows={dbRows} periodLabel={selectedPeriodLabel} timezone="Asia/Kolkata" /> : view === 'reports' || isReportsRoute ? <BoxPackingReports rows={dbRows} range={dateRange} today={today} timezone="Asia/Kolkata" onRangeChange={({ startDate, endDate }) => setDateRange({ startDate, endDate })} /> : <>
     {!showAnalytics && <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}><span style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 21 }}>Box Packing Overview</span><span style={{ fontSize: 12.5, color: 'var(--tx3)' }}>Completed packing activity, box counts and confirmation evidence</span><span style={{ marginLeft: 'auto', ...mono, fontSize: 10, color: OK }}>● LIVE · DEMO DATA</span></div>}
     {view === 'overview' ? <PackingOverview rows={rows} stats={stats} selectedZone={selectedZone} setSelectedZone={setSelectedZone} streamChannel={streamChannel} periodLabel={selectedPeriodLabel} /> : null}
     {showAnalytics && view === 'analytics' ? <>
       <div style={{ display: 'flex', alignItems: 'center', gap: 13, flexWrap: 'wrap', padding: '14px 20px', borderRadius: 18, color: '#fff', background: 'linear-gradient(125deg, #2563eb 0%, #4f46e5 52%, #7c3aed 100%)', boxShadow: '0 12px 28px rgba(79,70,229,.22)', position: 'relative', overflow: 'visible' }}><div style={{ position: 'absolute', width: 300, height: 300, right: 90, top: -205, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,.22), transparent 68%)' }} /><div style={{ position: 'absolute', width: 200, height: 200, left: -70, bottom: -155, borderRadius: '50%', background: 'radial-gradient(circle, rgba(34,211,238,.22), transparent 70%)' }} /><div style={{ flex: 1, minWidth: 280, position: 'relative' }}><div style={{ ...mono, fontSize: 9, letterSpacing: '.14em', color: '#e0e7ff', display: 'flex', alignItems: 'center', gap: 6 }}><Sparkles size={12} /> PACKING OPERATIONS INTELLIGENCE</div><div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 21, marginTop: 4 }}>Box Packing Analytics</div><div style={{ fontSize: 11, color: '#eef2ff', marginTop: 2 }}>Throughput, cycle time and review queue across packing zones.</div></div><div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', position: 'relative' }}><PresetDateRangePicker startDate={analyticsRange.startDate} endDate={analyticsRange.endDate} maxDate={today} onRangeChange={({ start, end }) => { const nextStart = start ? moment(start).format('YYYY-MM-DD') : today; const nextEnd = end ? moment(end).format('YYYY-MM-DD') : nextStart; setAnalyticsRange({ startDate: nextStart, endDate: nextEnd }); }} /><AnalyticsFilters open={analyticsFiltersOpen} setOpen={setAnalyticsFiltersOpen} status={analyticsStatus} setStatus={setAnalyticsStatus} zone={analyticsZone} setZone={setAnalyticsZone} zones={analyticsZones} /><button type="button" onClick={() => setAnalyticsRefresh((value) => value + 1)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 15px', borderRadius: 9, border: '1px solid rgba(255,255,255,.38)', color: '#fff', background: 'rgba(255,255,255,.13)', cursor: 'pointer', fontSize: 14, fontWeight: 700, boxShadow: 'inset 0 1px 0 rgba(255,255,255,.15)' }}><RefreshCw size={16} />Refresh</button></div></div>
       <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 }}><AnalyticsMetric icon={PackageCheck} label="Completed events" value={analyticsStats.total - analyticsStats.review} sub="Confirmed packing cycles" color="#2563eb" points="0,19 11,19 20,11 29,16 39,8 49,13 58,4 64,4" /><AnalyticsMetric icon={Boxes} label="Boxes packed" value={analyticsStats.boxes} sub="Across all zones" color="#00a878" points="0,20 10,20 18,14 27,17 37,8 46,13 55,5 64,3" /><AnalyticsMetric icon={ShieldAlert} label="Review queue" value={analyticsStats.review} sub="Events needing attention" color="#f97316" points="0,7 10,10 19,8 29,16 38,12 47,19 56,14 64,18" /><AnalyticsMetric icon={Clock3} label="Average cycle" value={`${analyticsStats.avgTime}s`} sub="Average packing time" color="#7c3aed" points="0,17 10,16 19,18 29,11 38,14 47,8 56,12 64,5" /></div>
     </> : null}
     {view === 'analytics' && <Panel style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '12px 14px' }}><span style={label}>Status</span>{[['all', 'ALL', '#475569'], ['completed', 'COMPLETED', OK], ['review', 'NEEDS REVIEW', WARN]].map(([value, text, color]) => <Chip key={value} on={filter === value} color={color} onClick={() => setFilter(value)}>{text}<span style={{ opacity: .7 }}>{value === 'all' ? dbRows.length : dbRows.filter((row) => row.status === value).length}</span></Chip>)}</Panel>}
    {showAnalytics && <AnalyticsPanel rows={analyticsRows} stats={analyticsStats} />}
     {view === 'analytics' && (!rows.length ? <Panel><NoPeriodData minH={200} /></Panel> : grid ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 14 }}>{rows.map((row) => <LogCard key={row.id} row={row} />)}</div> : <LogList rows={rows} />)}
     {view === 'analytics' && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--tx3)', fontSize: 11.5 }}><ClipboardCheck size={14} /> Dummy records are shown for UI validation.</div>}
     </>}
  </div></div></div>;
}
