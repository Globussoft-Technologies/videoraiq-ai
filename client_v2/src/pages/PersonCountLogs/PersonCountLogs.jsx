import React, { useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactApexChart from 'react-apexcharts';
import moment from 'moment-timezone';
import {
  ChartColumnBig,
  ChevronLeft,
  ChevronRight,
  Loader2,
  SearchX,
} from 'lucide-react';
import { usePermissions } from '@/context/PermissionContext';
import AccessDenied from '@/components/AccessDenied';

import { fetchPersonCountLogs } from './Api';
import { buildChart } from './personCountChart';
import AutoRefreshComponent from '@/pages/AttendanceLogs/components/AutoRefreshComponent';
import DateRangePicker from '@/pages/AttendanceLogs/components/DateRangePicker';

const LIMIT = 2;

const REFRESH_KEY = 'person_count_auto_refresh_enabled';
const INTERVAL_KEY = 'person_count_auto_refresh_interval';

const PersonCountLogs = () => {
  const navigate = useNavigate();
  const { permissions, loading: permissionsLoading } = usePermissions();

  // Person Count uses the accessLogs permission key in V1. Resolve in order:
  // section-specific (accessLogs) → global → legacy flat.
  const resolveLogPerm = (action) => {
    const logs = permissions?.logs;
    if (!logs) return false;
    if (typeof logs.accessLogs?.[action] === 'boolean') return logs.accessLogs[action];
    if (typeof logs.global?.[action] === 'boolean') return logs.global[action];
    if (typeof logs[action] === 'boolean') return logs[action];
    return false;
  };
  const canView = resolveLogPerm('view');

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
      const res = await fetchPersonCountLogs({ skip, limit: LIMIT, startDate, endDate });
      const body = res?.data?.body?.data;
      setRecords(body?.data || []);
      setTotalCount(body?.totalCount || 0);
    } catch (err) {
      console.log('Error fetching person count logs:', err);
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

  if (permissionsLoading) return null;
  if (!canView) {
    return (
      <AccessDenied
        message="You don't have permission to view Person Count Logs."
        onBack={() => navigate(-1)}
      />
    );
  }

  return (
    <div className="p-3 sm:p-4 lg:p-[22px] flex flex-col gap-3 sm:gap-[18px] min-h-full">
      <div className="w-full flex flex-1 flex-col bg-[var(--bg1)] border border-[var(--bd)] rounded-[16px] p-4 sm:p-5 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
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

          <div className="w-full md:flex md:items-center md:ml-auto md:w-auto gap-3 flex flex-wrap">
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
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="w-10 h-10 text-[var(--brand)] animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-full bg-[var(--crit)]/10 border border-[var(--crit)]/20 flex items-center justify-center mb-4">
              <SearchX className="w-7 h-7 text-[var(--crit)]" />
            </div>
            <p className="text-[18px] font-semibold text-[var(--tx)]" style={{ fontFamily: 'var(--disp)' }}>
              Failed to load
            </p>
            <p className="text-sm text-[var(--tx3)] mt-1.5 max-w-[320px] text-center">
              Something went wrong while loading person count logs. Please refresh and try again.
            </p>
          </div>
        ) : charts.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-full bg-[var(--bg2)] border border-[var(--bd)] flex items-center justify-center mb-4">
              <SearchX className="w-7 h-7 text-[var(--tx3)]" />
            </div>
            <p className="text-[18px] font-semibold text-[var(--tx)]" style={{ fontFamily: 'var(--disp)' }}>
              No person count logs found
            </p>
            <p className="text-sm text-[var(--tx3)] mt-1.5 max-w-[320px] text-center">
              There are no person count logs for the selected date range. Try widening the range.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {charts.map((chart, idx) => (
              <div
                key={idx}
                className="bg-[var(--bg2)] rounded-[12px] border border-[var(--bd)] p-4 shadow-sm"
              >
                {/* NVR + Camera header */}
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <span className="text-xs font-medium text-[var(--tx2)] bg-[var(--bg1)] border border-[var(--bd)] px-3 py-1 rounded-full">
                    NVR Name:{' '}
                    <span className="text-[var(--violet)] font-semibold">
                      {chart.nvrName}
                    </span>
                  </span>
                  <span className="text-xs font-medium text-[var(--tx2)] bg-[var(--bg1)] border border-[var(--bd)] px-3 py-1 rounded-full">
                    Camera Name:{' '}
                    <span className="text-[var(--violet)] font-semibold">
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
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 items-center gap-4">
          <div className="text-sm text-[var(--tx2)] bg-[var(--bg2)] px-3 py-1.5 font-normal rounded-[8px] w-fit inline-flex items-center gap-2">
            Total logs -{' '}
            <span className="text-[var(--violet)] font-semibold bg-[var(--violet)]/10 px-2.5 py-1 rounded-md">
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
                  : 'text-[var(--tx2)] hover:bg-[var(--bg2)] cursor-pointer'
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
                      ? 'bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white hover:opacity-95'
                      : 'text-[var(--tx2)] hover:bg-[var(--bg2)]'
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
                  : 'text-[var(--tx2)] hover:bg-[var(--bg2)] cursor-pointer'
              }`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div />
        </div>
      )}
    </div>
  );
};

export default PersonCountLogs;
