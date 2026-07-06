import React, {
  useEffect,
  useCallback,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDownUp,
  Play,
  Clock,
  Filter,
  ArrowUp,
  ArrowDown,
  Hourglass,
  Calendar,
  MapPin,
  LogIn,
  LogOut,
  Video,
} from 'lucide-react';
import ReusableTablePage from './ReusableTablePage';
import LogEmployeeProfileDialog from './LogEmployeeProfileDialog';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';
import {  getAttendanceLogs } from './Api/get';
import { getCamerasBasedOnNvr, getNvrNames } from '../Dashboard/Api/get';
import ActionCameraPreview from './ActionCameraPreview';
import moment from 'moment-timezone';
import { usePermissions } from '@/context/Permission/PermissionContext';
import AccessDenied from '@/components/AccessDenied';
import MultiSelect from '@/components/ui/multiselect';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import LogsFilterPopover from './components/LogsFilterPopover';
import BreakLogsDialog from './components/BreakLogsDialog';
import { filterByDepartment, getchannels, getNVRs, getEmployeeLocations } from './Api/post';
import { Switch } from '@/components/ui/switch';
import AutoRefreshComponent from './components/AutoRefreshComponent';
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from 'sonner';
import { resolveUploadUrl } from '@/utils/resolveUploadUrl';


const styles = {
  text: 'text-[#333333] text-[10px] sm:text-xs font-normal',
};

const initialState = {
  // profile / preview
  selectedLog: null,
  showPreview: false,
  selectedProfile: null,
  showProfileDialog: false,

  // break logs
  selectedBreakLog: null,
  showBreakLogs: false,

  // sorting
  sortOrder: '',
  sortField: '',

  // region & date
  region: moment.tz.guess(),
  startDate: '',
  endDate: '',
  minDate: null,
  maxDateDefault: moment().endOf('day').toDate(),

  // search
  searchInput: '',
  searchTerm: '',

  // logs
  attendanceLogs: [],
  attendanceLogsCount: 0,
  loading: false,

  // departments
  departments: [],
  selectedDepartments: [],

  // NVR / Camera
  nvrIds: '',
  nvrList: [],
  cameraList: [],
  cameraId: '',
  nvrValue: '',
  cameraValue: '',
  nvrVasetNvrValuelue: '',

  // pagination
  currentPage: 1,
  limit: 10,

  // time range
  fromTime: '',
  toTime: '',
  timeType: '',

  // location (stores locationName strings to match backend's employeeLocations array)
  employeeLocations: [],
  locationList: [],

  // date range (extra)
  dateRange: { start: null, end: null },

  // constants
  BASE_URL: import.meta.env.VITE_BACKEND + '/api/v1/uploads',
  USER_AVTAR_INITIALS: import.meta.env.VITE_INITIALS_URL,
  todayISO: moment().format('YYYY-MM-DD'),
};

function reducer(state, action) {
  switch (action.type) {
    // profile
    case 'SET_SELECTED_LOG':
      return { ...state, selectedLog: action.value };
    case 'SET_SHOW_PREVIEW':
      return { ...state, showPreview: action.value };

    case 'SET_SELECTED_PROFILE':
      return { ...state, selectedProfile: action.value };
    case 'SET_SHOW_PROFILE_DIALOG':
      return { ...state, showProfileDialog: action.value };

    // break logs
    case 'SET_SELECTED_BREAK_LOG':
      return { ...state, selectedBreakLog: action.value };
    case 'SET_SHOW_BREAK_LOGS':
      return { ...state, showBreakLogs: action.value };

    // sorting
    case 'SET_SORT_FIELD':
      return { ...state, sortField: action.value };
    case 'SET_SORT_ORDER':
      return { ...state, sortOrder: action.value };

    // search
    case 'SET_SEARCH_INPUT':
      return { ...state, searchInput: action.value };
    case 'SET_SEARCH_TERM':
      return { ...state, searchTerm: action.value };

    // region/dates
    case 'SET_START_DATE':
      return { ...state, startDate: action.value };
    case 'SET_END_DATE':
      return { ...state, endDate: action.value };
    case 'SET_MIN_DATE':
      return { ...state, minDate: action.value };
    case 'SET_DATE_RANGE':
      return { ...state, dateRange: action.value };

    // logs
    case 'SET_ATTENDANCE_LOGS':
      return { ...state, attendanceLogs: action.value };
    case 'SET_ATTENDANCE_COUNT':
      return { ...state, attendanceLogsCount: action.value };
    case 'SET_LOADING':
      return { ...state, loading: action.value };

    // departments
    case 'SET_DEPARTMENTS':
      return { ...state, departments: action.value };
    case 'SET_SELECTED_DEPARTMENTS':
      return { ...state, selectedDepartments: action.value };

    // nvr/camera
    case 'SET_NVR_ID':
      return { ...state, nvrIds: action.value };
    case 'SET_NVR_LIST':
      return { ...state, nvrList: action.value };

    case 'SET_CAMERA_LIST':
      return { ...state, cameraList: action.value };
    case 'SET_CAMERA_ID':
      return { ...state, cameraId: action.value };

    case 'SET_NVR_VALUE':
      return { ...state, nvrValue: action.value };
    case 'SET_CAMERA_VALUE':
      return { ...state, cameraValue: action.value };
    case 'SET_NVRVASETNRVALUE':
      return { ...state, nvrVasetNvrValuelue: action.value };

    // pagination
    case 'SET_CURRENT_PAGE':
      return { ...state, currentPage: action.value };
    case 'SET_LIMIT':
      return { ...state, limit: action.value, currentPage: 1 };

    // time range
    case 'SET_FROM_TIME':
      return { ...state, fromTime: action.value };
    case 'SET_TO_TIME':
      return { ...state, toTime: action.value };
    case 'SET_TIME_TYPE':
      return { ...state, timeType: action.value };

    // location
    case 'SET_EMPLOYEE_LOCATIONS':
      return { ...state, employeeLocations: action.value };
    case 'SET_LOCATION_LIST':
      return { ...state, locationList: action.value };

    default:
      return state;
  }
}

