import React, { useCallback, useEffect, useMemo, useState } from 'react';
import moment from 'moment-timezone';
import {
  CarFront,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  LogIn,
  LogOut,
  RotateCcw,
  Search,
  SearchX,
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import PresetDateRangePicker from '@/components/PresetDateRangePicker';
import ImageWithLoader from '@/pages/AttendanceLogs/components/ImageWithLoader';
import ImagePreviewModal from '@/pages/ANPRLogs/components/ImagePreviewModal';
import ExportButton from '@/pages/AttendanceLogs/components/ExportButton';
import AutoRefreshComponent from '@/pages/AttendanceLogs/components/AutoRefreshComponent';
import MultiSelect from '@/pages/AttendanceLogs/components/MultiSelect';
import { Popover, PopoverContent, PopoverTrigger } from '@/pages/AttendanceLogs/components/Popover';
import VehicleNumberSelect from '@/pages/ANPRLogs/components/VehicleNumberSelect';
import AccessDenied from '@/components/AccessDenied';
import PageLoader from '@/components/PageLoader';
import { usePermissions } from '@/context/PermissionContext';
import {
  fetchVehicleCheckInOutLogs,
  getNVRs,
  getChannels,
  getVehicleNumbers,
} from './Api';
import { handleVehicleCheckInOutExport } from './vehicleCheckInOutExport';

const PAGE_SIZES = [10, 25, 50, 100];

const REFRESH_KEY = 'vehicleCheckInOut:autoRefresh';
const INTERVAL_KEY = 'vehicleCheckInOut:refreshInterval';

/** Same resolver Car Logs uses — DS sends a path, not a URL. */
const getImageUrl = (item) => {
  const path = item?.Image || item?.image || item?.imageUrl || '';
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${import.meta.env.VITE_INCIDENT_URL || ''}${path}`;
};

const fmtTime = (value) => (value ? moment(value).format('DD/MM/YYYY hh:mm A') : '--');
const fmtFirstCheckIn = (row) => (Number(row?.checkInCount || 0) > 0 ? fmtTime(row.timeOfIncident) : '--');
const dash = (value) => (value === null || value === undefined || value === '' ? '--' : value);

const cameraName = (row) => row?.channelData?.customName || row?.channelData?.name || '--';

/**
 * Custody is the reason this page exists: a car that checked in and has not
 * checked back out is still on the premises, so it reads as a state, not a
 * timestamp.
 */
const CustodyChip = ({ inCustody }) => (
  <span
    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap"
    style={{
      color: inCustody ? 'var(--warn)' : 'var(--ok)',
      background: `color-mix(in srgb, ${inCustody ? 'var(--warn)' : 'var(--ok)'} 15%, transparent)`,
    }}
  >
    <span
      className="w-1.5 h-1.5 rounded-full"
      style={{ background: inCustody ? 'var(--warn)' : 'var(--ok)' }}
    />
    {inCustody ? 'In custody' : 'Returned'}
  </span>
);

const DirectionChip = ({ checkin }) => (
  <span
    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap"
    style={{
      color: checkin ? 'var(--ok)' : 'var(--warn)',
      background: `color-mix(in srgb, ${checkin ? 'var(--ok)' : 'var(--warn)'} 14%, transparent)`,
    }}
  >
    {checkin ? <LogIn className="w-3 h-3" /> : <LogOut className="w-3 h-3" />}
    {checkin ? 'Check-In' : 'Check-Out'}
  </span>
);

const CUSTODY_TABS = [
  { id: '', label: 'All' },
  { id: 'true', label: 'In custody' },
  { id: 'false', label: 'Returned' },
];

const th = 'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--tx2)] whitespace-nowrap';
const td = 'px-4 py-3 text-sm text-[var(--tx)] align-middle';

const VehicleCheckInOutLogs = () => {
  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [custody, setCustody] = useState('');
  const [nvrIds, setNvrIds] = useState([]);
  const [channelIds, setChannelIds] = useState([]);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [vehicleNumberSearch, setVehicleNumberSearch] = useState('');

  const [nvrList, setNvrList] = useState([]);
  const [cameraList, setCameraList] = useState([]);
  const [vehicleNumberList, setVehicleNumberList] = useState([]);
  const [startDate, setStartDate] = useState(moment().format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState(moment().format('YYYY-MM-DD'));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [gotoPage, setGotoPage] = useState('');

  const [autoRefresh, setAutoRefresh] = useState(() => {
    const saved = localStorage.getItem(REFRESH_KEY);
    return saved !== null ? saved === 'true' : true;
  });
  const [refreshInterval, setRefreshInterval] = useState(() => {
    const parsed = parseInt(localStorage.getItem(INTERVAL_KEY), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 30;
  });

  // vehicleKey -> { loading, data } for the expanded sub-rows.
  const [expanded, setExpanded] = useState({});
  const [previewIndex, setPreviewIndex] = useState(-1);
  const [exporting, setExporting] = useState(null);

  const { permissions, loading: permissionsLoading } = usePermissions();
  const canView = permissions?.logs?.vehicleCheckInOutLogs?.view
    ?? permissions?.logs?.carLogs?.view
    ?? permissions?.logs?.view
    ?? true;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchVehicleCheckInOutLogs({
        skip: (page - 1) * pageSize,
        limit: pageSize,
        startDate,
        endDate,
        custody,
        nvrIds,
        channelIds,
        search: debouncedSearch || vehicleNumber,
        // Bring each vehicle's crossings back with the row so the image
        // preview can walk every crossing image without an expand or a
        // second request.
        includeHistory: true,
      });
      const data = res?.data?.body?.data;
      setRows(data?.data || []);
      setTotalCount(data?.totalCount || 0);
      // Any open sub-rows belong to the previous result set.
      setExpanded({});
    } catch (err) {
      console.error(err);
      toast.error(
        err?.response?.data?.body?.message || 'Failed to fetch vehicle check-in/out logs',
      );
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, startDate, endDate, custody, nvrIds, channelIds, vehicleNumber, debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [nvrIds, channelIds, vehicleNumber, custody]);

  // Filter option sources.
  useEffect(() => {
    getNVRs()
      .then((res) => setNvrList(res?.data?.body?.data || []))
      .catch((err) => console.error('Failed to fetch NVRs', err));
  }, []);

  useEffect(() => {
    getChannels({ nvrIds })
      .then((res) => setCameraList(res?.data?.body?.data || []))
      .catch((err) => console.error('Failed to fetch cameras', err));
  }, [nvrIds]);

  useEffect(() => {
    const timer = setTimeout(() => {
      getVehicleNumbers({
        search: vehicleNumberSearch,
        startDate,
        endDate,
        nvrIds,
        channelIds,
      })
        .then((res) => setVehicleNumberList(res?.data?.body?.data?.vehicleNumbers || []))
        .catch((err) => console.error('Failed to fetch vehicle numbers', err));
    }, 300);
    return () => clearTimeout(timer);
  }, [vehicleNumberSearch, startDate, endDate, nvrIds, channelIds]);

  useEffect(() => localStorage.setItem(REFRESH_KEY, autoRefresh), [autoRefresh]);
  useEffect(() => localStorage.setItem(INTERVAL_KEY, refreshInterval), [refreshInterval]);

  useEffect(() => {
    if (!autoRefresh || refreshInterval <= 0) return undefined;
    const id = setInterval(load, refreshInterval * 1000);
    return () => clearInterval(id);
  }, [autoRefresh, refreshInterval, load]);

  // Crossings arrive with the row (includeHistory), so expanding is just a
  // visual toggle — no request.
  const toggleRow = (row) => {
    const key = row.vehicleKey;
    setExpanded((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = true;
      return next;
    });
  };

  // Newest crossing first for the expand panel.
  const crossingsOf = (row) =>
    [...(row.crossings || [])].sort(
      (a, b) => new Date(b.timeOfIncident) - new Date(a.timeOfIncident),
    );

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Exactly what the table is currently showing. Paging is deliberately absent:
  // an export covers the whole filtered set, not the page on screen.
  const exportFilters = useMemo(
    () => ({
      startDate,
      endDate,
      custody,
      nvrIds,
      channelIds,
      search: debouncedSearch || vehicleNumber,
    }),
    [startDate, endDate, custody, nvrIds, channelIds, vehicleNumber, debouncedSearch],
  );

  const nvrOptions = useMemo(
    () => nvrList.map((nvr) => ({ label: nvr.nvrName, id: nvr._id || nvr.id })),
    [nvrList],
  );
  const cameraOptions = useMemo(
    () => cameraList.map((cam) => ({ label: cam.customName || cam.name, id: cam._id || cam.id })),
    [cameraList],
  );
  const filteredVehicleNumbers = useMemo(() => {
    const query = vehicleNumberSearch.trim().toLowerCase();
    if (!query) return vehicleNumberList;
    return vehicleNumberList.filter((n) => String(n).toLowerCase().includes(query));
  }, [vehicleNumberList, vehicleNumberSearch]);

  const activeFiltersCount = [nvrIds.length > 0, channelIds.length > 0, !!vehicleNumber].filter(
    Boolean,
  ).length;

  const resetFilters = () => {
    setNvrIds([]);
    setChannelIds([]);
    setVehicleNumber('');
    setVehicleNumberSearch('');
  };

  const runExport = async (format) => {
    setExporting(format);
    try {
      await handleVehicleCheckInOutExport(format, exportFilters);
    } finally {
      setExporting(null);
    }
  };

  const summary = useMemo(
    () => ({
      inCustody: rows.filter((r) => r.custody).length,
      returned: rows.filter((r) => !r.custody).length,
    }),
    [rows],
  );

  // Every image slot for the vehicles on this page, in row order: each vehicle's
  // own thumbnail, then every one of its crossings. One slot per clickable
  // image on screen — nothing is de-duplicated, so a vehicle's thumbnail and
  // its matching check-in crossing are two separate stops. Crossings ride along
  // with the rows (includeHistory), so the list is complete whether or not any
  // row is expanded. Each slot carries a stable `key` so a click opens the
  // exact slot rather than the first row with the same URL.
  const previewSlots = useMemo(() => {
    const slots = [];
    rows.forEach((row) => {
      const rowImg = getImageUrl(row);
      if (rowImg) slots.push({ key: `${row.vehicleKey}:row`, url: rowImg });
      (row.crossings || []).forEach((c) => {
        const url = getImageUrl(c);
        if (url) slots.push({ key: `${row.vehicleKey}:${c._id}`, url });
      });
    });
    return slots;
  }, [rows]);

  const previewImages = useMemo(() => previewSlots.map((s) => s.url), [previewSlots]);

  const openPreview = (slotKey) => {
    const index = previewSlots.findIndex((s) => s.key === slotKey);
    setPreviewIndex(index >= 0 ? index : -1);
  };
  const previewImage = previewIndex >= 0 ? previewImages[previewIndex] : null;

  if (permissionsLoading) return <PageLoader />;
  if (!canView) return <AccessDenied />;

  return (
    <div className="p-3 sm:p-4 lg:p-[22px] flex flex-col gap-[18px] min-h-full">
      <div className="w-full flex-1 flex flex-col p-3 sm:p-5 bg-[var(--bg1)] border border-[var(--bd)] rounded-[16px] gap-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="relative w-full md:w-[320px]">
            <Input
              type="text"
              placeholder="Search plate, model, camera..."
              className="pl-4 pr-10 shadow-none border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx)] h-10 text-sm focus:border-[var(--blue)]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--tx3)]" />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <PresetDateRangePicker
              startDate={startDate}
              endDate={endDate}
              maxDate={moment().format('YYYY-MM-DD')}
              onRangeChange={({ start, end }) => {
                setStartDate(start ? moment(start).format('YYYY-MM-DD') : '');
                setEndDate(end ? moment(end).format('YYYY-MM-DD') : '');
                setPage(1);
              }}
            />
            <ExportButton
              onClick={() => runExport('excel')}
              disabled={Boolean(exporting) || !rows.length}
              className="disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting === 'excel' ? 'Exporting…' : 'Excel'}
            </ExportButton>
            <ExportButton
              onClick={() => runExport('pdf')}
              disabled={Boolean(exporting) || !rows.length}
              className="disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting === 'pdf' ? 'Exporting…' : 'PDF'}
            </ExportButton>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="h-10 inline-flex items-center gap-2 px-3 rounded-lg text-sm font-medium cursor-pointer border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx2)] hover:bg-[var(--bg3)] hover:text-[var(--tx)] transition-colors"
                >
                  <Filter className="w-4 h-4" />
                  Filters
                  {activeFiltersCount > 0 && (
                    <span className="bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] h-5 flex items-center justify-center">
                      {activeFiltersCount}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[380px] max-w-[calc(100vw-24px)] rounded-xl p-4" align="end">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-[var(--bd)] pb-2">
                    <h4 className="font-semibold text-base text-[var(--tx)]">Filters</h4>
                    {activeFiltersCount > 0 && (
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="flex items-center gap-1 cursor-pointer text-xs text-[var(--brand)] hover:underline"
                      >
                        <RotateCcw className="w-3 h-3" /> Reset all
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
                    <VehicleNumberSelect
                      vehicleNumber={vehicleNumber}
                      setVehicleNumber={setVehicleNumber}
                      vehicleNumberList={filteredVehicleNumbers}
                      vehicleNumberSearch={vehicleNumberSearch}
                      setVehicleNumberSearch={setVehicleNumberSearch}
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
              onManualRefresh={load}
            />
          </div>
        </div>

        {/* Custody filter */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex p-1 rounded-[10px] bg-[var(--bg2)] border border-[var(--bd)]">
            {CUSTODY_TABS.map((tab) => (
              <button
                key={tab.id || 'all'}
                type="button"
                onClick={() => {
                  setCustody(tab.id);
                  setPage(1);
                }}
                className="px-3 py-1.5 rounded-[8px] text-xs font-medium transition-colors cursor-pointer"
                style={{
                  background: custody === tab.id ? 'var(--bg3)' : 'transparent',
                  color: custody === tab.id ? 'var(--tx)' : 'var(--tx3)',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <span className="text-[11px] text-[var(--tx3)] ml-auto">
            {totalCount} vehicle{totalCount === 1 ? '' : 's'} · {summary.inCustody} in custody on
            this page
          </span>
        </div>

        {/* Table */}
        <div className="relative overflow-auto customscrollbar border border-[var(--bd)] rounded-[12px] min-h-[320px]">
          {loading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--bg1solid)]/70">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--tx3)]" />
            </div>
          )}

          <table className="w-full border-collapse min-w-[1000px]">
            <thead className="bg-[var(--bg2)]">
              <tr className="border-b border-[var(--bd)]">
                <th className={`${th} w-10`} />
                <th className={th}>Image</th>
                <th className={th}>Vehicle Number</th>
                <th className={th}>Custody</th>
                <th className={th}>In / Out</th>
                <th className={th}>NVR Name</th>
                <th className={th}>Camera Name</th>
                <th className={th}>First Check-In</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => {
                const open = Boolean(expanded[row.vehicleKey]);
                const image = getImageUrl(row);
                return (
                  <React.Fragment key={row.vehicleKey}>
                    <tr
                      onClick={() => toggleRow(row)}
                      className="border-b border-[var(--bd)] hover:bg-[var(--bg2)] transition-colors cursor-pointer"
                    >
                      <td className={`${td} text-[var(--tx3)]`}>
                        {open ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </td>
                      <td className={td}>
                        {image ? (
                          <ImageWithLoader
                            src={image}
                            alt={dash(row.vehicleNumber)}
                            className="w-12 h-9 rounded-md overflow-hidden border border-[var(--bd)]"
                            imgClassName="w-full h-full object-cover"
                            onClick={(e) => {
                              e.stopPropagation();
                              openPreview(`${row.vehicleKey}:row`);
                            }}
                          />
                        ) : (
                          <span className="inline-flex items-center justify-center w-12 h-9 rounded-md bg-[var(--bg3)] text-[var(--tx3)]">
                            <CarFront className="w-4 h-4" />
                          </span>
                        )}
                      </td>
                      <td className={`${td} font-medium`}>{dash(row.vehicleNumber)}</td>
                      <td className={td}>
                        <CustodyChip inCustody={row.custody} />
                      </td>
                      <td className={`${td} text-[var(--tx2)] whitespace-nowrap`}>
                        {row.checkInCount} / {row.checkOutCount}
                      </td>
                      <td className={td}>{dash(row?.nvrData?.nvrName)}</td>
                      <td className={td}>{cameraName(row)}</td>
                      <td className={`${td} whitespace-nowrap`}>
                        {fmtFirstCheckIn(row)}
                      </td>
                    </tr>

                    {open && (
                      <tr className="border-b border-[var(--bd)]">
                        <td colSpan={8} className="p-0">
                          <div className="bg-[var(--bg2)] px-6 py-4">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--tx2)] mb-2">
                              All crossings for {dash(row.vehicleNumber)}
                            </div>

                            {crossingsOf(row).length === 0 ? (
                              <div className="text-xs text-[var(--tx3)] py-3">
                                No crossings for this range.
                              </div>
                            ) : (
                              <div className="rounded-[10px] border border-[var(--bd)] bg-[var(--bg1solid)] divide-y divide-[var(--bd)]">
                                {crossingsOf(row).map((sub) => (
                                  <div
                                    key={sub._id}
                                    className="flex flex-wrap items-center gap-4 px-4 py-2.5"
                                  >
                                    <DirectionChip checkin={sub.checkin} />
                                    <span className="text-xs text-[var(--tx)] whitespace-nowrap">
                                      {fmtTime(sub.timeOfIncident)}
                                    </span>
                                    <span className="text-[11px] text-[var(--tx3)]">
                                      {dash(sub?.nvrData?.nvrName)} · {cameraName(sub)}
                                    </span>
                                    {sub.zone && (
                                      <span className="text-[11px] text-[var(--tx3)]">
                                        Zone: {sub.zone}
                                      </span>
                                    )}
                                    {getImageUrl(sub) && (
                                      <button
                                        type="button"
                                        onClick={() => openPreview(`${row.vehicleKey}:${sub._id}`)}
                                        className="ml-auto text-[11px] text-[var(--blue)] hover:underline cursor-pointer"
                                      >
                                        View image
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <SearchX className="w-7 h-7 mx-auto text-[var(--tx3)] mb-2" />
                    <p className="text-sm text-[var(--tx2)]">
                      No vehicle check-in/out logs for this range.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {!loading && rows.length > 0 && (
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 items-center gap-4">
            <div className="text-sm text-[var(--tx2)] bg-[var(--bg2)] px-3 py-1.5 font-normal rounded-[8px] w-fit inline-flex items-center gap-2">
              Total logs -{' '}
              <span className="text-[var(--violet)] font-semibold bg-[var(--violet)]/10 px-2.5 py-1 rounded-md">
                {totalCount}
              </span>
            </div>

            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className={`flex items-center justify-center w-8 h-8 rounded ${
                  page === 1
                    ? 'text-[var(--tx3)] cursor-not-allowed'
                    : 'text-[var(--tx2)] hover:bg-[var(--bg2)] cursor-pointer'
                }`}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {(() => {
                const pages = [];
                const maxVisiblePages = 5;
                if (totalPages <= maxVisiblePages) {
                  for (let i = 1; i <= totalPages; i += 1) pages.push(i);
                } else if (page <= 3) {
                  for (let i = 1; i <= 4; i += 1) pages.push(i);
                  if (totalPages > 5) pages.push('...');
                  pages.push(totalPages);
                } else if (page >= totalPages - 2) {
                  pages.push(1);
                  if (totalPages > 5) pages.push('...');
                  for (let i = totalPages - 3; i <= totalPages; i += 1) pages.push(i);
                } else {
                  pages.push(1, '...');
                  for (let i = page - 1; i <= page + 1; i += 1) pages.push(i);
                  pages.push('...', totalPages);
                }
                return pages.map((p, index) =>
                  p === '...' ? (
                    <span
                      key={`ellipsis-${index}`}
                      className="flex items-center justify-center w-8 h-8 text-[var(--tx3)]"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`flex items-center justify-center w-8 h-8 rounded text-sm font-medium cursor-pointer ${
                        page === p
                          ? 'bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white'
                          : 'text-[var(--tx2)] hover:bg-[var(--bg2)]'
                      }`}
                    >
                      {p}
                    </button>
                  ),
                );
              })()}

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className={`flex items-center justify-center w-8 h-8 rounded ${
                  page === totalPages
                    ? 'text-[var(--tx3)] cursor-not-allowed'
                    : 'text-[var(--tx2)] hover:bg-[var(--bg2)] cursor-pointer'
                }`}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-center lg:justify-end gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[var(--tx2)] whitespace-nowrap">Go to:</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[1-9][0-9]*"
                  value={gotoPage}
                  onChange={(e) => setGotoPage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    const n = Number(gotoPage);
                    if (Number.isFinite(n) && n >= 1) {
                      setPage(Math.min(totalPages, Math.max(1, Math.trunc(n))));
                    }
                    setGotoPage('');
                  }}
                  placeholder="Page"
                  className="h-9 w-16 border border-[var(--bd)] rounded-lg text-xs text-[var(--tx)] bg-[var(--bg2)] px-2 focus:outline-none focus:border-[var(--brand)]"
                />
                <button
                  type="button"
                  onClick={() => {
                    const n = Number(gotoPage);
                    if (Number.isFinite(n) && n >= 1) {
                      setPage(Math.min(totalPages, Math.max(1, Math.trunc(n))));
                    }
                    setGotoPage('');
                  }}
                  disabled={String(gotoPage).trim() === ''}
                  className="h-9 px-3 rounded-lg text-xs font-medium cursor-pointer bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-95 transition-opacity"
                >
                  Go
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[var(--tx2)] whitespace-nowrap">Rows:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="h-9 border border-[var(--bd)] rounded-lg text-xs text-[var(--tx)] bg-[var(--bg2)] px-2 cursor-pointer focus:outline-none focus:border-[var(--brand)]"
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {previewImage && (
        <ImagePreviewModal
          previewImage={previewImage}
          hasPrevious={previewIndex > 0}
          hasNext={previewIndex < previewImages.length - 1}
          onPrevious={() => setPreviewIndex((i) => Math.max(0, i - 1))}
          onNext={() => setPreviewIndex((i) => Math.min(previewImages.length - 1, i + 1))}
          onClose={() => setPreviewIndex(-1)}
        />
      )}
    </div>
  );
};

export default VehicleCheckInOutLogs;
