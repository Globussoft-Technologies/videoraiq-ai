import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactApexChart from 'react-apexcharts';
import moment from 'moment-timezone';
import { toast } from 'sonner';
import { Activity, BarChart3, Camera, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3, DoorOpen, GitBranch, Maximize2, Move, PieChart, RefreshCw, TrendingDown, Trophy, Users, X } from 'lucide-react';
import AccessDenied from '@/components/AccessDenied';
import CameraStream from '@/components/CameraStream';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/context/PermissionContext';
import { useSocket } from '@/context/SocketContext';
import { getChannels } from '@/helpers/configure';
import { deleteLineCrossingLogs, fetchIncidentLogs } from '@/pages/IncidentLogs/Api';
import DateRangePicker from '@/pages/AttendanceLogs/components/DateRangePicker';
import SystemControls from '@/page/user/CommandCenter/SystemControls';
import MultiSelect from '@/components/MultiSelect';

const IST_ZONE = 'Asia/Kolkata';
const ENDPOINT = '/incidents/logs/line-crossing';
const LOG_PANEL_WIDTH = 315;
const CHART_COLORS = ['#0b3b8f', '#ff7a1a', '#2563eb', '#ec4899', '#00b8d4', '#7c3aed', '#14b8a6'];
const TOP_CAMERA_COLORS = ['#1e3a8a', '#f97316', '#2563eb', '#fb923c', '#0b3b8f'];
const STAT_COLOR = '#0b3b8f';
const GRAPH_CARD_ACCENT = '#0b3b8f';
const LINE_AUDIO_STORAGE_KEY = 'lineCrossingAudioMuted';
const GRID_OPTIONS = [1, 2, 3, 4];

function canViewLineCrossing(permissions) {
  const logs = permissions?.logs;
  if (!logs) return false;
  if (typeof logs.lineCrossingLogs?.view === 'boolean') return logs.lineCrossingLogs.view;
  if (typeof logs.global?.view === 'boolean') return logs.global.view;
  return !!logs.view;
}

function enabledLineCrossing(channel) {
  const entry = channel?.detections?.lineCrossingSettings;
  return typeof entry === 'object' ? !!entry.enabled : !!entry;
}

function nvrIdOf(channel) {
  return channel?.nvrId?._id || channel?.nvrId || channel?.NVRId || channel?.nvr?._id || channel?.nvr;
}

function streamableChannel(channel) {
  const nvrId = nvrIdOf(channel);
  const channelId = channel?._id || channel?.id || channel?.channelId;
  return {
    ...channel,
    streamingUrl: channel?.streamingUrl || channel?.StreamingUrl || (nvrId && channelId ? `stream/${nvrId}-${channelId}/playlist.m3u8` : ''),
  };
}

function channelName(channel) {
  return channel?.customName || channel?.name || channel?.channelName || channel?.channelId || 'Camera';
}

function channelKey(channel) {
  return String(channel?._id || channel?.id || channel?.channelId || '');
}

function lineCrossingOverlayData(camera) {
  const entry = camera?.detections?.lineCrossingSettings;
  const setting = entry?.id && typeof entry.id === 'object' ? entry.id : null;
  const settings = setting?.settings || {};
  const cameraId = channelKey(camera);
  const raw = settings.referencePoints?.[cameraId] || settings.referencePoints?.[camera?._id];
  if (!Array.isArray(raw) || !raw.length) return null;
  const line = Array.isArray(raw[0]?.[0]) ? raw[0] : raw;
  const points = line.slice(0, 2).map((point) => (Array.isArray(point) ? { x: Number(point[0]), y: Number(point[1]) } : { x: Number(point?.x), y: Number(point?.y) }));
  if (points.length < 2 || points.some((point) => Number.isNaN(point.x) || Number.isNaN(point.y))) return null;
  const [videoW = 1280, videoH = 720] = Array.isArray(settings.videoResolution) ? settings.videoResolution : [];
  const inside = Array.isArray(settings.inside_reference_point)
    ? { x: Number(settings.inside_reference_point[0]), y: Number(settings.inside_reference_point[1]) }
    : null;
  return {
    name: settings.zone_configs?.[0]?.name || setting?.name || 'Line',
    points,
    inside: inside && !Number.isNaN(inside.x) && !Number.isNaN(inside.y) ? inside : null,
    videoW: Number(videoW) || 1280,
    videoH: Number(videoH) || 720,
  };
}

function LineCrossingOverlay({ camera, fit = 'contain' }) {
  const hostRef = useRef(null);
  const [box, setBox] = useState(null);
  const data = lineCrossingOverlayData(camera);
  useEffect(() => {
    const node = hostRef.current;
    if (!node) return undefined;
    const update = () => {
      const rect = node.getBoundingClientRect();
      setBox({ width: rect.width, height: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  if (!data) return null;
  const containerW = box?.width || 0;
  const containerH = box?.height || 0;
  const videoRatio = data.videoW / data.videoH;
  const containerRatio = containerW && containerH ? containerW / containerH : videoRatio;
  let renderW = containerW || '100%';
  let renderH = containerH || '100%';
  let offsetX = 0;
  let offsetY = 0;
  if (containerW && containerH && fit === 'contain') {
    if (containerRatio > videoRatio) {
      renderH = containerH;
      renderW = containerH * videoRatio;
      offsetX = (containerW - renderW) / 2;
    } else {
      renderW = containerW;
      renderH = containerW / videoRatio;
      offsetY = (containerH - renderH) / 2;
    }
  }
  const scaleX = (x) => (x / data.videoW) * 1000;
  const scaleY = (y) => (y / data.videoH) * 1000;
  const linePoints = data.points.map((point) => `${scaleX(point.x).toFixed(1)},${scaleY(point.y).toFixed(1)}`).join(' ');
  const labelPoint = data.points[0];
  return (
    <div ref={hostRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }}>
      <div style={{ position: 'absolute', left: offsetX, top: offsetY, width: renderW, height: renderH, overflow: 'hidden' }}>
        <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
          <polyline points={linePoints} fill="none" stroke="#f59e0b" strokeWidth="5" strokeLinecap="round" />
          {data.points.map((point, index) => (
            <circle key={index} cx={scaleX(point.x)} cy={scaleY(point.y)} r="8" fill="#f59e0b" stroke="#fff" strokeWidth="2.5" />
          ))}
          {data.inside && (
            <>
              <circle cx={scaleX(data.inside.x)} cy={scaleY(data.inside.y)} r="10" fill="#22c55e" stroke="#fff" strokeWidth="2.5" />
              <text x={scaleX(data.inside.x) + 14} y={scaleY(data.inside.y) - 12} fill="#22c55e" fontSize="26" fontWeight="800">
                Inside Reference Point
              </text>
            </>
          )}
        </svg>
        <span style={{ position: 'absolute', left: `${Math.min(92, Math.max(2, (labelPoint.x / data.videoW) * 100))}%`, top: `${Math.min(92, Math.max(2, (labelPoint.y / data.videoH) * 100 - 5))}%`, transform: 'translateY(-100%)', maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderRadius: 6, background: 'rgba(245,158,11,.95)', color: '#111827', padding: '3px 7px', fontSize: 11, fontWeight: 900, boxShadow: '0 8px 18px rgba(0,0,0,.24)' }}>
          {data.name}
        </span>
      </div>
    </div>
  );
}

function statCard(label, value, sub, Icon, color = STAT_COLOR) {
  const valueIsText = Number.isNaN(Number(value));
  return (
    <div style={{ position: 'relative', overflow: 'hidden', background: `linear-gradient(135deg, ${color}12 0%, var(--bg1) 58%, ${color}08 100%)`, border: `1px solid ${color}2f`, borderRadius: 12, padding: 16, minWidth: 0, boxShadow: `0 14px 32px ${color}10` }}>
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: color, boxShadow: `0 0 18px ${color}55` }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <span style={{ width: 46, height: 46, borderRadius: 16, display: 'grid', placeItems: 'center', background: `${color}18`, color, flexShrink: 0 }}>
            <Icon size={22} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--tx2)', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
            <div style={{ marginTop: 6, fontFamily: 'var(--disp)', fontSize: valueIsText ? 15 : 27, lineHeight: 1.05, fontWeight: 850, color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
          </div>
        </div>
        <span style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center', background: `${color}14`, border: `1px solid ${color}32`, color, flexShrink: 0 }}>
          <Icon size={15} />
        </span>
      </div>
      <div style={{ marginTop: 14, fontSize: 11.5, color: 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
    </div>
  );
}

function movementStatCard({ kind, value, rows, dropdownOpen, onToggle }) {
  const wrapRef = useRef(null);
  const isEntry = kind === 'entry';
  const color = isEntry ? '#10b981' : '#ef4444';
  const soft = isEntry ? 'rgba(16,185,129,.1)' : 'rgba(239,68,68,.1)';
  const title = isEntry ? 'Entries' : 'Exits';
  const sub = isEntry ? 'People counted entering the line' : 'People counted exiting the line';
  const Icon = DoorOpen;
  const countKey = isEntry ? 'entry' : 'exit';
  const headerColor = isEntry ? '#059669' : '#dc2626';
  const columnLabel = isEntry ? 'Entries' : 'Exit';
  const visibleRows = rows.slice(0, 3);

  useEffect(() => {
    if (!dropdownOpen) return undefined;
    const handlePointerDown = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        onToggle();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [dropdownOpen, onToggle]);

  return (
    <div ref={wrapRef} style={{ position: 'relative', height: 164, background: `linear-gradient(135deg, ${soft}, var(--bg1) 58%, ${soft})`, border: `1px solid ${color}30`, borderRadius: 12, minWidth: 0, boxShadow: `0 12px 26px ${color}10` }}>
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: color, boxShadow: `0 0 18px ${color}55` }} />
      <div style={{ display: 'grid', gridTemplateColumns: '168px minmax(0,1fr)', height: '100%' }}>
        <div style={{ padding: '16px 14px 12px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '32px minmax(0,1fr)', alignItems: 'center', gap: 9 }}>
            <span style={{ width: 32, height: 32, borderRadius: '50%', display: 'grid', placeItems: 'center', background: `${color}18`, color, flexShrink: 0 }}>
              <Icon size={17} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 850, color: 'var(--tx2)', whiteSpace: 'nowrap' }}>{title}</div>
              <div style={{ marginTop: 3, fontFamily: 'var(--disp)', fontSize: 25, lineHeight: 1, fontWeight: 900, color, whiteSpace: 'nowrap' }}>{value}</div>
            </div>
          </div>
          <div style={{ fontSize: 11, lineHeight: 1.35, color: 'var(--tx3)' }}>{sub}</div>
        </div>
        <div style={{ position: 'relative', borderLeft: '1px solid var(--bd)', padding: '10px 10px 8px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(56px,1fr) 36px 32px', gap: 5, padding: '0 0 6px', borderBottom: '1px solid var(--bd)', fontSize: 10, fontWeight: 850, color: 'var(--tx2)' }}>
            <div>Camera Name</div>
            <div>Mode</div>
            <div style={{ textAlign: 'right', color: headerColor }}>{columnLabel}</div>
          </div>
          <div style={{ display: 'grid', flex: '1 1 auto' }}>
            {visibleRows.length ? visibleRows.map((row) => (
              <div key={`${kind}-${row.camera}-${row.mode}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(56px,1fr) 36px 32px', gap: 5, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--bd)', fontSize: 11 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, color: 'var(--tx)' }}>
                  <span style={{ width: 16, height: 16, borderRadius: 5, display: 'grid', placeItems: 'center', background: `${color}12`, color, flexShrink: 0 }}>
                    <Camera size={10} />
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}>{row.camera}</span>
                </div>
                <div style={{ color: 'var(--tx2)', fontWeight: 700 }}>{row.mode}</div>
                <div style={{ textAlign: 'right', color: headerColor, fontWeight: 900 }}>{row[countKey]}</div>
              </div>
            )) : (
              <div style={{ padding: '18px 0', color: 'var(--tx3)', fontSize: 12 }}>No camera movement data.</div>
            )}
          </div>
          <button
            type="button"
            onClick={onToggle}
            style={{ alignSelf: 'flex-end', height: 20, border: 0, background: 'transparent', color: 'var(--tx2)', display: 'flex', alignItems: 'center', gap: 4, padding: '0 2px', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}
          >
            View all
            {dropdownOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>
      {dropdownOpen && (
        <div style={{ position: 'absolute', right: 12, top: 'calc(100% + 6px)', zIndex: 60, width: 340, maxWidth: 'calc(100vw - 80px)', maxHeight: 260, overflowY: 'auto', background: 'var(--bg1solid)', border: `1px solid ${color}40`, borderRadius: 12, boxShadow: '0 24px 64px rgba(15,23,42,.28)', padding: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--tx)' }}>All {title}</div>
            <div style={{ fontSize: 11, fontWeight: 800, color }}>{rows.length} cameras</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(130px,1fr) 68px 58px', gap: 10, padding: '8px 10px', borderRadius: 8, background: `${color}12`, fontSize: 11, fontWeight: 900, color: 'var(--tx2)' }}>
            <div>Camera Name</div>
            <div>Mode</div>
            <div style={{ textAlign: 'right', color: headerColor }}>{columnLabel}</div>
          </div>
          {rows.length ? rows.map((row) => (
            <div key={`dropdown-${kind}-${row.camera}-${row.mode}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(130px,1fr) 68px 58px', gap: 10, alignItems: 'center', padding: '9px 10px', borderBottom: '1px solid var(--bd)', background: 'var(--bg1solid)', fontSize: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, color: 'var(--tx)' }}>
                <span style={{ width: 20, height: 20, borderRadius: 6, display: 'grid', placeItems: 'center', background: `${color}12`, color, flexShrink: 0 }}>
                  <Camera size={12} />
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 750 }}>{row.camera}</span>
              </div>
              <div style={{ color: 'var(--tx2)', fontWeight: 750 }}>{row.mode}</div>
              <div style={{ textAlign: 'right', color: headerColor, fontWeight: 900 }}>{row[countKey]}</div>
            </div>
          )) : (
            <div style={{ padding: 14, color: 'var(--tx3)', fontSize: 12 }}>No camera movement data.</div>
          )}
        </div>
      )}
    </div>
  );
}

function movementTotalCard(value) {
  const color = '#2563eb';
  return (
    <div style={{ position: 'relative', height: 164, overflow: 'hidden', background: `linear-gradient(135deg, ${color}12 0%, var(--bg1) 58%, ${color}08 100%)`, border: `1px solid ${color}2f`, borderRadius: 12, padding: 22, minWidth: 0, boxShadow: `0 12px 26px ${color}10`, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: color, boxShadow: `0 0 18px ${color}55` }} />
      <div style={{ display: 'grid', gridTemplateColumns: '38px minmax(0,1fr)', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 38, height: 38, borderRadius: '50%', display: 'grid', placeItems: 'center', background: `${color}18`, color, flexShrink: 0 }}>
          <Users size={19} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 850, color: 'var(--tx2)' }}>Total Present</div>
          <div style={{ marginTop: 4, fontFamily: 'var(--disp)', fontSize: 30, lineHeight: 1, fontWeight: 900, color }}>{value}</div>
        </div>
      </div>
      <div style={{ marginTop: 10, fontSize: 11, lineHeight: 1.35, color: 'var(--tx3)' }}></div>
    </div>
  );
}