const Logs = () => {
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    startDate: initialState.todayISO,
    endDate: initialState.todayISO,
  });

  const ATTENDANCE_REFRESH_KEY = 'attendance_auto_refresh_enabled';
  const ATTENDANCE_INTERVAL_KEY = 'attendance_auto_refresh_interval';
  const ATTENDANCE_VIEW_MODE_KEY = 'attendance_view_mode';

  const [autoRefresh, setAutoRefresh] = useState(() => {
    const saved = localStorage.getItem(ATTENDANCE_REFRESH_KEY);
    return saved !== null ? saved === 'true' : true;
  });
  const [refreshInterval, setRefreshInterval] = useState(() => {
    const saved = localStorage.getItem(ATTENDANCE_INTERVAL_KEY);
     const parsed = parseInt(saved, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 30;
  });
  const [manualTrigger, setManualTrigger] = useState(0);
  const [viewMode, setViewMode] = useState(() => {
    const saved = localStorage.getItem(ATTENDANCE_VIEW_MODE_KEY);
    return saved === 'grid' ? 'grid' : 'table';
  });

  useEffect(() => {
    localStorage.setItem(ATTENDANCE_REFRESH_KEY, autoRefresh);
  }, [autoRefresh]);

  useEffect(() => {
    localStorage.setItem(ATTENDANCE_INTERVAL_KEY, refreshInterval);
  }, [refreshInterval]);

  useEffect(() => {
    localStorage.setItem(ATTENDANCE_VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

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
    minDate,
    maxDateDefault,
    searchInput,
    searchTerm,
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
  // console.log("permissions", permissions);
  // Logs permissions may be flat ({view,...}) or nested per sub-section
  // (attendanceLogs, accessLogs, global, ...). Resolve in order:
  // section-specific → global → legacy flat.
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

  // Land the user on a sub-route whose tab actually appears in the sidebar.
  // The sidebar only shows tabs with specific sub-permission (e.g.
  // attendanceLogs.view), so if the user lacks the specific permission for
  // this page we redirect to one they do have specifically — even if
  // canView is true via logs.global.view fallback. Otherwise the URL and
  // active sidebar tab disagree and no tab looks selected on landing.
  useEffect(() => {
    if (permissionsLoading) return;
    const logs = permissions?.logs;
    if (!logs) return;
    if (logs.attendanceLogs?.view === true) return;
    const candidates = [
      ['accessLogs', '/logs/access'],
      ['ANPRLogs', '/logs/ANPR'],
    ];
    for (const [key, route] of candidates) {
      if (logs[key]?.view === true) {
        navigate(route, { replace: true });
        return;
      }
    }
  }, [permissionsLoading, permissions, navigate]);
  const convertToRegionTime = (utcTime, region) => {
    if (!utcTime) return '--';
    return moment.utc(utcTime).tz(region).format('hh:mm:ss A');
  };


  // const convertToUTC = (date, time, region) => {
  //   if (!date || !time) return null;
  //   const localDateTime = moment.tz(`${date} ${time}`, "YYYY-MM-DD HH:mm", region);
  //   return localDateTime.utc().format("HH:mm");
  // };

  const convertToUTC = (date, time, region) => {
    if (!date || !time) return null;

    const hasAmPm = /am|pm/i.test(time);

    const format = hasAmPm
      ? 'YYYY-MM-DD hh:mm A' // 12-hour format
      : 'YYYY-MM-DD HH:mm'; // 24-hour format

    return moment.tz(`${date} ${time}`, format, region).utc().format('HH:mm');
  };

  // Fetch NVR names
  // useEffect(() => {
  //   const fetchNvrNames = async () => {
  //     try {
  //       const response = await getNvrNames();
  //       if (response.statusCode === 200) {
  //         dispatch({
  //           type: "SET_NVR_LIST",
  //           value: response.body.data.nvrs,
  //         });
  //       } else {
  //         console.log('No NVRs found');
  //       }
  //     } catch (error) {
  //       console.error('Error fetching NVR names:', error);
  //     }
  //   };

  //   fetchNvrNames();
  // }, []);
  useEffect(() => {
    const fetchNvrs = async () => {
      try {
        const response = await getNVRs();
        const nvrs = response?.data?.body?.data || [];

        dispatch({ type: 'SET_NVR_LIST', value: nvrs });
      } catch (error) {
        console.log('Error fetching NVRs:', error);
      }
    };

    fetchNvrs();
  }, []);

  // useEffect(() => {
  //   const fetchCameras = async () => {
  //     if (!nvrId) return;
  //     try {
  //       const response = await getCamerasBasedOnNvr(nvrId);
  //       if (response.statusCode === 200) {
  //         dispatch({
  //           type: "SET_CAMERA_LIST",
  //           value: response?.body?.data?.channels || [],
  //         });
  //       } else {
  //         console.log('No cameras found');
  //       }
  //     } catch (error) {
  //       console.error('Error fetching cameras:', error);
  //     }
  //   };

  //   fetchCameras();
  // }, [nvrId]);

  useEffect(() => {
    const fetchChannels = async () => {
      try {
        const payload = { nvrIds };
        const response = await getchannels(payload);

        const channels = response?.data?.body?.data || [];
        dispatch({ type: 'SET_CAMERA_LIST', value: channels });
      } catch (error) {
        console.log('Error fetching channels:', error);
      }
    };

    fetchChannels();
  }, [nvrIds]);

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const payload = { limit: 50 };
        const res = await filterByDepartment(payload);

        const deptList =
          res?.data?.body?.data?.data?.map((d) => ({
            label: d.departmentName,
            id: d._id,
          })) || [];

        dispatch({ type: 'SET_DEPARTMENTS', value: deptList });
      } catch (err) {
        console.log('Failed to load departments', err);
      }
    };

    fetchDepartments();
  }, []);

  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const res = await getEmployeeLocations({ skip: 0, limit: 100 });
        const list = res?.data?.body?.data?.locations || [];
        dispatch({ type: 'SET_LOCATION_LIST', value: list });
      } catch (err) {
        console.log('Failed to load locations', err);
      }
    };
    fetchLocations();
  }, []);

  // Use locationName as the option id so MultiSelect stores name strings
  // (matches the backend `employeeLocations` body contract).
  const locationOptions = useMemo(
    () =>
      (locationList || []).map((loc) => ({
        label: loc.locationName,
        id: loc.locationName,
      })),
    [locationList]
  );

  useEffect(() => {
    dispatch({ type: 'SET_CURRENT_PAGE', value: 1 });
  }, [selectedDepartments, nvrIds, cameraId, fromTime, toTime, timeType, employeeLocations, limit]);




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
        const logs = response?.data?.body?.data?.attendanceLogs || [];
        dispatch({ type: 'SET_ATTENDANCE_LOGS', value: logs });
        dispatch({
          type: 'SET_ATTENDANCE_COUNT',
          value: response?.data?.body?.data?.total || 0,
        });
        const minDateValue =
          response?.data?.body?.data?.attendanceLogsStartDate;
        dispatch({
          type: 'SET_MIN_DATE',
          value: minDateValue ? new Date(minDateValue) : null,
        });
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

  // Effect 1: Manual/Filter trigger
  useEffect(() => {
    fetchAttendanceLogs();
  }, [fetchAttendanceLogs, manualTrigger]);

  // Effect 2: Auto Refresh timer
  useEffect(() => {
    let intervalId;
    if (autoRefresh  && refreshInterval > 0) {
      intervalId = setInterval(fetchAttendanceLogs, refreshInterval * 1000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [autoRefresh, refreshInterval, fetchAttendanceLogs]);

  const mappedLogs =
    attendanceLogs.length > 0
      ? attendanceLogs.map((item) => ({
          id: item.employee?._id || item.id,
          image: item.employee?.profilePics?.[0]
            ? resolveUploadUrl(item.employee.profilePics[0])
            : USER_AVTAR_INITIALS +
              (item.employee ? item.employee.firstName.charAt(0) : 'U') +
              (item.employee ? item.employee.lastName.charAt(0) : 'P'),
          name: item.employee
            ? `${item.employee.firstName} ${item.employee.lastName}`
            : '',
          department: item.employee?.departmentId?.departmentName || 'Unknown',
          date: item.date,
          location: item.employee?.location || '--',
          login: item.logInTime,
          logout: item.logOutTime || '--',
          imageUrls: Array.isArray(item?.imageUrls)
            ? item.imageUrls.map((img) => ({
                url:
                  img?.images?.frame ||
                  img?.images?.person ||
                  img?.images?.face,
                timestamp: img?.timestamp,
                cameraType: img?.cameraType,
              }))
            : [],
          email: item.employee?.email || '',
          checkinCam: item.checkinCam || '-',
          checkoutCam: item.checkoutCam || '-',
        }))
      : [];

const getSingleImageUrl = (item) => {
  const img =
    item?.imageUrls?.[0]?.images?.person ||
    item?.imageUrls?.[0]?.images?.face ||
    item?.imageUrls?.[0]?.images?.frame;

  return img
    ? `${import.meta.env.VITE_BACKEND}/api/v1/uploads/${img}`
    : "";
};



const fetchAllForExport = async () => {
  const departmentIds = selectedDepartments.join(",");
  const utcFromTime = convertToUTC(startDate, fromTime, region);
  const utcToTime = convertToUTC(startDate, toTime, region);

  const nvrIdStr = Array.isArray(nvrIds) ? nvrIds.join(",") : "";
  const cameraIdStr = Array.isArray(cameraId) ? cameraId.join(",") : "";

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
        true,
        employeeLocations
  );

  return response?.data?.body?.data?.attendanceLogs || [];
};

const exportToPDF = async () => {
  const allLogs = await fetchAllForExport();

  if (!allLogs.length) {
    toast.error("No data to export");
    
    return;
  }

  const baseData = allLogs.map((item, index) => ({
    ID: index + 1,
    Name: item.employee
      ? `${item.employee.firstName} ${item.employee.lastName}`
      : "--",
    Department: item.employee?.departmentId?.departmentName || "--",
    Date:  moment(item.logInTime).isValid()
              ? moment(item.logInTime).format('DD/MM/YYYY')
              : moment(item.logOutTime).isValid()
                ? moment(item.logOutTime).format('DD/MM/YYYY')
                : '-',
    Location: item.employee?.location || "--",
    CheckIn: convertToRegionTime(item.logInTime, region),
    CheckOut:
      item.logOutTime === "--"
        ? "--"
        : convertToRegionTime(item.logOutTime, region),
    CheckinCamera: item.checkinCam ? item.checkinCam : '--',
    CheckoutCamera: item.checkoutCam ? item.checkoutCam : '--',
     ImageUrl: getSingleImageUrl(item),
  }));

  const doc = new jsPDF("landscape");


 
  doc.setFont("helvetica");
  doc.setFontSize(12);
  doc.text("Attendance Logs Report", 14, 12);
  
  doc.text(
  `Generated on: ${moment().format("DD/MM/YYYY HH:mm")}`,
  14,
  18
);


  
  const headers = [
    "ID",
    "Name",
    "Department",
    "Date",
    "Location",
    "Check in",
    "Check out",
    "Checkin Camera",
    "Checkout Camera",
    "View Image",
  ];

  const rows = baseData.map((row) => [
    row.ID,
    row.Name,
    row.Department,
    row.Date,
    row.Location,
    row.CheckIn,
    row.CheckOut,
    row.CheckinCamera,
    row.CheckoutCamera,
    // "View Image",
  ]);

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 26,
    styles: { fontSize: 7 },
    columnStyles: { 9: { cellWidth: 40 } },

    didDrawCell: function (data) {
      if (data.column.index === 9 && data.section === "body") {
        const imageUrl = baseData[data.row.index].ImageUrl;

        // Make link clickable
        doc.link(
          data.cell.x,
          data.cell.y,
          data.cell.width,
          data.cell.height,
          { url: imageUrl }
        );

       

          doc.setFont("helvetica", "normal");

    // Set blue color
    doc.setTextColor(0, 0, 255);

    // Rewrite text cleanly
    const text = "View Image";
    const textX = data.cell.x + 4;
    const textY = data.cell.y + data.cell.height / 2 + 2;

    doc.text(text, textX, textY);

    // Underline
    const textWidth = doc.getTextWidth(text);
    doc.setLineWidth(0.3);
    doc.line(textX, textY + 1, textX + textWidth, textY + 1);

      }
    },
  });

  doc.save(`attendance_logs_report.pdf`);
};


