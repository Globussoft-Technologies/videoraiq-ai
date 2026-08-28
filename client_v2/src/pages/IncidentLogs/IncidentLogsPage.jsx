import React, { useEffect, useCallback, useMemo, useReducer, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import moment from 'moment-timezone';
import { LayoutGrid, List, Loader2 } from 'lucide-react';
import { usePermissions } from '@/context/PermissionContext';
import AccessDenied from '@/components/AccessDenied';

import ReusableTablePage from '@/pages/AttendanceLogs/components/ReusableTablePage';
import AutoRefreshComponent from '@/pages/AttendanceLogs/components/AutoRefreshComponent';
import ExportButton from '@/pages/AttendanceLogs/components/ExportButton';
import ImagePreviewModal from '@/pages/ANPRLogs/components/ImagePreviewModal';
import { Popover, PopoverContent, PopoverTrigger } from '@/pages/AttendanceLogs/components/Popover';

import { initialState, reducer } from './incidentState';
import { buildColumns, renderIncidentCard } from './incidentColumns';
import { handleIncidentExport } from './incidentExport';
import IncidentFilterPopover from './components/IncidentFilterPopover';
import { getNVRs, getchannels, fetchIncidentLogs } from './Api';

const SEVERITY_LEVELS = ['high', 'moderate', 'low'];

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

/**
 * Shared page for the six stevinrock incident-table logs (conveyor, crusher,
 * vehicle-obstruction, line-crossing, water-spill, unauthorized-access).
 * Behaviour is identical to the ANPR log page; the `config` prop selects the
 * endpoint, title, columns, filters and export naming. Route it with a `key`
 * so navigating between log types remounts (resetting filters to today).
 */
const IncidentLogsPage = ({ config }) => {
  const maxDateDefault = useMemo(() => moment().endOf('day').toDate(), []);
  const REFRESH_KEY = `${config.storagePrefix}_auto_refresh_enabled`;
  const INTERVAL_KEY = `${config.storagePrefix}_auto_refresh_interval`;

  const [state, dispatch] = useReducer(reducer, initialState);
  const {
    rows,
    loading,
    error,
    totalCount,
    currentPage,
    sortOrder,
    sortField,
    searchInput,
    startDate,
    endDate,
    nvrList,
    cameraList,
    nvrIds,
    channelIds,
    severity,
    status,
    limit,
  } = state;

  const [autoRefresh, setAutoRefresh] = useState(() => {
    const saved = localStorage.getItem(REFRESH_KEY);
    return saved !== null ? saved === 'true' : true;
  });
  const [refreshInterval, setRefreshInterval] = useState(() => {
    const parsed = parseInt(localStorage.getItem(INTERVAL_KEY), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 30;
  });
  const [manualTrigger, setManualTrigger] = useState(0);
  const [viewMode, setViewMode] = useState('grid'); // 'table' | 'grid'
  const [previewImage, setPreviewImage] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(-1);
  const [previewImageLoading, setPreviewImageLoading] = useState(false);
  const [pdfViewOpen, setPdfViewOpen] = useState(false);
  const [pdfExportingFormat, setPdfExportingFormat] = useState('');
  const [severityTotals, setSeverityTotals] = useState({ high: 0, moderate: 0, low: 0 });

  const { permissions, loading: permissionsLoading } = usePermissions();
  const navigate = useNavigate();

  // Logs permissions may be flat ({ view, edit }) or nested per sub-section.
  // Resolve in order: section-specific → global → flat.
  const resolveLogPerm = (action) => {
    const logs = permissions?.logs;
    if (!logs) return false;
    if (typeof logs[config.permissionKey]?.[action] === 'boolean') return logs[config.permissionKey][action];
    if (typeof logs.global?.[action] === 'boolean') return logs.global[action];
    if (typeof logs[action] === 'boolean') return logs[action];
    return false;
  };
  const canView = resolveLogPerm('view');
  const canEdit = resolveLogPerm('edit');

  /* ─────────────── Auto-refresh persistence ─────────────── */
  useEffect(() => localStorage.setItem(REFRESH_KEY, autoRefresh), [REFRESH_KEY, autoRefresh]);
  useEffect(() => localStorage.setItem(INTERVAL_KEY, refreshInterval), [INTERVAL_KEY, refreshInterval]);

  /* ─────────────── Filter metadata ─────────────── */
  useEffect(() => {
    (async () => {
      try {
        const res = await getNVRs();
        dispatch({ type: 'SET_NVR_LIST', value: res?.data?.body?.data || [] });
      } catch (err) {
        console.log('Error fetching NVRs:', err);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await getchannels({ nvrIds });
        dispatch({ type: 'SET_CAMERA_LIST', value: res?.data?.body?.data || [] });
      } catch (err) {
        console.log('Error fetching channels:', err);
      }
    })();
  }, [nvrIds]);

  // Reset to page 1 when filters or page size change.
  useEffect(() => {
    dispatch({ type: 'SET_CURRENT_PAGE', value: 1 });
  }, [nvrIds, channelIds, severity, status, limit]);

  const skip = (currentPage - 1) * limit;

  /* ─────────────── Data fetch ─────────────── */
  const fetchLogs = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', value: true });
    dispatch({ type: 'SET_ERROR', value: null });
    try {
      const res = await fetchIncidentLogs({
        endpoint: config.endpoint,
        skip,
        limit,
        startDate,
        endDate,
        sortField,
        sortOrder,
        nvrIds,
        channelIds,
        severity,
        status: config.showStatus ? status : undefined,
        search: searchInput,
      });

      const data = res?.data?.body?.data;
      const list = data?.data || [];
      const total = data?.totalCount || 0;

      const INCIDENT_URL = import.meta.env.VITE_INCIDENT_URL || '';

      const mapped = list.map((item) => ({
        id: item._id,
        _id: item._id,
        incidentName: item.incidentName || '--',
        currentStatus: item.currentStatus || '--',
        nvrName: item.nvrData?.nvrName || '--',
        channelName: item.channelData?.name || '--',
        nvrId: item.nvrId || item.nvrData?._id || '',
        channelId: item.channelId || item.channelData?._id || '',
        createdAt: item.createdAt,
        incidentImageUrl: item.Image ? `${INCIDENT_URL}${item.Image}` : null,
        severity: item.severity || '--',
      }));

      dispatch({ type: 'SET_ROWS', value: mapped });
      dispatch({ type: 'SET_TOTAL_COUNT', value: total });

      try {
        const totals = await Promise.all(
          SEVERITY_LEVELS.map(async (level) => {
            if (severity && severity !== level) return [level, 0];
            const countRes = await fetchIncidentLogs({
              endpoint: config.endpoint,
              skip: 0,
              limit: 1,
              startDate,
              endDate,
              nvrIds,
              channelIds,
              severity: level,
              status: config.showStatus ? status : undefined,
              search: searchInput,
            });
            return [level, countRes?.data?.body?.data?.totalCount || 0];
          })
        );
        setSeverityTotals(Object.fromEntries(totals));
      } catch (statsErr) {
        console.log(`Error fetching ${config.title} severity totals:`, statsErr);
      }
    } catch (err) {
      console.log(`Error fetching ${config.title}:`, err);
      dispatch({ type: 'SET_ERROR', value: err });
    } finally {
      dispatch({ type: 'SET_LOADING', value: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, limit, startDate, endDate, sortField, sortOrder, nvrIds, channelIds, severity, status, searchInput]);

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

  const unauthorizedAccessLogs = config.storagePrefix === 'unauthorized_access';
  const previewNavigationEnabled = unauthorizedAccessLogs;
  const previewRows = useMemo(
    () => (previewNavigationEnabled ? rows.filter((row) => row.incidentImageUrl) : []),
    [previewNavigationEnabled, rows]
  );

  const showPreviewAt = useCallback(
    (index) => {
      const nextRow = previewRows[index];
      if (!nextRow) return;
      setPreviewIndex(index);
      setPreviewImageLoading(true);
      setPreviewImage(nextRow.incidentImageUrl);
    },
    [previewRows]
  );

  const openPreview = useCallback(
    (url) => {
      if (!url) return;
      setPreviewIndex(previewNavigationEnabled ? previewRows.findIndex((row) => row.incidentImageUrl === url) : -1);
      setPreviewImageLoading(true);
      setPreviewImage(url);
    },
    [previewNavigationEnabled, previewRows]
  );

  const closePreview = useCallback(() => {
    setPreviewImage(null);
    setPreviewIndex(-1);
    setPreviewImageLoading(false);
  }, []);

  const showPreviousPreview = useCallback(() => {
    if (previewIndex > 0) showPreviewAt(previewIndex - 1);
  }, [previewIndex, showPreviewAt]);

  const showNextPreview = useCallback(() => {
    if (previewIndex >= 0 && previewIndex < previewRows.length - 1) {
      showPreviewAt(previewIndex + 1);
    }
  }, [previewIndex, previewRows.length, showPreviewAt]);

  const onSort = useCallback(
    (field) => {
      dispatch({ type: 'SET_SORT_FIELD', value: field });
      dispatch({ type: 'SET_SORT_ORDER', value: sortOrder === 'asc' ? 'desc' : 'asc' });
    },
    [sortOrder]
  );

  const columns = useMemo(
    () => buildColumns(config, { onSort, onPreview: openPreview }),
    [config, onSort, openPreview]
  );

  const gridCard = useCallback(
    (item) => renderIncidentCard(item, config, { onPreview: openPreview }),
    [config, openPreview]
  );

  // KPI tiles — derived from the loaded page + server total (no placeholder data).
  const stats = useMemo(() => {
    return [
      { label: 'Incidents', value: totalCount ?? 0, color: 'var(--blue)' },
      { label: 'High', value: severityTotals.high || 0, color: 'var(--crit)' },
      { label: 'Moderate', value: severityTotals.moderate || 0, color: 'var(--warn)' },
      { label: 'Low', value: severityTotals.low || 0, color: 'var(--ok)' },
    ];
  }, [severityTotals, totalCount]);

  const exportParams = useMemo(
    () => ({
      startDate,
      endDate,
      sortField,
      sortOrder,
      nvrIds,
      channelIds,
      severity,
      status: config.showStatus ? status : undefined,
      searchInput,
    }),
    [startDate, endDate, sortField, sortOrder, nvrIds, channelIds, severity, config.showStatus, status, searchInput]
  );

  const handleExport = useCallback(
    (format) => handleIncidentExport(format, config, exportParams),
    [config, exportParams]
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

  /* ─────────────── Guards ─────────────── */
  if (permissionsLoading) return null;
  if (!canView) {
    return <AccessDenied message={config.accessDenied} onBack={() => navigate(-1)} />;
  }

  return (
    <div className="p-3 sm:p-4 lg:p-[22px] flex flex-col gap-3 sm:gap-[18px] min-h-full">
      <ImagePreviewModal
        previewImage={previewImage}
        loading={previewImageLoading}
        setLoading={setPreviewImageLoading}
        hasPrevious={previewNavigationEnabled && previewIndex > 0}
        hasNext={previewNavigationEnabled && previewIndex >= 0 && previewIndex < previewRows.length - 1}
        onPrevious={showPreviousPreview}
        onNext={showNextPreview}
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
        setCurrentPage={(p) => dispatch({ type: 'SET_CURRENT_PAGE', value: p })}
        onPageChange={(p) => dispatch({ type: 'SET_CURRENT_PAGE', value: p })}
        limit={limit}
        onLimitChange={(v) => dispatch({ type: 'SET_LIMIT', value: v })}
        searchKeys={['incidentName', 'nvrName', 'channelName']}
        searchQuery={searchInput}
        onSearchChange={(v) => dispatch({ type: 'SET_SEARCH_INPUT', value: v })}
        startDate={startDate}
        endDate={endDate}
        maxDate={maxDateDefault}
        datePickerVariant={config.datePickerVariant}
        onDateRangeChange={({ start, end }) => {
          const toIso = (d) => (d instanceof Date ? moment(d).format('YYYY-MM-DD') : d);
          let s = start ? toIso(start) : null;
          let e = end ? toIso(end) : null;
          if (s && !e) e = s;
          if (!s && e) s = e;
          // Clearing the range resets to "today" instead of an empty filter
          // (empty dates make the backend return all/incoming data).
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
          dispatch({ type: 'SET_START_DATE', value: s });
          dispatch({ type: 'SET_END_DATE', value: e });
        }}
      >
        {canEdit && <ExportButton onClick={() => handleExport('excel')}>Excel</ExportButton>}
        {canEdit && unauthorizedAccessLogs ? (
          <PdfViewPopover
            open={pdfViewOpen}
            exportingFormat={pdfExportingFormat}
            onOpenChange={setPdfViewOpen}
            onSelect={handlePdfExport}
          />
        ) : (
          canEdit && <ExportButton onClick={() => handleExport('pdf')}>PDF</ExportButton>
        )}

        <IncidentFilterPopover
          nvrOptions={nvrOptions}
          nvrIds={nvrIds}
          setNvrIds={(v) => dispatch({ type: 'SET_NVR_IDS', value: Array.isArray(v) ? v : [] })}
          setChannelIds={(v) => dispatch({ type: 'SET_CHANNEL_IDS', value: Array.isArray(v) ? v : [] })}
          cameraOptions={cameraOptions}
          channelIds={channelIds}
          severity={severity}
          setSeverity={(v) => dispatch({ type: 'SET_SEVERITY', value: v })}
          showStatus={config.showStatus}
          status={status}
          setStatus={(v) => dispatch({ type: 'SET_STATUS', value: v })}
        />

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

export default IncidentLogsPage;
