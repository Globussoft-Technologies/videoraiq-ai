import React, { useEffect, useCallback, useMemo, useReducer, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import moment from 'moment-timezone';
import { usePermissions } from '@/context/PermissionContext';
import AccessDenied from '@/components/AccessDenied';
import unknownimg from '@/assets/unknownimg.jpg';

import { initialState, reducer } from './accessState';
import { buildColumns, renderAccessCard } from './accessColumns';
import { handleAccessExport } from './accessExport';
import { useAccessTagging } from './useAccessTagging';
import TagUserDropdown from './components/TagUserDropdown';
import {
  getAllAccessLogsDetails,
  filterByDepartment,
  getNVRs,
  getchannels,
  getEmployeeLocations,
} from './Api';
import ReusableTablePage from '@/pages/AttendanceLogs/components/ReusableTablePage';
import LogsFilterPopover from '@/pages/AttendanceLogs/components/LogsFilterPopover';
import AutoRefreshComponent from '@/pages/AttendanceLogs/components/AutoRefreshComponent';
import LogEmployeeProfileDialog from '@/pages/AttendanceLogs/components/LogEmployeeProfileDialog';
import ActionCameraPreview from '@/pages/AttendanceLogs/components/ActionCameraPreview';
import ExportButton from '@/pages/AttendanceLogs/components/ExportButton';

const ACCESS_REFRESH_KEY = 'access_auto_refresh_enabled';
const ACCESS_INTERVAL_KEY = 'access_auto_refresh_interval';
const ACCESS_VIEW_MODE_KEY = 'access_view_mode';

const convertToUTC = (date, time, region) => {
  if (!date || !time) return null;
  const hasAmPm = /am|pm/i.test(time);
  const format = hasAmPm ? 'YYYY-MM-DD hh:mm A' : 'YYYY-MM-DD HH:mm';
  return moment.tz(`${date} ${time}`, format, region).utc().format('HH:mm');
};

const AccessLogs = () => {
  const nasUrl = import.meta.env.VITE_BACKEND || '';
  const [limit, setLimit] = useState(12);

  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    startDate: initialState.todayISO,
    endDate: initialState.todayISO,
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
  // Default to grid; a saved 'table' choice is still remembered.
  const [viewMode, setViewMode] = useState(() =>
    localStorage.getItem(ACCESS_VIEW_MODE_KEY) === 'table' ? 'table' : 'grid'
  );
  const [authorizedTotal, setAuthorizedTotal] = useState(0);

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
    region,
    maxDateDefault,
  } = state;

  const skip = (currentPage - 1) * limit;

  const { permissions, loading: permissionsLoading } = usePermissions();
  const navigate = useNavigate();

  // Logs permissions may be flat ({view,...}) or nested per sub-section
  // (accessLogs, global, …). Resolve in order: section-specific → global → flat.
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

  /* ─────────────── Tag flow ─────────────── */
  const {
    taggingId,
    tagOverrides,
    pickedNames,
    dropdown,
    setDropdown,
    isTagged,
    handleToggle,
    tagWithUser,
    resetOverrides,
  } = useAccessTagging();

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

  // locationName used as option id so MultiSelect stores name strings (backend contract).
  const locationOptions = useMemo(
    () => (locationList || []).map((loc) => ({ label: loc.locationName, id: loc.locationName })),
    [locationList]
  );

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

  useEffect(() => {
    dispatch({ type: 'SET_CURRENT_PAGE', value: 1 });
  }, [selectedDepartments, nvrIds, channelIds, removeUnknown, employeeLocations, limit]);

  /* ─────────────── Data fetch ─────────────── */
  const fetchLogs = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', value: true });
    dispatch({ type: 'SET_ERROR', value: null });
    // Reset local tag overrides so freshly fetched server state wins.
    resetOverrides();

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
        ...(fromTime && toTime && { fromTime: utcFromTime, toTime: utcToTime }),
      };

      const authorizedPayload = {
        ...payload,
        skip: 0,
        limit: 1,
        removeUnknown: true,
      };

      const [res, authorizedRes] = await Promise.all([
        getAllAccessLogsDetails(payload),
        getAllAccessLogsDetails(authorizedPayload).catch((error) => {
          console.log('Error fetching authorized user count:', error);
          return null;
        }),
      ]);
      const data = res?.data?.body?.data;
      const authorizedData = authorizedRes?.data?.body?.data;

      dispatch({ type: 'SET_MINDATE', value: data?.accessLogsStartDate?.createdAt || null });

      const userlogs = data?.usersLogs || [];
      const total = data?.total || 0;

      const mapped = userlogs.map((log) => {
        const sessions = log.sessions || [];
        const firstSessionImg = sessions
          .map((s) => s?.images?.faceImage || s?.images?.personImage || s?.images?.frameImage)
          .find(Boolean);
        const image =
          log.userInfo?.profilePics?.length > 0
            ? `${nasUrl}/uploads${log.userInfo.profilePics[0]}`
            : firstSessionImg
              ? `${nasUrl}/uploads${firstSessionImg}`
              : unknownimg;
        const imageUrls = sessions.map((session) => {
          const images = session.images;
          return images?.frameImage || images?.personImage || images?.faceImage;
        });
        const personImages = sessions
          .map((session) => {
            const img =
              session?.images?.personImage ||
              session?.images?.frameImage ||
              session?.images?.faceImage;
            return img ? `${nasUrl}/uploads${img}` : null;
          })
          .filter(Boolean);
        const timestamp = sessions.map((session) => session.timestamp);
        return {
          name: log.userInfo?.userName || 'Unknown',
          userId: log.userId || log.userInfo?._id || null,
          accessLogId: log._id || null,
          tag: !!log.tag,
          department: log.department?.departmentName || '--',
          date: log.date || '--',
          location: log.userInfo?.location || log.nvrInfo?.location || '--',
          cameraName: sessions[0]?.channel?.name || '--',
          enteredIn: sessions.length > 0 ? sessions[0].timestamp : null,
          exitTiming: sessions.length > 1 ? sessions[sessions.length - 1].timestamp : null,
          image,
          email: log.userInfo?.email || '--',
          emp_id: log.userInfo?.emp_id || '--',
          imageUrls,
          personImages,
          timestamp,
        };
      });

      dispatch({ type: 'SET_ROWS', value: mapped });
      dispatch({ type: 'SET_TOTAL_COUNT', value: total });
      setAuthorizedTotal(authorizedData?.total || 0);
    } catch (err) {
      console.log('Error fetching logs:', err);
      dispatch({ type: 'SET_ERROR', value: err });
    } finally {
      dispatch({ type: 'SET_LOADING', value: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /* ─────────────── Derived data ─────────────── */
  const columns = useMemo(
    () =>
      buildColumns({
        dispatch,
        sortField,
        sortOrder,
        region,
        isTagged,
        taggingId,
        pickedNames,
        handleToggle,
        canEdit,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sortField, sortOrder, region, taggingId, tagOverrides, pickedNames, canEdit]
  );

  const gridCard = useCallback(
    (item) =>
      renderAccessCard(item, {
        dispatch,
        region,
        isTagged,
        taggingId,
        pickedNames,
        handleToggle,
        canEdit,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [region, taggingId, tagOverrides, pickedNames, canEdit]
  );

  // KPI tiles — derived from the loaded page + server total (no placeholder data).
  const stats = useMemo(() => {
  const list = rows || [];
  const tagged = list.filter((r) => isTagged(r)).length;

  return [
    { label: 'Access Events', value: totalCount ?? 0, color: 'var(--blue)' },
    { label: 'Tagged', value: tagged, color: 'var(--cyan)' },
    { label: 'Authorized Users', value: authorizedTotal, color: 'var(--ok)' },
  ];
}, [rows, totalCount, authorizedTotal, tagOverrides, isTagged]);

  const handleExport = (format) =>
    handleAccessExport(format, {
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
    return (
      <AccessDenied
        message="You don't have permission to view Logs."
        onBack={() => navigate(-1)}
      />
    );
  }

  return (
    <div className="p-3 sm:p-4 lg:p-[22px] flex flex-col gap-3 sm:gap-[18px] min-h-full">
      {/* Authorized-user picker dropdown (opens beside the toggle) */}
      {dropdown?.rect && (
        <TagUserDropdown
          anchorRect={dropdown.rect}
          busy={!!taggingId}
          onSelect={(user) => tagWithUser(dropdown.item, user)}
          onClose={() => setDropdown(null)}
        />
      )}

      {/* CAMERA PREVIEW */}
      <ActionCameraPreview
        module="accesslogs"
        selectedLog={selectedLog}
        isOpen={showPreview}
        onClose={() => {
          dispatch({ type: 'SET_SHOW_PREVIEW', value: false });
          dispatch({ type: 'SET_SELECTED_LOG', value: null });
        }}
      />

      {/* TABLE / GRID */}
      <ReusableTablePage
        stats={stats}
        title="Access Logs"
        data={rows}
        columns={columns}
        loading={loading}
        error={error}
        currentPage={currentPage}
        setCurrentPage={(v) => dispatch({ type: 'SET_CURRENT_PAGE', value: v })}
        onPageChange={(v) => dispatch({ type: 'SET_CURRENT_PAGE', value: v })}
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
        datePickerVariant="preset"
        onDateRangeChange={({ start, end }) => {
          const toIso = (d) => (d instanceof Date ? d.toISOString().split('T')[0] : d);
          dispatch({ type: 'SET_START_DATE', value: start ? toIso(start) : '' });
          dispatch({ type: 'SET_END_DATE', value: end ? toIso(end) : '' });
        }}
      >
        {canEdit && (
          <div className="flex gap-2">
            <ExportButton onClick={() => handleExport('excel')}>Excel</ExportButton>
            <ExportButton onClick={() => handleExport('pdf')}>PDF</ExportButton>
          </div>
        )}

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
          setSelectedDepartments={(v) => dispatch({ type: 'SET_SELECTED_DEPARTMENTS', value: v })}
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

      {/* PROFILE DIALOG */}
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

export default AccessLogs;