function recordCameraName(record) {
  return record?.channelData?.name || record?.channelName || record?.cameraName || record?.channelId?.name || '--';
}

function recordCameraId(record) {
  return String(record?.channelData?._id || record?.channelId?._id || record?.channelId || record?.cameraId?._id || record?.cameraId || '');
}

function recordNvrId(record) {
  return String(record?.nvrData?._id || record?.nvrId?._id || record?.nvrId || record?.channelData?.nvrId?._id || record?.channelData?.nvrId || '');
}

function recordNvrName(record) {
  return record?.nvrData?.nvrName || record?.nvrData?.name || record?.nvrName || '--';
}

function channelNvrName(channel) {
  return channel?.nvrId?.nvrName || channel?.nvrId?.name || channel?.nvrName || channel?.nvr?.nvrName || 'NVR';
}

function recordTimestamp(record) {
  return record?.timeOfIncident || record?.createdAt || record?.updatedAt;
}

function recordEntry(record) {
  if (record?.totalEntry != null) return Number(record.totalEntry || 0);
  if (record?.entry != null) return Number(record.entry || 0);
  if (record?.entryCount != null) return Number(record.entryCount || 0);
  if (record?.atoB != null) return Number(record.atoB || 0);
  return (record?.timeSeries || []).reduce((sum, point) => sum + Number(point.entry ?? point.entryCount ?? point.atoB ?? 0), 0);
}

function recordExit(record) {
  if (record?.totalExit != null) return Number(record.totalExit || 0);
  if (record?.exit != null) return Number(record.exit || 0);
  if (record?.exitCount != null) return Number(record.exitCount || 0);
  if (record?.btoA != null) return Number(record.btoA || 0);
  return (record?.timeSeries || []).reduce((sum, point) => sum + Number(point.exit ?? point.exitCount ?? point.btoA ?? 0), 0);
}

function recordMode(record) {
  const raw = String(record?.count_mode || record?.countMode || record?.mode || record?.type || '').toLowerCase();
  if (raw === 'all' || raw === 'both' || raw === 'gauge') return 'All';
  if (raw.includes('entry')) return 'Entry';
  if (raw.includes('exit')) return 'Exit';
  return '--';
}

function recordsPresentCount(records) {
  const totalEntry = records.reduce((sum, item) => sum + recordEntry(item), 0);
  const totalExit = records.reduce((sum, item) => sum + recordExit(item), 0);
  return Math.max(totalEntry - totalExit, 0);
}

function isEntryMovementRow(row) {
  const mode = String(row?.mode || '').toLowerCase();
  if (mode === 'all') return true;
  if (mode === 'entry') return true;
  if (mode === 'exit') return false;
  return Number(row?.entry || 0) > 0;
}

function isExitMovementRow(row) {
  const mode = String(row?.mode || '').toLowerCase();
  if (mode === 'all') return true;
  if (mode === 'exit') return true;
  if (mode === 'entry') return false;
  return Number(row?.exit || 0) > 0;
}

function flattenSeries(records) {
  let runningEntry = 0;
  let runningExit = 0;
  return records
    .flatMap((record) => {
      if (record.timeSeries?.length) {
        return record.timeSeries.map((point) => ({
          timestamp: point.timestamp || recordTimestamp(record),
          entry: Number(point.entry ?? point.entryCount ?? point.atoB ?? 0),
          exit: Number(point.exit ?? point.exitCount ?? point.btoA ?? 0),
        }));
      }
      return [{
        timestamp: recordTimestamp(record),
        entry: recordEntry(record),
        exit: recordExit(record),
      }];
    })
    .filter((point) => point.timestamp)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .map((point) => {
      runningEntry += Number(point.entry || 0);
      runningExit += Number(point.exit || 0);
      return { ...point, entry: runningEntry, exit: runningExit };
    });
}

function buildChartOptions() {
  return {
    chart: {
      type: 'area',
      toolbar: { show: false },
      animations: { enabled: false },
      zoom: { enabled: true, type: 'x', autoScaleYaxis: true },
    },
    colors: [CHART_COLORS[0], CHART_COLORS[1]],
    stroke: { curve: 'smooth', width: 2.6 },
    fill: {
      type: 'gradient',
      gradient: { opacityFrom: 0.32, opacityTo: 0.04, stops: [0, 100] },
    },
    dataLabels: { enabled: false },
    markers: { size: 4, strokeWidth: 0 },
    grid: { borderColor: 'rgba(148,163,184,.25)', strokeDashArray: 4 },
    xaxis: {
      type: 'datetime',
      labels: {
        datetimeUTC: false,
        style: { fontSize: '10px', colors: 'var(--tx3)' },
        formatter: (value) => moment(value).tz(IST_ZONE).format('HH:mm'),
      },
    },
    yaxis: {
      min: 0,
      forceNiceScale: true,
      title: { text: 'Total crossings', style: { color: 'var(--tx3)', fontSize: '11px', fontWeight: 700 } },
      labels: { style: { fontSize: '10px', colors: 'var(--tx3)' } },
    },
    tooltip: {
      x: { formatter: (value) => moment(value).tz(IST_ZONE).format('DD MMM YYYY, HH:mm:ss') },
    },
    legend: { position: 'top', horizontalAlign: 'right', fontSize: '11px' },
  };
}

