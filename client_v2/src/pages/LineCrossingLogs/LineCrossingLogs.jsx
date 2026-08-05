import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactApexChart from 'react-apexcharts';
import moment from 'moment-timezone';
import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, Camera, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3, GitBranch, Maximize2, Move, PieChart, RefreshCw, Sigma, Trophy, Video, Volume2, VolumeX, X } from 'lucide-react';
import AccessDenied from '@/components/AccessDenied';
import CameraStream from '@/components/CameraStream';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/context/PermissionContext';
import { useSocket } from '@/context/SocketContext';
import { getChannels } from '@/helpers/configure';
import { fetchIncidentLogs } from '@/pages/IncidentLogs/Api';
import DateRangePicker from '@/pages/AttendanceLogs/components/DateRangePicker';

const IST_ZONE = 'Asia/Kolkata';
const ENDPOINT = '/incidents/logs/line-crossing';
const LOG_PANEL_WIDTH = 315;
const STREAMS_PER_PAGE = 1;
const CHART_COLORS = ['#0b3b8f', '#ff7a1a', '#2563eb', '#ec4899', '#00b8d4', '#7c3aed', '#14b8a6'];
const STAT_COLOR = '#0b3b8f';
const GRAPH_CARD_ACCENT = '#0b3b8f';

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