const exportToExcel = async () => {
  const allLogs = await fetchAllForExport();

  if (!allLogs.length) {
   toast.error("No data to export");
    return;
  }

  const data = allLogs.map((item, index) => ({
    ID: index + 1,
    Name: item.employee
      ? `${item.employee.firstName} ${item.employee.lastName}`
      : "--",
    Department: item.employee?.departmentId?.departmentName || "Unknown",
    Date: moment(item.logInTime).isValid()
              ? moment(item.logInTime).format('DD/MM/YYYY')
              : moment(item.logOutTime).isValid()
                ? moment(item.logOutTime).format('DD/MM/YYYY')
                : '-',
    Location: item.employee?.location || "--",
    "Check in": convertToRegionTime(item.logInTime, region),
    "Check out":
      item.logOutTime === "--"
        ? "--"
        : convertToRegionTime(item.logOutTime, region),
   "Checkin Camera": item.checkinCam ? item.checkinCam : "--",
  "Checkout Camera": item.checkoutCam ? item.checkoutCam : "--",
    "View Image":  "" ,

  }));

  const worksheet = XLSX.utils.json_to_sheet(data);

  // Force hyperlink formula in column J
  allLogs.forEach((item, index) => {
    const url = getSingleImageUrl(item);
    const cellRef = XLSX.utils.encode_cell({ r: index + 1, c: 9 });

    worksheet[cellRef] = {
      t: "f",
      f: `HYPERLINK("${url}", "View Image")`
    };
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance Logs");

  XLSX.writeFile(
    workbook,
    `attendance_logs_report.xlsx`
  );
};

const handleExport = async (format) => {
    
    if (format === "excel") await exportToExcel();
    if (format === "pdf") await exportToPDF();
 
};




  const totalPages = Math.max(1, Math.ceil(attendanceLogsCount / limit));

  const formatDateToYMD = (date) => {
    if (!date) return null;
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Columns (useMemo)
  const columns = useMemo(
    () => [
      {
        accessorKey: 'Profile',
        header: 'Profile',
        cell: ({ row }) => (
          <button
            onClick={() => {
              dispatch({ type: 'SET_SELECTED_PROFILE', value: row.original });
              dispatch({ type: 'SET_SHOW_PROFILE_DIALOG', value: true });
            }}
            className="w-10 h-10 rounded-full overflow-hidden bg-white border border-[#E6E6E6] p-[1px] flex items-center justify-center cursor-pointer"
            aria-label={`Open profile ${row.original.name}`}
          >
            <img
              src={row.original.image}
              alt={row.original.name}
              className="w-10 h-10 object-cover"
            />
          </button>
        ),
      },
      {
        accessorKey: 'name',
        header: () => (
          <button
            onClick={() => {
              dispatch({ type: 'SET_SORT_FIELD', value: 'fullname' });
              dispatch({
                type: 'SET_SORT_ORDER',
                value: sortOrder === 'asc' ? 'desc' : 'asc',
              });
            }}
            className="flex items-center gap-1 cursor-pointer ml-7"
          >
            Name
            {sortField === 'fullname' ? (
              sortOrder === 'asc' ? (
                <ArrowUp className="w-4 h-4" />
              ) : (
                <ArrowDown className="w-4 h-4" />
              )
            ) : (
              <ArrowDownUp className="w-4 h-4 text-gray-400" />
            )}
          </button>
        ),
        cell: ({ row }) => (
          <span className={styles.text}>{row.original.name}</span>
        ),
      },
      {
        accessorKey: 'department',
        header: () => (
          <button
            onClick={() => {
              dispatch({ type: 'SET_SORT_FIELD', value: 'department' });
              dispatch({
                type: 'SET_SORT_ORDER',
                value: sortOrder === 'asc' ? 'desc' : 'asc',
              });
            }}
            className="flex items-center gap-1 cursor-pointer"
          >
            Department
            {sortField === 'department' ? (
              sortOrder === 'asc' ? (
                <ArrowUp className="w-4 h-4" />
              ) : (
                <ArrowDown className="w-4 h-4" />
              )
            ) : (
              <ArrowDownUp className="w-4 h-4 text-gray-400" />
            )}
          </button>
        ),
        cell: ({ row }) => (
          <span className={styles.text}>{row.original.department}</span>
        ),
      },
      {
        accessorKey: 'date',
        header: () => (
          <button
            onClick={() => {
              dispatch({ type: 'SET_SORT_FIELD', value: 'date' });
              dispatch({
                type: 'SET_SORT_ORDER',
                value: sortOrder === 'asc' ? 'desc' : 'asc',
              });
            }}
            className="flex items-center gap-1 cursor-pointer"
          >
            Date
            {sortField === 'date' ? (
              sortOrder === 'asc' ? (
                <ArrowUp className="w-4 h-4" />
              ) : (
                <ArrowDown className="w-4 h-4" />
              )
            ) : (
              <ArrowDownUp className="w-4 h-4 text-gray-400" />
            )}
          </button>
        ),
        cell: ({ row }) => (
          <span className={styles.text}>
            {moment(row.original.login).isValid()
              ? moment(row.original.login).format('DD/MM/YYYY')
              : moment(row.original.logout).isValid()
                ? moment(row.original.logout).format('DD/MM/YYYY')
                : '-'}
          </span>
        ),
      },
      {
        accessorKey: 'location',
        header: () => (
          <button
            onClick={() => {
              dispatch({ type: 'SET_SORT_FIELD', value: 'location' });
              dispatch({
                type: 'SET_SORT_ORDER',
                value: sortOrder === 'asc' ? 'desc' : 'asc',
              });
            }}
            className="flex items-center gap-1 cursor-pointer"
          >
            Location
            {sortField === 'location' ? (
              sortOrder === 'asc' ? (
                <ArrowUp className="w-4 h-4" />
              ) : (
                <ArrowDown className="w-4 h-4" />
              )
            ) : (
              <ArrowDownUp className="w-4 h-4 text-gray-400" />
            )}
          </button>
        ),
        cell: ({ row }) => (
          <span className={styles.text}>{row.original.location}</span>
        ),
      },
      {
        accessorKey: 'Check in',
        header: () => (
          <button
            onClick={() => {
              dispatch({ type: 'SET_SORT_FIELD', value: 'checkin' });
              dispatch({
                type: 'SET_SORT_ORDER',
                value: sortOrder === 'asc' ? 'desc' : 'asc',
              });
            }}
            className="flex items-center gap-1 cursor-pointer"
          >
            Check in
            {sortField === 'checkin' ? (
              sortOrder === 'asc' ? (
                <ArrowUp className="w-4 h-4" />
              ) : (
                <ArrowDown className="w-4 h-4" />
              )
            ) : (
              <ArrowDownUp className="w-4 h-4 text-gray-400" />
            )}
          </button>
        ),
        cell: ({ row }) => (
          <span className={styles.text + ' ml-3'}>
            {convertToRegionTime(row.original.login, region)}
          </span>
        ),
      },
      {
        accessorKey: 'Check out',
        header: () => (
          <button
            onClick={() => {
              dispatch({ type: 'SET_SORT_FIELD', value: 'checkout' });
              dispatch({
                type: 'SET_SORT_ORDER',
                value: sortOrder === 'asc' ? 'desc' : 'asc',
              });
            }}
            className="flex items-center gap-1 cursor-pointer"
          >
            Check out
            {sortField === 'checkout' ? (
              sortOrder === 'asc' ? (
                <ArrowUp className="w-4 h-4" />
              ) : (
                <ArrowDown className="w-4 h-4" />
              )
            ) : (
              <ArrowDownUp className="w-4 h-4 text-gray-400" />
            )}
          </button>
        ),
        cell: ({ row }) => (
          <span className={styles.text + ' ml-5'}>
            {row.original.logout === '--' ? (
              <span className="ml-4"> -- </span>
            ) : (
              convertToRegionTime(row.original.logout, region)
            )}
          </span>
        ),
      },
      {
        accessorKey: 'Camera',
        header: 'Camera',
        cell: ({ row }) => (
          <div className="flex flex-col gap-2">
            <span className={styles.text}>
              checkin: {row.original.checkinCam}
            </span>
            <span className={styles.text}>
              checkout: {row.original.checkoutCam}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'actions',
        header: 'Action',
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                dispatch({ type: 'SET_SELECTED_LOG', value: row.original });
                dispatch({ type: 'SET_SHOW_PREVIEW', value: true });
              }}
              className="p-2 rounded-full bg-transparent cursor-pointer"
              aria-label={`Play ${row.original.name}`}
            >
              <Play className="w-5 h-5 text-[#07486A]" />
            </button>
            <button
              onClick={() => {
                dispatch({ type: 'SET_SELECTED_BREAK_LOG', value: row.original });
                dispatch({ type: 'SET_SHOW_BREAK_LOGS', value: true });
              }}
              className="p-2 rounded-full bg-transparent cursor-pointer"
              aria-label={`View break logs for ${row.original.name}`}
              title="Break logs"
            >
              <Hourglass className="w-5 h-5 text-[#07486A]" />
            </button>
          </div>
        ),
      },
    ],
    [sortField, sortOrder, region]
  );

  const renderAttendanceCard = (item) => {
    const dateStr = moment(item.login).isValid()
      ? moment(item.login).format('DD/MM/YYYY')
      : moment(item.logout).isValid()
        ? moment(item.logout).format('DD/MM/YYYY')
        : '--';
    const checkInStr = convertToRegionTime(item.login, region);
    const checkOutStr =
      item.logout === '--' ? '--' : convertToRegionTime(item.logout, region);

    return (
      <div
        onClick={() => {
          dispatch({ type: 'SET_SELECTED_PROFILE', value: item });
          dispatch({ type: 'SET_SHOW_PROFILE_DIALOG', value: true });
        }}
        className="bg-white rounded-2xl p-3 sm:p-4 md:p-5 lg:p-6 shadow-sm border border-gray-100 flex flex-col items-center relative group hover:shadow-md transition-shadow cursor-pointer h-full w-full min-w-0"
      >
        {/* Department badge top-left */}
        <div className="absolute top-2 left-2 md:top-3 md:left-3 z-20 max-w-[55%]">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-semibold bg-[#E3F5FF] text-[#07486A] border border-[#CFEFFF] shadow-sm truncate max-w-full">
            {item.department}
          </span>
        </div>

        {/* Action buttons top-right */}
        <div className="absolute top-2 right-2 flex flex-row flex-nowrap items-center gap-0.5 sm:gap-1 z-30">
          <button
            onClick={(e) => {
              e.stopPropagation();
              dispatch({ type: 'SET_SELECTED_LOG', value: item });
              dispatch({ type: 'SET_SHOW_PREVIEW', value: true });
            }}
            className="text-[#07486A] hover:bg-blue-50 p-1 md:p-1.5 rounded-full transition-colors cursor-pointer"
            aria-label={`Play ${item.name}`}
            title="Play preview"
          >
            <Play className="w-4 h-4 md:w-5 md:h-5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              dispatch({ type: 'SET_SELECTED_BREAK_LOG', value: item });
              dispatch({ type: 'SET_SHOW_BREAK_LOGS', value: true });
            }}
            className="text-[#07486A] hover:bg-blue-50 p-1 md:p-1.5 rounded-full transition-colors cursor-pointer"
            aria-label={`View break logs for ${item.name}`}
            title="Break logs"
          >
            <Hourglass className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        </div>

        {/* Avatar */}
        <div className="relative mb-3 md:mb-5 mt-6 sm:mt-4 flex items-center justify-center w-full">
          <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 lg:w-32 lg:h-32 rounded-full overflow-hidden shadow-sm shrink-0 ring-4 ring-gray-50 group-hover:ring-[#CFEFFF] transition-all">
            <img
              src={item.image}
              alt={item.name}
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* Name */}
        <div className="w-full text-center mb-2 md:mb-3 px-2">
          <div className="text-[#07486A] text-sm md:text-base font-semibold truncate">
            {item.name}
          </div>
        </div>

        {/* Divider */}
        <div className="w-full h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent mb-3 md:mb-5"></div>

        {/* Info */}
        <div className="w-full space-y-2.5 md:space-y-3.5">
          <div className="flex items-center gap-2 md:gap-3 text-xs md:text-sm min-w-0">
            <Calendar className="w-4 h-4 md:w-5 md:h-5 text-gray-700 shrink-0" />
            <span className="font-semibold text-gray-900 w-16 md:w-24 shrink-0 text-[10px] md:text-[11px] uppercase tracking-wider">
              Date
            </span>
            <span className="text-gray-600 truncate flex-1 text-right min-w-0">
              {dateStr}
            </span>
          </div>
          <div className="flex items-center gap-2 md:gap-3 text-xs md:text-sm min-w-0">
            <MapPin className="w-4 h-4 md:w-5 md:h-5 text-gray-700 shrink-0" />
            <span className="font-semibold text-gray-900 w-16 md:w-24 shrink-0 text-[10px] md:text-[11px] uppercase tracking-wider">
              Location
            </span>
            <span
              className="text-gray-600 truncate flex-1 text-right min-w-0"
              title={item.location}
            >
              {item.location}
            </span>
          </div>
          <div className="flex items-center gap-2 md:gap-3 text-xs md:text-sm min-w-0">
            <LogIn className="w-4 h-4 md:w-5 md:h-5 text-gray-700 shrink-0" />
            <span className="font-semibold text-gray-900 w-16 md:w-24 shrink-0 text-[10px] md:text-[11px] uppercase tracking-wider">
              Check In
            </span>
            <span className="text-gray-600 truncate flex-1 text-right min-w-0">
              {checkInStr}
            </span>
          </div>
          <div className="flex items-center gap-2 md:gap-3 text-xs md:text-sm min-w-0">
            <LogOut className="w-4 h-4 md:w-5 md:h-5 text-gray-700 shrink-0" />
            <span className="font-semibold text-gray-900 w-16 md:w-24 shrink-0 text-[10px] md:text-[11px] uppercase tracking-wider">
              Check Out
            </span>
            <span className="text-gray-600 truncate flex-1 text-right min-w-0">
              {checkOutStr}
            </span>
          </div>
          <div className="flex items-center gap-2 md:gap-3 text-xs md:text-sm min-w-0">
            <Video className="w-4 h-4 md:w-5 md:h-5 text-gray-700 shrink-0" />
            <span className="font-semibold text-gray-900 w-16 md:w-24 shrink-0 text-[10px] md:text-[11px] uppercase tracking-wider">
              In Cam
            </span>
            <span
              className="text-gray-600 truncate flex-1 text-right min-w-0"
              title={item.checkinCam}
            >
              {item.checkinCam}
            </span>
          </div>
          <div className="flex items-center gap-2 md:gap-3 text-xs md:text-sm min-w-0">
            <Video className="w-4 h-4 md:w-5 md:h-5 text-gray-700 shrink-0" />
            <span className="font-semibold text-gray-900 w-16 md:w-24 shrink-0 text-[10px] md:text-[11px] uppercase tracking-wider">
              Out Cam
            </span>
            <span
              className="text-gray-600 truncate flex-1 text-right min-w-0"
              title={item.checkoutCam}
            >
              {item.checkoutCam}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // Wait for permissions to finish loading before deciding access. Without
  // this, users briefly see AccessDenied while IsAuth is still resolving the
  // redirect to a logs sub-route they actually have permission for.
  if (permissionsLoading) return null;
  if (!canView) {
    return <AccessDenied message="You don't have permission to view Logs." />;
  }

  return (
    <>
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

      {/* TABLE */}
      <ReusableTablePage
        loading={state.loading}
        title="Attendance Logs"
        attendanceLogsCount={attendanceLogsCount}
        currentPage={currentPage}
        setCurrentPage={(p) => dispatch({ type: 'SET_CURRENT_PAGE', value: p })}
        onPageChange={(p) => dispatch({ type: 'SET_CURRENT_PAGE', value: p })}
        data={mappedLogs}
        columns={columns}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        gridCard={renderAttendanceCard}
        searchQuery={searchInput}
        onSearchChange={(v) => dispatch({ type: 'SET_SEARCH_INPUT', value: v })}
        searchKeys={['name', 'department']}
        limit={limit}
        onLimitChange={(v) => dispatch({ type: 'SET_LIMIT', value: v })}
        startDate={startDate}
        endDate={endDate}
        // minDate={minDate}
        maxDate={maxDateDefault}
        onDateRangeChange={({ start, end }) => {
          const toIso = (d) =>
            d instanceof Date ? d.toISOString().split('T')[0] : d;

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
       <div className="flex gap-2">
  <div className="flex gap-2">
 {canEdit && (
  <>
    <Button
      className="bg-[#07486A] text-white rounded-[8px] px-3 py-2 text-sm cursor-pointer"
      onClick={() => handleExport("excel")}
    >
   Export Excel
    </Button>

    <Button
      className="bg-[#07486A] text-white rounded-[8px] px-3 py-2 text-sm cursor-pointer"
      onClick={() => handleExport("pdf")}
    >
      Export PDF
    </Button>
  </>
)}

</div>

</div>

        {/* FILTERS POPOVER */}
        <LogsFilterPopover
          nvrIds={Array.isArray(nvrIds) ? nvrIds : []}
          setNvrId={(v) =>
            dispatch({ type: 'SET_NVR_ID', value: Array.isArray(v) ? v : [] })
          }
          nvrList={nvrList}
          cameraId={Array.isArray(cameraId) ? cameraId : []}
          setCameraId={(v) =>
            dispatch({
              type: 'SET_CAMERA_ID',
              value: Array.isArray(v) ? v : [],
            })
          }
          cameraList={cameraList}
          departments={departments}
          selectedDepartments={selectedDepartments}
          setSelectedDepartments={(v) =>
            dispatch({
              type: 'SET_SELECTED_DEPARTMENTS',
              value: v,
            })
          }
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
            dispatch({
              type: 'SET_EMPLOYEE_LOCATIONS',
              value: Array.isArray(v) ? v : [],
            })
          }
          locationOptions={locationOptions}
        />
        <AutoRefreshComponent
          isActive={autoRefresh}
          onActiveChange={setAutoRefresh}
          refreshInterval={refreshInterval}
          onIntervalChange={setRefreshInterval}
          onManualRefresh={() => {
            // Manual refresh logic
            // Since we need to trigger the useEffect, we can use a dummy state if we don't want to refactor
            setManualTrigger((prev) => prev + 1);
          }}
        />
      </ReusableTablePage>

      {/* PROFILE POPUP */}
      <LogEmployeeProfileDialog
        open={showProfileDialog}
        onOpenChange={(open) => {
          dispatch({ type: 'SET_SHOW_PROFILE_DIALOG', value: open });
          if (!open) {
            dispatch({ type: 'SET_SELECTED_PROFILE', value: null });
          }
        }}
        profile={selectedProfile}
      />

      {/* BREAK LOGS MODAL */}
      <BreakLogsDialog
        open={showBreakLogs}
        onOpenChange={(open) => {
          dispatch({ type: 'SET_SHOW_BREAK_LOGS', value: open });
          if (!open) {
            dispatch({ type: 'SET_SELECTED_BREAK_LOG', value: null });
          }
        }}
        log={selectedBreakLog}
        region={region}
        selectedDate={startDate}
        canEdit={canEdit}
      />
    </>
  );
};

export default Logs;
