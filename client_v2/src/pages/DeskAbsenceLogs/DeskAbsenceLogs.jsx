import React, { useEffect, useCallback, useMemo, useState } from 'react';
import ReactApexChart from 'react-apexcharts';
import moment from 'moment-timezone';
import { useNavigate } from 'react-router-dom';
import {
  ChartColumnBig,
  ChevronLeft,
  ChevronRight,
  Filter,
  RotateCcw,
} from 'lucide-react';
import { usePermissions } from '@/context/PermissionContext';
import AccessDenied from '@/components/AccessDenied';
import { Button } from '@/components/ui/button';
import notfound from '@/assets/notfound.svg';

import AutoRefreshComponent from '@/pages/AttendanceLogs/components/AutoRefreshComponent';
import MultiSelect from '@/pages/AttendanceLogs/components/MultiSelect';
import DateRangePicker from '@/pages/AttendanceLogs/components/DateRangePicker';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/pages/AttendanceLogs/components/Popover';

import { buildChart } from './deskAbsenceChart';
import {
  getDeskAbsenceLogs,
  getZoneNames,
  getNVRs,
  getchannels,
} from './Api';

const LIMIT = 2;
const REFRESH_KEY = 'desk_absence_auto_refresh_enabled';
const INTERVAL_KEY = 'desk_absence_auto_refresh_interval';

