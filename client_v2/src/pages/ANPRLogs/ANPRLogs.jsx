import React, { useEffect, useCallback, useMemo, useReducer, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import moment from 'moment-timezone';
import { usePermissions } from '@/context/PermissionContext';
import AccessDenied from '@/components/AccessDenied';
import { Button } from '@/components/ui/button';

import ReusableTablePage from '@/pages/AttendanceLogs/components/ReusableTablePage';
import AutoRefreshComponent from '@/pages/AttendanceLogs/components/AutoRefreshComponent';

import { initialState, reducer, REFRESH_KEY, INTERVAL_KEY } from './anprState';
import { buildColumns, renderANPRCard } from './anprColumns';
import { handleANPRExport } from './anprExport';
import ANPRFilterPopover from './components/ANPRFilterPopover';
import VehicleNumberSelect from './components/VehicleNumberSelect';
import ImagePreviewModal from './components/ImagePreviewModal';
import {
  getNVRs,
  getchannels,
  fetchVehicleObstructionLogs,
  getVehicleNumbers,
} from './Api';

const HOST = import.meta.env.VITE_BACKEND;

const ANPRLogs = () => {
  const maxDateDefault = useMemo(() => moment().endOf('day').toDate(), []);

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
    resolved,
    reportStatus,
    vehicleNumber,
    vehicleNumberList,
    vehicleNumberSearch,
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
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'grid'
  const [previewImage, setPreviewImage] = useState(null);
  const [previewImageLoading, setPreviewImageLoading] = useState(false);

  const { permissions, loading: permissionsLoading } = usePermissions();
  const navigate = useNavigate();

  // Logs permissions may be flat ({ view, edit }) or nested per sub-section
  // (ANPRLogs, global, …). Resolve in order: section-specific → global → flat.
  const resolveLogPerm = (action) => {
    const logs = permissions?.logs;
    if (!logs) return false;
    if (typeof logs.ANPRLogs?.[action] === 'boolean') return logs.ANPRLogs[action];
    if (typeof logs.global?.[action] === 'boolean') return logs.global[action];
    if (typeof logs[action] === 'boolean') return logs[action];
    return false;
  };
  const canView = resolveLogPerm('view');
  const canEdit = resolveLogPerm('edit');

  // Land the user on a sub-route whose tab actually appears in the sidebar.
  useEffect(() => {
    if (permissionsLoading) return;
    const logs = permissions?.logs;
    if (!logs) return;
    if (logs.ANPRLogs?.view === true) return;
    const candidates = [
      ['attendanceLogs', '/logs/attendance'],
      ['accessLogs', '/logs/access'],
    ];
    for (const [key, route] of candidates) {
      if (logs[key]?.view === true) {
        navigate(route, { replace: true });
        return;
      }
    }
  }, [permissionsLoading, permissions, navigate]);

  /* ─────────────── Auto-refresh persistence ─────────────── */
  useEffect(() => localStorage.setItem(REFRESH_KEY, autoRefresh), [autoRefresh]);
  useEffect(() => localStorage.setItem(INTERVAL_KEY, refreshInterval), [refreshInterval]);

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

  // Fetch distinct vehicle numbers (debounced when search changes).
  useEffect(() => {
    const handle = setTimeout(async () => {
      try {
        const res = await getVehicleNumbers(vehicleNumberSearch);
        dispatch({
          type: 'SET_VEHICLE_NUMBER_LIST',
          value: res?.data?.body?.data?.vehicleNumbers || [],
        });
      } catch (err) {
        console.log('Error fetching vehicle numbers:', err);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [vehicleNumberSearch]);

  // Reset to page 1 when filters or page size change.
  useEffect(() => {
    dispatch({ type: 'SET_CURRENT_PAGE', value: 1 });
  }, [nvrIds, channelIds, severity, resolved, reportStatus, vehicleNumber, limit]);

  const skip = (currentPage - 1) * limit;

  /* ─────────────── Data fetch ─────────────── */
  const fetchLogs = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', value: true });
    dispatch({ type: 'SET_ERROR', value: null });
    try {
      const res = await fetchVehicleObstructionLogs({
        skip,
        limit,
        startDate,
        endDate,
        sortField,
        sortOrder,
        nvrIds,
        channelIds,
        severity,
        resolved,
        reportStatus,
        vehicleNumber,
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
        nvrName: item.nvrData?.nvrName || '--',
        channelName: item.channelData?.name || '--',
        timeOfIncident: item.timeOfIncident || '--',
        createdAt: item.createdAt,
        imageUrl: item.Image ? `${HOST}${item.Image}` : null,
        incidentImageUrl: item.Image ? `${INCIDENT_URL}${item.Image}` : null,
        vehicleNumber: item.vehicleNumber || '--',
        severity: item.severity || '--',
        resolved: item.resolved,
        reportStatus: item.reportStatus,
      }));

      dispatch({ type: 'SET_ROWS', value: mapped });
      dispatch({ type: 'SET_TOTAL_COUNT', value: total });
    } catch (err) {
      console.log('Error fetching vehicle obstruction logs:', err);
      dispatch({ type: 'SET_ERROR', value: err });
    } finally {
      dispatch({ type: 'SET_LOADING', value: false });
    }
  }, [
    skip,
    limit,
    startDate,
    endDate,
    sortField,
    sortOrder,
    nvrIds,
    channelIds,
    severity,
    resolved,
    reportStatus,
    vehicleNumber,
    searchInput,
  ]);

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

  const openPreview = useCallback((url) => {
    if (!url) return;
    setPreviewImageLoading(true);
    setPreviewImage(url);
  }, []);

  const closePreview = () => {
    setPreviewImage(null);
    setPreviewImageLoading(false);
  };

  const onSort = useCallback((field) => {
    dispatch({ type: 'SET_SORT_FIELD', value: field });
    dispatch({ type: 'SET_SORT_ORDER', value: sortOrder === 'asc' ? 'desc' : 'asc' });
  }, [sortOrder]);

  const columns = useMemo(
    () => buildColumns({ onSort, onPreview: openPreview }),
    [onSort, openPreview]
  );

  const gridCard = useCallback(
    (item) => renderANPRCard(item, { onPreview: openPreview }),
    [openPreview]
  );

  const handleExport = (format) =>
    handleANPRExport(format, {
      startDate,
      endDate,
      sortField,
      sortOrder,
      nvrIds,
      channelIds,
      severity,
      resolved,
      reportStatus,
      vehicleNumber,
      searchInput,
    });

  /* ─────────────── Guards ─────────────── */
  if (permissionsLoading) return null;
  if (!canView) {
    return (
      <AccessDenied
        message="You don't have permission to view Logs."
        onBack={() => navigate(-1)}
      />
    );
  }

  return (
    <div className="p-[22px] flex flex-col gap-[18px] min-h-full">
      <ImagePreviewModal
        previewImage={previewImage}
        loading={previewImageLoading}
        setLoading={setPreviewImageLoading}
        onClose={closePreview}
      />

      <ReusableTablePage
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
        searchKeys={['incidentName', 'nvrName', 'channelName', 'vehicleNumber']}
        searchQuery={searchInput}
        onSearchChange={(v) => dispatch({ type: 'SET_SEARCH_INPUT', value: v })}
        startDate={startDate}
        endDate={endDate}
        maxDate={maxDateDefault}
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
        <VehicleNumberSelect
          vehicleNumber={vehicleNumber}
          setVehicleNumber={(v) => dispatch({ type: 'SET_VEHICLE_NUMBER', value: v })}
          vehicleNumberList={vehicleNumberList}
          vehicleNumberSearch={vehicleNumberSearch}
          setVehicleNumberSearch={(v) => dispatch({ type: 'SET_VEHICLE_NUMBER_SEARCH', value: v })}
        />

        {canEdit && (
          <Button
            className="bg-[var(--brand)] text-white rounded-[8px] px-3 py-2 text-sm cursor-pointer hover:bg-[var(--brand-hover)]"
            onClick={() => handleExport('excel')}
          >
            Export Excel
          </Button>
        )}
        {canEdit && (
          <Button
            className="bg-[var(--brand)] text-white rounded-[8px] px-3 py-2 text-sm cursor-pointer hover:bg-[var(--brand-hover)]"
            onClick={() => handleExport('pdf')}
          >
            Export PDF
          </Button>
        )}

        <ANPRFilterPopover
          nvrOptions={nvrOptions}
          nvrIds={nvrIds}
          setNvrIds={(v) => dispatch({ type: 'SET_NVR_IDS', value: Array.isArray(v) ? v : [] })}
          setChannelIds={(v) => dispatch({ type: 'SET_CHANNEL_IDS', value: Array.isArray(v) ? v : [] })}
          cameraOptions={cameraOptions}
          channelIds={channelIds}
          severity={severity}
          setSeverity={(v) => dispatch({ type: 'SET_SEVERITY', value: v })}
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

export default ANPRLogs;
