import useMetadataEffect from '@/hooks/useMetadataEffect';
import useLogPolling from '@/hooks/useLogPolling';
import React, { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import ReactApexChart from 'react-apexcharts';
import moment from 'moment-timezone';
import { useNavigate } from 'react-router-dom';
import {
  ChartColumnBig,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  RotateCcw,
  SearchX,
  Search,
  UserCheck,
  Users,
  UserX,
} from 'lucide-react';
import { usePermissions } from '@/context/PermissionContext';
import AccessDenied from '@/components/AccessDenied';
import { Button } from '@/components/ui/button';

import AutoRefreshComponent from '@/pages/AttendanceLogs/components/AutoRefreshComponent';
import MultiSelect from '@/pages/AttendanceLogs/components/MultiSelect';
import DateRangePicker from '@/components/PresetDateRangePicker';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/pages/AttendanceLogs/components/Popover';

import { DEFAULT_LOG_PAGE_SIZE } from '@/pages/AttendanceLogs/components/ReusableTablePage';
import DeskAbsenceImageLogs, { mapDeskAbsenceImage } from './DeskAbsenceImageLogs';
import { buildChart } from './deskAbsenceChart';
import {
  getDeskAbsenceLogs,
  getZoneNames,
  getNVRs,
  getchannels,
} from './Api';

const LIMIT = 2;
const TABS = [['logs', 'Logs'], ['graph', 'Graph']];
const STATUS_FILTERS = [
  ['all', 'All', Users],
  ['present', 'Present', UserCheck],
  ['absent', 'Absent', UserX],
];
const REFRESH_KEY = 'desk_absence_auto_refresh_enabled';
const INTERVAL_KEY = 'desk_absence_auto_refresh_interval';

const DeskAbsenceLogs = () => {
  const navigate = useNavigate();
  const maxDateDefault = moment().endOf('day').toDate();

  const [records, setRecords] = useState([]);
  const [tab, setTab] = useState('logs');
  const tabButtons = useRef({});
  const [viewMode, setViewMode] = useState('grid');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [logSearch, setLogSearch] = useState('');
  const [listSort, setListSort] = useState({ sortField: 'incidentTime', sortOrder: 'desc' });
  const [imageLimit, setImageLimit] = useState(DEFAULT_LOG_PAGE_SIZE);
  const requestId = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [imageSummary, setImageSummary] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [startDate, setStartDate] = useState(moment().format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState(moment().format('YYYY-MM-DD'));
  const [drilldownStack, setDrilldownStack] = useState([]);

  const baseView = useMemo(() => {
    const rangeDays = Math.max(1, moment(endDate).diff(moment(startDate), 'days') + 1);
    const granularity = rangeDays === 1 ? 'time' : rangeDays > 90 ? 'month' : 'day';
    return {
      granularity,
      startDate,
      endDate,
      label: granularity === 'month'
        ? 'Monthly overview'
        : granularity === 'day'
          ? 'Daily overview'
          : moment(startDate).format('DD MMMM YYYY'),
    };
  }, [startDate, endDate]);
  const graphView = drilldownStack[drilldownStack.length - 1] || baseView;
  const activeView = tab === 'graph' ? graphView : baseView;

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
  // Resolve in order: section-specific (deskLogs) → accessLogs (legacy shared
  // key, kept for roles seeded before deskLogs was wired here) → global.
  const resolveLogPerm = (action) => {
    const logs = permissions?.logs;
    if (!logs) return false;
    if (typeof logs.deskLogs?.[action] === 'boolean') return logs.deskLogs[action];
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

  const pageSize = tab === 'logs' ? imageLimit : LIMIT;
  const sortField = tab === 'logs' && viewMode === 'table' ? listSort.sortField : undefined;
  const sortOrder = sortField ? listSort.sortOrder : undefined;
  const personPresent = tab === 'logs' && statusFilter !== 'all' ? statusFilter === 'present' : undefined;
  const search = tab === 'logs' ? logSearch : undefined;
  const searchPending = searchInput.trim() !== logSearch;
  const totalPages = Math.max(1, Math.ceil(totalCount / LIMIT));

  const fetchLogs = useCallback(async ({ background = false } = {}) => {
    if (!canView) return;
    const id = ++requestId.current;
    if (!background) setLoading(true);
    setError(null);
    try {
      const res = await getDeskAbsenceLogs({
        skip: (currentPage - 1) * pageSize,
        limit: pageSize,
        mode: tab === 'logs' ? 'images' : undefined,
        sortField,
        sortOrder,
        personPresent,
        search,
        startDate: activeView.startDate,
        endDate: activeView.endDate,
        granularity: activeView.granularity,
        nvrIds,
        channelIds,
        zoneNames,
      });
      const body = res?.data?.body?.data;
      if (id !== requestId.current) return;
      if (!Array.isArray(body?.data) || (tab === 'logs' && body.mode !== 'images')) {
        throw new Error('Invalid desk absence logs response');
      }
      const count = body.totalCount || 0;
      const lastPage = Math.max(1, Math.ceil(count / pageSize));
      if (currentPage > lastPage) setCurrentPage(lastPage);
      setRecords(tab === 'logs' ? body.data.map(mapDeskAbsenceImage) : body.data);
      setTotalCount(count);
      if (tab === 'logs') setImageSummary(body.summary);
    } catch (err) {
      if (id !== requestId.current) return;
      console.log('Error fetching desk absence logs:', err);
      setError(err);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [canView, currentPage, pageSize, tab, sortField, sortOrder, personPresent, search, activeView.startDate, activeView.endDate, activeView.granularity, nvrIds, channelIds, zoneNames]);

  useEffect(() => {
    if (tab !== 'logs' || !searchPending) return;
    const timer = setTimeout(() => {
      requestId.current += 1;
      setLoading(true);
      setCurrentPage(1);
      setLogSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [tab, searchInput, searchPending]);

  useEffect(() => {
    fetchLogs();
    return () => { requestId.current += 1; };
  }, [fetchLogs, manualTrigger]);

  // Load NVR list once.
  useMetadataEffect(() => {
    let metadataActive = true;
    (async () => {
      try {
        const res = await getNVRs();
        if (!metadataActive) return;
        setNvrList(res?.data?.body?.data || []);
      } catch (err) {
        console.log('Error fetching NVRs:', err);
      }
    })();

    return () => { metadataActive = false; };
  }, [], ["nvrs"]);

  // Load channels whenever the selected NVRs change.
  useMetadataEffect(() => {
    let metadataActive = true;
    (async () => {
      try {
        const res = await getchannels({ nvrIds });
        if (!metadataActive) return;
        setCameraList(res?.data?.body?.data || []);
      } catch (err) {
        console.log('Error fetching channels:', err);
      }
    })();

    return () => { metadataActive = false; };
  }, [nvrIds], ["cameras"]);

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

  useLogPolling(fetchLogs, autoRefresh, refreshInterval, loading);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
    setDrilldownStack([]);
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

  const handlePointSelect = useCallback((period) => {
    if (!period || activeView.granularity === 'time') return;

    if (activeView.granularity === 'month') {
      const monthStart = `${period}-01`;
      const monthEnd = moment(period, 'YYYY-MM').endOf('month').format('YYYY-MM-DD');
      setDrilldownStack((current) => [
        ...current,
        {
          granularity: 'day',
          startDate: monthStart < activeView.startDate ? activeView.startDate : monthStart,
          endDate: monthEnd > activeView.endDate ? activeView.endDate : monthEnd,
          label: moment(period, 'YYYY-MM').format('MMMM YYYY'),
        },
      ]);
    } else {
      setDrilldownStack((current) => [
        ...current,
        {
          granularity: 'time',
          startDate: period,
          endDate: period,
          label: moment(period, 'YYYY-MM-DD').format('DD MMMM YYYY'),
        },
      ]);
    }
    setCurrentPage(1);
  }, [activeView]);

  const charts = tab === 'graph' ? records.map((record) => buildChart(record, {
    granularity: activeView.granularity,
    onPointSelect: handlePointSelect,
    rangeStart: activeView.startDate,
    rangeEnd: activeView.endDate,
  })) : [];

  const viewRangeLabel = activeView.startDate === activeView.endDate
    ? moment(activeView.startDate).format('DD MMMM YYYY')
    : `${moment(activeView.startDate).format('DD MMM YYYY')} - ${moment(activeView.endDate).format('DD MMM YYYY')}`;

  const propStart = useMemo(() => moment(startDate).startOf('day').toDate(), [startDate]);
  const propEnd = useMemo(() => moment(endDate).startOf('day').toDate(), [endDate]);

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

  const datePicker = (
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
  );
  const filterActions = (
    <>
      {/* NVR / Camera / Zone filters */}
      <Popover>
        <PopoverTrigger asChild>
          <Button className="flex bg-[var(--violet)]/10 border border-[var(--violet)]/30 rounded-lg text-[var(--violet)] font-semibold hover:bg-[var(--violet)]/15 cursor-pointer items-center gap-2 relative h-10">
            <Filter className="w-4 h-4" />
            Filters
            {activeFiltersCount > 0 && (
              <span className="bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] h-5 flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] rounded-xl p-4" align="end">
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

      <AutoRefreshComponent
        isActive={autoRefresh}
        onActiveChange={setAutoRefresh}
        refreshInterval={refreshInterval}
        onIntervalChange={setRefreshInterval}
        onManualRefresh={() => setManualTrigger((prev) => prev + 1)}
      />
    </>
  );
  const breadcrumbs = tab === 'graph' && (baseView.granularity !== 'time' || drilldownStack.length > 0) && (
    <div aria-label="Graph overview" className="flex flex-wrap items-center gap-2 text-base">
      <button
        type="button"
        onClick={() => {
          setDrilldownStack([]);
          setCurrentPage(1);
        }}
        className={`font-semibold ${drilldownStack.length > 0 ? 'text-[var(--violet)] hover:underline cursor-pointer' : 'text-[var(--tx)] cursor-default'}`}
      >
        {baseView.label}
      </button>
      {drilldownStack.map((view, index) => (
        <React.Fragment key={`${view.granularity}-${view.startDate}`}>
          <ChevronRight className="w-4 h-4 text-[var(--tx3)]" />
          <button
            type="button"
            onClick={() => {
              if (index === drilldownStack.length - 1) return;
              setDrilldownStack((current) => current.slice(0, index + 1));
              setCurrentPage(1);
            }}
            className={`font-semibold ${index === drilldownStack.length - 1 ? 'text-[var(--tx)] cursor-default' : 'text-[var(--violet)] hover:underline cursor-pointer'}`}
          >
            {view.label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );

  const selectTab = (nextTab) => {
    if (nextTab === tab) return;
    requestId.current += 1;
    setRecords([]);
    setTotalCount(0);
    setError(null);
    setLoading(true);
    setCurrentPage(1);
    setTab(nextTab);
  };

  const moveTabFocus = (event, currentTab) => {
    const first = TABS[0][0];
    const last = TABS[TABS.length - 1][0];
    const next = {
      Home: first,
      End: last,
      ArrowLeft: currentTab === first ? last : first,
      ArrowRight: currentTab === last ? first : last,
    }[event.key];
    if (!next) return;
    event.preventDefault();
    tabButtons.current[next]?.focus();
    selectTab(next);
  };

  const filters = {
    startDate: activeView.startDate,
    endDate: activeView.endDate,
    nvrIds,
    channelIds,
    zoneNames,
  };
  const statusTabs = (
    <div
      role="group"
      aria-label="Filter by presence status"
      className="flex h-10 items-center gap-1 rounded-[10px] border border-[var(--bd)] bg-[var(--bg2)] p-1"
    >
      {STATUS_FILTERS.map(([value, label, Icon]) => (
        <button
          key={value}
          type="button"
          aria-pressed={statusFilter === value}
          className={`flex h-full cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[7px] px-3 text-xs font-semibold transition-colors ${statusFilter === value
            ? 'bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white shadow-sm'
            : 'text-[var(--tx2)] hover:text-[var(--tx)]'}`}
          onClick={() => {
            if (value === statusFilter) return;
            requestId.current += 1;
            setLoading(true);
            setCurrentPage(1);
            setStatusFilter(value);
          }}
        >
          <Icon size={14} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
  const logSearchControls = (
    <>
      <label className="relative flex h-10 w-full items-center rounded-[10px] border border-[var(--bd)] bg-[var(--bg2)] focus-within:border-[var(--violet)] sm:w-[300px]">
        <Search className="pointer-events-none absolute left-3 h-4 w-4 text-[var(--tx3)]" aria-hidden="true" />
        <input
          type="search"
          aria-label="Search desk absence logs"
          placeholder="Search description, severity, NVR, camera, or zone"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          className="h-full w-full bg-transparent pl-9 pr-3 text-sm text-[var(--tx)] outline-none placeholder:text-[var(--tx3)]"
        />
      </label>
      {statusTabs}
    </>
  );
  const sortListBy = (field) => {
    setCurrentPage(1);
    setListSort((current) => ({
      sortField: field,
      sortOrder: current.sortField === field && current.sortOrder === 'asc' ? 'desc' : 'asc',
    }));
  };
  const stats = [
    { label: 'Total Desk Absence Logs', value: loading ? '—' : imageSummary?.totalCount ?? totalCount, color: 'var(--blue)' },
    { label: 'Present', value: loading ? '—' : imageSummary?.presentCount ?? '—', color: 'var(--ok)' },
    { label: 'Absent', value: loading ? '—' : imageSummary?.absentCount ?? '—', color: 'var(--crit)' },
  ];

  return (
    <div className="p-3 sm:p-4 lg:p-[22px] flex flex-col gap-3 sm:gap-[18px] min-h-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Desk Absence views" className="flex w-fit gap-1 rounded-lg border border-[var(--bd)] bg-[var(--bg2)] p-1">
          {TABS.map(([value, label]) => (
            <button
              key={value}
              ref={(node) => { tabButtons.current[value] = node; }}
              id={`desk-absence-tab-${value}`}
              type="button"
              role="tab"
              aria-controls={`desk-absence-panel-${value}`}
              aria-selected={tab === value}
              tabIndex={tab === value ? 0 : -1}
              onClick={() => selectTab(value)}
              onKeyDown={(event) => moveTabFocus(event, value)}
              className={`cursor-pointer rounded-md px-4 py-2 text-sm font-semibold ${tab === value
                ? 'bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white'
                : 'text-[var(--tx2)] hover:text-[var(--tx)]'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex w-full flex-wrap items-center gap-3 sm:w-auto">
          {datePicker}
        </div>
      </div>

      <div
        id={`desk-absence-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`desk-absence-tab-${tab}`}
        className="flex min-w-0 flex-1 flex-col"
      >
        {tab === 'logs' && !error ? (
          <DeskAbsenceImageLogs
            key={JSON.stringify([filters, sortField, sortOrder])}
            rows={records}
            loading={loading || searchPending}
            totalCount={totalCount}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            limit={imageLimit}
            onLimitChange={setImageLimit}
            viewMode={viewMode}
            setViewMode={(nextViewMode) => {
              if (nextViewMode !== viewMode && (listSort.sortField !== 'incidentTime' || listSort.sortOrder !== 'desc')) {
                setCurrentPage(1);
              }
              setViewMode(nextViewMode);
            }}
            stats={stats}
            logSearchControls={logSearchControls}
            filterActions={filterActions}
            filters={{ ...filters, sortField, sortOrder, personPresent, search }}
            sort={listSort}
            onSort={sortListBy}
          />
        ) : (
          <>
            <div className="w-full flex flex-1 flex-col bg-[var(--bg1)] border border-[var(--bd)] rounded-[16px] p-4 sm:p-5 space-y-4">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-3">
                {tab === 'logs' && logSearchControls}
                {breadcrumbs}
                <div className="w-full md:flex md:items-center md:ml-auto md:w-auto gap-3 flex flex-wrap">
                  {filterActions}
                </div>
              </div>
              {tab === 'graph' && !loading && !error && activeView.granularity !== 'time'
                && charts.some((chart) => chart.seriesData.length > 0) && (
                  <p className="text-xs text-[var(--tx3)]">
                    Click a {activeView.granularity === 'month' ? 'month' : 'date'} point to view more detail.
                  </p>
              )}

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
                    Something went wrong while loading desk absence logs. Please refresh and try again.
                  </p>
                </div>
              ) : charts.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center py-16">
                  <div className="w-16 h-16 rounded-full bg-[var(--bg2)] border border-[var(--bd)] flex items-center justify-center mb-4">
                    <SearchX className="w-7 h-7 text-[var(--tx3)]" />
                  </div>
                  <p className="text-[18px] font-semibold text-[var(--tx)]" style={{ fontFamily: 'var(--disp)' }}>
                    No desk absence logs found
                  </p>
                  <p className="text-sm text-[var(--tx3)] mt-1.5 max-w-[320px] text-center">
                    There are no desk absence logs for the selected date range. Try widening the range or clearing filters.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {charts.map((chart, idx) => (
                    <div
                      key={`${chart.id || idx}-${activeView.granularity}`}
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
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--tx2)] bg-[var(--bg1)] border border-[var(--bd)] px-3 py-1 rounded-full">
                          <CalendarDays className="w-3.5 h-3.5 text-[var(--violet)]" />
                          {activeView.startDate === activeView.endDate ? 'Date' : 'Range'}:{' '}
                          <span className="text-[var(--violet)] font-semibold">
                            {viewRangeLabel}
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
                          series={[{
                            name: activeView.granularity === 'time' ? 'Person Count' : 'Total Count',
                            data: chart.seriesData,
                          }]}
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
            {!loading && !error && charts.length > 0 && (
              <div className="mt-4 flex items-center justify-center">
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
                            ? 'bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white'
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
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default DeskAbsenceLogs;
