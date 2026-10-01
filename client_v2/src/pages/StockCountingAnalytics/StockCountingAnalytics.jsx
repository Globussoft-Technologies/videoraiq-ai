import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactApexChart from 'react-apexcharts';
import moment from 'moment-timezone';
import {
  Boxes,
  BrainCircuit,
  ChevronDown,
  Clock3,
  Loader2,
  PackageCheck,
  PackageOpen,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Truck,
} from 'lucide-react';
import { usePermissions } from '@/context/PermissionContext';
import AccessDenied from '@/components/AccessDenied';
import PresetDateRangePicker from '@/components/PresetDateRangePicker';
import ImagePreviewModal from '@/pages/ANPRLogs/components/ImagePreviewModal';
import IncidentFilterPopover from '@/pages/IncidentLogs/components/IncidentFilterPopover';
import {
  fetchIncidentBoxTypes,
  fetchIncidentLogs,
  fetchIncidentVehicleNumbers,
  fetchStockCountingAnalytics,
  getNVRs,
  getchannels,
} from '@/pages/IncidentLogs/Api';

const VEHICLE_ENDPOINT = '/incidents/logs/loading-unloading-stock-counting-detection/numbers';
const BOX_TYPE_ENDPOINT = '/incidents/logs/loading-unloading-stock-counting-detection/box-types';
const number = (value) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(value || 0);
const titleCase = (value) => String(value || 'Unknown').replace(/\b\w/g, (letter) => letter.toUpperCase());
const STAT_CARD_WAVE = [0.12, 0.05, 0.18, 0.58, 0.76, 0.55, 0.28, 0.22, 0.48, 0.76, 0.9];
const incidentImageUrl = (value) => {
  if (!value) return '';
  const image = String(value).trim();
  if (/^(https?:|data:|blob:)/i.test(image)) return image;
  return `${import.meta.env.VITE_INCIDENT_URL || ''}${image}`;
};
const stockEventImageKey = (boxType, event, index) => (
  `${boxType}:${event?._id || event?.eventId || index}`
);
const statCardSpark = (values, fallbackValue) => {
  const points = (Array.isArray(values) ? values : [])
    .map(Number)
    .filter(Number.isFinite);
  if (points.length > 1 && points.some((point) => point !== points[0])) return points;

  const base = Number(fallbackValue) || 0;
  const amplitude = Math.max(Math.abs(base) * 0.2, 1);
  return STAT_CARD_WAVE.map((point) => Math.max(0, base + ((point - 0.4) * amplitude)));
};

const initialAnalytics = {
  summary: {},
  trends: [],
  boxTypes: [],
  topVehicles: [],
  hourlyActivity: [],
  insights: [],
};

