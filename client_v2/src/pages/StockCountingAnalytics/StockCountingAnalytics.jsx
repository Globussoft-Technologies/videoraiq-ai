import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactApexChart from 'react-apexcharts';
import moment from 'moment-timezone';
import {
  Boxes,
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
import { getConfiguredTimezone } from '@/utils/timezone';
import {
  fetchIncidentBoxTypes,
  fetchIncidentVehicleNumbers,
  fetchStockCountingAnalytics,
  getNVRs,
  getchannels,
} from '@/pages/IncidentLogs/Api';

const VEHICLE_ENDPOINT = '/incidents/logs/loading-unloading-stock-counting-detection/numbers';
const BOX_TYPE_ENDPOINT = '/incidents/logs/loading-unloading-stock-counting-detection/box-types';
const number = (value) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(value || 0);
const titleCase = (value) => String(value || 'Unknown').replace(/\b\w/g, (letter) => letter.toUpperCase());
const incidentImageUrl = (value) => {
  if (!value) return '';
  const image = String(value).trim();
  if (/^(https?:|data:|blob:)/i.test(image)) return image;
  return `${import.meta.env.VITE_INCIDENT_URL || ''}${image}`;
};
const stockEventImageKey = (boxType, event, index) => (
  `${boxType}:${event?._id || event?.eventId || index}`
);
const initialAnalytics = {
  summary: {},
  composition: [],
  trends: [],
  boxTypes: [],
  topVehicles: [],
  hourlyActivity: [],
  activity: [],
  activityInterval: 'hour',
  insights: [],
};

const StockCountingAnalytics = () => {
  const navigate = useNavigate();
  const { permissions, loading: permissionsLoading } = usePermissions();
  const [startDate, setStartDate] = useState(moment.tz(getConfiguredTimezone()).subtract(29, 'days').format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState(moment.tz(getConfiguredTimezone()).format('YYYY-MM-DD'));
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
  const [boxTypeEventTotals, setBoxTypeEventTotals] = useState({});
  const eventGeneration = useRef(0);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [trendMetric, setTrendMetric] = useState('boxes');
  const analyticsRequest = useRef(0);
  const [previewImageKey, setPreviewImageKey] = useState('');
  const [previewImageLoading, setPreviewImageLoading] = useState(false);

  const logs = permissions?.logs;
  const canView = typeof logs?.stockCountingLogs?.view === 'boolean'
    ? logs.stockCountingLogs.view
    : typeof logs?.global?.view === 'boolean'
      ? logs.global.view
      : Boolean(logs?.view);

  useEffect(() => {
    if (!canView) return;
    let active = true;
    getNVRs()
      .then((res) => { if (active) setNvrList(res?.data?.body?.data || []); })
      .catch(() => { if (active) setNvrList([]); });
    return () => { active = false; };
  }, [canView]);

  useEffect(() => {
    if (!canView) return;
    let active = true;
    getchannels({ nvrIds })
      .then((res) => { if (active) setCameraList(res?.data?.body?.data || []); })
      .catch(() => { if (active) setCameraList([]); });
    return () => { active = false; };
  }, [nvrIds, canView]);

  useEffect(() => {
    if (!canView) return;
    let active = true;
    const timer = setTimeout(() => {
      fetchIncidentVehicleNumbers({
        endpoint: VEHICLE_ENDPOINT,
        search: vehicleNumberSearch,
        startDate,
        endDate,
        nvrIds,
        channelIds,
      })
        .then((res) => { if (active) setVehicleNumberList(res?.data?.body?.data?.vehicleNumbers || []); })
        .catch(() => { if (active) setVehicleNumberList([]); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [vehicleNumberSearch, startDate, endDate, nvrIds, channelIds, canView]);

  useEffect(() => {
    if (!canView) return;
    let active = true;
    fetchIncidentBoxTypes({
      endpoint: BOX_TYPE_ENDPOINT,
      startDate,
      endDate,
      nvrIds,
      channelIds,
      vehicleNumber,
    })
      .then((res) => { if (active) setBoxTypeList(res?.data?.body?.data?.boxTypes || []); })
      .catch(() => { if (active) setBoxTypeList([]); });
    return () => { active = false; };
  }, [startDate, endDate, nvrIds, channelIds, vehicleNumber, canView]);

  const loadAnalytics = useCallback(async () => {
    const request = ++analyticsRequest.current;
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
      if (request !== analyticsRequest.current) return;
      setAnalytics({ ...initialAnalytics, ...(res?.data?.body?.data || {}) });
      setLastUpdated(new Date());
    } catch (err) {
      if (request !== analyticsRequest.current) return;
      setError(err);
      setAnalytics(initialAnalytics);
    } finally {
      if (request === analyticsRequest.current) setLoading(false);
    }
  }, [startDate, endDate, nvrIds, channelIds, vehicleNumber, boxType]);

  useEffect(() => {
    if (canView) loadAnalytics();
    return () => { analyticsRequest.current += 1; };
  }, [canView, loadAnalytics, refreshKey]);

  useEffect(() => {
    eventGeneration.current += 1;
    setExpandedBoxTypes(new Set());
    setBoxTypeEventRows({});
    setBoxTypeEventLoading({});
    setBoxTypeEventErrors({});
    setBoxTypeEventTotals({});
    setPreviewImageKey('');
    return () => { eventGeneration.current += 1; };
  }, [startDate, endDate, nvrIds, channelIds, vehicleNumber, boxType, refreshKey]);

  const loadBoxTypeEvents = useCallback(async (selectedBoxType, skip = 0) => {
    const generation = eventGeneration.current;
    setBoxTypeEventLoading((current) => ({ ...current, [selectedBoxType]: true }));
    setBoxTypeEventErrors((current) => ({ ...current, [selectedBoxType]: '' }));
    try {
      const response = await fetchStockCountingAnalytics({ startDate, endDate, nvrIds, channelIds,
        vehicleNumber, boxType: selectedBoxType, mode: 'events', skip, limit: 10 });
      if (generation !== eventGeneration.current) return;
      const data = response?.data?.body?.data || {};
      setBoxTypeEventRows((current) => ({ ...current, [selectedBoxType]: skip ? [...(current[selectedBoxType] || []), ...(data.rows || [])] : (data.rows || []) }));
      setBoxTypeEventTotals((current) => ({ ...current, [selectedBoxType]: data.total || 0 }));
    } catch {
      if (generation === eventGeneration.current) setBoxTypeEventErrors((current) => ({ ...current, [selectedBoxType]: 'Unable to load movements for this box type.' }));
    } finally {
      if (generation === eventGeneration.current) setBoxTypeEventLoading((current) => ({ ...current, [selectedBoxType]: false }));
    }
  }, [startDate, endDate, nvrIds, channelIds, vehicleNumber]);

  const toggleBoxType = useCallback((selectedBoxType) => {
    const isExpanded = expandedBoxTypes.has(selectedBoxType);
    setExpandedBoxTypes((current) => {
      const next = new Set(current);
      if (next.has(selectedBoxType)) next.delete(selectedBoxType);
      else next.add(selectedBoxType);
      return next;
    });
    if (!isExpanded && !boxTypeEventRows[selectedBoxType] && !boxTypeEventLoading[selectedBoxType]) loadBoxTypeEvents(selectedBoxType);
  }, [expandedBoxTypes, boxTypeEventRows, boxTypeEventLoading, loadBoxTypeEvents]);

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
      value: loading ? null : summary.loadedBoxes,
      note: `${number(summary.loadingEvents)} loading events`,
      icon: PackageCheck,
      color: '#10b981',
      cardClass: 'border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.09] to-[var(--bg1solid)]',
      iconClass: 'bg-emerald-500/10 text-emerald-500',
    },
    {
      label: 'Unloaded Boxes',
      value: loading ? null : summary.unloadedBoxes,
      note: `${number(summary.unloadingEvents)} unloading events`,
      icon: PackageOpen,
      color: '#f59e0b',
      cardClass: 'border-amber-500/20 bg-gradient-to-br from-amber-500/[0.09] to-[var(--bg1solid)]',
      iconClass: 'bg-amber-500/10 text-amber-500',
    },
    {
      label: 'Total Boxes Moved',
      value: loading ? null : summary.totalBoxes,
      note: `${number(summary.totalEvents)} total events`,
      icon: Boxes,
      color: '#8b5cf6',
      cardClass: 'border-violet-500/20 bg-gradient-to-br from-violet-500/[0.09] to-[var(--bg1solid)]',
      iconClass: 'bg-violet-500/10 text-violet-500',
    },
    {
      label: 'Identified Vehicles',
      value: loading ? null : summary.totalVehicles,
      note: `${number(summary.unidentifiedEvents)} unidentified movements`,
      icon: Truck,
      color: '#3b82f6',
      cardClass: 'border-blue-500/20 bg-gradient-to-br from-blue-500/[0.09] to-[var(--bg1solid)]',
      iconClass: 'bg-blue-500/10 text-blue-500',
    },
  ];

  const sharedChart = useMemo(() => ({
    chart: { toolbar: { show: false }, background: 'transparent', foreColor: 'var(--tx2)', fontFamily: 'var(--ui)' },
    grid: { borderColor: 'var(--bd)', strokeDashArray: 4 },
    dataLabels: { enabled: false },
    tooltip: { theme: false },
    legend: { labels: { colors: 'var(--tx2)' }, fontSize: '12px' },
  }), []);

  const activityInterval = analytics.activityInterval;
  const trendRows = analytics.activity;
  const trendPeriod = { hour: 'Hourly', day: 'Daily', month: 'Monthly' }[activityInterval];
  const selectTrendBucket = useCallback((bucket) => {
    if (!bucket || activityInterval === 'hour') return;
    if (activityInterval === 'day') { setStartDate(bucket); setEndDate(bucket); return; }
    const month = moment(bucket, 'YYYY-MM');
    // Keep partial months within the selected date range.
    setStartDate(month.clone().startOf('month').format('YYYY-MM-DD') < startDate ? startDate : month.clone().startOf('month').format('YYYY-MM-DD'));
    setEndDate(month.clone().endOf('month').format('YYYY-MM-DD') > endDate ? endDate : month.clone().endOf('month').format('YYYY-MM-DD'));
  }, [activityInterval, startDate, endDate]);
  const trendOptions = useMemo(() => ({
    ...sharedChart,
    chart: { ...sharedChart.chart, type: 'bar', events: { dataPointSelection: (_event, _chart, selection) => selectTrendBucket(trendRows[selection.dataPointIndex]?.bucket) } },
    colors: ['#10b981', '#f59e0b', '#c084fc'],
    plotOptions: { bar: { borderRadius: 2, columnWidth: '64%', dataLabels: { position: 'top' } } },
    dataLabels: {
      enabled: false,
      offsetY: -18,
      style: { fontSize: '12px', fontWeight: 700, colors: ['var(--tx)'] },
      formatter: (value) => number(value),
    },
    xaxis: {
      categories: trendRows.map((item) => activityInterval === 'hour' ? `${item.bucket}:00` : moment(item.bucket, activityInterval === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD').format(activityInterval === 'month' ? 'MMM YYYY' : 'DD MMM')),
      labels: { style: { colors: 'var(--tx3)', fontSize: '12px' } },
      axisBorder: { color: 'var(--bd)' },
      axisTicks: { show: false },
    },
    yaxis: { min: 0, forceNiceScale: true, labels: { style: { colors: 'var(--tx3)', fontSize: '12px' } } },
    legend: { ...sharedChart.legend, position: 'top', horizontalAlign: 'right', markers: { size: 5 } },
  }), [trendRows, activityInterval, sharedChart, selectTrendBucket]);

  const hourlyOptions = useMemo(() => ({
    ...sharedChart,
    colors: ['#10b981', '#f59e0b', '#8b5cf6'],
    plotOptions: { bar: { borderRadius: 3, columnWidth: '58%', dataLabels: { position: 'top' } } },
    dataLabels: {
      enabled: false,
      offsetY: -18,
      style: { fontSize: '12px', fontWeight: 700, colors: ['var(--tx)'] },
      formatter: (value) => number(value),
    },
    xaxis: {
      categories: analytics.hourlyActivity.map((item) => `${String(item.hour).padStart(2, '0')}:00`),
      labels: {
        rotate: 0,
        hideOverlappingLabels: true,
        offsetY: 4,
        formatter: (value) => Number.parseInt(String(value), 10) % 2 === 0 ? value : '',
        style: { colors: 'var(--tx3)', fontSize: '12px' },
      },
      axisBorder: { color: 'var(--bd)' },
      axisTicks: { show: false },
    },
    yaxis: { min: 0, forceNiceScale: true, labels: { style: { colors: 'var(--tx3)', fontSize: '12px' } } },
    legend: { ...sharedChart.legend, position: 'top', horizontalAlign: 'right', markers: { size: 5 } },
  }), [analytics.hourlyActivity, sharedChart]);

  const boxTypeOptionsChart = useMemo(() => ({
    ...sharedChart,
    labels: analytics.composition.map((item) => titleCase(item.boxType)),
    colors: analytics.composition.map((item) => ({ brown: '#a16207', white: '#06b6d4', other: '#8b5cf6' }[item.boxType] || '#64748b')),
    stroke: { colors: ['var(--bg1solid)'], width: 2 },
    dataLabels: { enabled: false },
    plotOptions: {
      pie: {
        donut: {
          size: '68%',
          labels: {
            show: true,
            name: { show: true, color: 'var(--tx2)', fontSize: '12px', offsetY: -5 },
            value: { show: true, color: 'var(--tx)', fontSize: '20px', fontWeight: 800, offsetY: 5 },
            total: { show: true, label: 'Total Boxes Moved', color: 'var(--tx2)', formatter: () => number(summary.totalBoxes) },
          },
        },
      },
    },
    legend: { position: 'bottom', fontSize: '12px', labels: { colors: 'var(--tx2)' }, markers: { size: 5 } },
  }), [analytics.composition, sharedChart, summary.totalBoxes]);

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
      <section className="sticky top-0 z-20 overflow-hidden rounded-xl border border-[var(--bd)] bg-[var(--bg1solid)] shadow-sm">
        <div className="flex flex-col gap-4 bg-slate-800 p-4 text-white lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-white/75">
              Recorded stock movements
            </div>
            <h2 className="mt-1 text-xl font-bold">Loading/Unloading Analytics</h2>
            <p className="mt-1 text-sm text-white/75">Box throughput and recorded loading/unloading activity.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PresetDateRangePicker
              startDate={startDate}
              endDate={endDate}
              maxDate={moment.tz(getConfiguredTimezone()).format('YYYY-MM-DD')}
              onRangeChange={({ start, end }) => {
                const nextStart = start ? moment(start).format('YYYY-MM-DD') : moment.tz(getConfiguredTimezone()).format('YYYY-MM-DD');
                const nextEnd = end ? moment(end).format('YYYY-MM-DD') : nextStart;
                setStartDate(nextStart);
                setEndDate(nextEnd);
              }}
            />
            <IncidentFilterPopover
              nvrOptions={nvrOptions}
              nvrIds={nvrIds}
              setNvrIds={(value) => { setNvrIds(value); setChannelIds([]); setVehicleNumber(''); setBoxType(''); }}
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
            <button type="button" onClick={() => { setStartDate(moment.tz(getConfiguredTimezone()).subtract(29, 'days').format('YYYY-MM-DD')); setEndDate(moment.tz(getConfiguredTimezone()).format('YYYY-MM-DD')); setNvrIds([]); setChannelIds([]); setVehicleNumber(''); setBoxType(''); setVehicleNumberSearch(''); }} className="h-10 rounded-lg border border-white/25 px-3 text-sm">Reset</button>
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
      <div className="px-4 py-2 text-sm text-[var(--tx2)]" aria-live="polite">
        {startDate} to {endDate} | {analytics.timezone || getConfiguredTimezone()} | {nvrIds.length ? `${nvrIds.length} NVRs` : 'All authorized NVRs'} | {channelIds.length ? `${channelIds.length} cameras` : 'All authorized cameras'}
        {vehicleNumber && ` | Vehicle: ${vehicleNumber}`}{boxType && ` | Type: ${titleCase(boxType)}`}
        {lastUpdated && ` | Updated ${moment(lastUpdated).tz(analytics.timezone || getConfiguredTimezone()).format('hh:mm:ss A')}`}
      </div>
      </section>
      <p className="text-sm text-[var(--tx2)]">Totals represent box movements, not current inventory. Repeat movements can count the same box more than once.</p>
      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center text-sm font-medium text-red-500">
          Unable to load stock analytics. Please refresh and try again.
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map(({ label, value, note, icon: Icon, color, cardClass, iconClass }) => {
              return (
                <div key={label} className={`relative min-h-[104px] overflow-hidden rounded-2xl border p-4 shadow-sm ${cardClass}`}>
                  <div className="relative z-10 flex h-full items-center gap-3">
                    <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${iconClass}`}>
                      <Icon className="h-6 w-6" strokeWidth={2} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[10px] font-extrabold uppercase tracking-wider" style={{ color }}>{label}</p>
                      <p className="mt-0.5 text-2xl font-black leading-none" style={{ color }}>{loading ? '--' : number(value)}</p>
                      <p className="mt-2 truncate text-[11px] font-medium" style={{ color }}>{loading ? 'Loading...' : note}</p>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>

          {!loading && summary.totalEvents > 0 && (
            <p className="rounded-lg border border-[var(--bd)] bg-[var(--bg1solid)] p-3 text-sm text-[var(--tx2)]">
              {number(summary.unknownDirectionEvents)} movements have unknown direction ({number(summary.unknownDirectionBoxes)} boxes).
              {' '}{number(summary.invalidCountEvents)} movements have invalid counts and contribute no boxes.
              {' '}{number(summary.colourSplitEvents)} of {number(summary.totalEvents)} movements have a validated colour split.
            </p>
          )}
          {loading ? (
            <div className="grid min-h-[360px] place-items-center rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)]">
              <div className="text-center text-sm text-[var(--tx2)]"><Loader2 className="mx-auto mb-2 h-7 w-7 animate-spin text-[var(--brand)]" />Analyzing stock movements...</div>
            </div>
          ) : summary.totalEvents ? (
            <div className="grid gap-3 xl:grid-cols-12">
              <section className="rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] p-4 shadow-sm xl:col-span-12">
                <div className="mb-3">
                  <h3 className="font-bold text-[var(--tx)]">Stock movement trend</h3>
                  <p className="text-sm text-[var(--tx2)]">{trendPeriod} {trendMetric === 'boxes' ? 'loaded and unloaded boxes' : 'movement events'}. Empty intervals mean no recorded movements.{activityInterval !== 'hour' && ` Click a bar to inspect that ${activityInterval === 'month' ? 'month' : 'day'}.`}</p>
                  <div className="mt-2 flex gap-2">{['boxes', 'events'].map((metric) => <button key={metric} type="button" aria-pressed={trendMetric === metric} onClick={() => setTrendMetric(metric)} className={`rounded-lg border px-3 py-1 text-sm ${trendMetric === metric ? 'border-violet-500 bg-violet-500/10 text-violet-500' : 'border-[var(--bd)] text-[var(--tx2)]'}`}>{titleCase(metric)}</button>)}</div>
                </div>
                <ReactApexChart
                  type="bar"
                  height={250}
                  options={trendOptions}
                  series={trendMetric === 'events' ? [{ name: 'Events', data: trendRows.map((item) => item.events) }] : [
                    { name: 'Loaded boxes', data: trendRows.map((item) => item.loaded) },
                    { name: 'Unloaded boxes', data: trendRows.map((item) => item.unloaded) },
                  ]}
                />
              </section>

              <section className="rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] p-4 shadow-sm xl:col-span-7">
                <h3 className="font-bold text-[var(--tx)]">Activity by hour of day</h3>
                <p className="mb-1 text-sm text-[var(--tx2)]">Loaded and unloaded boxes at each hour, summed across the selected dates.</p>
                <ReactApexChart
                  type="bar"
                  height={250}
                  options={hourlyOptions}
                  series={[
                    { name: 'Loaded', data: analytics.hourlyActivity.map((item) => item.loaded) },
                    { name: 'Unloaded', data: analytics.hourlyActivity.map((item) => item.unloaded) },
                  ]}
                />
              </section>

              <section className="rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] p-4 shadow-sm xl:col-span-5">
                <h3 className="font-bold text-[var(--tx)]">Box composition</h3>
                <p className="mb-1 text-sm text-[var(--tx2)]">Validated colour counts; classification only means no reliable colour split</p>
                <ReactApexChart
                  type="donut"
                  height={250}
                  options={boxTypeOptionsChart}
                  series={analytics.composition.map((item) => item.total)}
                />
              </section>

              <section className="rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] p-4 shadow-sm xl:col-span-7">
                <h3 className="font-bold text-[var(--tx)]">Top vehicle throughput</h3>
                <p className="mb-1 text-sm text-[var(--tx2)]">Loaded and unloaded boxes by vehicle</p>
                <div className="max-h-[240px] overflow-auto" tabIndex="0" role="region" aria-label="Vehicle throughput, scroll to see more vehicles"><table className="w-full border-separate border-spacing-0 whitespace-nowrap text-left text-sm"><thead><tr className="h-10 text-[var(--tx2)]">{['Identified vehicle', 'Loaded', 'Unloaded', 'Total boxes', 'Events'].map((label) => <th key={label} className="sticky top-0 z-10 h-10 border-b border-[var(--bd)] bg-[var(--bg1solid)] px-3 py-2">{label}</th>)}</tr></thead><tbody>{analytics.topVehicles.map((vehicle) => <tr key={vehicle.vehicleNumber} className="h-10 text-[var(--tx)]"><td className="border-b border-[var(--bd)] px-3 py-2"><button type="button" onClick={() => { setVehicleNumber(vehicle.vehicleNumber); }} className="text-violet-500 underline">{vehicle.vehicleNumber}</button></td><td className="border-b border-[var(--bd)] px-3 py-2 text-emerald-500">{number(vehicle.loaded)}</td><td className="border-b border-[var(--bd)] px-3 py-2 text-amber-500">{number(vehicle.unloaded)}</td><td className="border-b border-[var(--bd)] px-3 py-2">{number(vehicle.total)}</td><td className="border-b border-[var(--bd)] px-3 py-2">{number(vehicle.events)}</td></tr>)}</tbody></table></div>
                <p className="mt-2 text-sm text-[var(--tx2)]">Identified vehicles ranked by boxes moved. Scroll to see more. Click a vehicle to inspect its movements.</p>
              </section>

              <section className="overflow-hidden rounded-2xl border border-violet-500/20 bg-[var(--bg1solid)] shadow-sm xl:col-span-5">
                <div className="border-b border-violet-500/15 bg-gradient-to-r from-violet-500/15 to-blue-500/10 px-4 py-3">
                  <div className="flex items-center gap-2 font-bold text-[var(--tx)]"><Sparkles className="h-4 w-4 text-violet-500" /> Quick summary</div>
                  <p className="mt-1 text-sm text-[var(--tx2)]">A simple summary of the selected stock data</p>
                </div>
                <div className="space-y-2 p-3">
                  {analytics.insights.map((insight, index) => (
                    <div key={`${insight.type}-${index}`} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${index % 3 === 0 ? 'border-emerald-500/25 bg-emerald-500/10' : index % 3 === 1 ? 'border-violet-500/25 bg-violet-500/10' : 'border-amber-500/25 bg-amber-500/10'}`}>
                      <span className={`shrink-0 ${index % 3 === 0 ? 'text-emerald-500' : index % 3 === 1 ? 'text-violet-500' : 'text-amber-500'}`}>
                        {index % 3 === 0 ? <TrendingUp className="h-5 w-5" /> : index % 3 === 1 ? <PackageCheck className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[var(--tx)]">{insight.title}</p>
                        <p className="mt-0.5 text-sm text-[var(--tx2)]">{insight.message}</p>
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

                                  {isEventsLoading && !events.length ? (
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
                                          const eventMoment = moment.utc(event.timeOfIncident).tz(analytics.timezone || getConfiguredTimezone());

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
                                              <p className="text-xs text-[var(--tx2)]"><span className="font-bold text-[var(--tx)]">Boxes:</span> {event.invalidCount ? 'Invalid count' : number(event.boxCount)}</p>
                                              <p className="truncate text-xs text-[var(--tx2)]" title={event.vehicleNumber || 'Unknown'}><span className="font-bold text-[var(--tx)]">Vehicle:</span> {event.vehicleNumber || 'Unknown'}</p>
                                              <p className="min-w-0 text-xs text-[var(--tx2)]"><span className="font-bold text-[var(--tx)]">Description:</span> {event.description || '--'}</p>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                  {events.length < (boxTypeEventTotals[rowKey] || 0) && (
                                    <div className="mt-3 flex items-center justify-between text-xs text-[var(--tx2)]">
                                      <span>{events.length} of {number(boxTypeEventTotals[rowKey])} movements</span>
                                      <button type="button" disabled={isEventsLoading} onClick={() => loadBoxTypeEvents(rowKey, events.length)} className="rounded-lg border border-[var(--bd)] px-3 py-2 disabled:opacity-50">{isEventsLoading ? 'Loading...' : 'Load more'}</button>
                                    </div>
                                  )}
                                  {eventsError && <button type="button" onClick={() => loadBoxTypeEvents(rowKey, events.length)} className="mt-2 text-xs text-violet-500 underline">Retry loading movements</button>}
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
