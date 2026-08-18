import React, { useEffect, useCallback, useMemo, useReducer, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
// Module-level constant so the reducer gets the same reference on every reset
// and the `stats` memo doesn't recompute on unrelated renders.
const EMPTY_STATUS_COUNTS = {
  present: 0,
  halfDay: 0,
  absent: 0,
  checkedIn: 0,
  earlyLeave: 0,
  notCheckedIn: 0,
  checkinLogs: 0,
  checkoutLogs: 0,
};

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

const cameraNamesForAttendance = (item) => {
  const names = [
    item?.checkinCam,
    item?.checkoutCam,
    ...(Array.isArray(item?.imageUrls) ? item.imageUrls.map((capture) => capture?.cameraName) : []),
  ].filter((name) => name && String(name).trim() && String(name).toLowerCase() !== 'unknown');
  return [...new Set(names.map((name) => String(name).trim()))].join(', ');
};

const ABSENT_TABS = {
  EARLY_LEAVE: 'early_leave',
  NOT_CHECKED_IN: 'not_checked_in',
};

const AttendanceLogs = () => {
  // Arriving from another screen (e.g. Attendance Analytics' "Present" tile)
  // can pre-select a day and status — read once, on mount, as the reducer's
  // initial state rather than reacting to it afterwards.
  const location = useLocation();
  const navState = location.state || {};
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    startDate: navState.startDate || initialState.todayISO,
    endDate: navState.endDate || initialState.todayISO,
    statusFilter: navState.statusFilter || '',
    employeeLocations: Array.isArray(navState.employeeLocations) ? navState.employeeLocations : [],
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
  const attendanceRequestRef = useRef(0);
  const [absentTab, setAbsentTab] = useState(() =>
    navState.statusFilter === ABSENT_TABS.NOT_CHECKED_IN
      ? ABSENT_TABS.NOT_CHECKED_IN
      : ABSENT_TABS.EARLY_LEAVE
  );
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
    statusFilter,
    attendanceLogs,
    attendanceLogsCount,
    statusCounts,
    totalEmployees,
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
  const absentFlowActive =
    statusFilter === 'absent' ||
    statusFilter === ABSENT_TABS.EARLY_LEAVE ||
    statusFilter === ABSENT_TABS.NOT_CHECKED_IN;
  const effectiveStatusFilter = absentFlowActive
    ? absentTab === ABSENT_TABS.NOT_CHECKED_IN
      ? ABSENT_TABS.NOT_CHECKED_IN
      : ABSENT_TABS.EARLY_LEAVE
    : statusFilter;

  useEffect(() => {
    if (!absentFlowActive) setAbsentTab(ABSENT_TABS.EARLY_LEAVE);
  }, [absentFlowActive]);
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
    const requestId = ++attendanceRequestRef.current;
    dispatch({ type: 'SET_LOADING', value: true });
    const departmentIds = selectedDepartments.join(',');
    const utcFromTime = convertToUTC(startDate, fromTime, region);
    const utcToTime = convertToUTC(startDate, toTime, region);
    const nvrIdStr = Array.isArray(nvrIds) ? nvrIds.join(',') : '';
    const cameraIdStr = Array.isArray(cameraId) ? cameraId.join(',') : '';

    try {
      const [response, summaryResponse] = await Promise.all([
        getAttendanceLogs(
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
          employeeLocations,
          effectiveStatusFilter
        ),
        // Keep the tiles pinned to the whole currently-selected range.
        // Clicking a tile should only narrow the table/grid rows, not
        // replace the summary totals with "counts inside the active tile".
        getAttendanceLogs(
          searchInput,
          nvrIdStr,
          cameraIdStr,
          startDate,
          endDate,
          1,
          limit,
          sortField,
          sortOrder,
          departmentIds,
          utcFromTime,
          utcToTime,
          timeType,
          false,
          employeeLocations,
          ''
        ),
      ]);
      if (requestId !== attendanceRequestRef.current) return;

      const summaryData = summaryResponse?.data?.body?.data;
      if (
        response?.data?.statusCode === 500 &&
        response?.data?.body?.status === 'failed' &&
        response?.data?.body?.message === 'No attendance found'
      ) {
        dispatch({ type: 'SET_ATTENDANCE_LOGS', value: [] });
        dispatch({ type: 'SET_ATTENDANCE_COUNT', value: 0 });
        dispatch({
          type: 'SET_STATUS_COUNTS',
          value: summaryData?.statusCounts || EMPTY_STATUS_COUNTS,
        });
        dispatch({
          type: 'SET_TOTAL_EMPLOYEES',
          value: summaryData?.totalEmployees || 0,
        });
      } else {
        dispatch({
          type: 'SET_ATTENDANCE_LOGS',
          value: response?.data?.body?.data?.attendanceLogs || [],
        });
        dispatch({ type: 'SET_ATTENDANCE_COUNT', value: response?.data?.body?.data?.total || 0 });
        dispatch({
          type: 'SET_STATUS_COUNTS',
          value: summaryData?.statusCounts || EMPTY_STATUS_COUNTS,
        });
        dispatch({
          type: 'SET_TOTAL_EMPLOYEES',
          value: summaryData?.totalEmployees || 0,
        });
        const minDateValue =
          response?.data?.body?.data?.attendanceLogsStartDate ||
          summaryData?.attendanceLogsStartDate;
        dispatch({ type: 'SET_MIN_DATE', value: minDateValue ? new Date(minDateValue) : null });
      }
    } catch (error) {
      if (requestId !== attendanceRequestRef.current) return;
      console.error('Error fetching attendance logs:', error);
      dispatch({ type: 'SET_ATTENDANCE_LOGS', value: [] });
      dispatch({ type: 'SET_ATTENDANCE_COUNT', value: 0 });
      dispatch({ type: 'SET_STATUS_COUNTS', value: EMPTY_STATUS_COUNTS });
    } finally {
      if (requestId === attendanceRequestRef.current) dispatch({ type: 'SET_LOADING', value: false });
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
    effectiveStatusFilter,
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
        cameraNames: cameraNamesForAttendance(item),
        imageUrls: Array.isArray(item?.imageUrls)
          ? item.imageUrls.map((img) => ({
              url: img?.images?.frame || img?.images?.person || img?.images?.face,
              timestamp: img?.timestamp,
              cameraType: img?.cameraType,
              cameraName: img?.cameraName,
            }))
          : [],
        email: item.employee?.email || '',
        checkinCam: cameraNamesForAttendance(item) || item.checkinCam || '-',
        checkoutCam: item.checkoutCam || '-',
        // Graded on the server against this org's configured full-day /
        // half-day thresholds — never re-derived here, so the table, the
        // export and Attendance Analytics can't disagree.
        status: item.status,
        minutesSpent: item.minutesSpent,
        // Same checkout→checkin pairing behind the Break Logs dialog,
        // totalled here so the table doesn't need a click-through to show it.
        breakMinutes: item.breakMinutes || 0,
        breakCount: item.breakCount || 0,
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

  // Toggling a tile re-filters the table to just that status (clicking the
  // active one clears it back to all statuses for the date range).
  const toggleStatusFilter = (value) =>
    dispatch({ type: 'SET_STATUS_FILTER', value: statusFilter === value ? '' : value });

  const toggleAbsentFlow = () => {
    if (absentFlowActive && absentTab === ABSENT_TABS.EARLY_LEAVE) {
      dispatch({ type: 'SET_STATUS_FILTER', value: '' });
      setAbsentTab(ABSENT_TABS.EARLY_LEAVE);
      return;
    }
    setAbsentTab(ABSENT_TABS.EARLY_LEAVE);
    dispatch({ type: 'SET_STATUS_FILTER', value: ABSENT_TABS.EARLY_LEAVE });
  };

  const handleOpenBasicPage = () => {
    navigate('/register-users');
  };

  const handleResetBasicView = () => {
    setAbsentTab(ABSENT_TABS.EARLY_LEAVE);
    dispatch({ type: 'SET_STATUS_FILTER', value: '' });
    navigate(location.pathname, {
      replace: true,
      state: {
        ...navState,
        startDate,
        endDate,
        employeeLocations,
        statusFilter: '',
      },
    });
  };

  const hasActiveTileFilter = !!statusFilter;

  const absentTabs = absentFlowActive ? (
    <div className="inline-flex items-center gap-[3px] rounded-[10px] border border-[var(--bd)] bg-[var(--bg2)] p-[3px]">
      <button
        type="button"
        onClick={() => {
          setAbsentTab(ABSENT_TABS.EARLY_LEAVE);
          dispatch({ type: 'SET_STATUS_FILTER', value: ABSENT_TABS.EARLY_LEAVE });
        }}
        className={`h-9 rounded-[8px] px-3 text-xs font-semibold transition-colors ${
          absentTab === ABSENT_TABS.EARLY_LEAVE
            ? 'bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white shadow-sm'
            : 'text-[var(--tx2)] hover:text-[var(--tx)]'
        }`}
      >
        Early Leave
      </button>
      <button
        type="button"
        onClick={() => {
          setAbsentTab(ABSENT_TABS.NOT_CHECKED_IN);
          dispatch({ type: 'SET_STATUS_FILTER', value: ABSENT_TABS.NOT_CHECKED_IN });
        }}
        className={`h-9 rounded-[8px] px-3 text-xs font-semibold transition-colors ${
          absentTab === ABSENT_TABS.NOT_CHECKED_IN
            ? 'bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white shadow-sm'
            : 'text-[var(--tx2)] hover:text-[var(--tx)]'
        }`}
      >
        Not Checked In
      </button>
    </div>
  ) : null;

  // KPI tiles — server-graded status totals for the WHOLE filtered range, not
  // the loaded page. Counting the page meant 150 employees at 10 rows per page
  // reported totals out of 10, and the tiles changed as you paged. Same
  // grading as the Status column; thresholds from Settings > Attendance Rules.
  const stats = useMemo(
    () => [
      // Roster size — deliberately first, as the denominator the other four
      // are read against. It is not range-scoped like they are, so it isn't
      // filterable by status.
      {
        label: 'Total Active Employees',
        value: totalEmployees || 0,
        color: 'var(--tx)',
        active: !statusFilter,
        onClick: handleOpenBasicPage,
      },
      // Anyone who has checked in at all today, regardless of duration or
      // whether they've since checked out. `checkin` is a duration-agnostic
      // pseudo-status the backend matches on firstCheckIn presence, not one
      // of the four real ATTENDANCE_STATUS values.
      {
        label: 'Check In',
        value: statusCounts?.checkinLogs || 0,
        color: 'var(--ok)',
        active: statusFilter === 'checkin',
        onClick: () => toggleStatusFilter('checkin'),
      },
      {
        label: 'Half Day',
        value: statusCounts?.halfDay || 0,
        color: 'var(--warn)',
        active: statusFilter === 'half_day',
        onClick: () => toggleStatusFilter('half_day'),
      },
      // Roster-based: total employees minus anyone who has checked in today.
      // Starts at the full roster and only drops as check-ins land. Clicking
      // through still filters the table to status=absent, but that can only
      // ever show employees who already have a log row (checked in/out under
      // the half-day threshold) — most of this count has no log row to show,
      // since they never checked in at all.
      {
        label: 'Absent',
        value: statusCounts?.absent || 0,
        color: 'var(--crit)',
        active: absentFlowActive,
        onClick: toggleAbsentFlow,
      },
      {
        label: 'Checkout',
        value: statusCounts?.checkoutLogs || 0,
        color: 'var(--blue)',
        active: statusFilter === 'checkout',
        onClick: () => toggleStatusFilter('checkout'),
      },
    ],
    [absentFlowActive, handleOpenBasicPage, statusCounts, totalEmployees, statusFilter]
  );

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
      statusFilter: effectiveStatusFilter,
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
        secondaryToolbar={absentTabs}
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
        {hasActiveTileFilter && (
          <button
            type="button"
            onClick={handleResetBasicView}
            className="h-10 rounded-[10px] border border-[var(--bd)] bg-[var(--bg2)] px-3 text-xs font-semibold text-[var(--tx2)] transition-colors hover:border-[var(--violet)] hover:text-[var(--tx)] cursor-pointer"
          >
            Clear Tile Filter
          </button>
        )}

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