const StockCountingAnalytics = () => {
  const navigate = useNavigate();
  const { permissions, loading: permissionsLoading } = usePermissions();
  const [startDate, setStartDate] = useState(moment().subtract(29, 'days').format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState(moment().format('YYYY-MM-DD'));
  const [nvrList, setNvrList] = useState([]);
  const [cameraList, setCameraList] = useState([]);
  const [nvrIds, setNvrIds] = useState([]);
  const [channelIds, setChannelIds] = useState([]);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [vehicleNumberList, setVehicleNumberList] = useState([]);
  const [vehicleNumberSearch, setVehicleNumberSearch] = useState('');
  const [boxType, setBoxType] = useState('');
  const [boxTypeList, setBoxTypeList] = useState([]);
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedBoxTypes, setExpandedBoxTypes] = useState(() => new Set());
  const [boxTypeEventRows, setBoxTypeEventRows] = useState({});
  const [boxTypeEventLoading, setBoxTypeEventLoading] = useState({});
  const [boxTypeEventErrors, setBoxTypeEventErrors] = useState({});
  const [previewImageKey, setPreviewImageKey] = useState('');
  const [previewImageLoading, setPreviewImageLoading] = useState(false);

  const logs = permissions?.logs;
  const canView = typeof logs?.stockCountingLogs?.view === 'boolean'
    ? logs.stockCountingLogs.view
    : typeof logs?.global?.view === 'boolean'
      ? logs.global.view
      : Boolean(logs?.view);

  useEffect(() => {
    getNVRs()
      .then((res) => setNvrList(res?.data?.body?.data || []))
      .catch(() => setNvrList([]));
  }, []);

  useEffect(() => {
    getchannels({ nvrIds })
      .then((res) => setCameraList(res?.data?.body?.data || []))
      .catch(() => setCameraList([]));
  }, [nvrIds]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchIncidentVehicleNumbers({
        endpoint: VEHICLE_ENDPOINT,
        search: vehicleNumberSearch,
        startDate,
        endDate,
        nvrIds,
        channelIds,
      })
        .then((res) => setVehicleNumberList(res?.data?.body?.data?.vehicleNumbers || []))
        .catch(() => setVehicleNumberList([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [vehicleNumberSearch, startDate, endDate, nvrIds, channelIds]);

  useEffect(() => {
    fetchIncidentBoxTypes({
      endpoint: BOX_TYPE_ENDPOINT,
      startDate,
      endDate,
      nvrIds,
      channelIds,
      vehicleNumber,
    })
      .then((res) => setBoxTypeList(res?.data?.body?.data?.boxTypes || []))
      .catch(() => setBoxTypeList([]));
  }, [startDate, endDate, nvrIds, channelIds, vehicleNumber]);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchStockCountingAnalytics({
        startDate,
        endDate,
        nvrIds,
        channelIds,
        vehicleNumber,
        boxType,
      });
      setAnalytics({ ...initialAnalytics, ...(res?.data?.body?.data || {}) });
    } catch (err) {
      setError(err);
      setAnalytics(initialAnalytics);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, nvrIds, channelIds, vehicleNumber, boxType]);

  useEffect(() => {
    if (canView) loadAnalytics();
  }, [canView, loadAnalytics, refreshKey]);

  useEffect(() => {
    setExpandedBoxTypes(new Set());
    setBoxTypeEventRows({});
    setBoxTypeEventLoading({});
    setBoxTypeEventErrors({});
  }, [startDate, endDate, nvrIds, channelIds, vehicleNumber, boxType]);

  const toggleBoxType = useCallback(async (selectedBoxType) => {
    const isExpanded = expandedBoxTypes.has(selectedBoxType);
    setExpandedBoxTypes((current) => {
      const next = new Set(current);
      if (next.has(selectedBoxType)) next.delete(selectedBoxType);
      else next.add(selectedBoxType);
      return next;
    });
    if (isExpanded || boxTypeEventRows[selectedBoxType] || boxTypeEventLoading[selectedBoxType]) return;

    setBoxTypeEventLoading((current) => ({ ...current, [selectedBoxType]: true }));
    setBoxTypeEventErrors((current) => ({ ...current, [selectedBoxType]: '' }));
    try {
      const response = await fetchIncidentLogs({
        endpoint: '/incidents/logs/loading-unloading-stock-counting-detection',
        skip: 0,
        limit: 10000,
        startDate,
        endDate,
        nvrIds,
        channelIds,
        vehicleNumber,
        boxType: selectedBoxType,
        sortField: 'timeOfIncident',
        sortOrder: 'desc',
      });
      const groupedRows = response?.data?.body?.data?.data || [];
      const events = groupedRows
        .flatMap((row) => (row.events || []).map((event) => ({
          ...event,
          vehicleNumber: String(row.vehicleNumber || '').trim() || 'Unknown',
        })))
        .sort((left, right) => new Date(right.timeOfIncident) - new Date(left.timeOfIncident));
      setBoxTypeEventRows((current) => ({ ...current, [selectedBoxType]: events }));
    } catch (fetchError) {
      console.error(`Failed to fetch ${selectedBoxType} stock movements:`, fetchError);
      setBoxTypeEventErrors((current) => ({
        ...current,
        [selectedBoxType]: 'Unable to load movements for this box type.',
      }));
    } finally {
      setBoxTypeEventLoading((current) => ({ ...current, [selectedBoxType]: false }));
    }
  }, [expandedBoxTypes, boxTypeEventRows, boxTypeEventLoading, startDate, endDate, nvrIds, channelIds, vehicleNumber]);

  const nvrOptions = useMemo(
    () => nvrList.map((item) => ({ label: item.nvrName, id: item._id || item.id })),
    [nvrList],
  );
  const cameraOptions = useMemo(
    () => cameraList.map((item) => ({ label: item.customName || item.name, id: item._id || item.id })),
    [cameraList],
  );
  const boxTypeOptions = useMemo(
    () => boxTypeList.map((value) => ({ value, label: titleCase(value) })),
    [boxTypeList],
  );

  // Keep every image currently shown in the expanded performance rows in one
  // ordered gallery. This lets the modal arrows and Left/Right keys move
  // naturally through the same top-to-bottom order visible in the table.
  const performanceImageSlots = useMemo(() => {
    const slots = [];
    analytics.boxTypes.forEach((item) => {
      const rowKey = item.boxType || 'unknown';
      if (!expandedBoxTypes.has(rowKey)) return;
      (boxTypeEventRows[rowKey] || []).forEach((event, eventIndex) => {
        const url = incidentImageUrl(event.Image);
        if (!url) return;
        slots.push({
          key: stockEventImageKey(rowKey, event, eventIndex),
          url,
        });
      });
    });
    return slots;
  }, [analytics.boxTypes, boxTypeEventRows, expandedBoxTypes]);

  const previewImageIndex = performanceImageSlots.findIndex((slot) => slot.key === previewImageKey);
  const previewImage = previewImageIndex >= 0 ? performanceImageSlots[previewImageIndex] : null;

  const movePreview = useCallback((offset) => {
    if (previewImageIndex < 0) return;
    const nextIndex = previewImageIndex + offset;
    if (nextIndex < 0 || nextIndex >= performanceImageSlots.length) return;
    setPreviewImageLoading(true);
    setPreviewImageKey(performanceImageSlots[nextIndex].key);
  }, [performanceImageSlots, previewImageIndex]);

  const summary = analytics.summary || {};
  const kpis = [
    {
      label: 'Loaded Boxes',
      value: summary.loadedBoxes,
      note: `${number(summary.loadingEvents)} loading events`,
      icon: PackageCheck,
      color: '#10b981',
      cardClass: 'border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.09] to-[var(--bg1solid)]',
      iconClass: 'bg-emerald-500/10 text-emerald-500',
      spark: analytics.hourlyActivity.map((item) => item.loaded),
    },
    {
      label: 'Unloaded Boxes',
      value: summary.unloadedBoxes,
      note: `${number(summary.unloadingEvents)} unloading events`,
      icon: PackageOpen,
      color: '#f59e0b',
      cardClass: 'border-amber-500/20 bg-gradient-to-br from-amber-500/[0.09] to-[var(--bg1solid)]',
      iconClass: 'bg-amber-500/10 text-amber-500',
      spark: analytics.hourlyActivity.map((item) => item.unloaded),
    },
    {
      label: 'Total Boxes',
      value: summary.totalBoxes,
      note: `${number(summary.totalEvents)} total events`,
      icon: Boxes,
      color: '#8b5cf6',
      cardClass: 'border-violet-500/20 bg-gradient-to-br from-violet-500/[0.09] to-[var(--bg1solid)]',
      iconClass: 'bg-violet-500/10 text-violet-500',
      spark: analytics.hourlyActivity.map((item) => item.total),
    },
    {
      label: 'Active Vehicles',
      value: summary.totalVehicles,
      note: `${summary.netFlow >= 0 ? '+' : ''}${number(summary.netFlow)} net box flow`,
      icon: Truck,
      color: '#3b82f6',
      cardClass: 'border-blue-500/20 bg-gradient-to-br from-blue-500/[0.09] to-[var(--bg1solid)]',
      iconClass: 'bg-blue-500/10 text-blue-500',
      spark: [summary.totalVehicles, summary.totalVehicles],
    },
  ];

  const sharedChart = useMemo(() => ({
    chart: { toolbar: { show: false }, background: 'transparent', foreColor: 'var(--tx2)', fontFamily: 'var(--ui)' },
    grid: { borderColor: 'var(--bd)', strokeDashArray: 4 },
    dataLabels: { enabled: false },
    tooltip: { theme: false },
    legend: { labels: { colors: 'var(--tx2)' }, fontSize: '11px' },
  }), []);

  const trendOptions = useMemo(() => ({
    ...sharedChart,
    chart: { ...sharedChart.chart, type: 'bar' },
    colors: ['#10b981', '#f59e0b', '#c084fc'],
    plotOptions: { bar: { borderRadius: 2, columnWidth: '64%', dataLabels: { position: 'top' } } },
    dataLabels: {
      enabled: true,
      offsetY: -18,
      style: { fontSize: '10px', fontWeight: 700, colors: ['var(--tx)'] },
      formatter: (value) => number(value),
    },
    xaxis: {
      categories: analytics.trends.map((item) => moment(item.date).format('DD MMM')),
      labels: { style: { colors: 'var(--tx3)', fontSize: '10px' } },
      axisBorder: { color: 'var(--bd)' },
      axisTicks: { show: false },
    },
    yaxis: { min: 0, forceNiceScale: true, labels: { style: { colors: 'var(--tx3)', fontSize: '10px' } } },
    legend: { ...sharedChart.legend, position: 'top', horizontalAlign: 'right', markers: { size: 5 } },
  }), [analytics.trends, sharedChart]);

  const hourlyOptions = useMemo(() => ({
    ...sharedChart,
    colors: ['#10b981', '#f59e0b', '#8b5cf6'],
    plotOptions: { bar: { borderRadius: 3, columnWidth: '58%', dataLabels: { position: 'top' } } },
    dataLabels: {
      enabled: true,
      offsetY: -18,
      style: { fontSize: '10px', fontWeight: 700, colors: ['var(--tx)'] },
      formatter: (value) => number(value),
    },
    xaxis: {
      categories: analytics.hourlyActivity.map((item) => (
        `${String(item.hour).padStart(2, '0')}:00-${String((item.hour + 1) % 24).padStart(2, '0')}:00`
      )),
      labels: { rotate: 0, hideOverlappingLabels: true, style: { colors: 'var(--tx3)', fontSize: '9px' } },
      axisBorder: { color: 'var(--bd)' },
      axisTicks: { show: false },
    },
    yaxis: { min: 0, forceNiceScale: true, labels: { style: { colors: 'var(--tx3)', fontSize: '10px' } } },
    legend: { ...sharedChart.legend, position: 'top', horizontalAlign: 'right', markers: { size: 5 } },
  }), [analytics.hourlyActivity, sharedChart]);

  const boxTypeOptionsChart = useMemo(() => ({
    ...sharedChart,
    labels: analytics.boxTypes.map((item) => titleCase(item.boxType)),
    colors: ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#6366f1'],
    stroke: { colors: ['var(--bg1solid)'], width: 2 },
    dataLabels: { enabled: false },
    plotOptions: {
      pie: {
        donut: {
          size: '68%',
          labels: {
            show: true,
            name: { show: true, color: 'var(--tx2)', fontSize: '11px', offsetY: -5 },
            value: { show: true, color: 'var(--tx)', fontSize: '20px', fontWeight: 800, offsetY: 5 },
            total: { show: true, label: 'Total Boxes', color: 'var(--tx2)', formatter: () => number(summary.totalBoxes) },
          },
        },
      },
    },
    legend: { position: 'bottom', fontSize: '10px', labels: { colors: 'var(--tx2)' }, markers: { size: 5 } },
  }), [analytics.boxTypes, sharedChart, summary.totalBoxes]);

  const vehicleOptions = useMemo(() => ({
    ...sharedChart,
    colors: ['#3b82f6', '#a855f7'],
    plotOptions: { bar: { horizontal: true, borderRadius: 2, barHeight: '52%', dataLabels: { position: 'top' } } },
    dataLabels: {
      enabled: true,
      offsetX: 8,
      style: { fontSize: '10px', fontWeight: 700, colors: ['var(--tx)'] },
      formatter: (value) => number(value),
    },
    xaxis: {
      categories: analytics.topVehicles.map((item) => item.vehicleNumber),
      labels: { style: { colors: 'var(--tx3)', fontSize: '10px' } },
    },
    yaxis: { labels: { style: { colors: 'var(--tx2)', fontWeight: 600, fontSize: '10px' } } },
    legend: { ...sharedChart.legend, position: 'top', horizontalAlign: 'right', markers: { size: 5 } },
  }), [analytics.topVehicles, sharedChart]);

  const sparkOptions = useCallback((color, points) => ({
    chart: { type: 'area', sparkline: { enabled: true }, animations: { enabled: false } },
    colors: [color],
    dataLabels: { enabled: false },
    grid: { show: false, padding: { left: 0, right: 0, top: 2, bottom: 0 } },
    markers: { size: 0 },
    stroke: { curve: 'smooth', width: 2 },
    fill: { type: 'gradient', gradient: { opacityFrom: 0.35, opacityTo: 0.04 } },
    tooltip: { enabled: false },
    // Let each compact chart scale to its own range. Pinning the minimum to
    // zero compresses low-variance data into an almost straight horizontal
    // line instead of the clearly visible wave used by the stat-card design.
    yaxis: { show: false, labels: { show: false }, axisBorder: { show: false }, axisTicks: { show: false } },
    xaxis: {
      categories: points.map((_, index) => index),
      labels: { show: false },
      axisBorder: { show: false },
      axisTicks: { show: false },
      tooltip: { enabled: false },
    },
  }), []);

  if (permissionsLoading) return null;
  if (!canView) return <AccessDenied message="You do not have permission to view stock analytics." onBack={() => navigate(-1)} />;

  return (
    <div className="min-h-full space-y-4 p-3 sm:p-4 lg:p-[22px]">
      <ImagePreviewModal
        previewImage={previewImage?.url}
        imageKey={previewImage?.key}
        loading={previewImageLoading}
        setLoading={setPreviewImageLoading}
        hasPrevious={previewImageIndex > 0}
        hasNext={previewImageIndex >= 0 && previewImageIndex < performanceImageSlots.length - 1}
        onPrevious={() => movePreview(-1)}
        onNext={() => movePreview(1)}
        position={previewImageIndex + 1}
        total={performanceImageSlots.length}
        onClose={() => {
          setPreviewImageKey('');
          setPreviewImageLoading(false);
        }}
      />
      <section className="overflow-hidden rounded-2xl border border-violet-500/30 shadow-[0_12px_34px_rgba(109,40,217,0.16)]">
        <div className="flex flex-col gap-4 bg-gradient-to-r from-violet-700 via-fuchsia-600 to-indigo-600 p-4 text-white lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-white/75">
              <BrainCircuit className="h-4 w-4" /> AI-powered operational intelligence
            </div>
            <h2 className="mt-1 text-xl font-bold">Loading/Unloading Analytics</h2>
            <p className="mt-1 text-sm text-white/75">Movement trends, box mix, vehicle activity, and data-driven insights.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PresetDateRangePicker
              startDate={startDate}
              endDate={endDate}
              maxDate={moment().format('YYYY-MM-DD')}
              onRangeChange={({ start, end }) => {
                const nextStart = start ? moment(start).format('YYYY-MM-DD') : moment().format('YYYY-MM-DD');
                const nextEnd = end ? moment(end).format('YYYY-MM-DD') : nextStart;
                setStartDate(nextStart);
                setEndDate(nextEnd);
              }}
            />
            <IncidentFilterPopover
              nvrOptions={nvrOptions}
              nvrIds={nvrIds}
              setNvrIds={(value) => { setNvrIds(value); if (!value.length) setChannelIds([]); }}
              cameraOptions={cameraOptions}
              channelIds={channelIds}
              setChannelIds={setChannelIds}
              showSeverity={false}
              severity=""
              setSeverity={() => {}}
              showVehicleNumber
              vehicleNumber={vehicleNumber}
              setVehicleNumber={setVehicleNumber}
              vehicleNumberList={vehicleNumberList}
              vehicleNumberSearch={vehicleNumberSearch}
              setVehicleNumberSearch={setVehicleNumberSearch}
              showBoxType
              boxType={boxType}
              setBoxType={setBoxType}
              boxTypeOptions={boxTypeOptions}
              triggerClassName="!border-white/25 !bg-white/10 !text-white hover:!bg-white/20"
            />
            <button
              type="button"
              onClick={() => setRefreshKey((value) => value + 1)}
              disabled={loading}
              className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-white/25 bg-white/15 px-3 text-sm font-semibold text-white transition hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center text-sm font-medium text-red-500">
          Unable to load stock analytics. Please refresh and try again.
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map(({ label, value, note, icon: Icon, color, cardClass, iconClass, spark }) => {
              const points = statCardSpark(spark, value);
              return (
                <div key={label} className={`relative min-h-[104px] overflow-hidden rounded-2xl border p-4 shadow-sm ${cardClass}`}>
                  <div className="relative z-10 flex h-full items-center gap-3">
                    <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${iconClass}`}>
                      <Icon className="h-6 w-6" strokeWidth={2} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[10px] font-extrabold uppercase tracking-wider" style={{ color }}>{label}</p>
                      <p className="mt-0.5 text-2xl font-black leading-none" style={{ color }}>{number(value)}</p>
                      <p className="mt-2 truncate text-[11px] font-medium" style={{ color }}>{note}</p>
                    </div>
                    <div className="ml-auto mt-auto h-[54px] w-[42%] min-w-[90px]">
                      <ReactApexChart
                        type="area"
                        height={54}
                        options={sparkOptions(color, points)}
                        series={[{ name: label, data: points }]}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {loading ? (
            <div className="grid min-h-[360px] place-items-center rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)]">
              <div className="text-center text-sm text-[var(--tx2)]"><Loader2 className="mx-auto mb-2 h-7 w-7 animate-spin text-[var(--brand)]" />Analyzing stock movements...</div>
            </div>
          ) : summary.totalEvents ? (
            <div className="grid gap-3 xl:grid-cols-12">
              <section className="rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] p-4 shadow-sm xl:col-span-5">
                <div className="mb-3">
                  <h3 className="font-bold text-[var(--tx)]">Stock movement trend</h3>
                  <p className="text-xs text-[var(--tx3)]">Daily loaded and unloaded box volume</p>
                </div>
                <ReactApexChart
                  type="bar"
                  height={250}
                  options={trendOptions}
                  series={[
                    { name: 'Loaded', data: analytics.trends.map((item) => item.loaded) },
                    { name: 'Unloaded', data: analytics.trends.map((item) => item.unloaded) },
                    { name: 'Total (Events)', data: analytics.trends.map((item) => item.events) },
                  ]}
                />
              </section>

              <section className="rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] p-4 shadow-sm xl:col-span-4">
                <h3 className="font-bold text-[var(--tx)]">Hourly activity</h3>
                <p className="mb-1 text-xs text-[var(--tx3)]">Events and boxes by hour of day</p>
                <ReactApexChart
                  type="bar"
                  height={250}
                  options={hourlyOptions}
                  series={[
                    { name: 'Loaded', data: analytics.hourlyActivity.map((item) => item.loaded) },
                    { name: 'Unloaded', data: analytics.hourlyActivity.map((item) => item.unloaded) },
                    { name: 'Total', data: analytics.hourlyActivity.map((item) => item.total) },
                  ]}
                />
              </section>

              <section className="rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] p-4 shadow-sm xl:col-span-3">
                <h3 className="font-bold text-[var(--tx)]">Box-type breakdown</h3>
                <p className="mb-1 text-xs text-[var(--tx3)]">Share of total box movement</p>
                <ReactApexChart
                  type="donut"
                  height={250}
                  options={boxTypeOptionsChart}
                  series={analytics.boxTypes.map((item) => item.total)}
                />
              </section>

              <section className="rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] p-4 shadow-sm xl:col-span-7">
                <h3 className="font-bold text-[var(--tx)]">Top vehicle throughput</h3>
                <p className="mb-1 text-xs text-[var(--tx3)]">Loaded and unloaded boxes by vehicle</p>
                <ReactApexChart
                  type="bar"
                  height={220}
                  options={vehicleOptions}
                  series={[
                    { name: 'Loaded', data: analytics.topVehicles.map((item) => item.loaded) },
                    { name: 'Unloaded', data: analytics.topVehicles.map((item) => item.unloaded) },
                  ]}
                />
              </section>

              <section className="overflow-hidden rounded-2xl border border-violet-500/20 bg-[var(--bg1solid)] shadow-sm xl:col-span-5">
                <div className="border-b border-violet-500/15 bg-gradient-to-r from-violet-500/15 to-blue-500/10 px-4 py-3">
                  <div className="flex items-center gap-2 font-bold text-[var(--tx)]"><Sparkles className="h-4 w-4 text-violet-500" /> Quick summary</div>
                  <p className="mt-1 text-xs text-[var(--tx3)]">A simple summary of the selected stock data</p>
                </div>
                <div className="space-y-2 p-3">
                  {analytics.insights.map((insight, index) => (
                    <div key={`${insight.type}-${index}`} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${index % 3 === 0 ? 'border-emerald-500/25 bg-emerald-500/10' : index % 3 === 1 ? 'border-violet-500/25 bg-violet-500/10' : 'border-amber-500/25 bg-amber-500/10'}`}>
                      <span className={`shrink-0 ${index % 3 === 0 ? 'text-emerald-500' : index % 3 === 1 ? 'text-violet-500' : 'text-amber-500'}`}>
                        {index % 3 === 0 ? <TrendingUp className="h-5 w-5" /> : index % 3 === 1 ? <PackageCheck className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[var(--tx)]">{insight.title}</p>
                        <p className="mt-0.5 text-[11px] text-[var(--tx2)]">{insight.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="overflow-hidden rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] shadow-sm xl:col-span-12">
                <div className="border-b border-[var(--bd)] px-4 py-3">
                  <h3 className="font-bold text-[var(--tx)]">Box-type performance</h3>
                  <p className="text-xs text-[var(--tx3)]">Loaded, unloaded, and total boxes for each recorded type</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-left text-sm">
                    <thead className="bg-slate-700 text-[10px] uppercase tracking-wider text-white dark:bg-slate-800">
                      <tr><th className="w-12 px-4 py-2.5" aria-label="Expand row" /><th className="px-4 py-2.5">Box Type</th><th className="px-4 py-2.5">Loaded</th><th className="px-4 py-2.5">Unloaded</th><th className="px-4 py-2.5">Total Boxes</th></tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--bd)]">
                      {analytics.boxTypes.map((item) => {
                        const rowKey = item.boxType || 'unknown';
                        const isExpanded = expandedBoxTypes.has(rowKey);
                        const events = boxTypeEventRows[rowKey] || [];
                        const isEventsLoading = Boolean(boxTypeEventLoading[rowKey]);
                        const eventsError = boxTypeEventErrors[rowKey];

                        return (
                          <React.Fragment key={rowKey}>
                            <tr className="text-[var(--tx2)] transition hover:bg-[var(--bg2)]">
                              <td className="px-4 py-2.5">
                                <button
                                  type="button"
                                  onClick={() => toggleBoxType(rowKey)}
                                  className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--tx3)] transition hover:bg-violet-500/10 hover:text-violet-500"
                                  aria-expanded={isExpanded}
                                  aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${titleCase(rowKey)} movements`}
                                >
                                  <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                </button>
                              </td>
                              <td className="px-4 py-2.5 text-xs font-bold capitalize text-[var(--tx)]">{titleCase(rowKey)}</td>
                              <td className="px-4 py-2.5 text-xs font-semibold text-emerald-500">{number(item.loaded)}</td>
                              <td className="px-4 py-2.5 text-xs font-semibold text-amber-500">{number(item.unloaded)}</td>
                              <td className="px-4 py-2.5 text-xs font-bold text-violet-500">{number(item.total)}</td>
                            </tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan={5} className="bg-slate-50/80 px-5 py-4 dark:bg-slate-900/35">
                                  <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-[var(--tx2)]">
                                    <Boxes className="h-4 w-4 text-violet-500" />
                                    All stock movements for {titleCase(rowKey)} boxes
                                  </div>

                                  {isEventsLoading ? (
                                    <div className="flex min-h-28 items-center justify-center gap-2 rounded-xl border border-[var(--bd)] bg-[var(--bg1solid)] text-sm text-[var(--tx3)]">
                                      <Loader2 className="h-5 w-5 animate-spin text-violet-500" /> Loading movements...
                                    </div>
                                  ) : eventsError ? (
                                    <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-6 text-center text-sm font-medium text-red-500">{eventsError}</div>
                                  ) : events.length === 0 ? (
                                    <div className="rounded-xl border border-[var(--bd)] bg-[var(--bg1solid)] px-4 py-6 text-center text-sm text-[var(--tx3)]">No movements found for this box type.</div>
                                  ) : (
                                    <div className="overflow-hidden rounded-xl border border-[var(--bd)] bg-[var(--bg1solid)]">
                                      <div className="relative">
                                        {events.length > 1 && <span className="absolute bottom-10 left-[28px] top-10 w-px bg-blue-500" aria-hidden="true" />}
                                        {events.map((event, eventIndex) => {
                                          const imageUrl = incidentImageUrl(event.Image);
                                          const movement = String(event.direction || '').toLowerCase();
                                          const isLoadingMovement = movement === 'loading';
                                          const eventMoment = moment(event.timeOfIncident);

                                          return (
                                            <div
                                              key={event._id || event.eventId || `${rowKey}-${eventIndex}`}
                                              className="relative grid min-h-[86px] grid-cols-[24px_90px_68px_minmax(220px,280px)_88px_72px_130px_minmax(220px,1fr)] items-center gap-3 border-b border-[var(--bd)] px-4 py-3 last:border-b-0"
                                            >
                                              <span className="relative z-10 mx-auto h-2 w-2 rounded-full bg-blue-500" aria-hidden="true" />
                                              <div className="leading-tight">
                                                <p className="text-xs font-bold text-[var(--tx)]">{eventMoment.isValid() ? eventMoment.format('hh:mm A') : '--'}</p>
                                                <p className="mt-1 text-[11px] text-[var(--tx3)]">{eventMoment.isValid() ? eventMoment.format('DD MMM YYYY') : '--'}</p>
                                              </div>
                                              {imageUrl ? (
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setPreviewImageLoading(true);
                                                    setPreviewImageKey(stockEventImageKey(rowKey, event, eventIndex));
                                                  }}
                                                  className="h-12 w-16 cursor-zoom-in overflow-hidden rounded-lg border border-[var(--bd)] bg-[var(--bg2)] shadow-sm"
                                                  title="View incident image"
                                                >
                                                  <img src={imageUrl} alt="Stock movement" className="h-full w-full object-cover" loading="lazy" />
                                                </button>
                                              ) : (
                                                <div className="grid h-12 w-16 place-items-center rounded-lg border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx3)]"><Boxes className="h-5 w-5" /></div>
                                              )}
                                              <div className="min-w-0 text-[11px] leading-5">
                                                <p className="text-[var(--tx2)]"><span className="font-bold text-[var(--tx)]">NVR Name:</span> {event.nvrName || 'Unknown'}</p>
                                                <p className="whitespace-normal break-words text-[var(--tx2)]"><span className="font-bold text-[var(--tx)]">Camera Name:</span> {event.channelName || 'Unknown'}</p>
                                              </div>
                                              <span className={`inline-flex justify-center rounded-full px-3 py-1 text-[11px] font-bold ${isLoadingMovement ? 'bg-emerald-500/15 text-emerald-500' : 'bg-amber-500/15 text-amber-500'}`}>
                                                {titleCase(movement || 'Unknown')}
                                              </span>
                                              <p className="text-xs text-[var(--tx2)]"><span className="font-bold text-[var(--tx)]">Boxes:</span> {number(event.boxCount)}</p>
                                              <p className="truncate text-xs text-[var(--tx2)]" title={event.vehicleNumber || 'Unknown'}><span className="font-bold text-[var(--tx)]">Vehicle:</span> {event.vehicleNumber || 'Unknown'}</p>
                                              <p className="min-w-0 text-xs text-[var(--tx2)]"><span className="font-bold text-[var(--tx)]">Description:</span> {event.description || '--'}</p>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          ) : (
            <div className="grid min-h-[300px] place-items-center rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] p-8 text-center">
              <div><Boxes className="mx-auto mb-3 h-10 w-10 text-[var(--tx3)]" /><p className="font-bold text-[var(--tx)]">No stock movement data</p><p className="mt-1 text-sm text-[var(--tx3)]">Try a wider date range or clear the selected filters.</p></div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default StockCountingAnalytics;