function buildBarOptions(categories, { horizontal = false, stacked = false, distributed = false, colors } = {}) {
  return {
    chart: { type: 'bar', toolbar: { show: false }, stacked, animations: { enabled: true, speed: 450 } },
    colors: colors || [CHART_COLORS[0], CHART_COLORS[1], CHART_COLORS[3]],
    plotOptions: {
      bar: { horizontal, distributed, borderRadius: 5, columnWidth: '14%', barHeight: '20%' },
    },
    dataLabels: { enabled: false },
    grid: { borderColor: 'rgba(148,163,184,.24)', strokeDashArray: 4 },
    xaxis: {
      categories,
      labels: { style: { fontSize: '10px', colors: 'var(--tx3)' }, rotate: -20, trim: true },
    },
    yaxis: { labels: { style: { fontSize: '10px', colors: 'var(--tx3)' } } },
    legend: { position: 'top', horizontalAlign: 'right', fontSize: '11px', labels: { colors: 'var(--tx2)' } },
    tooltip: { theme: false },
  };
}

function buildPieOptions(labels) {
  return {
    chart: { type: 'donut', toolbar: { show: false }, animations: { enabled: true, speed: 450 } },
    labels,
    colors: [CHART_COLORS[0], CHART_COLORS[1], CHART_COLORS[3], CHART_COLORS[4], CHART_COLORS[5]],
    stroke: { width: 2, colors: ['var(--bg1)'] },
    dataLabels: { enabled: true, style: { fontSize: '11px', fontWeight: 800 } },
    legend: { position: 'bottom', fontSize: '11px', labels: { colors: 'var(--tx2)' } },
    plotOptions: { pie: { donut: { size: '62%', labels: { show: true, total: { show: true, label: 'Crossings', color: 'var(--tx3)' } } } } },
    tooltip: { theme: false },
  };
}

function buildHeatmapOptions(categories) {
  return {
    chart: { type: 'heatmap', toolbar: { show: false }, animations: { enabled: true, speed: 450 } },
    colors: [GRAPH_CARD_ACCENT],
    plotOptions: {
      heatmap: {
        radius: 4,
        enableShades: false,
        shadeIntensity: 0,
        colorScale: {
          ranges: [
            { from: 0, to: 0, color: '#e5e7eb', name: 'None' },
            { from: 1, to: 3, color: '#fed7aa', name: 'Low' },
            { from: 4, to: 10, color: '#f97316', name: 'Medium' },
            { from: 11, to: 9999, color: '#1e3a8a', name: 'High' },
          ],
        },
      },
    },
    dataLabels: { enabled: false },
    grid: { borderColor: 'rgba(148,163,184,.22)' },
    xaxis: { categories, labels: { style: { fontSize: '10px', colors: 'var(--tx3)' } } },
    yaxis: { labels: { style: { fontSize: '10px', colors: 'var(--tx3)' } } },
    legend: { position: 'top', horizontalAlign: 'right', fontSize: '11px', labels: { colors: 'var(--tx2)' } },
    tooltip: { theme: false },
  };
}

