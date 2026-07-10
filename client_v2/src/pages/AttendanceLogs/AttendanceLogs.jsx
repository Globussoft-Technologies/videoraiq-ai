import React, { useEffect, useCallback, useMemo, useReducer, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import moment from 'moment-timezone';
import { usePermissions } from '@/context/PermissionContext';
import AccessDenied from '@/components/AccessDenied';

import { initialState, reducer } from './attendanceState';
import { buildColumns, renderAttendanceCard } from './attendanceColumns';
import { handleAttendanceExport } from './attendanceExport';
import ReusableTablePage from './components/ReusableTablePage';
import LogsFilterPopover from './components/LogsFilterPopover';
import AutoRefreshComponent from './components/AutoRefreshComponent';
import LogEmployeeProfileDialog from './components/LogEmployeeProfileDialog';
import BreakLogsDialog from './components/BreakLogsDialog';
import ActionCameraPreview from './components/ActionCameraPreview';
import ExportButton from './components/ExportButton';
import {
  getAttendanceLogs,
  filterByDepartment,
  getchannels,
  getNVRs,
  getEmployeeLocations,
} from './Api';

const ATTENDANCE_REFRESH_KEY = 'attendance_auto_refresh_enabled';
const ATTENDANCE_INTERVAL_KEY = 'attendance_auto_refresh_interval';
const ATTENDANCE_VIEW_MODE_KEY = 'attendance_view_mode';

const convertToRegionTime = (utcTime, region) => {
  if (!utcTime) return '--';
  return moment.utc(utcTime).tz(region).format('hh:mm:ss A');
};

const convertToUTC = (date, time, region) => {
  if (!date || !time) return null;
  const hasAmPm = /am|pm/i.test(time);
  const format = hasAmPm ? 'YYYY-MM-DD hh:mm A' : 'YYYY-MM-DD HH:mm';
  return moment.tz(`${date} ${time}`, format, region).utc().format('HH:mm');
};

const AttendanceLogs = () => {
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    startDate: initialState.todayISO,
    endDate: initialState.todayISO,
  });

  const [autoRefresh, setAutoRefresh] = useState(() => {
    const saved = localStorage.getItem(ATTENDANCE_REFRESH_KEY);
    return saved !== null ? saved === 'true' : true;
  });
  const [refreshInterval, setRefreshInterval] = useState(() => {
    const parsed = parseInt(localStorage.getItem(ATTENDANCE_INTERVAL_KEY), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 30;
  });
  const [manualTrigger, setManualTrigger] = useState(0);
  // Default to grid; a saved 'table' choice is still remembered.
  const [viewMode, setViewMode] = useState(() =>
    localStorage.getItem(ATTENDANCE_VIEW_MODE_KEY) === 'table' ? 'table' : 'grid'
  );

  useEffect(() => localStorage.setItem(ATTENDANCE_REFRESH_KEY, autoRefresh), [autoRefresh]);
  useEffect(() => localStorage.setItem(ATTENDANCE_INTERVAL_KEY, refreshInterval), [refreshInterval]);
  useEffect(() => localStorage.setItem(ATTENDANCE_VIEW_MODE_KEY, viewMode), [viewMode]);

  const {
    selectedLog,
    showPreview,
    selectedProfile,
    showProfileDialog,
    selectedBreakLog,
    showBreakLogs,
    sortOrder,
    sortField,
    region,
    startDate,
    endDate,
    maxDateDefault,
    searchInput,
    attendanceLogs,
    attendanceLogsCount,
    departments,
    selectedDepartments,
    nvrIds,
    nvrList,
    cameraId,
    cameraList,
    fromTime,
    toTime,
    timeType,
    employeeLocations,
    locationList,
    currentPage,
    limit,
    BASE_URL,
    USER_AVTAR_INITIALS,
  } = state;

  const { permissions, loading: permissionsLoading } = usePermissions();
  const navigate = useNavigate();
  // Logs permissions may be nested per sub-section (attendanceLogs, global, …)
  // or a legacy flat shape ({ view, edit }). Resolve in order:
  // section-specific → global → legacy flat. Matches the V1 contract.
  const resolveLogPerm = (action) => {
    const logs = permissions?.logs;
    if (!logs) return false;
    if (typeof logs.attendanceLogs?.[action] === 'boolean') return logs.attendanceLogs[action];
    if (typeof logs.global?.[action] === 'boolean') return logs.global[action];
    if (typeof logs[action] === 'boolean') return logs[action];
    return false;
  };
  const canView = resolveLogPerm('view');
  const canEdit = resolveLogPerm('edit');

  /* ─────────────── Filter metadata ─────────────── */
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
        const response = await getchannels({ nvrIds });
        dispatch({ type: 'SET_CAMERA_LIST', value: response?.data?.body?.data || [] });
      } catch (error) {
        console.log('Error fetching channels:', error);
      }
    })();
  }, [nvrIds]);

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

  // Reset to page 1 when filters change.
  useEffect(() => {
    dispatch({ type: 'SET_CURRENT_PAGE', value: 1 });
  }, [selectedDepartments, nvrIds, cameraId, fromTime, toTime, timeType, employeeLocations, limit]);

  /* ─────────────── Data fetch ─────────────── */
  const fetchAttendanceLogs = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', value: true });
    const departmentIds = selectedDepartments.join(',');
    const utcFromTime = convertToUTC(startDate, fromTime, region);
    const utcToTime = convertToUTC(startDate, toTime, region);
    const nvrIdStr = Array.isArray(nvrIds) ? nvrIds.join(',') : '';
    const cameraIdStr = Array.isArray(cameraId) ? cameraId.join(',') : '';

    try {
      const response = await getAttendanceLogs(
        searchInput,
        nvrIdStr,
        cameraIdStr,
        startDate,
        endDate,
        currentPage,
        limit,
        sortField,
        sortOrder,
        departmentIds,
        utcFromTime,
        utcToTime,
        timeType,
        false,
        employeeLocations
      );
      if (
        response?.data?.statusCode === 500 &&
        response?.data?.body?.status === 'failed' &&
        response?.data?.body?.message === 'No attendance found'
      ) {
        dispatch({ type: 'SET_ATTENDANCE_LOGS', value: [] });
        dispatch({ type: 'SET_ATTENDANCE_COUNT', value: 0 });
      } else {
        dispatch({
          type: 'SET_ATTENDANCE_LOGS',
          value: response?.data?.body?.data?.attendanceLogs || [],
        });
        dispatch({ type: 'SET_ATTENDANCE_COUNT', value: response?.data?.body?.data?.total || 0 });
        const minDateValue = response?.data?.body?.data?.attendanceLogsStartDate;
        dispatch({ type: 'SET_MIN_DATE', value: minDateValue ? new Date(minDateValue) : null });
      }
    } catch (error) {
      console.error('Error fetching attendance logs:', error);
      dispatch({ type: 'SET_ATTENDANCE_LOGS', value: [] });
      dispatch({ type: 'SET_ATTENDANCE_COUNT', value: 0 });
    } finally {
      dispatch({ type: 'SET_LOADING', value: false });
    }
  }, [
    searchInput,
    nvrIds,
    cameraId,
    startDate,
    endDate,
    currentPage,
    sortField,
    sortOrder,
    selectedDepartments,
    fromTime,
    toTime,
    timeType,
    region,
    limit,
    employeeLocations,
  ]);

  useEffect(() => {
    fetchAttendanceLogs();
  }, [fetchAttendanceLogs, manualTrigger]);

  useEffect(() => {
    let intervalId;
    if (autoRefresh && refreshInterval > 0) {
      intervalId = setInterval(fetchAttendanceLogs, refreshInterval * 1000);
    }
    return () => intervalId && clearInterval(intervalId);
  }, [autoRefresh, refreshInterval, fetchAttendanceLogs]);

  /* ─────────────── Derived data ─────────────── */
  const mappedLogs = useMemo(
    () =>
      (attendanceLogs || []).map((item) => ({
        id: item.employee?._id || item.id,
        image: item.employee?.profilePics?.[0]
          ? BASE_URL + item.employee?.profilePics?.[0]
          : USER_AVTAR_INITIALS +
            (item.employee ? item.employee.firstName.charAt(0) : 'U') +
            (item.employee ? item.employee.lastName.charAt(0) : 'P'),
        name: item.employee ? `${item.employee.firstName} ${item.employee.lastName}` : '',
        department: item.employee?.departmentId?.departmentName || 'Unknown',
        date: item.date,
        location: item.employee?.location || '--',
        login: item.logInTime,
        logout: item.logOutTime || '--',
        imageUrls: Array.isArray(item?.imageUrls)
          ? item.imageUrls.map((img) => ({
              url: img?.images?.frame || img?.images?.person || img?.images?.face,
              timestamp: img?.timestamp,
              cameraType: img?.cameraType,
            }))
          : [],
        email: item.employee?.email || '',
        checkinCam: item.checkinCam || '-',
        checkoutCam: item.checkoutCam || '-',
      })),
    [attendanceLogs, BASE_URL, USER_AVTAR_INITIALS]
  );

  const columns = useMemo(
    () => buildColumns({ dispatch, sortField, sortOrder, region, convertToRegionTime }),
    [sortField, sortOrder, region]
  );

  const gridCard = useCallback(
    (item) => renderAttendanceCard(item, { dispatch, region, convertToRegionTime }),
    [region]
  );

  // KPI tiles — derived from the loaded page + server total (no placeholder data).
  const stats = useMemo(() => {
    const rows = mappedLogs || [];
    const checkedIn = rows.filter((r) => r.login).length;
    const checkedOut = rows.filter((r) => r.logout && r.logout !== '--').length;
    // Present = both checked in AND checked out; everyone else on the page is Absent.
    const present = rows.filter((r) => r.login && r.logout && r.logout !== '--').length;
    const absent = rows.length - present;
    return [
      { label: 'Checked In', value: checkedIn, color: 'var(--blue)' },
      { label: 'Check Out', value: checkedOut, color: 'var(--cyan)' },
      { label: 'Present', value: present, color: 'var(--ok)' },
      { label: 'Absent', value: absent, color: 'var(--crit)' },
    ];
  }, [mappedLogs]);

  const handleExport = (format) =>
    handleAttendanceExport(format, {
      searchInput,
      nvrIds,
      cameraId,
      startDate,
      endDate,
      currentPage,
      limit,
      sortField,
      sortOrder,
      selectedDepartments,
      fromTime,
      toTime,
      timeType,
      employeeLocations,
      region,
    });

  /* ─────────────── Guards ─────────────── */
  if (permissionsLoading) return null;
  if (!canView) {
    return (
      <AccessDenied
        message="You don't have permission to view Attendance Logs."
        onBack={() => navigate(-1)}
      />
    );
  }

  return (
    <div className="p-3 sm:p-4 lg:p-[22px] flex flex-col gap-3 sm:gap-[18px] min-h-full">
      {/* CAMERA PREVIEW */}
      <ActionCameraPreview
        module="attendancelogs"
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
        loading={state.loading}
        attendanceLogsCount={attendanceLogsCount}
        currentPage={currentPage}
        setCurrentPage={(p) => dispatch({ type: 'SET_CURRENT_PAGE', value: p })}
        onPageChange={(p) => dispatch({ type: 'SET_CURRENT_PAGE', value: p })}
        data={mappedLogs}
        columns={columns}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        gridCard={gridCard}
        searchQuery={searchInput}
        onSearchChange={(v) => dispatch({ type: 'SET_SEARCH_INPUT', value: v })}
        searchKeys={['name', 'department']}
        limit={limit}
        onLimitChange={(v) => dispatch({ type: 'SET_LIMIT', value: v })}
        startDate={startDate}
        endDate={endDate}
        maxDate={maxDateDefault}
        onDateRangeChange={({ start, end }) => {
          const toIso = (d) => (d instanceof Date ? d.toISOString().split('T')[0] : d);
          let s = start ? toIso(start) : null;
          let e = end ? toIso(end) : null;
          if (s && !e) e = s;
          if (!s && e) s = e;
          if (!s && !e) {
            s = state.todayISO;
            e = state.todayISO;
          }
          if (moment(s).isAfter(moment(e))) {
            const tmp = s;
            s = e;
            e = tmp;
          }
          dispatch({ type: 'SET_DATE_RANGE', value: { start: s, end: e } });
          dispatch({ type: 'SET_START_DATE', value: s });
          dispatch({ type: 'SET_END_DATE', value: e });
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
          setNvrId={(v) => dispatch({ type: 'SET_NVR_ID', value: Array.isArray(v) ? v : [] })}
          nvrList={nvrList}
          cameraId={Array.isArray(cameraId) ? cameraId : []}
          setCameraId={(v) => dispatch({ type: 'SET_CAMERA_ID', value: Array.isArray(v) ? v : [] })}
          cameraList={cameraList}
          departments={departments}
          selectedDepartments={selectedDepartments}
          setSelectedDepartments={(v) => dispatch({ type: 'SET_SELECTED_DEPARTMENTS', value: v })}
          setFromTime={(v) => dispatch({ type: 'SET_FROM_TIME', value: v })}
          setToTime={(v) => dispatch({ type: 'SET_TO_TIME', value: v })}
          setTimeType={(v) => dispatch({ type: 'SET_TIME_TYPE', value: v })}
          timeType={timeType}
          fromTime={fromTime}
          toTime={toTime}
          showTimeRange={false}
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
        open={showProfileDialog}
        onOpenChange={(open) => {
          dispatch({ type: 'SET_SHOW_PROFILE_DIALOG', value: open });
          if (!open) dispatch({ type: 'SET_SELECTED_PROFILE', value: null });
        }}
        profile={selectedProfile}
      />

      {/* BREAK LOGS DIALOG */}
      <BreakLogsDialog
        open={showBreakLogs}
        onOpenChange={(open) => {
          dispatch({ type: 'SET_SHOW_BREAK_LOGS', value: open });
          if (!open) dispatch({ type: 'SET_SELECTED_BREAK_LOG', value: null });
        }}
        log={selectedBreakLog}
        region={region}
        selectedDate={startDate}
        canEdit={canEdit}
      />
    </div>
  );
};

export default AttendanceLogs;