const DeskAbsenceLogs = () => {
  const navigate = useNavigate();
  const maxDateDefault = moment().endOf('day').toDate();

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [startDate, setStartDate] = useState(moment().format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState(moment().format('YYYY-MM-DD'));

  // Filters: NVR, Camera (channel), Zone name
  const [nvrList, setNvrList] = useState([]);
  const [cameraList, setCameraList] = useState([]);
  const [zoneNameList, setZoneNameList] = useState([]);
  const [nvrIds, setNvrIds] = useState([]);
  const [channelIds, setChannelIds] = useState([]);
  const [zoneNames, setZoneNames] = useState([]);

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

  /* ─────────────── Permissions ─────────────── */
  const { permissions, loading: permissionsLoading } = usePermissions();
  // Desk Absence uses the accessLogs sub-section permission key. Resolve in
  // order: section-specific (accessLogs) → global → legacy flat.
  const resolveLogPerm = (action) => {
    const logs = permissions?.logs;
    if (!logs) return false;
    if (typeof logs.accessLogs?.[action] === 'boolean') return logs.accessLogs[action];
    if (typeof logs.global?.[action] === 'boolean') return logs.global[action];
    if (typeof logs[action] === 'boolean') return logs[action];
    return false;
  };
  const canView = resolveLogPerm('view');

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
      const res = await getDeskAbsenceLogs({
        skip,
        limit: LIMIT,
        startDate,
        endDate,
        nvrIds,
        channelIds,
        zoneNames,
      });
      const body = res?.data?.body?.data;
      setRecords(body?.data || []);
      setTotalCount(body?.totalCount || 0);
    } catch (err) {
      console.log('Error fetching desk absence logs:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [skip, startDate, endDate, nvrIds, channelIds, zoneNames]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs, manualTrigger]);

  // Load NVR list once.
  useEffect(() => {
    (async () => {
      try {
        const res = await getNVRs();
        setNvrList(res?.data?.body?.data || []);
      } catch (err) {
        console.log('Error fetching NVRs:', err);
      }
    })();
  }, []);

  // Load channels whenever the selected NVRs change.
  useEffect(() => {
    (async () => {
      try {
        const res = await getchannels({ nvrIds });
        setCameraList(res?.data?.body?.data || []);
      } catch (err) {
        console.log('Error fetching channels:', err);
      }
    })();
  }, [nvrIds]);

  // Load zone-name options once.
  useEffect(() => {
    (async () => {
      try {
        const res = await getZoneNames();
        const data = res?.data?.body?.data;
        // Support either ["z1","z2"] or [{ zoneName: "z1" }] shapes.
        const list = Array.isArray(data)
          ? data
          : data?.zoneNames || data?.data || [];
        setZoneNameList(list);
      } catch (err) {
        console.log('Error fetching zone names:', err);
      }
    })();
  }, []);

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
  }, [startDate, endDate, nvrIds, channelIds, zoneNames]);

  // Filter dropdown options
  const nvrOptions = useMemo(
    () => nvrList.map((nvr) => ({ label: nvr.nvrName, id: nvr._id || nvr.id })),
    [nvrList]
  );
  const cameraOptions = useMemo(
    () =>
      cameraList.map((cam) => ({
        label: cam.customName || cam.name,
        id: cam.id || cam._id,
      })),
    [cameraList]
  );
  const zoneOptions = useMemo(
    () =>
      (zoneNameList || [])
        .map((z) => (typeof z === 'string' ? z : z?.zoneName))
        .filter(Boolean)
        .map((name) => ({ label: name, id: name })),
    [zoneNameList]
  );

  const activeFiltersCount = [
    nvrIds.length > 0,
    channelIds.length > 0,
    zoneNames.length > 0,
  ].filter(Boolean).length;

  const resetFilters = () => {
    setNvrIds([]);
    setChannelIds([]);
    setZoneNames([]);
  };

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

  /* ─────────────── Guards ─────────────── */
  if (permissionsLoading) return null;
  if (!canView) {
    return (
      <AccessDenied
        message="You don't have permission to view Desk Absence Logs."
        onBack={() => navigate(-1)}
      />
    );
  }

  return (
    <div className="min-h-screen">
      <div className="w-full p-3 sm:p-4 space-y-5 md:space-y-7 xl:space-y-8 bg-[var(--bg1solid)] rounded-[18px]">
        <div className="border-[var(--bd)] rounded-[8px] xl:rounded-[20px] bg-[var(--bg2)] p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4">
          <h2 className="text-base font-semibold text-[var(--brand)]  dark:text-[#0094e2]">
            Desk Absence Logs
          </h2>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <DateRangePicker
              startDate={propStart}
              endDate={propEnd}
              maxDate={maxDateDefault}
              onRangeChange={(range) => {
                if (!range) return;
                const toIso = (d) =>
                  d instanceof Date ? moment(d).format('YYYY-MM-DD') : d;
                let s = range.start ? toIso(range.start) : null;
                let e = range.end ? toIso(range.end) : null;
                if (s && !e) e = s;
                if (!s && e) s = e;
                // Clearing resets to today (empty dates would return all data).
                if (!s && !e) {
                  const today = moment().format('YYYY-MM-DD');
                  s = today;
                  e = today;
                }
                setStartDate(s);
                setEndDate(e);
              }}
            />

            {/* NVR / Camera / Zone filters */}
            <Popover>
              <PopoverTrigger asChild>
                <Button className="flex bg-[linear-gradient(94.16deg,#FFFFFF_0.77%,#AAE2FF_99.4%)] rounded-lg text-[#333333] cursor-pointer items-center gap-2 relative h-9">
                  <Filter className="w-4 h-4" />
                  Filters
                  {activeFiltersCount > 0 && (
                    <span className="bg-[var(--brand)] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] h-5 flex items-center justify-center">
                      {activeFiltersCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[320px] rounded-xl p-4" align="start">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-[var(--bd)] pb-2">
                    <h4 className="font-semibold text-base text-[var(--tx)]">Filters</h4>
                    {activeFiltersCount > 0 && (
                      <button
                        onClick={resetFilters}
                        className="flex items-center gap-1 cursor-pointer text-xs text-[var(--brand)] hover:underline"
                      >
                        <RotateCcw className="w-3 h-3 cursor-pointer" /> Reset all
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    <MultiSelect
                      options={nvrOptions}
                      value={nvrIds}
                      onChange={(value) => {
                        setNvrIds(value);
                        if (value.length === 0) setChannelIds([]);
                      }}
                      placeholder="Select NVR"
                      searchable
                      className="w-full"
                      maxHeight="max-h-40"
                      msg="No NVR Found"
                    />
                    <MultiSelect
                      options={cameraOptions}
                      value={channelIds}
                      onChange={setChannelIds}
                      placeholder="Select Camera"
                      searchable
                      className="w-full"
                      maxHeight="max-h-40"
                      msg="No Camera Found"
                    />
                    <MultiSelect
                      options={zoneOptions}
                      value={zoneNames}
                      onChange={setZoneNames}
                      placeholder="Select Zone"
                      searchable
                      className="w-full"
                      maxHeight="max-h-40"
                      msg="No Zone Found"
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>

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
            <div className="flex items-center justify-center py-16 text-[var(--tx3)] text-sm">
              Loading...
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-16 text-[var(--crit)] text-sm">
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
                  className="bg-[var(--bg1solid)] rounded-xl border border-[var(--bd)] p-4 shadow-sm"
                >
                  {/* NVR + Camera header */}
                  <div className="flex items-center gap-4 mb-3">
                    <span className="text-xs font-medium text-[var(--tx2)] bg-[var(--bg2)] px-3 py-1 rounded-full">
                      NVR Name:{' '}
                      <span className="text-[var(--brand)] font-semibold">
                        {chart.nvrName}
                      </span>
                    </span>
                    <span className="text-xs font-medium text-[var(--tx2)] bg-[var(--bg2)] px-3 py-1 rounded-full">
                      Camera Name:{' '}
                      <span className="text-[var(--brand)] font-semibold">
                        {chart.cameraName}
                      </span>
                    </span>
                  </div>

                  {chart.seriesData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[220px] text-[var(--tx3)] text-sm">
                      <ChartColumnBig className="w-10 h-10 mb-2 text-[var(--tx3)]" />
                      No time-series data
                    </div>
                  ) : (
                    <ReactApexChart
                      options={chart.options}
                      series={[{ name: 'Person Count', data: chart.seriesData }]}
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
            <div className="text-sm text-[var(--tx)] bg-[var(--bg2)] px-3 py-1.5 font-[400] rounded-[5px] w-42 inline-flex items-center gap-2">
              Total logs -{' '}
              <span className="text-[var(--brand)] font-medium bg-[var(--brand)]/10 px-2.5 py-1 rounded-md">
                {totalCount}
              </span>
            </div>

            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className={`flex items-center justify-center w-8 h-8 rounded ${
                  currentPage === 1
                    ? 'text-[var(--tx3)] cursor-not-allowed'
                    : 'text-[var(--tx2)] hover:bg-[var(--bg3)] cursor-pointer'
                }`}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {getPaginationPages().map((page, index) =>
                page === '...' ? (
                  <span
                    key={`ellipsis-${index}`}
                    className="flex items-center justify-center w-8 h-8 text-[var(--tx3)]"
                  >
                    ...
                  </span>
                ) : (
                  <button
                    key={page}
                    onClick={() => handlePageChange(page)}
                    className={`flex items-center justify-center w-8 h-8 rounded text-sm font-medium cursor-pointer ${
                      currentPage === page
                        ? 'bg-[var(--brand)] text-white'
                        : 'text-[var(--tx2)] hover:bg-[var(--bg3)]'
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
                    ? 'text-[var(--tx3)] cursor-not-allowed'
                    : 'text-[var(--tx2)] hover:bg-[var(--bg3)] cursor-pointer'
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

export default DeskAbsenceLogs;
