import React, { useEffect, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import moment from 'moment-timezone';
import { Filter, RotateCcw, Loader2, List, LayoutGrid } from 'lucide-react';
import { usePermissions } from '@/context/PermissionContext';
import AccessDenied from '@/components/AccessDenied';
import { Button } from '@/components/ui/button';

import ReusableTablePage from '@/pages/AttendanceLogs/components/ReusableTablePage';
import AutoRefreshComponent from '@/pages/AttendanceLogs/components/AutoRefreshComponent';
import ExportButton from '@/pages/AttendanceLogs/components/ExportButton';
import MultiSelect from '@/pages/AttendanceLogs/components/MultiSelect';
import { Popover, PopoverContent, PopoverTrigger } from '@/pages/AttendanceLogs/components/Popover';
import ImagePreviewModal from '@/pages/ANPRLogs/components/ImagePreviewModal';

import { buildColumns, renderSleepActivityCard } from './sleepActivityColumns';
import { getSleepActivityLogs, getNVRs, getchannels } from './Api';
import { handleSleepActivityExport } from './sleepActivityExport';

// Two-way PDF split: the plain list-table PDF and the image-forward grid PDF
// that mirrors the on-screen grid cards.
function PdfViewPopover({ open, exportingFormat, onOpenChange, onSelect }) {
  const exporting = !!exportingFormat;
  return (
    <Popover open={open} onOpenChange={(nextOpen) => !exporting && onOpenChange(nextOpen)}>
      <PopoverTrigger asChild>
        <ExportButton>PDF</ExportButton>
      </PopoverTrigger>
      <PopoverContent className="w-[190px] overflow-hidden rounded-lg border border-[var(--bd)] bg-[var(--bg1solid)] p-1.5 shadow-xl" align="end">
        <div className="space-y-1">
          <button
            type="button"
            disabled={exporting}
            onClick={() => onSelect('pdf')}
            className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-md px-2.5 text-left text-sm font-semibold text-[var(--tx)] transition-colors hover:bg-[var(--bg2)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-red-500/10 text-red-500">
              {exportingFormat === 'pdf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <List className="h-3.5 w-3.5" />}
            </span>
            <span className="truncate">Export List View</span>
          </button>

          <button
            type="button"
            disabled={exporting}
            onClick={() => onSelect('pdf-grid')}
            className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-md px-2.5 text-left text-sm font-semibold text-[var(--tx)] transition-colors hover:bg-[var(--bg2)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[var(--brand)]/10 text-[var(--brand)]">
              {exportingFormat === 'pdf-grid' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LayoutGrid className="h-3.5 w-3.5" />}
            </span>
            <span className="truncate">Export Grid View</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const REFRESH_KEY = 'sleep_activity_auto_refresh_enabled';
const INTERVAL_KEY = 'sleep_activity_auto_refresh_interval';

// The API's optional isSleeping filter.
// '' = all, 'true' = only sleeping, 'false' = only awake.
const SLEEPING_OPTIONS = [
  { key: '', label: 'All' },
  { key: 'true', label: 'Sleeping' },
  { key: 'false', label: 'Awake' },
];

const SleepActivityLogs = () => {
  const navigate = useNavigate();
  const maxDateDefault = useMemo(() => moment().endOf('day').toDate(), []);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [searchInput, setSearchInput] = useState('');
  const [viewMode, setViewMode] = useState('grid');

  const [startDate, setStartDate] = useState(moment().format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState(moment().format('YYYY-MM-DD'));

  const [nvrList, setNvrList] = useState([]);
  const [cameraList, setCameraList] = useState([]);
  const [nvrIds, setNvrIds] = useState([]);
  const [channelIds, setChannelIds] = useState([]);
  const [sleepingFilter, setSleepingFilter] = useState(''); // '' | 'true' | 'false'

  const [previewImage, setPreviewImage] = useState(null);
  const [previewImageLoading, setPreviewImageLoading] = useState(false);

  const [pdfViewOpen, setPdfViewOpen] = useState(false);
  const [pdfExportingFormat, setPdfExportingFormat] = useState('');

  const [autoRefresh, setAutoRefresh] = useState(() => {
    const saved = localStorage.getItem(REFRESH_KEY);
    return saved !== null ? saved === 'true' : true;
  });
  const [refreshInterval, setRefreshInterval] = useState(() => {
    const parsed = parseInt(localStorage.getItem(INTERVAL_KEY), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 30;
  });
  const [manualTrigger, setManualTrigger] = useState(0);

  /* ─────────────── Permissions ─────────────── */
  const { permissions, loading: permissionsLoading } = usePermissions();
  const resolveLogPerm = (action) => {
    const logs = permissions?.logs;
    if (!logs) return false;
    if (typeof logs.sleepActivityLogs?.[action] === 'boolean') return logs.sleepActivityLogs[action];
    if (typeof logs.global?.[action] === 'boolean') return logs.global[action];
    if (typeof logs[action] === 'boolean') return logs[action];
    return false;
  };
  const canView = resolveLogPerm('view');

  useEffect(() => localStorage.setItem(REFRESH_KEY, autoRefresh), [autoRefresh]);
  useEffect(() => localStorage.setItem(INTERVAL_KEY, refreshInterval), [refreshInterval]);

  /* ─────────────── Filter metadata ─────────────── */
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

  // Reset to page 1 when filters or page size change.
  useEffect(() => {
    setCurrentPage(1);
  }, [startDate, endDate, nvrIds, channelIds, sleepingFilter, limit, searchInput]);

  const skip = (currentPage - 1) * limit;

  /* ─────────────── Data fetch ─────────────── */
  const fetchLogs = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getSleepActivityLogs({
        skip,
        limit,
        startDate,
        endDate,
        nvrIds,
        channelIds,
        // Omit unless the user picked Sleeping / Awake.
        isSleeping: sleepingFilter === '' ? undefined : sleepingFilter === 'true',
      });

      const body = res?.data?.body?.data;
      const list = body?.data || [];
      const total = body?.totalCount || 0;

      const INCIDENT_URL = import.meta.env.VITE_INCIDENT_URL || '';
      const fmt = (t) =>
        t ? moment.utc(t).tz(moment.tz.guess()).format('DD/MM/YYYY hh:mm A') : '--';

      const mapped = list.map((item) => ({
        id: item._id,
        _id: item._id,
        isSleeping: item.isSleeping === true,
        nvrName: item.nvrData?.nvrName || '--',
        channelName: item.channelData?.customName || item.channelData?.name || '--',
        nvrId: item.nvrId || item.nvrData?._id || '',
        channelId: item.channelId || item.channelData?._id || '',
        timeOfIncident: item.timeOfIncident || null,
        timeOfIncidentLabel: fmt(item.timeOfIncident),
        incidentImageUrl: item.Image ? `${INCIDENT_URL}${item.Image}` : null,
      }));

      setRows(mapped);
      setTotalCount(total);
    } catch (err) {
      console.log('Error fetching sleep activity logs:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [canView, skip, limit, startDate, endDate, nvrIds, channelIds, sleepingFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs, manualTrigger]);

  useEffect(() => {
    let intervalId;
    if (autoRefresh && refreshInterval > 0) {
      intervalId = setInterval(fetchLogs, refreshInterval * 1000);
    }
    return () => intervalId && clearInterval(intervalId);
  }, [autoRefresh, refreshInterval, fetchLogs]);

  /* ─────────────── Derived data ─────────────── */
  const nvrOptions = useMemo(
    () => nvrList.map((nvr) => ({ label: nvr.nvrName, id: nvr._id || nvr.id })),
    [nvrList]
  );
  const cameraOptions = useMemo(
    () => cameraList.map((cam) => ({ label: cam.customName || cam.name, id: cam._id || cam.id })),
    [cameraList]
  );

  // Mirrors ANPR: the Sleeping/Awake segmented control is a standalone toolbar
  // control (like ANPR's Tag/Untag filter) and does NOT count toward the
  // "Filters" badge — only the popover filters do.
  const activeFiltersCount = [
    nvrIds.length > 0,
    channelIds.length > 0,
  ].filter(Boolean).length;

  const resetFilters = () => {
    setNvrIds([]);
    setChannelIds([]);
  };

  const exportParams = useMemo(
    () => ({
      startDate,
      endDate,
      nvrIds,
      channelIds,
      isSleeping: sleepingFilter === '' ? undefined : sleepingFilter === 'true',
      searchInput,
    }),
    [startDate, endDate, nvrIds, channelIds, sleepingFilter, searchInput]
  );

  const handleExport = useCallback(
    (format) => handleSleepActivityExport(format, exportParams),
    [exportParams]
  );

  const handlePdfExport = useCallback(
    async (format) => {
      setPdfExportingFormat(format);
      try {
        await handleExport(format);
        setPdfViewOpen(false);
      } finally {
        setPdfExportingFormat('');
      }
    },
    [handleExport]
  );

  const openPreview = useCallback((url) => {
    if (!url) return;
    setPreviewImageLoading(true);
    setPreviewImage(url);
  }, []);

  const closePreview = () => {
    setPreviewImage(null);
    setPreviewImageLoading(false);
  };

  const columns = useMemo(() => buildColumns({ onPreview: openPreview }), [openPreview]);
  const gridCard = useCallback(
    (item) => renderSleepActivityCard(item, { onPreview: openPreview }),
    [openPreview]
  );

  const stats = useMemo(
    () => [{ label: 'Detections', value: totalCount ?? 0, color: 'var(--blue)' }],
    [totalCount]
  );

  /* ─────────────── Guards ─────────────── */
  if (permissionsLoading) return null;
  if (!canView) {
    return (
      <AccessDenied
        message="You don't have permission to view Sleep Activity Logs."
        onBack={() => navigate(-1)}
      />
    );
  }

  return (
    <div className="p-3 sm:p-4 lg:p-[22px] flex flex-col gap-3 sm:gap-[18px] min-h-full">
      <ImagePreviewModal
        previewImage={previewImage}
        loading={previewImageLoading}
        setLoading={setPreviewImageLoading}
        onClose={closePreview}
      />

      <ReusableTablePage
        stats={stats}
        loading={loading}
        error={error}
        data={rows}
        columns={columns}
        gridCard={gridCard}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        attendanceLogsCount={totalCount}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        onPageChange={setCurrentPage}
        limit={limit}
        onLimitChange={setLimit}
        searchKeys={['nvrName', 'channelName']}
        searchQuery={searchInput}
        onSearchChange={setSearchInput}
        startDate={startDate}
        endDate={endDate}
        maxDate={maxDateDefault}
        datePickerVariant="preset"
        onDateRangeChange={({ start, end }) => {
          const toIso = (d) => (d instanceof Date ? moment(d).format('YYYY-MM-DD') : d);
          let s = start ? toIso(start) : null;
          let e = end ? toIso(end) : null;
          if (s && !e) e = s;
          if (!s && e) s = e;
          if (!s && !e) {
            const today = moment().format('YYYY-MM-DD');
            s = today;
            e = today;
          }
          if (moment(s).isAfter(moment(e))) {
            const tmp = s;
            s = e;
            e = tmp;
          }
          setStartDate(s);
          setEndDate(e);
        }}
      >
        {/* Toolbar order mirrors ANPR: segmented status filter, then exports,
            then the Filters popover, then auto-refresh. */}
        <div
          className="inline-flex items-center rounded-[8px] border border-[var(--bd)] bg-[var(--bg2)] overflow-hidden h-10"
          role="group"
          aria-label="Filter by sleeping state"
        >
          {SLEEPING_OPTIONS.map((opt) => {
            const active = sleepingFilter === opt.key;
            return (
              <button
                key={opt.key || 'all'}
                type="button"
                onClick={() => setSleepingFilter(opt.key)}
                aria-pressed={active}
                className={`px-3 h-full text-[12px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
                  active
                    ? 'bg-[var(--blue)] text-white'
                    : 'text-[var(--tx2)] hover:text-[var(--tx)] hover:bg-[var(--bg3)]'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <ExportButton onClick={() => handleExport('excel')}>Excel</ExportButton>
        <PdfViewPopover
          open={pdfViewOpen}
          exportingFormat={pdfExportingFormat}
          onOpenChange={setPdfViewOpen}
          onSelect={handlePdfExport}
        />

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
      </ReusableTablePage>
    </div>
  );
};

export default SleepActivityLogs;
