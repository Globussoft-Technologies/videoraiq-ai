import moment from 'moment-timezone';

const IST_ZONE = 'Asia/Kolkata';

/**
 * Build the ApexCharts options + series-data for a single vehicle-count record.
 * Ported from V1's VehicleCountLogs (area chart over the record's timeSeries).
 */
export const buildChart = (record) => {
  const nvrName = record.nvrData?.nvrName || '--';
  const cameraName = record.channelData?.name || '--';

  const seriesData = (record.timeSeries || []).map((pt) => ({
    x: new Date(pt.timestamp).getTime(),
    y: pt.count,
  }));

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
        mounted: (chartCtx) => {
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
      curve: 'smooth',
      width: 1.5,
      colors: ['#5BA4CF'],
    },
    markers: { size: 0 },
    xaxis: {
      type: 'datetime',
      tickAmount: 'dataPoints',
      tickPlacement: 'on',
      labels: {
        datetimeUTC: false,
        rotate: -30,
        rotateAlways: false,
        hideOverlappingLabels: true,
        style: { fontSize: '10px', colors: '#888' },
        formatter: (val) => moment(val).tz(IST_ZONE).format('HH:mm'),
        datetimeFormatter: {
          minute: 'HH:mm',
        },
      },
      title: {
        text: 'Timestamp',
        style: { fontSize: '11px', color: '#555', fontWeight: 500 },
      },
    },
    yaxis: {
      title: {
        text: 'Count',
        style: { fontSize: '11px', color: '#555', fontWeight: 500 },
      },
      labels: { style: { fontSize: '11px', colors: '#888' } },
      min: 0,
    },
    tooltip: {
      x: {
        formatter: (val) => moment(val).tz(IST_ZONE).format('DD/MM/YYYY HH:mm:ss'),
      },
      y: { formatter: (val) => `${val} vehicles` },
    },
    grid: {
      borderColor: '#e8e8e8',
      strokeDashArray: 3,
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: true } },
    },
    dataLabels: { enabled: false },
  };

  return { nvrName, cameraName, seriesData, options };
};
