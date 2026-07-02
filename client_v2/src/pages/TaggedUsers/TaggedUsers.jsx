import React, { useEffect, useCallback, useMemo, useReducer, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import moment from 'moment-timezone';
import { toast } from 'sonner';
import { usePermissions } from '@/context/PermissionContext';
import AccessDenied from '@/components/AccessDenied';
import unknownimg from '@/assets/unknownimg.jpg';
import { Button } from '@/components/ui/button';

import ReusableTablePage from '@/pages/AttendanceLogs/components/ReusableTablePage';
import LogsFilterPopover from '@/pages/AttendanceLogs/components/LogsFilterPopover';
import AutoRefreshComponent from '@/pages/AttendanceLogs/components/AutoRefreshComponent';
import LogEmployeeProfileDialog from '@/pages/AttendanceLogs/components/LogEmployeeProfileDialog';
import ActionCameraPreview from '@/pages/AttendanceLogs/components/ActionCameraPreview';

import { initialState, reducer, todayISO, maxDateDefault, mapAccessLog } from './taggedState';
import { buildColumns, renderAccessCard } from './taggedColumns';
import { handleTaggedExport } from './taggedExport';
import {
  filterByDepartment,
  getAllAccessLogsDetails,
  getchannels,
  getEmployeeLocations,
  getNVRs,
  tagUser,
} from './Api';

const ACCESS_REFRESH_KEY = 'tagged_users_auto_refresh_enabled';
const ACCESS_INTERVAL_KEY = 'tagged_users_auto_refresh_interval';
const ACCESS_VIEW_MODE_KEY = 'tagged_users_view_mode';

const convertToUTC = (date, time, region) => {
  if (!date || !time) return null;
  const hasAmPm = /am|pm/i.test(time);
  const format = hasAmPm ? 'YYYY-MM-DD hh:mm A' : 'YYYY-MM-DD HH:mm';
  return moment.tz(`${date} ${time}`, format, region).utc().format('HH:mm');
};

const TaggedUsers = () => {
  const nasUrl = import.meta.env.VITE_BACKEND || '';
  const region = moment.tz.guess();
  const [limit, setLimit] = useState(10);

  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    startDate: todayISO,
    endDate: todayISO,
  });

  const [autoRefresh, setAutoRefresh] = useState(() => {
    const saved = localStorage.getItem(ACCESS_REFRESH_KEY);
    return saved !== null ? saved === 'true' : true;
  });
  const [refreshInterval, setRefreshInterval] = useState(() => {
    const parsed = parseInt(localStorage.getItem(ACCESS_INTERVAL_KEY), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 30;
  });
  const [manualTrigger, setManualTrigger] = useState(0);
  const [viewMode, setViewMode] = useState(() =>
    localStorage.getItem(ACCESS_VIEW_MODE_KEY) === 'grid' ? 'grid' : 'table'
  );

  useEffect(() => localStorage.setItem(ACCESS_REFRESH_KEY, autoRefresh), [autoRefresh]);
  useEffect(() => localStorage.setItem(ACCESS_INTERVAL_KEY, refreshInterval), [refreshInterval]);
  useEffect(() => localStorage.setItem(ACCESS_VIEW_MODE_KEY, viewMode), [viewMode]);

  const {
    selectedLog,
    showProfile,
    showPreview,
    currentPage,
    sortOrder,
    sortField,
    rows,
    loading,
    error,
    totalCount,
    departments,
    selectedDepartments,
    searchInput,
    startDate,
    endDate,
    nvrIds,
    nvrList,
    cameraList,
    channelIds,
    removeUnknown,
    fromTime,
    toTime,
    employeeLocations,
    locationList,
  } = state;

  const skip = (currentPage - 1) * limit;

  const { permissions, loading: permissionsLoading } = usePermissions();
  const navigate = useNavigate();

  // Logs permissions may be flat ({view,...}) or nested per sub-section
  // (accessLogs, attendanceLogs, global, ...). Resolve in order:
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
  const canEdit = resolveLogPerm('edit');

  // Land the user on a sub-route whose tab actually appears in the sidebar.
  useEffect(() => {
    if (permissionsLoading) return;
    const logs = permissions?.logs;
    if (!logs) return;
    if (logs.accessLogs?.view === true) return;
    const candidates = [
      ['attendanceLogs', '/logs/attendance'],
      ['ANPRLogs', '/logs/ANPR'],
    ];
    for (const [key, route] of candidates) {
      if (logs[key]?.view === true) {
        navigate(route, { replace: true });
        return;
      }
    }
  }, [permissionsLoading, permissions, navigate]);

  /* ─────────────── Filter metadata ─────────────── */
  useEffect(() => {
    (async () => {
      try {
        const res = await filterByDepartment({ limit: 50 });
        const deptList =
          res?.data?.body?.data?.data?.map((d) => ({ label: d.departmentName, id: d._id })) || [];
        dispatch({ type: 'SET_DEPARTMENTS', value: deptList });
      } catch (err) {
        console.log('Failed to load departments', err);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const response = await getNVRs();
        dispatch({ type: 'SET_NVR_LIST', value: response?.data?.body?.data || [] });
      } catch (error) {
        console.log('Error fetching NVRs:', error);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await getEmployeeLocations({ skip: 0, limit: 100 });
        dispatch({ type: 'SET_LOCATION_LIST', value: res?.data?.body?.data?.locations || [] });
      } catch (err) {
        console.log('Failed to load locations', err);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const response = await getchannels({ nvrIds });
        dispatch({ type: 'SET_CAMERA_LIST', value: response?.data?.body?.data || [] });
      } catch (error) {
        console.log('Error fetching channels:', error);
      }
    })();
  }, [nvrIds]);

  // Use locationName as the option id so MultiSelect stores name strings
  // (matches the backend `employeeLocations` body contract).
  const locationOptions = useMemo(
    () => (locationList || []).map((loc) => ({ label: loc.locationName, id: loc.locationName })),
    [locationList]
  );

  // Reset to page 1 when filters change.
  useEffect(() => {
    dispatch({ type: 'SET_CURRENT_PAGE', value: 1 });
  }, [selectedDepartments, nvrIds, channelIds, removeUnknown, employeeLocations, limit]);

  /* ─────────────── Data fetch ─────────────── */
  const fetchLogs = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', value: true });
    dispatch({ type: 'SET_ERROR', value: null });

    try {
      const utcFromTime = convertToUTC(startDate, fromTime, region);
      const utcToTime = convertToUTC(startDate, toTime, region);
      const payload = {
        startDate,
        endDate,
        searchQuery: searchInput || '',
        skip,
        limit,
        sortOrder,
        sortField,
        departmentIds: selectedDepartments,
        channelIds,
        nvrIds,
        employeeLocations,
        removeUnknown,
        isExport: false,
        tag: true,
        ...(fromTime && toTime && { fromTime: utcFromTime, toTime: utcToTime }),
      };

      const res = await getAllAccessLogsDetails(payload);
      const data = res?.data?.body?.data;

      dispatch({ type: 'SET_MINDATE', value: data?.accessLogsStartDate?.createdAt || null });

      const userlogs = data?.usersLogs || [];
      const total = data?.total || 0;

      const mapped = userlogs.map((log) => mapAccessLog(log, nasUrl, unknownimg));

      dispatch({ type: 'SET_ROWS', value: mapped });
      dispatch({ type: 'SET_TOTAL_COUNT', value: total });
    } catch (err) {
      console.log('Error fetching logs:', err);
      dispatch({ type: 'SET_ERROR', value: err });
    } finally {
      dispatch({ type: 'SET_LOADING', value: false });
    }
  }, [
    startDate,
    endDate,
    searchInput,
    skip,
    limit,
    sortOrder,
    sortField,
    selectedDepartments,
    channelIds,
    nvrIds,
    removeUnknown,
    fromTime,
    toTime,
    employeeLocations,
    nasUrl,
    region,
  ]);

  // Effect 1: Manual/Filter trigger
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs, manualTrigger]);

  // Effect 2: Auto Refresh timer
  useEffect(() => {
    let intervalId;
    if (autoRefresh && refreshInterval > 0) {
      intervalId = setInterval(fetchLogs, refreshInterval * 1000);
    }
    return () => intervalId && clearInterval(intervalId);
  }, [autoRefresh, refreshInterval, fetchLogs]);

  // This page lists only tagged entries, so every toggle starts ON. The user
  // can only turn it OFF (untag); doing so removes the row from this list.
  const [untaggingId, setUntaggingId] = useState(null);

  const handleUntag = useCallback(
    async (item) => {
      if (untaggingId || !item?.accessLogId) return;
      setUntaggingId(item.accessLogId);
      try {
        const result = await tagUser(item.userId, {
          tag: false,
          profileImages: item.personImages || [],
          accessLogId: item.accessLogId,
        });
        if (result?.body?.status === 'success' || result?.statusCode === 200) {
          toast.success('User untagged successfully');
          fetchLogs(); // refetch so the untagged row drops off this list
        } else {
          toast.error(
            result?.body?.message || result?.body?.error || 'Failed to untag user'
          );
        }
      } catch (error) {
        console.error('Failed to untag user', error);
        toast.error(
          error?.response?.data?.body?.message ||
            error?.response?.data?.body?.error ||
            error?.response?.data?.message ||
            'Failed to untag user'
        );
      } finally {
        setUntaggingId(null);
      }
    },
    [untaggingId, fetchLogs]
  );

  const columns = useMemo(
    () => buildColumns({ dispatch, sortField, sortOrder, region, untaggingId, handleUntag }),
    [sortField, sortOrder, region, untaggingId, handleUntag]
  );

  const gridCard = useCallback(
    (item) => renderAccessCard(item, { dispatch, region, untaggingId, handleUntag }),
    [region, untaggingId, handleUntag]
  );

  const handleExport = (format) =>
    handleTaggedExport(format, {
      startDate,
      endDate,
      searchInput,
      skip,
      limit,
      sortOrder,
      sortField,
      selectedDepartments,
      channelIds,
      nvrIds,
      employeeLocations,
      removeUnknown,
      fromTime,
      toTime,
      region,
    });

  /* ─────────────── Guards ─────────────── */
  if (permissionsLoading) return null;
  if (!canView) {
    return <AccessDenied message="You don't have permission to view Logs." />;
  }

  return (
    <div className="p-[22px] flex flex-col gap-[18px] min-h-full">
      {/* Preview window */}
      <ActionCameraPreview
        module="accesslogs"
        selectedLog={selectedLog}
        isOpen={showPreview}
        onClose={() => {
          dispatch({ type: 'SET_SHOW_PREVIEW', value: false });
          dispatch({ type: 'SET_SELECTED_LOG', value: null });
        }}
      />

      <ReusableTablePage
        data={rows}
        columns={columns}
        loading={loading}
        error={error}
        currentPage={currentPage}
        setCurrentPage={(v) => dispatch({ type: 'SET_CURRENT_PAGE', value: v })}
        attendanceLogsCount={totalCount}
        limit={limit}
        onLimitChange={(v) => {
          setLimit(v);
          dispatch({ type: 'SET_CURRENT_PAGE', value: 1 });
        }}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        gridCard={gridCard}
        searchKeys={['name', 'department']}
        searchQuery={searchInput}
        onSearchChange={(v) => dispatch({ type: 'SET_SEARCH_INPUT', value: v })}
        startDate={startDate}
        endDate={endDate}
        maxDate={maxDateDefault}
        onDateRangeChange={({ start, end }) => {
          const toIso = (d) => (d instanceof Date ? d.toISOString().split('T')[0] : d);
          dispatch({ type: 'SET_START_DATE', value: start ? toIso(start) : '' });
          dispatch({ type: 'SET_END_DATE', value: end ? toIso(end) : '' });
        }}
      >
        <div className="flex gap-2">
          {canEdit && (
            <>
              <Button
                className="bg-[var(--brand)] text-white rounded-[8px] px-3 py-2 text-sm cursor-pointer hover:bg-[var(--brand-hover)]"
                onClick={() => handleExport('excel')}
              >
                Export Excel
              </Button>
              <Button
                className="bg-[var(--brand)] text-white rounded-[8px] px-3 py-2 text-sm cursor-pointer hover:bg-[var(--brand-hover)]"
                onClick={() => handleExport('pdf')}
              >
                Export PDF
              </Button>
            </>
          )}
        </div>

        <LogsFilterPopover
          nvrIds={Array.isArray(nvrIds) ? nvrIds : []}
          setNvrId={(value) => {
            dispatch({ type: 'SET_NVR_IDS', value });
            if (value.length === 0) {
              dispatch({ type: 'SET_CHANNEL_IDS', value: [] });
            }
          }}
          nvrList={nvrList}
          cameraId={channelIds}
          setCameraId={(value) => dispatch({ type: 'SET_CHANNEL_IDS', value })}
          cameraList={cameraList}
          departments={departments}
          selectedDepartments={selectedDepartments}
          setSelectedDepartments={(v) =>
            dispatch({ type: 'SET_SELECTED_DEPARTMENTS', value: v })
          }
          showTimeRange={false}
          showUnknownFilter={true}
          removeUnknown={removeUnknown}
          setRemoveUnknown={(v) => dispatch({ type: 'SET_REMOVE_UNKNOWN', value: v })}
          setFromTime={(v) => dispatch({ type: 'SET_FROM_TIME', value: v })}
          setToTime={(v) => dispatch({ type: 'SET_TO_TIME', value: v })}
          fromTime={fromTime}
          toTime={toTime}
          showLocationFilter={true}
          employeeLocations={employeeLocations}
          setEmployeeLocations={(v) =>
            dispatch({ type: 'SET_EMPLOYEE_LOCATIONS', value: Array.isArray(v) ? v : [] })
          }
          locationOptions={locationOptions}
        />

        <AutoRefreshComponent
          isActive={autoRefresh}
          onActiveChange={setAutoRefresh}
          refreshInterval={refreshInterval}
          onIntervalChange={setRefreshInterval}
          onManualRefresh={() => setManualTrigger((prev) => prev + 1)}
        />
      </ReusableTablePage>

      {/* Profile popup */}
      <LogEmployeeProfileDialog
        module="accessLog"
        open={showProfile}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            dispatch({ type: 'SET_SHOW_PROFILE', value: false });
            dispatch({ type: 'SET_SELECTED_LOG', value: null });
          }
        }}
        onClose={() => {
          dispatch({ type: 'SET_SHOW_PROFILE', value: false });
          dispatch({ type: 'SET_SELECTED_LOG', value: null });
        }}
        profile={selectedLog}
      />
    </div>
  );
};

export default TaggedUsers;
