import React, { useEffect, useCallback, useMemo, useReducer, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import moment from 'moment-timezone';
import { LayoutGrid, List, Loader2, Truck } from 'lucide-react';
import { getConfiguredTimezone } from '@/utils/timezone';
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
import { handleStockCountingExport } from './stockCountingExport';
import IncidentFilterPopover from './components/IncidentFilterPopover';
import {
  getNVRs,
  getchannels,
  fetchIncidentLogs,
  fetchIncidentVehicleNumbers,
  fetchIncidentBoxTypes,
} from './Api';

const SEVERITY_LEVELS = ['high', 'moderate', 'low'];

const incidentImageUrl = (value) => {
  if (!value) return null;
  const image = String(value).trim();
  if (/^(https?:|data:|blob:)/i.test(image)) return image;
  return `${import.meta.env.VITE_INCIDENT_URL || ''}${image}`;
};

const stockEventPreviewKey = (row, event, index) => (
  `stock-event:${event?._id || event?.eventId || `${row?.aggregationKey || row?._id || 'row'}-${index}`}`
);

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
 * Shared page for the stevinrock incident-table logs (conveyor, crusher,
 * cylinder stacking, vehicle-obstruction, line-crossing, water-spill,
 * unauthorized-access).
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
    vehicleNumber,
    boxType,
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
  const [viewMode, setViewMode] = useState(() => (config.tableOnly ? 'table' : 'grid')); // 'table' | 'grid'
  const [previewImage, setPreviewImage] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(-1);
  const [previewImageLoading, setPreviewImageLoading] = useState(false);
  const [pdfViewOpen, setPdfViewOpen] = useState(false);
  const [pdfExportingFormat, setPdfExportingFormat] = useState('');
  const [exportingFormat, setExportingFormat] = useState('');
  const [severityTotals, setSeverityTotals] = useState({ high: 0, moderate: 0, low: 0 });
  const [vehicleNumberList, setVehicleNumberList] = useState([]);
  const [vehicleNumberSearch, setVehicleNumberSearch] = useState('');
  const [boxTypeList, setBoxTypeList] = useState([]);
  const [stockSummary, setStockSummary] = useState({
    vehicles: 0,
    loadedBoxes: 0,
    unloadedBoxes: 0,
    totalBoxes: 0,
    events: 0,
  });

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

  useEffect(() => {
    if (!config.vehicleNumbersEndpoint) {
      setVehicleNumberList([]);
      return undefined;
    }
    const timer = setTimeout(() => {
      fetchIncidentVehicleNumbers({
        endpoint: config.vehicleNumbersEndpoint,
        search: vehicleNumberSearch,
        startDate,
        endDate,
        nvrIds,
        channelIds,
      })
        .then((res) => {
          setVehicleNumberList(res?.data?.body?.data?.vehicleNumbers || []);
        })
        .catch((err) => {
          console.log(`Error fetching ${config.title} vehicle numbers:`, err);
          setVehicleNumberList([]);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [config.title, config.vehicleNumbersEndpoint, vehicleNumberSearch, startDate, endDate, nvrIds, channelIds]);

  useEffect(() => {
    if (!config.boxTypesEndpoint) {
      setBoxTypeList([]);
      return undefined;
    }
    fetchIncidentBoxTypes({
      endpoint: config.boxTypesEndpoint,
      startDate,
      endDate,
      nvrIds,
      channelIds,
      vehicleNumber,
    })
      .then((res) => setBoxTypeList(res?.data?.body?.data?.boxTypes || []))
      .catch((err) => {
        console.log(`Error fetching ${config.title} box types:`, err);
        setBoxTypeList([]);
      });
    return undefined;
  }, [config.boxTypesEndpoint, config.title, startDate, endDate, nvrIds, channelIds, vehicleNumber]);

  // Reset to page 1 when filters or page size change.
  useEffect(() => {
    dispatch({ type: 'SET_CURRENT_PAGE', value: 1 });
  }, [nvrIds, channelIds, severity, status, vehicleNumber, boxType, limit]);

  const skip = (currentPage - 1) * limit;

  /* ─────────────── Data fetch ─────────────── */
  const fetchLogs = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', value: true });
    dispatch({ type: 'SET_ERROR', value: null });
    try {
      const res = await fetchIncidentLogs({
        endpoint: config.endpoint,
        method: config.method,
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
        vehicleNumber: config.showVehicleNumberFilter ? vehicleNumber : undefined,
        boxType: config.showBoxTypeFilter ? boxType : undefined,
      });

      const data = res?.data?.body?.data;
      const list = data?.data || [];
      const total = data?.totalCount || 0;

      const mapped = list.map((item) => ({
        ...item,
        id: item._id,
        _id: item._id,
        incidentName: item.incidentName || '--',
        currentStatus: item.currentStatus || '--',
        nvrName: item.nvrData?.nvrName || '--',
        channelName: item.channelData?.name || '--',
        nvrId: item.nvrId || item.nvrData?._id || '',
        channelId: item.channelId || item.channelData?._id || '',
        createdAt: item.timeOfIncident || item.createdAt,
        incidentImageUrl: incidentImageUrl(item.Image),
        severity: item.severity || '--',
        count: item.count,
        alertThreshold: item.alertThreshold,
        fireCount: item.fireCount,
        smokeCount: item.smokeCount,
        isFallDetected: item.isFallDetected,
        evidenceScore: item.evidenceScore,
        isBlurred: item.isBlurred,
        stockMovement: item.stockMovement,
        stockCountBefore: item.stockCountBefore,
        stockCountAfter: item.stockCountAfter,
        vehicleNumber: String(item.vehicleNumber || '').trim() || (config.showStockCountingFields ? 'Unknown' : ''),
        direction: item.direction || item.stockMovement,
        boxCount: item.boxCount ?? item.count,
        loadedBoxCount: item.loadedBoxCount,
        unloadedBoxCount: item.unloadedBoxCount,
        boxTypes: item.boxTypes || (item.boxType ? [item.boxType] : []),
        eventCount: item.eventCount,
        sessionCount: item.sessionCount,
        defaultCountApplied: item.defaultCountApplied,
        truckPresent: item.truckPresent,
      }));

      dispatch({ type: 'SET_ROWS', value: mapped });
      dispatch({ type: 'SET_TOTAL_COUNT', value: total });
      if (config.showStockCountingFields) {
        setStockSummary(data?.summary || {
          vehicles: total,
          loadedBoxes: 0,
          unloadedBoxes: 0,
          totalBoxes: 0,
          events: 0,
        });
      }

      if (config.showStats !== false && !config.showStockCountingFields) {
        try {
          const totals = await Promise.all(
            SEVERITY_LEVELS.map(async (level) => {
              if (severity && severity !== level) return [level, 0];
              const countRes = await fetchIncidentLogs({
                endpoint: config.endpoint,
                method: config.method,
                skip: 0,
                limit: 1,
                startDate,
                endDate,
                nvrIds,
                channelIds,
                severity: level,
                status: config.showStatus ? status : undefined,
                search: searchInput,
                vehicleNumber: config.showVehicleNumberFilter ? vehicleNumber : undefined,
                boxType: config.showBoxTypeFilter ? boxType : undefined,
              });
              return [level, countRes?.data?.body?.data?.totalCount || 0];
            })
          );
          setSeverityTotals(Object.fromEntries(totals));
        } catch (statsErr) {
          console.log(`Error fetching ${config.title} severity totals:`, statsErr);
        }
      }
    } catch (err) {
      console.log(`Error fetching ${config.title}:`, err);
      dispatch({ type: 'SET_ERROR', value: err });
    } finally {
      dispatch({ type: 'SET_LOADING', value: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, limit, startDate, endDate, sortField, sortOrder, nvrIds, channelIds, severity, status, vehicleNumber, boxType, searchInput]);

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
  const enableViewExports = unauthorizedAccessLogs || config.enableViewExports === true;
  // The stock table keeps its event images inside collapsed row data. Include
  // those images in navigation even before the user expands a vehicle row.
  const previewNavigationEnabled = true;
  const previewRows = useMemo(() => {
    if (!previewNavigationEnabled) return [];
    const items = [];
    rows.forEach((row) => {
      if (row.incidentImageUrl) {
        items.push({
          previewKey: `incident:${row._id || row.aggregationKey || items.length}`,
          incidentImageUrl: row.incidentImageUrl,
        });
      }
      if (config.showStockCountingFields) {
        (row.events || []).forEach((event, index) => {
          const eventImageUrl = incidentImageUrl(event?.Image);
          if (eventImageUrl) {
            items.push({
              previewKey: stockEventPreviewKey(row, event, index),
              incidentImageUrl: eventImageUrl,
            });
          }
        });
      }
    });
    return items;
  }, [previewNavigationEnabled, rows, config.showStockCountingFields]);

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
    (url, previewKey) => {
      if (!url) return;
      setPreviewIndex(previewNavigationEnabled
        ? previewRows.findIndex((row) => (
          previewKey ? row.previewKey === previewKey : row.incidentImageUrl === url
        ))
        : -1);
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

  const renderStockEvents = useCallback(
    (row) => {
      const events = Array.isArray(row?.events) ? row.events : [];
      return (
        <div className="bg-[var(--bg2)] px-5 py-4">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--tx2)]">
            <span>All stock movements for</span>
            <Truck
              className="h-3.5 w-3.5 shrink-0 text-black dark:text-[var(--blue)]"
              strokeWidth={2.75}
              aria-hidden="true"
            />
            <span>{row?.vehicleNumber || 'Unknown'}</span>
          </div>
          {events.length === 0 ? (
            <div className="py-3 text-xs text-[var(--tx3)]">No individual events are available.</div>
          ) : (
            <div className="relative divide-y divide-[var(--bd)] overflow-hidden rounded-[10px] border border-[var(--bd)] bg-[var(--bg1solid)]">
              {events.length > 1 && (
                <span className="absolute bottom-[42px] left-[26px] top-[42px] z-10 w-px bg-[var(--blue)] sm:left-[28px]" />
              )}
              {events.map((event, index) => {
                const direction = String(event?.direction || '').toLowerCase();
                const imageUrl = incidentImageUrl(event?.Image);
                const eventTime = event?.timeOfIncident
                  ? moment.utc(event.timeOfIncident).tz(getConfiguredTimezone())
                  : null;
                return (
                  <div
                    key={event?._id || event?.eventId || `${row?.aggregationKey || row?._id}-${index}`}
                    className="grid min-h-[78px] grid-cols-[20px_82px_60px_125px_minmax(320px,1fr)] items-center gap-x-3 px-4 py-2.5 transition-colors hover:bg-[var(--bg2)] sm:grid-cols-[24px_92px_68px_145px_minmax(360px,1fr)]"
                  >
                    <div className="relative flex h-full min-h-[64px] items-center justify-center">
                      <span className="relative z-20 h-2 w-2 rounded-full bg-[var(--blue)]" />
                    </div>

                    <div className="text-left">
                      <div className="text-xs font-bold text-[var(--tx)]">
                        {eventTime ? eventTime.format('hh:mm A') : '--'}
                      </div>
                      <div className="mt-0.5 text-[11px] font-medium text-[var(--tx3)]">
                        {eventTime ? eventTime.format('DD MMM YYYY') : '--'}
                      </div>
                    </div>

                    {imageUrl ? (
                      <button
                        type="button"
                        onClick={() => openPreview(imageUrl, stockEventPreviewKey(row, event, index))}
                        className="mt-0.5 h-12 w-[60px] cursor-pointer overflow-hidden rounded-md border border-[var(--bd)] bg-[var(--bg3)] shadow-sm transition hover:border-[var(--blue)] sm:w-16"
                        title="View incident image"
                      >
                        <img
                          src={imageUrl}
                          alt={`${direction || 'Stock movement'} incident`}
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ) : (
                      <div className="mt-0.5 flex h-12 w-[60px] items-center justify-center rounded-md border border-[var(--bd)] bg-[var(--bg3)] text-[9px] font-medium text-[var(--tx3)] sm:w-16">
                        No image
                      </div>
                    )}

                    <div className="min-w-0 leading-tight">
                      <div className="truncate text-xs text-[var(--tx2)]">
                        <span className="font-bold text-[var(--tx)]">NVR Name:</span>{' '}
                        <span className="font-semibold">{event?.nvrName || '--'}</span>
                      </div>
                      <div className="mt-1 truncate text-[11px] text-[var(--tx2)]">
                        <span className="font-bold text-[var(--tx)]">Camera Name:</span>{' '}
                        <span className="font-semibold">{event?.channelName || '--'}</span>
                      </div>
                    </div>

                    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
                        <span
                          className={`inline-flex min-w-[76px] justify-center rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${
                            direction === 'loading'
                              ? 'bg-[var(--ok)]/15 text-[var(--ok)]'
                              : direction === 'unloading'
                                ? 'bg-[var(--warn)]/15 text-[var(--warn)]'
                                : 'bg-[var(--bg3)] text-[var(--tx2)]'
                          }`}
                        >
                          {direction || '--'}
                        </span>
                        <span className="text-[13px] text-[var(--tx2)]">
                          <span className="font-bold text-[var(--tx)]">Boxes:</span>{' '}
                          <span className="font-semibold">{event?.boxCount ?? 0}</span>
                        </span>
                        <span className="text-[13px] text-[var(--tx2)]">
                          <span className="font-bold text-[var(--tx)]">Box Type:</span>{' '}
                          <span className="font-semibold capitalize">{event?.boxType || '--'}</span>
                        </span>
                        {event?.description && (
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--tx2)]" title={event.description}>
                          <span className="font-bold text-[var(--tx)]">Description:</span>{' '}
                          {event.description}
                        </span>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    },
    [openPreview]
  );

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
    if (config.showStats === false) return [];
    if (config.showStockCountingFields) {
      return [
        { label: config.statsLabel || 'Vehicles', value: stockSummary.vehicles ?? totalCount ?? 0, color: 'var(--blue)' },
        { label: 'Loaded Boxes', value: stockSummary.loadedBoxes || 0, color: 'var(--ok)' },
        { label: 'Unloaded Boxes', value: stockSummary.unloadedBoxes || 0, color: 'var(--warn)' },
        { label: 'Total Boxes', value: stockSummary.totalBoxes || 0, color: 'var(--violet)' },
      ];
    }
    return [
      { label: config.statsLabel || 'Incidents', value: totalCount ?? 0, color: 'var(--blue)' },
      { label: 'High', value: severityTotals.high || 0, color: 'var(--crit)' },
      { label: 'Moderate', value: severityTotals.moderate || 0, color: 'var(--warn)' },
      { label: 'Low', value: severityTotals.low || 0, color: 'var(--ok)' },
    ];
  }, [config.showStats, config.showStockCountingFields, config.statsLabel, severityTotals, stockSummary, totalCount]);

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
      vehicleNumber: config.showVehicleNumberFilter ? vehicleNumber : undefined,
      boxType: config.showBoxTypeFilter ? boxType : undefined,
    }),
    [startDate, endDate, sortField, sortOrder, nvrIds, channelIds, severity, config.showStatus, status, config.showVehicleNumberFilter, vehicleNumber, config.showBoxTypeFilter, boxType, searchInput]
  );

  const handleExport = useCallback(async (format) => {
    setExportingFormat(format);
    try {
      if (config.useVehicleStyleExport) {
        await handleStockCountingExport(format, config, exportParams);
      } else {
        await handleIncidentExport(format, config, exportParams);
      }
    } finally {
      setExportingFormat('');
    }
  }, [config, exportParams]);

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
        imageKey={previewRows[previewIndex]?.previewKey}
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
        gridCard={config.tableOnly ? undefined : gridCard}
        viewMode={config.tableOnly ? 'table' : viewMode}
        onViewModeChange={config.tableOnly ? undefined : setViewMode}
        attendanceLogsCount={totalCount}
        currentPage={currentPage}
        setCurrentPage={(p) => dispatch({ type: 'SET_CURRENT_PAGE', value: p })}
        onPageChange={(p) => dispatch({ type: 'SET_CURRENT_PAGE', value: p })}
        limit={limit}
        onLimitChange={(v) => dispatch({ type: 'SET_LIMIT', value: v })}
        searchKeys={['incidentName', 'nvrName', 'channelName', 'vehicleNumber', 'direction', 'boxTypes']}
        searchQuery={searchInput}
        onSearchChange={(v) => dispatch({ type: 'SET_SEARCH_INPUT', value: v })}
        startDate={startDate}
        endDate={endDate}
        maxDate={maxDateDefault}
        datePickerVariant={config.datePickerVariant}
        renderExpandedRow={config.showStockCountingFields ? renderStockEvents : undefined}
        tableContainerClassName={config.showStockCountingFields ? '!border-[var(--blue)]' : ''}
        tableHeaderClassName={config.showStockCountingFields
          ? '!bg-slate-700 !text-white [&_tr]:!border-slate-700 [&_th]:!text-white [&_button]:!text-white'
          : ''}
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
        {canEdit && (
          <ExportButton
            onClick={() => handleExport('excel')}
            disabled={Boolean(exportingFormat) || !rows.length}
            className="disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exportingFormat === 'excel' ? 'Exporting…' : 'Excel'}
          </ExportButton>
        )}
        {canEdit && enableViewExports ? (
          <PdfViewPopover
            open={pdfViewOpen}
            exportingFormat={pdfExportingFormat}
            onOpenChange={setPdfViewOpen}
            onSelect={handlePdfExport}
          />
        ) : (
          canEdit && (
            <ExportButton
              onClick={() => handleExport('pdf')}
              disabled={Boolean(exportingFormat) || !rows.length}
              className="disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exportingFormat === 'pdf' ? 'Exporting…' : 'PDF'}
            </ExportButton>
          )
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
          showSeverity={config.showSeverityFilter !== false}
          showStatus={config.showStatus}
          status={status}
          setStatus={(v) => dispatch({ type: 'SET_STATUS', value: v })}
          showVehicleNumber={config.showVehicleNumberFilter}
          vehicleNumber={vehicleNumber}
          setVehicleNumber={(v) => dispatch({ type: 'SET_VEHICLE_NUMBER', value: v })}
          vehicleNumberList={vehicleNumberList}
          vehicleNumberSearch={vehicleNumberSearch}
          setVehicleNumberSearch={setVehicleNumberSearch}
          showBoxType={config.showBoxTypeFilter}
          boxType={boxType}
          setBoxType={(v) => dispatch({ type: 'SET_BOX_TYPE', value: v })}
          boxTypeOptions={boxTypeList.map((value) => ({
            value,
            label: value.replace(/\b\w/g, (letter) => letter.toUpperCase()),
          }))}
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
