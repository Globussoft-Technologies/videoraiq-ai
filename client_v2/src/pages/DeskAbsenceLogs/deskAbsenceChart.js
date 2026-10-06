import moment from 'moment-timezone';
import { getConfiguredTimezone } from '@/utils/timezone';

/**
 * Build the ApexCharts config + series for a single desk-absence record.
 * Ported 1:1 from the V1 DeskAbsenceLogs page (light theme, hardcoded colors).
 */
export const buildChart = (
  record,
  { granularity = 'time', onPointSelect, rangeStart, rangeEnd } = {}
) => {
  const nvrName = record.nvrData?.nvrName || '--';
  const cameraName = record.channelData?.customName || record.channelData?.name || '--';
  const timezone = getConfiguredTimezone();
  const isSummary = granularity !== 'time';
  const sourcePoints = (() => {
    if (!isSummary || !rangeStart || !rangeEnd) return record.timeSeries || [];
    const pointsByPeriod = new Map(
      (record.timeSeries || []).map((point) => [point.period, point])
    );
    const format = granularity === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD';
    const unit = granularity === 'month' ? 'month' : 'day';
    const cursor = moment.tz(rangeStart, 'YYYY-MM-DD', timezone).startOf(unit);
    const end = moment.tz(rangeEnd, 'YYYY-MM-DD', timezone).startOf(unit);
    const points = [];
    while (cursor.isSameOrBefore(end)) {
      const period = cursor.format(format);
      points.push(pointsByPeriod.get(period) || { period, personCount: 0 });
      cursor.add(1, unit);
    }
    return points;
  })();

  const seriesData = sourcePoints.map((pt) => {
    const periodDate = granularity === 'month'
      ? moment.tz(`${pt.period}-01`, 'YYYY-MM-DD', timezone)
      : moment.tz(pt.period, 'YYYY-MM-DD', timezone);
    return {
      x: isSummary
        ? periodDate.format(granularity === 'month' ? 'MMM YYYY' : 'DD MMM')
        : new Date(pt.timestamp).getTime(),
      y: pt.personCount ?? 0,
      period: pt.period || '',
      personPresent: !!pt.personPresent,
      zoneName: pt.zoneName || '',
    };
  });

  // Build a whole-number y-axis. For a small max (e.g. 3) show one tick per
  // integer; for a large max (e.g. 100) cap at ~10 evenly-spaced whole ticks
  // so the axis never lists every integer 0..100.
  const maxCount = seriesData.reduce((m, p) => Math.max(m, p.y || 0), 0);
  const yMax = Math.max(1, maxCount);
  const yTicks = yMax <= 10 ? yMax : Math.min(10, yMax);

  const options = {
    chart: {
      type: 'area',
      height: 280,
      toolbar: { show: false },
      zoom: {
        enabled: true,
        type: 'x',
        autoScaleYaxis: true,
        zoomedArea: {
          fill: { color: '#90CAF9', opacity: 0.4 },
          stroke: { color: '#0D47A1', opacity: 0.4, width: 1 },
        },
      },
      events: {
        dataPointSelection: (_event, _chartContext, config) => {
          if (!isSummary || typeof onPointSelect !== 'function') return;
          const point = seriesData[config?.dataPointIndex];
          if (point?.period) onPointSelect(point.period);
        },
        mounted: (chartCtx) => {
          if (isSummary) return;
          const el = chartCtx.el;
          if (!el) return;
          el.addEventListener(
            'wheel',
            (e) => {
              e.preventDefault();
              const { minX, maxX } = chartCtx.w.globals;
              const range = maxX - minX;
              const factor = e.deltaY < 0 ? 0.8 : 1.25;
              const newRange = range * factor;
              const center = (minX + maxX) / 2;
              chartCtx.zoomX(
                Math.round(center - newRange / 2),
                Math.round(center + newRange / 2)
              );
            },
            { passive: false }
          );
        },
      },
      animations: { enabled: false },
    },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.45,
        opacityTo: 0.05,
        stops: [0, 100],
        colorStops: [
          { offset: 0, color: '#90CAF9', opacity: 0.45 },
          { offset: 100, color: '#90CAF9', opacity: 0.05 },
        ],
      },
    },
    stroke: {
      curve: isSummary ? 'straight' : 'smooth',
      width: isSummary ? 2 : 1.5,
      colors: ['#3488f7'],
    },
    markers: {
      size: isSummary ? 4 : 0,
      hover: { size: isSummary ? 6 : 0 },
    },
    xaxis: {
      type: isSummary ? 'category' : 'datetime',
      ...(isSummary ? {} : { tickAmount: seriesData.length <= 15 ? 'dataPoints' : 12 }),
      tickPlacement: 'on',
      labels: {
        datetimeUTC: false,
        rotate: -30,
        rotateAlways: false,
        hideOverlappingLabels: true,
        style: { fontSize: '10px', colors: '#888' },
        formatter: (val) => {
          if (isSummary) return val;
          const value = moment(Number(val)).tz(timezone);
          return value.format('HH:mm');
        },
        datetimeFormatter: {
          minute: 'HH:mm',
        },
      },
      title: {
        text: granularity === 'month' ? 'Month' : granularity === 'day' ? 'Date' : 'Timestamp',
        style: { fontSize: '11px', color: '#555', fontWeight: 500 },
      },
    },
    yaxis: {
      title: {
        text: isSummary ? 'Total Count' : 'Person Count',
        style: { fontSize: '11px', color: '#555', fontWeight: 500 },
      },
      min: 0,
      max: yMax,
      tickAmount: yTicks,
      forceNiceScale: yMax > 10,
      labels: {
        style: { fontSize: '11px', colors: '#888' },
        formatter: (val) => Math.round(val),
      },
    },
    tooltip: {
      shared: !isSummary,
      intersect: isSummary,
      x: {
        formatter: (val, { dataPointIndex, w }) => {
          if (isSummary) {
            const point = w?.config?.series?.[0]?.data?.[dataPointIndex] || {};
            const period = point.period || '';
            return granularity === 'month'
              ? moment(period, 'YYYY-MM').format('MMMM YYYY')
              : moment(period, 'YYYY-MM-DD').format('DD MMMM YYYY');
          }
          const value = moment(val).tz(timezone);
          return value.format('DD/MM/YYYY HH:mm:ss');
        },
      },
      y: {
        formatter: (val, { dataPointIndex, w }) => {
          if (isSummary) return `${Math.round(val)} total count`;
          const point = w?.config?.series?.[0]?.data?.[dataPointIndex] || {};
          const zone = point.zoneName ? ` · Zone: ${point.zoneName}` : '';
          return `${val} persons${zone}`;
        },
      },
    },
    grid: {
      borderColor: '#e8e8e8',
      strokeDashArray: 3,
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: true } },
    },
    dataLabels: {
      enabled: isSummary && seriesData.length <= 31,
      formatter: (value) => Math.round(value),
      offsetY: -7,
      style: {
        fontSize: '10px',
        fontWeight: 600,
        colors: ['#334155'],
      },
      background: { enabled: false },
    },
  };

  return {
    id: record.channelId || record._id,
    nvrName,
    cameraName,
    seriesData,
    options,
  };
};