function chartShell(title, sub, Icon, children, onFullscreen) {
  return (
    <section style={{ background: 'var(--bg1)', border: '1px solid rgba(11,59,143,.24)', borderTop: `3px solid ${GRAPH_CARD_ACCENT}`, borderRadius: 12, padding: 14, minWidth: 0, boxShadow: '0 12px 28px rgba(11,59,143,.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
        <span style={{ width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'rgba(11,59,143,.1)', color: GRAPH_CARD_ACCENT }}>
          <Icon size={15} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx)' }}>{title}</div>
          <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>{sub}</div>
        </div>
        {onFullscreen && (
          <button
            type="button"
            onClick={onFullscreen}
            aria-label={`Open ${title} fullscreen`}
            title="Open fullscreen"
            style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg2)', color: GRAPH_CARD_ACCENT, display: 'grid', placeItems: 'center', cursor: 'pointer' }}
          >
            <Maximize2 size={14} />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function lineCrossingDirection(data) {
  const rawType = String(data?.type || data?.count_mode || data?.mode || data?.direction || '').toLowerCase();
  if (rawType.includes('exit')) return 'exit';
  if (rawType.includes('entry')) return 'entry';
  if (Number(data?.exit || data?.totalExit || data?.exitCount || data?.btoA || 0) > 0) return 'exit';
  if (Number(data?.entry || data?.totalEntry || data?.entryCount || data?.atoB || 0) > 0) return 'entry';
  return 'entry';
}

export default function LineCrossingLogs() {
  const { permissions, loading: permissionsLoading } = usePermissions();
  const { socket } = useSocket();
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [dateRangeRecords, setDateRangeRecords] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [allCameras, setAllCameras] = useState([]);
  const [enabledCameras, setEnabledCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [fullscreenCamera, setFullscreenCamera] = useState(null);
  const [socketEventsByChannel, setSocketEventsByChannel] = useState({});
  const [lineAudioMuted, setLineAudioMuted] = useState(() => {
    try { return localStorage.getItem(LINE_AUDIO_STORAGE_KEY) !== 'false'; } catch { return true; }
  });
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [collapsedFullscreenLogs, setCollapsedFullscreenLogs] = useState({});
  const [movementDropdown, setMovementDropdown] = useState(null);
  const [logPanelPosition, setLogPanelPosition] = useState({ x: 18, y: 18 });
  const [streamPage, setStreamPage] = useState(0);
  const [fullscreenGridSize, setFullscreenGridSize] = useState(1);
  const [fullscreenPage, setFullscreenPage] = useState(0);
  const [chartModal, setChartModal] = useState(null);
  const [analyticsNvrIds, setAnalyticsNvrIds] = useState([]);
  const [analyticsCameraIds, setAnalyticsCameraIds] = useState([]);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resettingAnalytics, setResettingAnalytics] = useState(false);
  const [resetTarget, setResetTarget] = useState('date');
  const [resetDraft, setResetDraft] = useState(() => {
    const today = moment().tz(IST_ZONE).format('YYYY-MM-DD');
    return { startDate: today, endDate: today, nvrIds: [], cameraIds: [] };
  });
  const [dateFilter, setDateFilter] = useState(() => {
    const today = moment().tz(IST_ZONE).format('YYYY-MM-DD');
    return { startDate: today, endDate: today };
  });
  const lineAudioMutedRef = useRef(true);
  const audioContextRef = useRef(null);
  const dragRef = useRef(null);
  const filtersRef = useRef({ startDate: '', endDate: '', nvrIds: [], channelIds: [] });
  const filtersHydratedRef = useRef(false);

  const canView = canViewLineCrossing(permissions);

  useEffect(() => {
    lineAudioMutedRef.current = lineAudioMuted;
  }, [lineAudioMuted]);

  useEffect(() => {
    const handleLineAudio = (event) => {
      if (typeof event.detail?.muted === 'boolean') {
        lineAudioMutedRef.current = event.detail.muted;
        setLineAudioMuted(event.detail.muted);
      }
    };
    window.addEventListener('line-crossing-audio-change', handleLineAudio);
    return () => window.removeEventListener('line-crossing-audio-change', handleLineAudio);
  }, []);

  const playLineCrossingSound = useCallback((direction) => {
    if (lineAudioMutedRef.current) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = audioContextRef.current || new AudioContext();
    audioContextRef.current = ctx;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const now = ctx.currentTime;
    const notes = direction === 'exit'
      ? [{ frequency: 720, offset: 0 }, { frequency: 440, offset: 0.13 }]
      : [{ frequency: 520, offset: 0 }, { frequency: 880, offset: 0.13 }];
    notes.forEach(({ frequency, offset }) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + offset;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.18);
    });
  }, []);

  const startLogPanelDrag = useCallback((event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - logPanelPosition.x,
      offsetY: event.clientY - logPanelPosition.y,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [logPanelPosition.x, logPanelPosition.y]);

  const moveLogPanel = useCallback((event) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    const maxX = Math.max(12, window.innerWidth - LOG_PANEL_WIDTH - 12);
    const maxY = Math.max(12, window.innerHeight - 130);
    setLogPanelPosition({
      x: Math.min(Math.max(12, event.clientX - dragRef.current.offsetX), maxX),
      y: Math.min(Math.max(12, event.clientY - dragRef.current.offsetY), maxY),
    });
  }, []);

  const stopLogPanelDrag = useCallback((event) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  }, []);

  useEffect(() => {
    filtersRef.current = {
      startDate: dateFilter.startDate,
      endDate: dateFilter.endDate,
      nvrIds: analyticsNvrIds,
      channelIds: analyticsCameraIds,
    };
  }, [analyticsCameraIds, analyticsNvrIds, dateFilter.endDate, dateFilter.startDate]);

  const loadChannels = useCallback(async () => {
    if (!canView) return [];
    const channelsRes = await getChannels({ skip: 0, limit: 1000 });
    const channels = (channelsRes?.channels || []).map(streamableChannel);
    const enabled = channels.filter(enabledLineCrossing);
    setAllCameras(channels);
    setEnabledCameras(enabled);
    return enabled;
  }, [canView]);

  const loadLogs = useCallback(async ({
    startDate,
    endDate,
    nvrIds,
    channelIds,
  } = {}) => {
    if (!canView) return;
    const effectiveFilters = {
      ...filtersRef.current,
      ...(startDate !== undefined && { startDate }),
      ...(endDate !== undefined && { endDate }),
      ...(nvrIds !== undefined && { nvrIds }),
      ...(channelIds !== undefined && { channelIds }),
    };
    setLoading(true);
    try {
      const logsRes = await fetchIncidentLogs({
        endpoint: ENDPOINT,
        skip: 0,
        limit: 500,
        startDate: effectiveFilters.startDate,
        endDate: effectiveFilters.endDate,
        nvrIds: effectiveFilters.nvrIds,
        channelIds: effectiveFilters.channelIds,
      });
      const payload = logsRes?.data?.body?.data;
      setRecords(payload?.data || []);
      setTotalCount(Number(payload?.totalCount || 0));
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, [canView]);

  const loadDateRangeLogs = useCallback(async ({ startDate, endDate } = {}) => {
    if (!canView) return;
    const effectiveStartDate = startDate ?? filtersRef.current.startDate;
    const effectiveEndDate = endDate ?? filtersRef.current.endDate;
    const logsRes = await fetchIncidentLogs({
      endpoint: ENDPOINT,
      skip: 0,
      limit: 500,
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
    });
    const payload = logsRes?.data?.body?.data;
    setDateRangeRecords(payload?.data || []);
  }, [canView]);

  const refreshAll = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      await loadChannels();
      await Promise.all([
        loadLogs(filtersRef.current),
        loadDateRangeLogs(filtersRef.current),
      ]);
    } finally {
      setLoading(false);
    }
  }, [canView, loadChannels, loadDateRangeLogs, loadLogs]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (!filtersHydratedRef.current) {
      filtersHydratedRef.current = true;
      return;
    }
    loadLogs(filtersRef.current);
  }, [analyticsCameraIds, analyticsNvrIds, dateFilter.endDate, dateFilter.startDate, loadLogs]);

  useEffect(() => {
    if (!filtersHydratedRef.current) return;
    loadDateRangeLogs(filtersRef.current);
  }, [dateFilter.endDate, dateFilter.startDate, loadDateRangeLogs]);

  useEffect(() => {
    const handleDetectionToggle = async (event) => {
      if (event.detail?.detectionType !== 'lineCrossingSettings') return;
      await loadChannels();
      await Promise.all([
        loadLogs(filtersRef.current),
        loadDateRangeLogs(filtersRef.current),
      ]);
    };
    window.addEventListener('vq-detection-toggle-change', handleDetectionToggle);
    return () => window.removeEventListener('vq-detection-toggle-change', handleDetectionToggle);
  }, [loadChannels, loadDateRangeLogs, loadLogs]);

  useEffect(() => {
    if (dateFilter.startDate && dateFilter.endDate && dateFilter.endDate < dateFilter.startDate) {
      setDateFilter((prev) => ({ ...prev, endDate: prev.startDate }));
    }
  }, [dateFilter.endDate, dateFilter.startDate]);

  const streamsPerPage = 1;

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(enabledCameras.length / streamsPerPage) - 1);
    setStreamPage((page) => Math.min(page, maxPage));
  }, [enabledCameras.length, streamsPerPage]);

  useEffect(() => {
    if (!socket || !user?.adminId || !canView) return undefined;
    const eventName = `cameradetection_${user.adminId}`;
    const handleDetection = (...args) => {
      const data = args.find((arg) => arg && typeof arg === 'object' && !Array.isArray(arg) && arg.incidentType)
        || args.find((arg) => Array.isArray(arg))?.find((item) => item && typeof item === 'object' && item.incidentType)
        || args[0];
      if (data?.incidentType && data.incidentType !== 'lineCrossing') return;
      const channelId = data?.channelId?._id || data?.channelId || data?.cameraId?._id || data?.cameraId;
      if (channelId) {
        setSocketEventsByChannel((prev) => ({ ...prev, [String(channelId)]: data }));
      }
      playLineCrossingSound(lineCrossingDirection(data));
      loadLogs(filtersRef.current);
      loadDateRangeLogs(filtersRef.current);
    };
    socket.on(eventName, handleDetection);
    return () => socket.off(eventName, handleDetection);
  }, [socket, user?.adminId, canView, loadDateRangeLogs, loadLogs, playLineCrossingSound]);

  const nvrOptions = useMemo(() => {
    const map = new Map();
    allCameras.forEach((camera) => {
      const id = String(nvrIdOf(camera) || '');
      if (id) map.set(id, channelNvrName(camera));
    });
    records.forEach((record) => {
      const id = recordNvrId(record);
      if (id) map.set(id, recordNvrName(record));
    });
    return [...map.entries()].map(([id, label]) => ({ id, label }));
  }, [allCameras, records]);

  const cameraOptions = useMemo(() => {
    const scoped = analyticsNvrIds.length
      ? allCameras.filter((camera) => analyticsNvrIds.includes(String(nvrIdOf(camera) || '')))
      : allCameras;
    return scoped.map((camera) => ({ id: String(camera._id || camera.id || camera.channelId || ''), label: channelName(camera) })).filter((item) => item.id);
  }, [allCameras, analyticsNvrIds]);

  const resetCameraOptions = useMemo(() => {
    const scoped = resetDraft.nvrIds.length
      ? allCameras.filter((camera) => resetDraft.nvrIds.includes(String(nvrIdOf(camera) || '')))
      : allCameras;
    return scoped.map((camera) => ({ id: String(camera._id || camera.id || camera.channelId || ''), label: channelName(camera) })).filter((item) => item.id);
  }, [allCameras, resetDraft.nvrIds]);

  useEffect(() => {
    setAnalyticsCameraIds((prev) => prev.filter((id) => cameraOptions.some((camera) => camera.id === id)));
  }, [cameraOptions]);

  useEffect(() => {
    setResetDraft((prev) => ({
      ...prev,
      cameraIds: prev.cameraIds.filter((id) => resetCameraOptions.some((camera) => camera.id === id)),
    }));
  }, [resetCameraOptions]);

  const filteredRecords = useMemo(() => records.filter((record) => {
    if (analyticsNvrIds.length && !analyticsNvrIds.includes(recordNvrId(record))) return false;
    if (analyticsCameraIds.length && !analyticsCameraIds.includes(recordCameraId(record))) return false;
    return true;
  }), [analyticsCameraIds, analyticsNvrIds, records]);

  const filteredEnabledCameras = useMemo(() => enabledCameras.filter((camera) => {
    const cameraId = String(camera._id || camera.id || camera.channelId || '');
    if (analyticsNvrIds.length && !analyticsNvrIds.includes(String(nvrIdOf(camera) || ''))) return false;
    if (analyticsCameraIds.length && !analyticsCameraIds.includes(cameraId)) return false;
    return true;
  }), [analyticsCameraIds, analyticsNvrIds, enabledCameras]);

  const resetAnalytics = async (mode) => {
    const nextFilters = {
      startDate: resetDraft.startDate,
      endDate: resetDraft.endDate,
      nvrIds: mode === 'camera' ? resetDraft.nvrIds : [],
      channelIds: mode === 'camera' ? resetDraft.cameraIds : [],
    };
    if (!nextFilters.startDate || !nextFilters.endDate) {
      toast.error('Select a date range before resetting analytics.');
      return;
    }
    setResettingAnalytics(true);
    try {
      const res = await deleteLineCrossingLogs(nextFilters);
      setDateFilter({ startDate: nextFilters.startDate, endDate: nextFilters.endDate });
      setAnalyticsNvrIds(nextFilters.nvrIds);
      setAnalyticsCameraIds(nextFilters.channelIds);
      setResetModalOpen(false);
      await Promise.all([
        loadLogs(nextFilters),
        loadDateRangeLogs(nextFilters),
      ]);
      const deletedCount = res?.data?.body?.data?.deletedCount ?? 0;
      toast.success(`${deletedCount} line crossing log${deletedCount === 1 ? '' : 's'} reset.`);
    } catch (err) {
      toast.error(err?.response?.data?.body?.message || err?.response?.data?.message || 'Failed to reset line crossing analytics.');
    } finally {
      setResettingAnalytics(false);
    }
  };

  const openResetModal = () => {
    setResetTarget(analyticsNvrIds.length || analyticsCameraIds.length ? 'camera' : 'date');
    setResetDraft({
      startDate: dateFilter.startDate,
      endDate: dateFilter.endDate,
      nvrIds: analyticsNvrIds,
      cameraIds: analyticsCameraIds,
    });
    setResetModalOpen(true);
  };

  const seriesPoints = useMemo(() => flattenSeries(filteredRecords), [filteredRecords]);
  const stats = useMemo(() => {
    const totalEntry = filteredRecords.reduce((sum, item) => sum + recordEntry(item), 0);
    const totalExit = filteredRecords.reduce((sum, item) => sum + recordExit(item), 0);
    const activeZones = new Set(filteredRecords.map((item) => item.zone).filter(Boolean)).size;
    return { totalEntry, totalExit, net: recordsPresentCount(filteredRecords), activeZones };
  }, [filteredRecords]);

  const movementStats = useMemo(() => {
    const totalEntry = dateRangeRecords.reduce((sum, item) => sum + recordEntry(item), 0);
    const totalExit = dateRangeRecords.reduce((sum, item) => sum + recordExit(item), 0);
    return { totalEntry, totalExit, net: recordsPresentCount(dateRangeRecords) };
  }, [dateRangeRecords]);

  const chartSeries = useMemo(() => ([
    { name: 'Entry', data: seriesPoints.map((point) => [new Date(point.timestamp).getTime(), point.entry]) },
    { name: 'Exit', data: seriesPoints.map((point) => [new Date(point.timestamp).getTime(), point.exit]) },
  ]), [seriesPoints]);

  const latestRecords = useMemo(
    () => [...filteredRecords].sort((a, b) => new Date(b.timeOfIncident || b.updatedAt) - new Date(a.timeOfIncident || a.updatedAt)).slice(0, 10),
    [filteredRecords],
  );

  const cameraMetrics = useMemo(() => {
    const grouped = new Map();
    filteredRecords.forEach((record) => {
      const camera = recordCameraName(record);
      const current = grouped.get(camera) || { camera, entry: 0, exit: 0, total: 0 };
      current.entry += recordEntry(record);
      current.exit += recordExit(record);
      current.total = current.entry + current.exit;
      grouped.set(camera, current);
    });
    return [...grouped.values()].sort((a, b) => b.total - a.total);
  }, [filteredRecords]);

  const movementRows = useMemo(() => {
    const grouped = new Map();
    dateRangeRecords.forEach((record) => {
      const camera = recordCameraName(record);
      const current = grouped.get(camera) || {
        camera,
        entry: 0,
        exit: 0,
        total: 0,
        modes: new Set(),
      };
      current.entry += recordEntry(record);
      current.exit += recordExit(record);
      current.total = current.entry + current.exit;
      const mode = recordMode(record);
      if (mode && mode !== '--') current.modes.add(mode);
      grouped.set(camera, current);
    });
    return [...grouped.values()]
      .map((item) => {
        const modes = [...item.modes];
        return {
          camera: item.camera,
          entry: item.entry,
          exit: item.exit,
          total: item.total,
          mode: modes.includes('All') || modes.length > 1 ? 'All' : (modes[0] || '--'),
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [dateRangeRecords]);

  const entryRows = useMemo(
    () => movementRows
      .filter(isEntryMovementRow)
      .sort((a, b) => b.entry - a.entry || b.total - a.total),
    [movementRows],
  );

  const exitRows = useMemo(
    () => movementRows
      .filter(isExitMovementRow)
      .sort((a, b) => b.exit - a.exit || b.total - a.total),
    [movementRows],
  );

  const dateRangeCameraMetrics = useMemo(() => {
    const grouped = new Map();
    dateRangeRecords.forEach((record) => {
      const camera = recordCameraName(record);
      const current = grouped.get(camera) || { camera, entry: 0, exit: 0, total: 0 };
      current.entry += recordEntry(record);
      current.exit += recordExit(record);
      current.total = current.entry + current.exit;
      grouped.set(camera, current);
    });
    return [...grouped.values()].sort((a, b) => b.total - a.total);
  }, [dateRangeRecords]);

  const hourlyTraffic = useMemo(() => {
    const grouped = new Map();
    const addPoint = (timestamp, entry, exit) => {
      if (!timestamp) return;
      const hour = moment(timestamp).tz(IST_ZONE).startOf('hour').format('HH:00');
      const current = grouped.get(hour) || { hour, entry: 0, exit: 0 };
      current.entry += Number(entry || 0);
      current.exit += Number(exit || 0);
      grouped.set(hour, current);
    };
    filteredRecords.forEach((record) => {
      if (record?.timeSeries?.length) {
        record.timeSeries.forEach((point) => addPoint(point.timestamp || recordTimestamp(record), point.entry ?? point.entryCount ?? point.atoB, point.exit ?? point.exitCount ?? point.btoA));
      } else {
        addPoint(recordTimestamp(record), recordEntry(record), recordExit(record));
      }
    });
    return [...grouped.values()].sort((a, b) => a.hour.localeCompare(b.hour));
  }, [filteredRecords]);

  const heatmap = useMemo(() => {
    const hours = Array.from(new Set(hourlyTraffic.map((item) => item.hour))).sort();
    const cameras = cameraMetrics.map((item) => item.camera);
    const matrix = new Map();
    const addPoint = (camera, timestamp, entry, exit) => {
      if (!timestamp) return;
      const hour = moment(timestamp).tz(IST_ZONE).startOf('hour').format('HH:00');
      const key = `${camera}::${hour}`;
      matrix.set(key, (matrix.get(key) || 0) + Number(entry || 0) + Number(exit || 0));
    };
    filteredRecords.forEach((record) => {
      const camera = recordCameraName(record);
      if (record?.timeSeries?.length) {
        record.timeSeries.forEach((point) => addPoint(camera, point.timestamp || recordTimestamp(record), point.entry ?? point.entryCount ?? point.atoB, point.exit ?? point.exitCount ?? point.btoA));
      } else {
        addPoint(camera, recordTimestamp(record), recordEntry(record), recordExit(record));
      }
    });
    return {
      hours,
      series: cameras.map((camera) => ({
        name: camera,
        data: hours.map((hour) => ({ x: hour, y: matrix.get(`${camera}::${hour}`) || 0 })),
      })),
    };
  }, [cameraMetrics, hourlyTraffic, filteredRecords]);

  const streamPageCount = Math.max(1, Math.ceil(filteredEnabledCameras.length / streamsPerPage));
  const visibleCameras = filteredEnabledCameras.slice(streamPage * streamsPerPage, (streamPage + 1) * streamsPerPage);
  const availableFullscreenGridOptions = useMemo(() => {
    const cameraCount = filteredEnabledCameras.length;
    if (cameraCount <= 1) return [1];
    return GRID_OPTIONS.filter((size) => size === 1 || ((size - 1) * (size - 1)) < cameraCount);
  }, [filteredEnabledCameras.length]);
  const fullscreenStreamsPerPage = fullscreenGridSize * fullscreenGridSize;
  const fullscreenPageCount = Math.max(1, Math.ceil(filteredEnabledCameras.length / fullscreenStreamsPerPage));
  const fullscreenVisibleCameras = filteredEnabledCameras.slice(fullscreenPage * fullscreenStreamsPerPage, (fullscreenPage + 1) * fullscreenStreamsPerPage);
  const fullscreenGridColumns = Math.max(1, Math.min(fullscreenGridSize, fullscreenVisibleCameras.length || 1));
  const cameraCategories = cameraMetrics.map((item) => item.camera);
  const hourlyCategories = hourlyTraffic.map((item) => item.hour);
  const topCameras = cameraMetrics.slice(0, 5);
  const highestCamera = dateRangeCameraMetrics[0] || null;
  const lowestCamera = dateRangeCameraMetrics.length ? dateRangeCameraMetrics[dateRangeCameraMetrics.length - 1] : null;
  const filteredModeActive = Boolean(analyticsNvrIds.length || analyticsCameraIds.length);
  const displayedTotalLogs = filteredModeActive ? filteredRecords.length : totalCount;
  const hasPieData = stats.totalEntry > 0 || stats.totalExit > 0;
  const pieLabels = ['Entry', 'Exit'];
  const pieSeries = [stats.totalEntry, stats.totalExit];

  const fullscreenLogItems = useMemo(() => fullscreenVisibleCameras
    .map((camera) => {
      const id = channelKey(camera);
      const socketEvent = socketEventsByChannel[String(id)];
      const apiRecord = filteredRecords.find((record) => recordCameraId(record) === String(id));
      const data = socketEvent || apiRecord;
      return data ? { camera, data } : null;
    })
    .filter(Boolean), [filteredRecords, fullscreenVisibleCameras, socketEventsByChannel]);

  const openFullscreenCamera = useCallback((camera) => {
    if (!camera) return;
    const index = filteredEnabledCameras.findIndex((item) => channelKey(item) === channelKey(camera));
    const targetPage = Math.floor(Math.max(index, 0) / fullscreenStreamsPerPage);
    setFullscreenPage(targetPage);
    setFullscreenCamera(camera);
  }, [filteredEnabledCameras, fullscreenStreamsPerPage]);

  const goToFullscreenPage = (page) => {
    const nextPage = (page + fullscreenPageCount) % fullscreenPageCount;
    setFullscreenPage(nextPage);
    setFullscreenCamera(filteredEnabledCameras[nextPage * fullscreenStreamsPerPage] || filteredEnabledCameras[0] || null);
  };

  useEffect(() => {
    if (streamPage > streamPageCount - 1) setStreamPage(0);
  }, [streamPage, streamPageCount]);

  useEffect(() => {
    if (fullscreenPage > fullscreenPageCount - 1) setFullscreenPage(0);
  }, [fullscreenPage, fullscreenPageCount]);

  useEffect(() => {
    if (!availableFullscreenGridOptions.includes(fullscreenGridSize)) {
      setFullscreenGridSize(availableFullscreenGridOptions[0]);
      setFullscreenPage(0);
    }
  }, [availableFullscreenGridOptions, fullscreenGridSize]);

  useEffect(() => {
    if (!fullscreenCamera) return;
    if (!filteredEnabledCameras.some((camera) => channelKey(camera) === channelKey(fullscreenCamera))) {
      setFullscreenCamera(filteredEnabledCameras[0] || null);
      setFullscreenPage(0);
    }
  }, [filteredEnabledCameras, fullscreenCamera]);

  if (permissionsLoading) return null;
  if (!canView) return <AccessDenied message="You don't have permission to view Line Crossing Logs." />;

  return (
    <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16, minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--disp)', fontSize: 20, fontWeight: 800, color: 'var(--tx)' }}>Line Crossing Analytics</div>
          <div style={{ marginTop: 3, fontSize: 12, color: 'var(--tx3)' }}>
            Filter line-crossing logs by date and review camera, hourly, and heatmap analytics.
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <MultiSelect
            options={nvrOptions}
            value={analyticsNvrIds}
            onChange={(next) => {
              setAnalyticsNvrIds(next);
              if (!next.length) setAnalyticsCameraIds([]);
            }}
            placeholder="All NVRs"
            searchPlaceholder="Search NVR..."
            msg="No NVRs found"
            className="w-[170px]"
            maxHeight="max-h-[210px]"
            tint="#0b3b8f"
          />
          <MultiSelect
            options={cameraOptions}
            value={analyticsCameraIds}
            onChange={setAnalyticsCameraIds}
            placeholder="All Cameras"
            searchPlaceholder="Search camera..."
            msg="No cameras found"
            className="w-[190px]"
            maxHeight="max-h-[210px]"
            tint="#2563eb"
          />
          <div style={{ width: 250 }}>
            <DateRangePicker
              startDate={dateFilter.startDate ? moment.tz(dateFilter.startDate, IST_ZONE).toDate() : null}
              endDate={dateFilter.endDate ? moment.tz(dateFilter.endDate, IST_ZONE).toDate() : null}
              onRangeChange={({ start, end }) => setDateFilter({
                startDate: start ? moment(start).tz(IST_ZONE).format('YYYY-MM-DD') : '',
                endDate: end ? moment(end).tz(IST_ZONE).format('YYYY-MM-DD') : '',
              })}
            />
          </div>
          <button
            type="button"
            onClick={openResetModal}
            style={{ height: 34, padding: '0 13px', borderRadius: 8, border: '1px solid rgba(124,58,237,.35)', background: 'rgba(124,58,237,.1)', color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
          >
            Reset Analytics
          </button>
          <button
            type="button"
            onClick={refreshAll}
            disabled={loading}
            style={{ height: 34, padding: '0 13px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg1)', color: 'var(--tx2)', display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, cursor: loading ? 'wait' : 'pointer' }}
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      <section style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--tx)', marginBottom: 8 }}>People Movement</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, alignItems: 'stretch' }}>
          {movementStatCard({
            kind: 'entry',
            value: movementStats.totalEntry,
            rows: entryRows,
            dropdownOpen: movementDropdown === 'entry',
            onToggle: () => setMovementDropdown((current) => (current === 'entry' ? null : 'entry')),
          })}
          {movementStatCard({
            kind: 'exit',
            value: movementStats.totalExit,
            rows: exitRows,
            dropdownOpen: movementDropdown === 'exit',
            onToggle: () => setMovementDropdown((current) => (current === 'exit' ? null : 'exit')),
          })}
          <div style={{ minWidth: 0, height: '100%' }}>
            {movementTotalCard(movementStats.net)}
          </div>
        </div>
      </section>

      <section style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--tx)', marginBottom: 10 }}>Other Metrics</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
          {statCard('Total Logs', displayedTotalLogs, 'Events returned for the selected date range', Activity, '#7c3aed')}
          {statCard('Enabled Cameras', filteredEnabledCameras.length, 'Cameras configured for line crossing', Camera, '#06b6d4')}
          {statCard('Highest Camera Count', highestCamera?.camera || '--', highestCamera ? `${highestCamera.entry} entry / ${highestCamera.exit} exit` : 'No camera activity in this range', Trophy, '#f59e0b')}
          {statCard('Lowest Camera Count', lowestCamera?.camera || '--', lowestCamera ? `${lowestCamera.entry} entry / ${lowestCamera.exit} exit` : 'No camera activity in this range', TrendingDown, '#64748b')}
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(620px, 1.18fr) minmax(360px, .82fr)', gap: 14, alignItems: 'stretch' }}>
        <section style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 16, boxShadow: '0 14px 34px rgba(15,23,42,.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff5b5b', boxShadow: '0 0 10px rgba(255,91,91,.7)' }} />
            <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--tx)' }}>Live Camera</div>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', letterSpacing: 1 }}>switch feeds ↓</span>
          </div>

          {filteredEnabledCameras.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto', paddingBottom: 12 }}>
              {filteredEnabledCameras.map((camera, index) => (
                <button
                  key={camera._id || camera.id || index}
                  type="button"
                  onClick={() => setStreamPage(Math.floor(index / streamsPerPage))}
                  style={{
                    flex: '0 0 auto',
                    height: 30,
                    padding: '0 12px',
                    borderRadius: 8,
                    border: `1px solid ${streamPage === Math.floor(index / streamsPerPage) ? 'rgba(37,99,235,.55)' : 'var(--bd)'}`,
                    background: streamPage === Math.floor(index / streamsPerPage) ? 'linear-gradient(135deg,rgba(11,59,143,.12),rgba(0,184,212,.08))' : 'var(--bg2)',
                    color: streamPage === Math.floor(index / streamsPerPage) ? CHART_COLORS[0] : 'var(--tx2)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00d084' }} />
                  {channelName(camera)}
                </button>
              ))}
            </div>
          )}

          {visibleCameras.length ? (
            <div style={{ position: 'relative', height: 430, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(11,59,143,.35)', background: '#071a3d', display: 'grid', gridTemplateColumns: '1fr', gap: 0, padding: 0 }}>
              {visibleCameras.map((camera, index) => (
                <div key={camera._id || camera.id || index} style={{ position: 'relative', minWidth: 0, minHeight: 0, borderRadius: 0, overflow: 'hidden', background: '#071a3d' }}>
                  <CameraStream
                    channel={camera}
                    camLabel={`LC-${streamPage * streamsPerPage + index + 1}`}
                    minH={0}
                    onMaximize={() => openFullscreenCamera(camera)}
                  />
                  <LineCrossingOverlay camera={camera} fit="cover" />
                </div>
              ))}
              {filteredEnabledCameras.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setStreamPage((page) => (page === 0 ? streamPageCount - 1 : page - 1))}
                    aria-label="Previous camera"
                    style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 40, height: 40, borderRadius: '50%', border: '1px solid rgba(255,255,255,.18)', background: 'rgba(7,26,61,.72)', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer', zIndex: 3, boxShadow: '0 8px 22px rgba(0,0,0,.22)' }}
                  >
                    <ChevronLeft size={21} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setStreamPage((page) => (page >= streamPageCount - 1 ? 0 : page + 1))}
                    aria-label="Next camera"
                    style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', width: 40, height: 40, borderRadius: '50%', border: '1px solid rgba(255,255,255,.18)', background: 'rgba(7,26,61,.72)', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer', zIndex: 3, boxShadow: '0 8px 22px rgba(0,0,0,.22)' }}
                  >
                    <ChevronRight size={21} />
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => openFullscreenCamera(visibleCameras[0])}
                aria-label="Fullscreen camera"
                style={{ position: 'absolute', right: 12, bottom: 12, width: 32, height: 32, borderRadius: 7, border: '1px solid rgba(255,255,255,.18)', background: 'rgba(7,26,61,.78)', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer', zIndex: 4 }}
              >
                <Maximize2 size={15} />
              </button>
            </div>
          ) : (
            <div style={{ height: 260, border: '1px dashed var(--bd)', borderRadius: 10, display: 'grid', placeItems: 'center', color: 'var(--tx3)', fontSize: 12 }}>
              No cameras have Line Crossing enabled.
            </div>
          )}
        </section>

        <SystemControls />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(560px, 1.08fr) minmax(420px, .92fr)', gap: 14, alignItems: 'stretch' }}>
        <section style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 14, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx)' }}>Cumulative Crossings Over Time</div>
              <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>Shows how entry and exit totals build up through the selected period</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>
                {lastRefresh ? `Updated ${moment(lastRefresh).format('HH:mm:ss')}` : 'Not refreshed'}
              </div>
              <button
                type="button"
                onClick={() => setChartModal({
                  title: 'Cumulative Crossings Over Time',
                  sub: 'Shows how entry and exit totals build up through the selected period',
                  children: seriesPoints.length ? <ReactApexChart options={buildChartOptions()} series={chartSeries} type="area" height={560} /> : <div style={{ height: 560, display: 'grid', placeItems: 'center', color: 'var(--tx3)', fontSize: 12 }}>No line crossing time-series data.</div>,
                })}
                style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg2)', color: GRAPH_CARD_ACCENT, display: 'grid', placeItems: 'center', cursor: 'pointer' }}
              >
                <Maximize2 size={14} />
              </button>
            </div>
          </div>
          {seriesPoints.length ? (
            <ReactApexChart options={buildChartOptions()} series={chartSeries} type="area" height={430} />
          ) : (
            <div style={{ height: 430, display: 'grid', placeItems: 'center', color: 'var(--tx3)', fontSize: 12 }}>
              No line crossing time-series data.
            </div>
          )}
        </section>

        {chartShell('Line Crossing Heatmap', 'Darker blocks identify the busiest camera-hour combinations', BarChart3,
          heatmap.series.length && heatmap.hours.length ? (
            <ReactApexChart
              options={buildHeatmapOptions(heatmap.hours)}
              series={heatmap.series}
              type="heatmap"
              height={430}
            />
          ) : (
            <div style={{ height: 430, display: 'grid', placeItems: 'center', color: 'var(--tx3)', fontSize: 12 }}>No heatmap data for the selected dates.</div>
          ),
          () => setChartModal({
            title: 'Line Crossing Heatmap',
            sub: 'Darker blocks identify the busiest camera-hour combinations',
            children: heatmap.series.length && heatmap.hours.length ? (
              <ReactApexChart
                options={buildHeatmapOptions(heatmap.hours)}
                series={heatmap.series}
                type="heatmap"
                height={560}
              />
            ) : <div style={{ height: 560, display: 'grid', placeItems: 'center', color: 'var(--tx3)', fontSize: 12 }}>No heatmap data for the selected dates.</div>,
          }))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
        {chartShell('Camera Wise Crossing Graph', 'Compare which cameras recorded the most entry and exit movement', BarChart3,
          cameraMetrics.length ? (
            <ReactApexChart
              options={buildBarOptions(cameraCategories)}
              series={[
                { name: 'Entry', data: cameraMetrics.map((item) => item.entry) },
                { name: 'Exit', data: cameraMetrics.map((item) => item.exit) },
              ]}
              type="bar"
              height={280}
            />
          ) : (
            <div style={{ height: 280, display: 'grid', placeItems: 'center', color: 'var(--tx3)', fontSize: 12 }}>No camera-wise crossing data.</div>
          ),
          () => setChartModal({
            title: 'Camera Wise Crossing Graph',
            sub: 'Compare which cameras recorded the most entry and exit movement',
            children: cameraMetrics.length ? (
              <ReactApexChart
                options={buildBarOptions(cameraCategories)}
                series={[
                  { name: 'Entry', data: cameraMetrics.map((item) => item.entry) },
                  { name: 'Exit', data: cameraMetrics.map((item) => item.exit) },
                ]}
                type="bar"
                height={560}
              />
            ) : <div style={{ height: 560, display: 'grid', placeItems: 'center', color: 'var(--tx3)', fontSize: 12 }}>No camera-wise crossing data.</div>,
          }))}

        {chartShell('Hourly Traffic', 'Shows the busiest hours for line-crossing activity in the selected range', Activity,
          hourlyTraffic.length ? (
            <ReactApexChart
              options={buildBarOptions(hourlyCategories, { stacked: true })}
              series={[
                { name: 'Entry', data: hourlyTraffic.map((item) => item.entry) },
                { name: 'Exit', data: hourlyTraffic.map((item) => item.exit) },
              ]}
              type="bar"
              height={280}
            />
          ) : (
            <div style={{ height: 280, display: 'grid', placeItems: 'center', color: 'var(--tx3)', fontSize: 12 }}>No hourly traffic data.</div>
          ),
          () => setChartModal({
            title: 'Hourly Traffic',
            sub: 'Shows the busiest hours for line-crossing activity in the selected range',
            children: hourlyTraffic.length ? (
              <ReactApexChart
                options={buildBarOptions(hourlyCategories, { stacked: true })}
                series={[
                  { name: 'Entry', data: hourlyTraffic.map((item) => item.entry) },
                  { name: 'Exit', data: hourlyTraffic.map((item) => item.exit) },
                ]}
                type="bar"
                height={560}
              />
            ) : <div style={{ height: 560, display: 'grid', placeItems: 'center', color: 'var(--tx3)', fontSize: 12 }}>No hourly traffic data.</div>,
          }))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(280px, .85fr)', gap: 14 }}>
        {chartShell('Top Cameras', 'Ranks cameras by total crossings so busy feeds stand out quickly', Trophy,
          topCameras.length ? (
            <ReactApexChart
              options={buildBarOptions(topCameras.map((item) => item.camera), { horizontal: true, distributed: true, colors: TOP_CAMERA_COLORS })}
              series={[{ name: 'Crossings', data: topCameras.map((item) => item.total) }]}
              type="bar"
              height={270}
            />
          ) : (
            <div style={{ height: 270, display: 'grid', placeItems: 'center', color: 'var(--tx3)', fontSize: 12 }}>No top camera data.</div>
          ),
          () => setChartModal({
            title: 'Top Cameras',
            sub: 'Ranks cameras by total crossings so busy feeds stand out quickly',
            children: topCameras.length ? (
              <ReactApexChart
                options={buildBarOptions(topCameras.map((item) => item.camera), { horizontal: true, distributed: true, colors: TOP_CAMERA_COLORS })}
                series={[{ name: 'Crossings', data: topCameras.map((item) => item.total) }]}
                type="bar"
                height={560}
              />
            ) : <div style={{ height: 560, display: 'grid', placeItems: 'center', color: 'var(--tx3)', fontSize: 12 }}>No top camera data.</div>,
          }))}

        {chartShell('Entry / Exit Split', 'Shows the percentage balance between entry and exit crossings', PieChart,
          hasPieData ? (
            <ReactApexChart
              options={buildPieOptions(pieLabels)}
              series={pieSeries}
              type="donut"
              height={270}
            />
          ) : (
            <div style={{ height: 270, display: 'grid', placeItems: 'center', color: 'var(--tx3)', fontSize: 12 }}>No entry or exit crossings for the selected range.</div>
          ),
          () => setChartModal({
            title: 'Entry / Exit Split',
            sub: 'Shows the percentage balance between entry and exit crossings',
            children: hasPieData ? (
              <ReactApexChart
                options={buildPieOptions(pieLabels)}
                series={pieSeries}
                type="donut"
                height={560}
              />
            ) : <div style={{ height: 560, display: 'grid', placeItems: 'center', color: 'var(--tx3)', fontSize: 12 }}>No entry or exit crossings for the selected range.</div>,
          }))}
      </div>

      <section style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '13px 15px', borderBottom: '1px solid var(--bd)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx)' }}>Latest Line Crossing Events</div>
          <span style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{loading ? 'Loading...' : `${latestRecords.length} shown`}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: 'var(--tx3)', textAlign: 'left', background: 'var(--bg2)' }}>
                {['Time', 'Camera', 'NVR', 'Mode', 'Entry', 'Exit', 'Severity'].map((head) => (
                  <th key={head} style={{ padding: '10px 12px', fontWeight: 700, whiteSpace: 'nowrap' }}>{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {latestRecords.map((record) => (
                <tr key={record._id} style={{ borderTop: '1px solid var(--bd)' }}>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: 'var(--tx2)' }}>{moment(record.timeOfIncident || record.createdAt).tz(IST_ZONE).format('DD MMM HH:mm:ss')}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--tx)', fontWeight: 700 }}>{record.channelData?.name || record.channelName || '--'}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--tx2)' }}>{record.nvrData?.nvrName || '--'}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--blue)', fontWeight: 700, textTransform: 'capitalize' }}>{record.type || '--'}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--ok)', fontWeight: 800 }}>{recordEntry(record)}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--crit)', fontWeight: 800 }}>{recordExit(record)}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--tx2)', textTransform: 'capitalize' }}>{record.severity || '--'}</td>
                </tr>
              ))}
              {!latestRecords.length && (
                <tr>
                  <td colSpan={7} style={{ padding: 28, textAlign: 'center', color: 'var(--tx3)' }}>No line crossing logs found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {fullscreenCamera && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: '#020409',
            display: 'flex',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              gridTemplateColumns: `repeat(${fullscreenGridColumns}, minmax(0, 1fr))`,
              gridAutoRows: 'minmax(0, 1fr)',
              gap: fullscreenGridSize === 1 ? 0 : 8,
              padding: fullscreenGridSize === 1 ? 0 : 12,
              background: '#020409',
            }}
          >
              {fullscreenVisibleCameras.map((camera, index) => (
                <div
                  key={camera._id || camera.id || index}
                style={{
                  minWidth: 0,
                  minHeight: 0,
                  position: 'relative',
                  borderRadius: fullscreenGridSize === 1 ? 0 : 10,
                  overflow: 'hidden',
                  border: fullscreenGridSize === 1 ? 0 : '1px solid rgba(255,255,255,.12)',
                  background: '#071a3d',
                }}
              >
                <CameraStream
                  channel={camera}
                  camLabel={channelName(camera)}
                  rounded={fullscreenGridSize !== 1}
                  fit="contain"
                  minH={0}
                  isFullscreen
                  enableFullscreenZoom
                  zoomToolbarStyle={{ top: 8, right: 104 }}
                >
                  <LineCrossingOverlay camera={camera} />
                </CameraStream>
              </div>
            ))}
          </div>
          <div
            style={{
              position: 'absolute',
              top: 16,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: 6,
              borderRadius: 11,
              border: '1px solid rgba(255,255,255,.14)',
              background: 'rgba(6,8,13,.76)',
              backdropFilter: 'blur(10px)',
            }}
          >
            {availableFullscreenGridOptions.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => {
                  setFullscreenGridSize(size);
                  setFullscreenPage(0);
                  setFullscreenCamera(filteredEnabledCameras[0] || fullscreenCamera);
                }}
                style={{
                  height: 28,
                  minWidth: 38,
                  borderRadius: 8,
                  border: `1px solid ${fullscreenGridSize === size ? 'rgba(96,165,250,.8)' : 'rgba(255,255,255,.16)'}`,
                  background: fullscreenGridSize === size ? 'rgba(37,99,235,.95)' : 'rgba(15,23,42,.72)',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 850,
                  cursor: 'pointer',
                }}
              >
                {size}x{size}
              </button>
            ))}
            {filteredEnabledCameras.length > 1 && (
              <span style={{ padding: '0 6px', color: 'rgba(226,232,240,.76)', fontSize: 11, fontWeight: 800 }}>
                {fullscreenPage + 1}/{fullscreenPageCount}
              </span>
            )}
          </div>
          {filteredEnabledCameras.length > fullscreenStreamsPerPage && (
            <>
              <button
                type="button"
                onClick={() => goToFullscreenPage(fullscreenPage - 1)}
                aria-label="Previous fullscreen cameras"
                style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: '50%', border: '1px solid rgba(255,255,255,.18)', background: 'rgba(7,26,61,.72)', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer', zIndex: 4, boxShadow: '0 10px 28px rgba(0,0,0,.3)' }}
              >
                <ChevronLeft size={23} />
              </button>
              <button
                type="button"
                onClick={() => goToFullscreenPage(fullscreenPage + 1)}
                aria-label="Next fullscreen cameras"
                style={{ position: 'absolute', right: 68, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: '50%', border: '1px solid rgba(255,255,255,.18)', background: 'rgba(7,26,61,.72)', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer', zIndex: 4, boxShadow: '0 10px 28px rgba(0,0,0,.3)' }}
              >
                <ChevronRight size={23} />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setFullscreenCamera(null)}
            aria-label="Close fullscreen"
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              width: 36,
              height: 36,
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,.18)',
              background: 'rgba(6,8,13,.72)',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
              zIndex: 3,
            }}
          >
            <X size={18} />
          </button>
          <div
            style={{
              position: 'absolute',
              left: logPanelPosition.x,
              top: logPanelPosition.y,
              zIndex: 3,
              width: LOG_PANEL_WIDTH,
              maxWidth: 'calc(100vw - 36px)',
              background: 'rgba(107,114,128,.78)',
              border: '1px solid rgba(255,255,255,.16)',
              backdropFilter: 'blur(12px)',
              borderRadius: 14,
              padding: 12,
              boxShadow: '0 18px 42px rgba(0,0,0,.32)',
            }}
          >
            <div
              onPointerDown={startLogPanelDrag}
              onPointerMove={moveLogPanel}
              onPointerUp={stopLogPanelDrag}
              onPointerCancel={stopLogPanelDrag}
              style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f8fafc', fontSize: 11, fontWeight: 800, marginBottom: 10, cursor: 'grab', userSelect: 'none', touchAction: 'none' }}
            >
              <Move size={13} />
              Live Logs
            </div>
            <button
              type="button"
              onClick={() => setDetailsOpen((prev) => !prev)}
              aria-expanded={detailsOpen}
              style={{ width: '100%', border: 0, background: 'rgba(9,13,24,.92)', borderRadius: 9, padding: '12px 13px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
            >
              Detection Details
              {detailsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
            <div className="hide-scrollbar" style={{ marginTop: detailsOpen ? 10 : 0, background: 'rgba(37,43,66,.92)', borderRadius: 10, padding: detailsOpen ? 10 : '0 10px', color: '#fff', maxHeight: detailsOpen ? 360 : 0, opacity: detailsOpen ? 1 : 0, overflowY: detailsOpen ? 'auto' : 'hidden', overflowX: 'hidden', msOverflowStyle: 'none', scrollbarWidth: 'none', transition: 'max-height .18s ease, opacity .18s ease, margin-top .18s ease, padding .18s ease' }}>
              {fullscreenLogItems.length ? fullscreenLogItems.map(({ camera, data }) => {
                const logKey = channelKey(camera);
                const logOpen = !collapsedFullscreenLogs[logKey];
                return (
                  <div key={`fullscreen-log-${logKey}`} style={{ padding: 0, marginBottom: 10, borderRadius: 10, background: 'rgba(31,36,59,.82)', border: '1px solid rgba(255,255,255,.08)', overflow: 'hidden' }}>
                    <button
                      type="button"
                      onClick={() => setCollapsedFullscreenLogs((prev) => ({ ...prev, [logKey]: !prev[logKey] }))}
                      aria-expanded={logOpen}
                      style={{ width: '100%', border: 0, background: 'transparent', color: '#fff', padding: '10px', display: 'flex', gap: 10, cursor: 'pointer', textAlign: 'left' }}
                    >
                      <span style={{ width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center', border: '1px solid rgba(249,115,22,.55)', color: '#fb923c', background: 'rgba(249,115,22,.12)', flexShrink: 0 }}>
                        <GitBranch size={17} />
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 900, minWidth: 0 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 8px #f59e0b', flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {data?.incidentName || 'Line crossing detected'}
                          </span>
                        </div>
                        <div style={{ marginTop: 5, color: 'rgba(226,232,240,.82)', fontSize: 11, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {channelName(camera)}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, color: 'rgba(226,232,240,.68)', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700 }}>
                          <Clock3 size={12} />
                          {data?.timeOfIncident ? moment(data.timeOfIncident).tz(IST_ZONE).format('HH:mm:ss') : '--'}
                        </div>
                      </div>
                      <span style={{ width: 24, height: 24, borderRadius: 7, display: 'grid', placeItems: 'center', background: 'rgba(15,23,42,.55)', color: 'rgba(226,232,240,.9)', flexShrink: 0 }}>
                        {logOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </span>
                    </button>
                    <div style={{ maxHeight: logOpen ? 92 : 0, opacity: logOpen ? 1 : 0, overflow: 'hidden', transition: 'max-height .18s ease, opacity .18s ease' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '0 10px 10px' }}>
                        <div style={{ background: 'rgba(15,23,42,.55)', borderRadius: 8, padding: '8px 9px' }}>
                          <div style={{ fontSize: 9.5, color: 'rgba(226,232,240,.58)', fontWeight: 800, textTransform: 'uppercase' }}>Total Entry</div>
                          <div style={{ marginTop: 3, color: '#22c55e', fontSize: 16, fontWeight: 900 }}>{recordEntry(data)}</div>
                        </div>
                        <div style={{ background: 'rgba(15,23,42,.55)', borderRadius: 8, padding: '8px 9px' }}>
                          <div style={{ fontSize: 9.5, color: 'rgba(226,232,240,.58)', fontWeight: 800, textTransform: 'uppercase' }}>Total Exit</div>
                          <div style={{ marginTop: 3, color: '#ef4444', fontSize: 16, fontWeight: 900 }}>{recordExit(data)}</div>
                        </div>
                        <div style={{ background: 'rgba(15,23,42,.55)', borderRadius: 8, padding: '8px 9px' }}>
                          <div style={{ fontSize: 9.5, color: 'rgba(226,232,240,.58)', fontWeight: 800, textTransform: 'uppercase' }}>Total Present</div>
                          <div style={{ marginTop: 3, color: '#60a5fa', fontSize: 16, fontWeight: 900 }}>{Math.max(recordEntry(data) - recordExit(data), 0)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }) : (
                <div style={{ padding: 14, color: 'rgba(226,232,240,.72)', fontSize: 12, textAlign: 'center' }}>
                  No line crossing logs for visible cameras.
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
      {resetModalOpen && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: 'fixed', inset: 0, zIndex: 10015, background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(6px)', display: 'grid', placeItems: 'center', padding: 24 }}
          onClick={() => setResetModalOpen(false)}
        >
          <section
            onClick={(event) => event.stopPropagation()}
            style={{ width: 'min(520px, 94vw)', background: 'var(--bg1solid)', border: '1px solid var(--bd)', borderRadius: 14, padding: 16, boxShadow: '0 24px 70px rgba(0,0,0,.32)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'rgba(124,58,237,.12)', color: '#7c3aed' }}>
                <RefreshCw size={15} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--tx)' }}>Reset Analytics</div>
                <div style={{ marginTop: 2, fontSize: 11, color: 'var(--tx3)' }}>Choose what you want to reset.</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button
                type="button"
                onClick={() => setResetTarget('date')}
                style={{ width: '100%', border: `1px solid ${resetTarget === 'date' ? 'rgba(124,58,237,.55)' : 'var(--bd)'}`, background: resetTarget === 'date' ? 'rgba(124,58,237,.1)' : 'var(--bg2)', color: 'var(--tx)', borderRadius: 10, padding: '12px 13px', textAlign: 'left', cursor: 'pointer' }}
              >
                <span style={{ display: 'block', fontSize: 13, fontWeight: 850 }}>Reset by date</span>
                <span style={{ display: 'block', marginTop: 3, fontSize: 11, color: 'var(--tx3)' }}>Use selected date range only.</span>
              </button>
              <button
                type="button"
                onClick={() => setResetTarget('camera')}
                style={{ width: '100%', border: `1px solid ${resetTarget === 'camera' ? 'rgba(124,58,237,.55)' : 'var(--bd)'}`, background: resetTarget === 'camera' ? 'rgba(124,58,237,.1)' : 'var(--bg2)', color: 'var(--tx)', borderRadius: 10, padding: '12px 13px', textAlign: 'left', cursor: 'pointer' }}
              >
                <span style={{ display: 'block', fontSize: 13, fontWeight: 850 }}>Reset by NVR & camera</span>
                <span style={{ display: 'block', marginTop: 3, fontSize: 11, color: 'var(--tx3)' }}>Use date, NVR and camera.</span>
              </button>
            </div>
            <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
              <div>
                <div style={{ marginBottom: 6, fontSize: 11, fontWeight: 800, color: 'var(--tx2)' }}>Date range</div>
                <DateRangePicker
                  startDate={resetDraft.startDate ? moment.tz(resetDraft.startDate, IST_ZONE).toDate() : null}
                  endDate={resetDraft.endDate ? moment.tz(resetDraft.endDate, IST_ZONE).toDate() : null}
                  onRangeChange={({ start, end }) => setResetDraft((prev) => ({
                    ...prev,
                    startDate: start ? moment(start).tz(IST_ZONE).format('YYYY-MM-DD') : '',
                    endDate: end ? moment(end).tz(IST_ZONE).format('YYYY-MM-DD') : '',
                  }))}
                />
              </div>
              {resetTarget === 'camera' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <div style={{ marginBottom: 6, fontSize: 11, fontWeight: 800, color: 'var(--tx2)' }}>NVR</div>
                    <MultiSelect
                      options={nvrOptions}
                      value={resetDraft.nvrIds}
                      onChange={(next) => setResetDraft((prev) => ({ ...prev, nvrIds: next, cameraIds: next.length ? prev.cameraIds : [] }))}
                      placeholder="Select NVR"
                      searchPlaceholder="Search NVR..."
                      msg="No NVRs found"
                      maxHeight="max-h-[190px]"
                      tint="#0b3b8f"
                    />
                  </div>
                  <div>
                    <div style={{ marginBottom: 6, fontSize: 11, fontWeight: 800, color: 'var(--tx2)' }}>Camera</div>
                    <MultiSelect
                      options={resetCameraOptions}
                      value={resetDraft.cameraIds}
                      onChange={(next) => setResetDraft((prev) => ({ ...prev, cameraIds: next }))}
                      placeholder="Select Camera"
                      searchPlaceholder="Search camera..."
                      msg="No cameras found"
                      maxHeight="max-h-[190px]"
                      tint="#2563eb"
                    />
                  </div>
                </div>
              )}
            </div>
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                style={{ height: 34, padding: '0 14px', borderRadius: 9, border: '1px solid var(--bd)', background: 'transparent', color: 'var(--tx2)', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resettingAnalytics}
                onClick={() => resetAnalytics(resetTarget)}
                style={{ height: 34, padding: '0 15px', borderRadius: 9, border: '1px solid rgba(124,58,237,.35)', background: 'linear-gradient(135deg,#5b6df6,#b935f2)', color: '#fff', fontSize: 12, fontWeight: 900, cursor: resettingAnalytics ? 'wait' : 'pointer', opacity: resettingAnalytics ? 0.7 : 1 }}
              >
                {resettingAnalytics ? 'Resetting...' : 'Apply'}
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )}
      {chartModal && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: 'fixed', inset: 0, zIndex: 10020, background: 'rgba(15,23,42,.62)', backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', padding: 24 }}
          onClick={() => setChartModal(null)}
        >
          <section
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(1120px, 96vw)',
              maxHeight: '90vh',
              overflow: 'auto',
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 14,
              padding: 18,
              boxShadow: '0 24px 70px rgba(0,0,0,.35)',
              color: '#0f172a',
              '--bg1': '#fff',
              '--bg2': '#f8fafc',
              '--bd': '#e2e8f0',
              '--tx': '#0f172a',
              '--tx2': '#475569',
              '--tx3': '#94a3b8',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--tx)' }}>{chartModal.title}</div>
                <div style={{ marginTop: 3, fontSize: 12, color: 'var(--tx3)' }}>{chartModal.sub}</div>
              </div>
              <button
                type="button"
                onClick={() => setChartModal(null)}
                aria-label="Close chart fullscreen"
                style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid var(--bd)', background: 'var(--bg2)', color: 'var(--tx2)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
              >
                <X size={17} />
              </button>
            </div>
            {chartModal.children}
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}
