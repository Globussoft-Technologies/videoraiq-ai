import React, {
  useEffect,
  useCallback,
  useState,
} from 'react';
import ReactApexChart from 'react-apexcharts';
import moment from 'moment-timezone';
import { ChartColumnBig, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import getAccessToken from '@/utils/getAccessToken';
import axios from 'axios';
import AutoRefreshComponent from './components/AutoRefreshComponent';
import { DateRangePickerComponent } from '@/components/ui/calendar';
import { formatDateRange } from '@/utils/formatDateRange';
import Month from '@/assets/Calendar.svg';
import notfound from '@/assets/notfound.svg';

const HOST = import.meta.env.VITE_BACKEND;
const IST_ZONE = 'Asia/Kolkata';
const LIMIT = 2;

const REFRESH_KEY = 'vehicle_count_auto_refresh_enabled';
const INTERVAL_KEY = 'vehicle_count_auto_refresh_interval';

const fetchVehicleCountLogs = async ({ skip, limit, startDate, endDate }) => {
  const token = getAccessToken();
  return axios.get(`${HOST}/api/v1/incidents/logs/vehicle-count`, {
    params: {
      skip,
      limit,
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
    },
    headers: {
      Accept: 'application/json',
      'x-access-token': token,
    },
  });
};

const buildChart = (record) => {
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
          el.addEventListener('wheel', (e) => {
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
          }, { passive: false });
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
        formatter: (val) =>
          moment(val).tz(IST_ZONE).format('DD/MM/YYYY HH:mm:ss'),
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

const VehicleCountLogs = () => {
  const maxDateDefault = moment().endOf('day').toDate();

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [startDate, setStartDate] = useState(moment().format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState(moment().format('YYYY-MM-DD'));

  const [autoRefresh, setAutoRefresh] = useState(() => {
    const saved = localStorage.getItem(REFRESH_KEY);
    return saved !== null ? saved === 'true' : true;
  });
  const [refreshInterval, setRefreshInterval] = useState(() => {
    const saved = localStorage.getItem(INTERVAL_KEY);
    const parsed = parseInt(saved, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 30;
  });
  const [manualTrigger, setManualTrigger] = useState(0);

  useEffect(() => {
    localStorage.setItem(REFRESH_KEY, autoRefresh);
  }, [autoRefresh]);

  useEffect(() => {
    localStorage.setItem(INTERVAL_KEY, refreshInterval);
  }, [refreshInterval]);

  const skip = (currentPage - 1) * LIMIT;
  const totalPages = Math.max(1, Math.ceil(totalCount / LIMIT));

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchVehicleCountLogs({ skip, limit: LIMIT, startDate, endDate });
      const body = res?.data?.body?.data;
      setRecords(body?.data || []);
      setTotalCount(body?.totalCount || 0);
    } catch (err) {
      console.log('Error fetching vehicle count logs:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [skip, startDate, endDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs, manualTrigger]);

  useEffect(() => {
    let intervalId;
    if (autoRefresh && refreshInterval > 0) {
      intervalId = setInterval(fetchLogs, refreshInterval * 1000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [autoRefresh, refreshInterval, fetchLogs]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [startDate, endDate]);

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  const charts = records.map(buildChart);

  const propStart = startDate ? moment(startDate).startOf('day').toDate() : null;
  const propEnd = endDate ? moment(endDate).startOf('day').toDate() : null;

  // Smart pagination pages array
  const getPaginationPages = () => {
    const pages = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else if (currentPage <= 3) {
      for (let i = 1; i <= 4; i++) pages.push(i);
      pages.push('...');
      pages.push(totalPages);
    } else if (currentPage >= totalPages - 2) {
      pages.push(1);
      pages.push('...');
      for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      pages.push('...');
      for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
      pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="min-h-screen">
      <div className="w-full overflow-x-auto p-3 sm:p-4 space-y-5 md:space-y-7 xl:space-y-8 bg-white rounded-[18px]">
        <div className="border-gray-200 rounded-[8px] xl:rounded-[20px] bg-[#FAFAFA] p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4">
          <h2 className="text-base font-semibold text-[#07486A]">
            Vehicle Count Logs
          </h2>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <DateRangePickerComponent
              startDate={propStart}
              endDate={propEnd}
              maxDate={maxDateDefault}
              onRangeChange={(range) => {
                if (!range) return;
                const toIso = (d) =>
                  d instanceof Date ? moment(d).format('YYYY-MM-DD') : d;
                setStartDate(range.start ? toIso(range.start) : '');
                setEndDate(range.end ? toIso(range.end) : '');
              }}
              buttonClassName="h-9 transition-shadow duration-300 ease-in-out hover:shadow-sm text-[#5D5D5D] font-medium cursor-pointer py-1.5 px-2 bg-[#FFFFFF] rounded-lg text-xs border border-[#C7C7C7] flex items-center justify-between w-full max-w-[280px] sm:min-w-[160px] md:w-auto md:px-2 2xl:h-10 2xl:py-2 2xl:px-4 2xl:rounded-[10px] 2xl:text-sm 2xl:min-w-[180px]"
              buttonContent={
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center overflow-hidden whitespace-nowrap">
                    <img
                      src={Month}
                      className="w-3.5 h-3.5 mr-1.5 shrink-0 2xl:w-4 2xl:h-4 2xl:mr-2 mt-0.5"
                      alt="Calendar Icon"
                    />
                    <span className="truncate block md:mt-0.5 w-[100px] text-left 2xl:w-[120px]">
                      {propStart && propEnd
                        ? formatDateRange(propStart, propEnd)
                        : 'Select Date'}
                    </span>
                  </div>
                  <ChevronDown className="w-[12px] h-[12px] text-[#5D5D5D] ml-1.5 shrink-0 2xl:w-[14px] 2xl:h-[14px] 2xl:ml-2" />
                </div>
              }
              popoverClassName="mt-1 z-50 2xl:mt-2"
              calendarClassName="p-3 bg-white shadow-lg border border-[#D8D8D8] 2xl:p-4"
            />

            <div className="ml-auto">
              <AutoRefreshComponent
                isActive={autoRefresh}
                onActiveChange={setAutoRefresh}
                refreshInterval={refreshInterval}
                onIntervalChange={setRefreshInterval}
                onManualRefresh={() => setManualTrigger((prev) => prev + 1)}
              />
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
              Loading...
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-16 text-red-400 text-sm">
              Failed to load data.
            </div>
          ) : charts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 min-h-[68vh]">
              <img src={notfound} alt="No logs found" className="w-64 h-64 mb-4" />
            </div>
          ) : (
            <div className="space-y-6">
              {charts.map((chart, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-xl border border-[#E6E6E6] p-4 shadow-sm"
                >
                  {/* NVR + Camera header */}
                  <div className="flex items-center gap-4 mb-3">
                    <span className="text-xs font-medium text-[#555] bg-[#EEF6FB] px-3 py-1 rounded-full">
                      NVR Name:{' '}
                      <span className="text-[#07486A] font-semibold">
                        {chart.nvrName}
                      </span>
                    </span>
                    <span className="text-xs font-medium text-[#555] bg-[#EEF6FB] px-3 py-1 rounded-full">
                      Camera Name:{' '}
                      <span className="text-[#07486A] font-semibold">
                        {chart.cameraName}
                      </span>
                    </span>
                  </div>

                  {chart.seriesData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[220px] text-gray-400 text-sm">
                      <ChartColumnBig className="w-10 h-10 mb-2 text-gray-300" />
                      No time-series data
                    </div>
                  ) : (
                    <ReactApexChart
                      options={chart.options}
                      series={[{ name: 'Vehicle Count', data: chart.seriesData }]}
                      type="area"
                      height={280}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {!loading && charts.length > 0 && (
          <div className="mt-6 grid grid-cols-3 items-center gap-4">
            <div className="text-sm text-[#333333] bg-[#F5F5F5] px-3 py-1.5 font-[400] rounded-[5px] w-42 inline-flex items-center gap-2">
              Total logs -{' '}
              <span className="text-[#07486A] font-medium bg-[#E3F5FF] px-2.5 py-1 rounded-md">
                {totalCount}
              </span>
            </div>

            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className={`flex items-center justify-center w-8 h-8 rounded ${
                  currentPage === 1
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-gray-100 cursor-pointer'
                }`}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {getPaginationPages().map((page, index) =>
                page === '...' ? (
                  <span
                    key={`ellipsis-${index}`}
                    className="flex items-center justify-center w-8 h-8 text-gray-400"
                  >
                    ...
                  </span>
                ) : (
                  <button
                    key={page}
                    onClick={() => handlePageChange(page)}
                    className={`flex items-center justify-center w-8 h-8 rounded text-sm font-medium ${
                      currentPage === page
                        ? 'bg-[#07486A] text-white cursor-pointer'
                        : 'text-gray-600 hover:bg-gray-100 cursor-pointer'
                    }`}
                  >
                    {page}
                  </button>
                )
              )}

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className={`flex items-center justify-center w-8 h-8 rounded ${
                  currentPage === totalPages
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-gray-100 cursor-pointer'
                }`}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div />
          </div>
        )}
      </div>
    </div>
  );
};

export default VehicleCountLogs;