function statCard(label, value, sub, Icon) {
  const valueIsText = Number.isNaN(Number(value));
  return (
    <div style={{ background: STAT_COLOR, border: '1px solid rgba(255,255,255,.18)', borderRadius: 12, padding: 16, minWidth: 0, boxShadow: '0 12px 28px rgba(11,59,143,.18)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,.68)', fontWeight: 700 }}>{label}</span>
        <span style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.36)', color: '#fff' }}>
          <Icon size={15} />
        </span>
      </div>
      <div style={{ marginTop: 10, fontFamily: 'var(--disp)', fontSize: valueIsText ? 15 : 26, lineHeight: 1.15, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
      <div style={{ marginTop: 5, fontSize: 11, color: 'rgba(255,255,255,.66)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
    </div>
  );
}

function recordCameraName(record) {
  return record?.channelData?.name || record?.channelName || record?.cameraName || record?.channelId?.name || '--';
}

function recordTimestamp(record) {
  return record?.timeOfIncident || record?.createdAt || record?.updatedAt;
}

function recordEntry(record) {
  if (record?.totalEntry != null) return Number(record.totalEntry || 0);
  return (record?.timeSeries || []).reduce((sum, point) => sum + Number(point.entry || 0), 0);
}

function recordExit(record) {
  if (record?.totalExit != null) return Number(record.totalExit || 0);
  return (record?.timeSeries || []).reduce((sum, point) => sum + Number(point.exit || 0), 0);
}

function flattenSeries(records) {
  let runningEntry = 0;
  let runningExit = 0;
  return records
    .flatMap((record) => {
      if (record.timeSeries?.length) {
        return record.timeSeries.map((point) => ({
          timestamp: point.timestamp || recordTimestamp(record),
          entry: Number(point.entry || 0),
          exit: Number(point.exit || 0),
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

function buildBarOptions(categories, { horizontal = false, stacked = false } = {}) {
  return {
    chart: { type: 'bar', toolbar: { show: false }, stacked, animations: { enabled: true, speed: 450 } },
    colors: [CHART_COLORS[0], CHART_COLORS[1], CHART_COLORS[3]],
    plotOptions: {
      bar: { horizontal, borderRadius: 5, columnWidth: '14%', barHeight: '20%' },
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
        shadeIntensity: 0.55,
        colorScale: {
          ranges: [
            { from: 0, to: 0, color: '#eef2ff', name: 'None' },
            { from: 1, to: 3, color: '#dbeafe', name: 'Low' },
            { from: 4, to: 10, color: '#a78bfa', name: 'Medium' },
            { from: 11, to: 9999, color: '#d946ef', name: 'High' },
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

function chartShell(title, sub, Icon, children) {
  return (
    <section style={{ background: 'var(--bg1)', border: '1px solid rgba(11,59,143,.24)', borderTop: `3px solid ${GRAPH_CARD_ACCENT}`, borderRadius: 12, padding: 14, minWidth: 0, boxShadow: '0 12px 28px rgba(11,59,143,.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
        <span style={{ width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'rgba(11,59,143,.1)', color: GRAPH_CARD_ACCENT }}>
          <Icon size={15} />
        </span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx)' }}>{title}</div>
          <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>{sub}</div>
        </div>
      </div>
      {children}
    </section>
  );
}

function lineCrossingDirection(data) {
  const rawType = String(data?.type || data?.count_mode || data?.mode || data?.direction || '').toLowerCase();
  if (rawType.includes('exit')) return 'exit';
  if (rawType.includes('entry')) return 'entry';
  if (Number(data?.exit || data?.totalExit || data?.exitCount || 0) > 0) return 'exit';
  if (Number(data?.entry || data?.totalEntry || data?.entryCount || 0) > 0) return 'entry';
  return 'entry';
}

export default function LineCrossingLogs() {
  const { permissions, loading: permissionsLoading } = usePermissions();
  const { socket } = useSocket();
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [enabledCameras, setEnabledCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [fullscreenCamera, setFullscreenCamera] = useState(null);
  const [socketEventsByChannel, setSocketEventsByChannel] = useState({});
  const [lineAudioMuted, setLineAudioMuted] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [logPanelPosition, setLogPanelPosition] = useState({ x: 18, y: 18 });
  const [streamPage, setStreamPage] = useState(0);
  const [dateFilter, setDateFilter] = useState(() => {
    const today = moment().tz(IST_ZONE).format('YYYY-MM-DD');
    return { startDate: today, endDate: today };
  });
  const lineAudioMutedRef = useRef(true);
  const audioContextRef = useRef(null);
  const dragRef = useRef(null);

  const canView = canViewLineCrossing(permissions);

  useEffect(() => {
    lineAudioMutedRef.current = lineAudioMuted;
  }, [lineAudioMuted]);

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

  const handleToggleLineAudio = useCallback(() => {
    setLineAudioMuted((prev) => {
      const next = !prev;
      if (!next) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext && !audioContextRef.current) audioContextRef.current = new AudioContext();
        audioContextRef.current?.resume?.().catch(() => {});
      }
      return next;
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

  const fetchAll = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const [logsRes, channelsRes] = await Promise.all([
        fetchIncidentLogs({
          endpoint: ENDPOINT,
          skip: 0,
          limit: 500,
          startDate: dateFilter.startDate,
          endDate: dateFilter.endDate,
        }),
        getChannels({ skip: 0, limit: 1000 }),
      ]);
      const payload = logsRes?.data?.body?.data;
      setRecords(payload?.data || []);
      setTotalCount(Number(payload?.totalCount || 0));
      setEnabledCameras((channelsRes?.channels || []).filter(enabledLineCrossing).map(streamableChannel));
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, [canView, dateFilter.endDate, dateFilter.startDate]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (dateFilter.startDate && dateFilter.endDate && dateFilter.endDate < dateFilter.startDate) {
      setDateFilter((prev) => ({ ...prev, endDate: prev.startDate }));
    }
  }, [dateFilter.endDate, dateFilter.startDate]);

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(enabledCameras.length / STREAMS_PER_PAGE) - 1);
    setStreamPage((page) => Math.min(page, maxPage));
  }, [enabledCameras.length]);

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
      fetchAll();
    };
    socket.on(eventName, handleDetection);
    return () => socket.off(eventName, handleDetection);
  }, [socket, user?.adminId, canView, fetchAll, playLineCrossingSound]);

  const seriesPoints = useMemo(() => flattenSeries(records), [records]);
  const stats = useMemo(() => {
    const totalEntry = records.reduce((sum, item) => sum + recordEntry(item), 0);
    const totalExit = records.reduce((sum, item) => sum + recordExit(item), 0);
    const activeZones = new Set(records.map((item) => item.zone).filter(Boolean)).size;
    return { totalEntry, totalExit, net: totalEntry - totalExit, activeZones };
  }, [records]);

  const chartSeries = useMemo(() => ([
    { name: 'Entry', data: seriesPoints.map((point) => [new Date(point.timestamp).getTime(), point.entry]) },
    { name: 'Exit', data: seriesPoints.map((point) => [new Date(point.timestamp).getTime(), point.exit]) },
  ]), [seriesPoints]);

  const latestRecords = useMemo(
    () => [...records].sort((a, b) => new Date(b.timeOfIncident || b.updatedAt) - new Date(a.timeOfIncident || a.updatedAt)).slice(0, 10),
    [records],
  );

  const cameraMetrics = useMemo(() => {
    const grouped = new Map();
    records.forEach((record) => {
      const camera = recordCameraName(record);
      const current = grouped.get(camera) || { camera, entry: 0, exit: 0, total: 0 };
      current.entry += recordEntry(record);
      current.exit += recordExit(record);
      current.total = current.entry + current.exit;
      grouped.set(camera, current);
    });
    return [...grouped.values()].sort((a, b) => b.total - a.total);
  }, [records]);

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
    records.forEach((record) => {
      if (record?.timeSeries?.length) {
        record.timeSeries.forEach((point) => addPoint(point.timestamp || recordTimestamp(record), point.entry, point.exit));
      } else {
        addPoint(recordTimestamp(record), recordEntry(record), recordExit(record));
      }
    });
    return [...grouped.values()].sort((a, b) => a.hour.localeCompare(b.hour));
  }, [records]);

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
    records.forEach((record) => {
      const camera = recordCameraName(record);
      if (record?.timeSeries?.length) {
        record.timeSeries.forEach((point) => addPoint(camera, point.timestamp || recordTimestamp(record), point.entry, point.exit));
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
  }, [cameraMetrics, hourlyTraffic, records]);

  const streamPageCount = Math.max(1, Math.ceil(enabledCameras.length / STREAMS_PER_PAGE));
  const visibleCameras = enabledCameras.slice(streamPage * STREAMS_PER_PAGE, (streamPage + 1) * STREAMS_PER_PAGE);
  const cameraCategories = cameraMetrics.map((item) => item.camera);
  const hourlyCategories = hourlyTraffic.map((item) => item.hour);
  const topCameras = cameraMetrics.slice(0, 5);
  const highestCamera = cameraMetrics[0] || null;
  const lowestCamera = cameraMetrics.length ? cameraMetrics[cameraMetrics.length - 1] : null;
  const pieLabels = stats.totalEntry || stats.totalExit ? ['Entry', 'Exit'] : ['No crossings'];
  const pieSeries = stats.totalEntry || stats.totalExit ? [stats.totalEntry, stats.totalExit] : [1];

  const fullscreenChannelId = fullscreenCamera?._id || fullscreenCamera?.id || fullscreenCamera?.channelId;
  const fullscreenSocketEvent = fullscreenChannelId ? socketEventsByChannel[String(fullscreenChannelId)] : null;
  const fullscreenApiRecord = fullscreenChannelId
    ? records.find((record) => String(record.channelId || record.channelData?._id || record.cameraId) === String(fullscreenChannelId))
    : null;
  const fullscreenOverlay = fullscreenSocketEvent || fullscreenApiRecord;

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
            onClick={handleToggleLineAudio}
            aria-label={lineAudioMuted ? 'Unmute line crossing detection audio' : 'Mute line crossing detection audio'}
            title={lineAudioMuted ? 'Unmute line crossing detection audio' : 'Mute line crossing detection audio'}
            style={{ height: 34, padding: '0 13px', borderRadius: 8, border: `1px solid ${lineAudioMuted ? '#ef4444' : '#22c55e'}`, background: lineAudioMuted ? '#ef4444' : '#22c55e', color: '#fff', display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 800, cursor: 'pointer', boxShadow: lineAudioMuted ? '0 8px 18px rgba(239,68,68,.18)' : '0 8px 18px rgba(34,197,94,.18)' }}
          >
            {lineAudioMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            {lineAudioMuted ? 'Muted' : 'Unmuted'}
          </button>
          <button
            type="button"
            onClick={fetchAll}
            disabled={loading}
            style={{ height: 34, padding: '0 13px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg1)', color: 'var(--tx2)', display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, cursor: loading ? 'wait' : 'pointer' }}
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 12 }}>
        {statCard('Total Logs', totalCount, 'Events returned for the selected date range', Activity)}
        {statCard('Enabled Cameras', enabledCameras.length, 'Cameras configured for line crossing', Camera)}
        {statCard('Entries', stats.totalEntry, 'People counted entering across all lines', ArrowUpRight)}
        {statCard('Exits', stats.totalExit, 'People counted exiting across all lines', ArrowDownRight)}
        {statCard('Highest Camera Count', highestCamera?.camera || '--', highestCamera ? `${highestCamera.entry} entry / ${highestCamera.exit} exit` : 'No camera activity in this range', Trophy)}
        {statCard('Lowest Camera Count', lowestCamera?.camera || '--', lowestCamera ? `${lowestCamera.entry} entry / ${lowestCamera.exit} exit` : 'No camera activity in this range', Sigma)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(520px, 1.08fr) minmax(420px, .92fr)', gap: 14, alignItems: 'stretch' }}>
        <section style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 16, boxShadow: '0 14px 34px rgba(15,23,42,.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff5b5b', boxShadow: '0 0 10px rgba(255,91,91,.7)' }} />
            <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--tx)' }}>Live Camera</div>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', letterSpacing: 1 }}>switch feeds ↓</span>
            <button
              type="button"
              onClick={() => visibleCameras[0] && setFullscreenCamera(visibleCameras[0])}
              disabled={!visibleCameras[0]}
              style={{ marginLeft: 'auto', border: 0, background: 'transparent', color: CHART_COLORS[2], fontSize: 12, fontWeight: 800, cursor: visibleCameras[0] ? 'pointer' : 'not-allowed', opacity: visibleCameras[0] ? 1 : 0.45 }}
            >
              Open full view →
            </button>
          </div>

          {enabledCameras.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto', paddingBottom: 12 }}>
              {enabledCameras.map((camera, index) => (
                <button
                  key={camera._id || camera.id || index}
                  type="button"
                  onClick={() => setStreamPage(index)}
                  style={{
                    flex: '0 0 auto',
                    height: 30,
                    padding: '0 12px',
                    borderRadius: 8,
                    border: `1px solid ${streamPage === index ? 'rgba(37,99,235,.55)' : 'var(--bd)'}`,
                    background: streamPage === index ? 'linear-gradient(135deg,rgba(11,59,143,.12),rgba(0,184,212,.08))' : 'var(--bg2)',
                    color: streamPage === index ? CHART_COLORS[0] : 'var(--tx2)',
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

          {visibleCameras[0] ? (
            <div style={{ position: 'relative', height: 430, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(11,59,143,.35)', background: '#071a3d' }}>
              <CameraStream
                channel={visibleCameras[0]}
                camLabel={`LC-${streamPage + 1}`}
                minH={430}
                onMaximize={() => setFullscreenCamera(visibleCameras[0])}
              />
              {enabledCameras.length > 1 && (
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
                onClick={() => setFullscreenCamera(visibleCameras[0])}
                aria-label="Open full view"
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

        <section style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 14, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx)' }}>Cumulative Crossings Over Time</div>
              <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>Shows how entry and exit totals build up through the selected period</div>
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>
              {lastRefresh ? `Updated ${moment(lastRefresh).format('HH:mm:ss')}` : 'Not refreshed'}
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
          ))}

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
          ))}
      </div>

      {chartShell('Line Crossing Heatmap', 'Darker blocks identify the busiest camera-hour combinations', BarChart3,
        heatmap.series.length && heatmap.hours.length ? (
          <ReactApexChart
            options={buildHeatmapOptions(heatmap.hours)}
            series={heatmap.series}
            type="heatmap"
            height={300}
          />
        ) : (
          <div style={{ height: 300, display: 'grid', placeItems: 'center', color: 'var(--tx3)', fontSize: 12 }}>No heatmap data for the selected dates.</div>
        ))}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(280px, .85fr)', gap: 14 }}>
        {chartShell('Top Cameras', 'Ranks cameras by total crossings so busy feeds stand out quickly', Trophy,
          topCameras.length ? (
            <ReactApexChart
              options={buildBarOptions(topCameras.map((item) => item.camera), { horizontal: true })}
              series={[{ name: 'Crossings', data: topCameras.map((item) => item.total) }]}
              type="bar"
              height={270}
            />
          ) : (
            <div style={{ height: 270, display: 'grid', placeItems: 'center', color: 'var(--tx3)', fontSize: 12 }}>No top camera data.</div>
          ))}

        {chartShell('Entry / Exit Split', 'Shows the percentage balance between entry and exit crossings', PieChart,
          <ReactApexChart
            options={buildPieOptions(pieLabels)}
            series={pieSeries}
            type="donut"
            height={270}
          />)}
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
                  <td style={{ padding: '10px 12px', color: 'var(--ok)', fontWeight: 800 }}>{Number(record.totalEntry || 0)}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--crit)', fontWeight: 800 }}>{Number(record.totalExit || 0)}</td>
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
          <CameraStream
            channel={fullscreenCamera}
            camLabel={channelName(fullscreenCamera)}
            rounded={false}
            fit="contain"
            minH={window.innerHeight}
            isFullscreen
            onMaximize={() => setFullscreenCamera(null)}
          />
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
            <div style={{ marginTop: detailsOpen ? 10 : 0, background: 'rgba(37,43,66,.92)', borderRadius: 10, padding: detailsOpen ? 12 : '0 12px', color: '#fff', maxHeight: detailsOpen ? 180 : 0, opacity: detailsOpen ? 1 : 0, overflow: 'hidden', transition: 'max-height .18s ease, opacity .18s ease, margin-top .18s ease, padding .18s ease' }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <span style={{ width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center', border: '1px solid rgba(249,115,22,.55)', color: '#fb923c', background: 'rgba(249,115,22,.12)', flexShrink: 0 }}>
                  <GitBranch size={17} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 900, minWidth: 0 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 8px #f59e0b', flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fullscreenOverlay?.incidentName || 'Line crossing detected'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, color: 'rgba(226,232,240,.68)', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700 }}>
                    <Clock3 size={12} />
                    {fullscreenOverlay?.timeOfIncident ? moment(fullscreenOverlay.timeOfIncident).tz(IST_ZONE).format('HH:mm:ss') : '--'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                <div style={{ background: 'rgba(15,23,42,.55)', borderRadius: 8, padding: '8px 9px' }}>
                  <div style={{ fontSize: 9.5, color: 'rgba(226,232,240,.58)', fontWeight: 800, textTransform: 'uppercase' }}>Total Entry</div>
                  <div style={{ marginTop: 3, color: '#22c55e', fontSize: 16, fontWeight: 900 }}>{Number(fullscreenOverlay?.totalEntry || 0)}</div>
                </div>
                <div style={{ background: 'rgba(15,23,42,.55)', borderRadius: 8, padding: '8px 9px' }}>
                  <div style={{ fontSize: 9.5, color: 'rgba(226,232,240,.58)', fontWeight: 800, textTransform: 'uppercase' }}>Total Exit</div>
                  <div style={{ marginTop: 3, color: '#ef4444', fontSize: 16, fontWeight: 900 }}>{Number(fullscreenOverlay?.totalExit || 0)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
