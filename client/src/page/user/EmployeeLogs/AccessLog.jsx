import React, {
  useEffect,
  useCallback,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import moment from 'moment';
import {
  ArrowDownUp,
  Play,
  ArrowUp,
  ArrowDown,
  Calendar,
  MapPin,
  Clock,
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
import {
  filterByDepartment,
  getAllAccessLogsDetails,
  getchannels,
  getEmployeeLocations,
  getNVRs,
} from './Api/post';
import ActionCameraPreview from './ActionCameraPreview';
import { usePermissions } from '@/context/Permission/PermissionContext';
import AccessDenied from '@/components/AccessDenied';
import unknownimg from '@/assets/unknownimg.jpg';
import MultiSelect from '@/components/ui/multiselect';
import LogsFilterPopover from './components/LogsFilterPopover';
import AutoRefreshComponent from './components/AutoRefreshComponent';
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

const styles = {
  text: 'text-[#333333] text-xs font-normal',
};

const initialState = {
  selectedLog: null,
  showProfile: false,
  showPreview: false,

  currentPage: 1,
  sortOrder: '',
  sortField: '',

  totalCount: 0,
  rows: [],
  loading: false,
  error: null,

  departments: [],
  selectedDepartments: [],

  searchInput: '',
  mindate: null,

  startDate: '',
  endDate: '',

  nvrIds: [],
  nvrList: [],
  cameraList: [],
  channelIds: [],

  nvrValue: '',
  cameraValue: '',
  removeUnknown: false,
  fromTime: '',
  toTime: '',

  // location (stores locationName strings to match backend's employeeLocations array)
  employeeLocations: [],
  locationList: [],
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_SELECTED_LOG':
      return { ...state, selectedLog: action.value };
    case 'SET_SHOW_PROFILE':
      return { ...state, showProfile: action.value };
    case 'SET_SHOW_PREVIEW':
      return { ...state, showPreview: action.value };

    case 'SET_CURRENT_PAGE':
      return { ...state, currentPage: action.value };
    case 'SET_SORT_ORDER':
      return { ...state, sortOrder: action.value };
    case 'SET_SORT_FIELD':
      return { ...state, sortField: action.value };

    case 'SET_ROWS':
      return { ...state, rows: action.value };
    case 'SET_TOTAL_COUNT':
      return { ...state, totalCount: action.value };
    case 'SET_LOADING':
      return { ...state, loading: action.value };
    case 'SET_ERROR':
      return { ...state, error: action.value };

    case 'SET_DEPARTMENTS':
      return { ...state, departments: action.value };
    case 'SET_SELECTED_DEPARTMENTS':
      return { ...state, selectedDepartments: action.value };

    case 'SET_SEARCH_INPUT':
      return { ...state, searchInput: action.value };
    case 'SET_MINDATE':
      return { ...state, mindate: action.value };

    case 'SET_START_DATE':
      return { ...state, startDate: action.value };
    case 'SET_END_DATE':
      return { ...state, endDate: action.value };

    case 'SET_NVR_IDS':
      return { ...state, nvrIds: action.value };
    case 'SET_NVR_LIST':
      return { ...state, nvrList: action.value };
    case 'SET_CAMERA_LIST':
      return { ...state, cameraList: action.value };
    case 'SET_CHANNEL_IDS':
      return { ...state, channelIds: action.value };

    case 'SET_NVR_VALUE':
      return { ...state, nvrValue: action.value };
    case 'SET_CAMERA_VALUE':
      return { ...state, cameraValue: action.value };

    case 'SET_REMOVE_UNKNOWN':
      return { ...state, removeUnknown: action.value };
    case 'SET_FROM_TIME':
      return { ...state, fromTime: action.value };
    case 'SET_TO_TIME':
      return { ...state, toTime: action.value };

    case 'SET_EMPLOYEE_LOCATIONS':
      return { ...state, employeeLocations: action.value };
    case 'SET_LOCATION_LIST':
      return { ...state, locationList: action.value };
    default:
      return state;
  }
}

const AccessLogs = () => {
  const nasUrl = import.meta.env.VITE_BACKEND || '';
  const region = moment.tz.guess();
  const [limit, setLimit] = useState(10);
  const todayISO = moment().format('YYYY-MM-DD');
  const maxDateDefault = moment().endOf('day').toDate();

  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    startDate: todayISO,
    endDate: todayISO,
  });

  const ACCESS_REFRESH_KEY = 'access_auto_refresh_enabled';
  const ACCESS_INTERVAL_KEY = 'access_auto_refresh_interval';
  const ACCESS_VIEW_MODE_KEY = 'access_view_mode';

  const [autoRefresh, setAutoRefresh] = useState(() => {
    const saved = localStorage.getItem(ACCESS_REFRESH_KEY);
    return saved !== null ? saved === 'true' : true;
  });
  const [refreshInterval, setRefreshInterval] = useState(() => {
    const saved = localStorage.getItem(ACCESS_INTERVAL_KEY);
    const parsed = parseInt(saved, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 30;
  });
  const [manualTrigger, setManualTrigger] = useState(0);
  const [viewMode, setViewMode] = useState(() => {
    const saved = localStorage.getItem(ACCESS_VIEW_MODE_KEY);
    return saved === 'grid' ? 'grid' : 'table';
  });

  useEffect(() => {
    localStorage.setItem(ACCESS_REFRESH_KEY, autoRefresh);
  }, [autoRefresh]);

  useEffect(() => {
    localStorage.setItem(ACCESS_INTERVAL_KEY, refreshInterval);
  }, [refreshInterval]);

  useEffect(() => {
    localStorage.setItem(ACCESS_VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

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
    mindate,
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
  // section-specific → global → legacy flat.
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
  // The sidebar only shows tabs with specific sub-permission (e.g.
  // accessLogs.view), so if the user lacks the specific permission for
  // this page we redirect to one they do have specifically — even if
  // canView is true via logs.global.view fallback. Otherwise the URL and
  // active sidebar tab disagree and no tab looks selected on landing.
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
  const convertToUTC = (date, time, region) => {
    if (!date || !time) return null;

    const hasAmPm = /am|pm/i.test(time);

    const format = hasAmPm
      ? 'YYYY-MM-DD hh:mm A' // 12-hour format
      : 'YYYY-MM-DD HH:mm'; // 24-hour format

    return moment.tz(`${date} ${time}`, format, region).utc().format('HH:mm');
  };

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
    dispatch({ type: 'SET_CURRENT_PAGE', value: 1 });
  }, [selectedDepartments, nvrIds, channelIds, removeUnknown, employeeLocations, limit]);
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
        isExport:false,
        ...(fromTime && toTime && { fromTime: utcFromTime, toTime: utcToTime }),
      };

      const res = await getAllAccessLogsDetails(payload);
      const data = res?.data?.body?.data;

      dispatch({
        type: 'SET_MINDATE',
        value: data?.accessLogsStartDate?.createdAt || null,
      });

      const userlogs = data?.usersLogs || [];
      const total = data?.total || 0;

      const mapped = userlogs.map((log) => {
        const sessions = log.sessions || [];
        const image =
          log.userInfo?.profilePics?.length > 0
            ? `${nasUrl}/api/v1/uploads${log.userInfo.profilePics[0]}`
            : unknownimg;
        const imageUrls = sessions.map((session) => {
          const images = session.images;
          return images?.frameImage || images?.personImage || images?.faceImage;
        });
        const timestamp = sessions.map((session) => session.timestamp);
        return {
          name: log.userInfo?.userName || 'Unknown',
          department: log.department?.departmentName || '--',
          date: log.date || '--',
          location: log.userInfo?.location || '--',
          cameraName: sessions[0]?.channel?.name || '--',
        enteredIn : sessions.length > 0 ? sessions[0].timestamp : null,
 exitTiming :
  sessions.length > 1 ? sessions[sessions.length - 1].timestamp : null,
          image,
          email: log.userInfo?.email || '--',
          emp_id: log.userInfo?.emp_id || '--',
          imageUrls,
          timestamp,
        };
      });

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
    unknownimg,
  ]);



  const getSingleImageUrl = (item) => {
   
  const img =
   item?.sessions?.[0]?.images?.frameImage ||
   item?.sessions?.[0]?.images?.personImage ||
   item?.sessions?.[0]?.images?.faceImage;

  return img
    ? `${import.meta.env.VITE_BACKEND}/api/v1/uploads/${img}`
    : "";

 
};
  const fetchAllForExport = async () => {
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
        isExport:true,
    ...(fromTime && toTime && { fromTime: utcFromTime, toTime: utcToTime }),
  };

  const res = await getAllAccessLogsDetails(payload);
  return res?.data?.body?.data?.usersLogs || [];
};
const formatAccessTime = (enteredIn, exitTiming, region) => {
  const inMoment = enteredIn ? moment.utc(enteredIn).tz(region) : null;
  const outMoment = exitTiming ? moment.utc(exitTiming).tz(region) : null;

  if (!inMoment) return "--";

  let diffText = "";
  if (inMoment && outMoment) {
    const diffMs = outMoment.diff(inMoment);
    const duration = moment.duration(diffMs);
    const totalMinutes = Math.floor(duration.asMinutes());
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours === 0 && minutes === 0) diffText = "";
    else if (hours === 0) diffText = ` (${minutes}Mins)`;
    else if (minutes === 0) diffText = ` (${hours}Hrs)`;
    else diffText = ` (${hours} Hrs ${minutes} Mins)`;
  }

  return outMoment
  ? `${inMoment.format("hh:mm A")} - ${outMoment.format("hh:mm A")}${diffText}`
  : inMoment.format("hh:mm A");

};



const exportToExcel = async () => {
  const allLogs = await fetchAllForExport();

  if (!allLogs.length) {
  toast.error("No data to export");
    return;
  }

  const excelData = allLogs.map((log, index) => {
    const sessions = log.sessions || [];
    const enteredIn = sessions?.length ? sessions[0].timestamp : null;
    const exitTiming =sessions?.length > 1 ? sessions[sessions.length - 1].timestamp : null;


    return {
      ID: index + 1,
      Name: log.userInfo?.userName || "Unknown",
      Department: log.department?.departmentName || "unknown",
      Date: log.date
        ? moment.utc(log.date).tz(region).format("DD/MM/YYYY")
        : "--",
      Location: log.userInfo?.location || "--",
      "Access Time": formatAccessTime(enteredIn, exitTiming, region),
      Camera: sessions[0]?.channel?.name || "--",
      viewImage:"",
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(excelData);

  allLogs.forEach((log, index) => {
    const url = getSingleImageUrl(log);
    const cellRef = XLSX.utils.encode_cell({ r: index + 1, c: 7 });

    worksheet[cellRef] = {
      t: "f",
      f: `HYPERLINK("${url}", "View Image")`
    };
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Access Logs");

  XLSX.writeFile(workbook, "access_logs_report.xlsx");
};
const exportToPDF = async () => {
  const allLogs = await fetchAllForExport();

  if (!allLogs.length) {
   toast.error("No data to export");
    return;
  }

  const doc = new jsPDF("landscape");
  doc.setFont("helvetica");
  doc.setFontSize(12);
  doc.text("Access Logs Report", 14, 12);
  
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
    "Access Time",
    "Camera",
     "View Image",

  ];

  const rows = allLogs.map((log, index) => {
    const sessions = log.sessions || [];
   const enteredIn = sessions?.length ? sessions[0].timestamp : null;
  const exitTiming =sessions?.length > 1 ? sessions[sessions.length - 1].timestamp : null;


    return [
      index + 1,
      log.userInfo?.userName || "Unknown",
      log.department?.departmentName || "--",
      log.date
        ? moment.utc(log.date).tz(region).format("DD/MM/YYYY")
        : "--",
      log.userInfo?.location || "--",
      formatAccessTime(enteredIn, exitTiming, region),
      sessions[0]?.channel?.name || "--",
      // "View Image",
    ];
  });

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 20,
    styles: { fontSize: 8 },
    didDrawCell: function (data) {
      if (data.column.index === 7 && data.section === "body") {
        const url = getSingleImageUrl(allLogs[data.row.index]);

        doc.link(
          data.cell.x,
          data.cell.y,
          data.cell.width,
          data.cell.height,
          { url }
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
    doc.setLineWidth(0.5);
    doc.line(textX, textY + 1, textX + textWidth, textY + 1);
   doc.setDrawColor(0, 0, 255);   // underline color (blue)

      }
    }})

  doc.save(`access_logs_report.pdf`);
};


const handleExport = async (format) => {
  if (format === "excel") await exportToExcel();
  if (format === "pdf") await exportToPDF();
};


  // Effect 1: Manual/Filter trigger
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs, manualTrigger]);

  // Effect 2: Auto Refresh timer
  useEffect(() => {
    let intervalId;
    if (autoRefresh  && refreshInterval > 0) {
      intervalId = setInterval(fetchLogs, refreshInterval * 1000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [autoRefresh, refreshInterval, fetchLogs]);

  const columns = useMemo(
    () => [
      {
        accessorKey: 'Profile',
        header: 'Profile',
        cell: ({ row }) => (
          <div
            className="w-8 h-8 rounded-full overflow-hidden bg-white border border-[#E6E6E6] cursor-pointer"
            onClick={() => {
              dispatch({ type: 'SET_SELECTED_LOG', value: row.original });
              dispatch({ type: 'SET_SHOW_PROFILE', value: true });
            }}
          >
            <img
              src={row.original.image}
              alt={row.original.name}
              className="w-8 h-8 object-cover"
            />
          </div>
        ),
      },

      {
        accessorKey: 'name',
        header: () => (
          <button
            onClick={() => {
              dispatch({ type: 'SET_SORT_FIELD', value: 'userInfo.userName' });
              dispatch({
                type: 'SET_SORT_ORDER',
                value: sortOrder === 'asc' ? 'desc' : 'asc',
              });
            }}
            className="flex items-center gap-1 ml-4 cursor-pointer"
          >
            Name
            {sortField === 'userInfo.userName' ? (
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
              dispatch({
                type: 'SET_SORT_FIELD',
                value: 'department.departmentName',
              });
              dispatch({
                type: 'SET_SORT_ORDER',
                value: sortOrder === 'asc' ? 'desc' : 'asc',
              });
            }}
            className="flex items-center gap-1 cursor-pointer"
          >
            Department
            {sortField === 'department.departmentName' ? (
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
            className="flex items-center gap-1 cursor-pointer ml-1"
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
            {row.original.date
              ? moment.utc(row.original.date).tz(region).format('DD/MM/YYYY')
              : '--/--/----'}
          </span>
        ),
      },

      {
        accessorKey: 'location',
        header: () => (
          <button
            onClick={() => {
              dispatch({ type: 'SET_SORT_FIELD', value: 'userInfo.location' });
              dispatch({
                type: 'SET_SORT_ORDER',
                value: sortOrder === 'asc' ? 'desc' : 'asc',
              });
            }}
            className="flex items-center gap-1 cursor-pointer"
          >
            Location
            {sortField === 'userInfo.location' ? (
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
        accessorKey: 'Access time',
        header: () => (
          <button
            onClick={() => {
              dispatch({ type: 'SET_SORT_FIELD', value: 'lastCreatedAt' });
              dispatch({
                type: 'SET_SORT_ORDER',
                value: sortOrder === 'asc' ? 'desc' : 'asc',
              });
            }}
            className="flex items-center gap-1 cursor-pointer ml-1"
          >
            Access time
            {sortField === 'lastCreatedAt' ? (
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

        cell: ({ row }) => {
          const enteredIn = row.original.enteredIn;
          const exitTiming = row.original.exitTiming;

          const enteredMoment = enteredIn
            ? moment.utc(enteredIn).tz(region)
            : null;
          const exitMoment = exitTiming
            ? moment.utc(exitTiming).tz(region)
            : null;

          const hyphen = enteredMoment && exitMoment ? '-' : ' ';

          let diffText = ' ';
          if (enteredMoment && exitMoment) {
            const diffMs = exitMoment.diff(enteredMoment);
            const duration = moment.duration(diffMs);
            const totalMinutes = Math.floor(duration.asMinutes());
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;

            if (hours === 0 && minutes === 0) diffText = '';
            else if (hours === 0) diffText = `(${minutes}Mins)`;
            else if (minutes === 0) diffText = `(${hours}Hrs)`;
            else diffText = `(${hours} Hrs ${minutes} Mins)`;
          }

          return (
            <div>
              <span
                className={
                  enteredMoment && !exitMoment
                    ? styles.text + ' ml-5'
                    : styles.text
                }
              >
                {enteredMoment ? enteredMoment.format('hh:mm A') : ' '}
              </span>
              {hyphen}
              <span className={styles.text}>
                {exitMoment ? exitMoment.format('hh:mm A') : ' '}
              </span>

              <div className="text-[#333333] text-xs font-normal ml-7">
                {diffText}
              </div>
            </div>
          );
        },
      },

      {
        accessorKey: 'cameraName',
        header: 'Camera',
        cell: ({ row }) => (
          <span
            className={
              styles.text + (row.original.cameraName === '--' ? ' ml-5' : ' ')
            }
          >
            {row.original.cameraName}
          </span>
        ),
      },

      {
        accessorKey: 'action',
        header: 'Action',
        cell: ({ row }) => (
          <div>
            <button
              onClick={() => {
                dispatch({
                  type: 'SET_SELECTED_LOG',
                  value: row.original,
                });
                dispatch({ type: 'SET_SHOW_PREVIEW', value: true });
              }}
              className="p-2 rounded-full bg-transparent cursor-pointer"
            >
              <Play className="w-5 h-5 text-[#07486A]" />
            </button>
          </div>
        ),
      },
    ],
    [sortField, sortOrder]
  );

  const renderAccessCard = (item) => {
    const dateStr = item.date
      ? moment.utc(item.date).tz(region).format('DD/MM/YYYY')
      : '--/--/----';
    const accessTimeStr = formatAccessTime(
      item.enteredIn,
      item.exitTiming,
      region
    );

    return (
      <div
        onClick={() => {
          dispatch({ type: 'SET_SELECTED_LOG', value: item });
          dispatch({ type: 'SET_SHOW_PROFILE', value: true });
        }}
        className="bg-white rounded-2xl p-3 sm:p-4 md:p-5 lg:p-6 shadow-sm border border-gray-100 flex flex-col items-center relative group hover:shadow-md transition-shadow cursor-pointer h-full w-full min-w-0"
      >
        {/* Department badge top-left */}
        <div className="absolute top-2 left-2 md:top-3 md:left-3 z-20 max-w-[55%]">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-semibold bg-[#E3F5FF] text-[#07486A] border border-[#CFEFFF] shadow-sm truncate max-w-full">
            {item.department}
          </span>
        </div>

        {/* Action button top-right */}
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
            <Clock className="w-4 h-4 md:w-5 md:h-5 text-gray-700 shrink-0" />
            <span className="font-semibold text-gray-900 w-16 md:w-24 shrink-0 text-[10px] md:text-[11px] uppercase tracking-wider">
              Access
            </span>
            <span
              className="text-gray-600 truncate flex-1 text-right min-w-0"
              title={accessTimeStr}
            >
              {accessTimeStr}
            </span>
          </div>
          <div className="flex items-center gap-2 md:gap-3 text-xs md:text-sm min-w-0">
            <Video className="w-4 h-4 md:w-5 md:h-5 text-gray-700 shrink-0" />
            <span className="font-semibold text-gray-900 w-16 md:w-24 shrink-0 text-[10px] md:text-[11px] uppercase tracking-wider">
              Camera
            </span>
            <span
              className="text-gray-600 truncate flex-1 text-right min-w-0"
              title={item.cameraName}
            >
              {item.cameraName}
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
        title="Access Logs"
        data={rows}
        columns={columns}
        loading={loading}
        error={error}
        currentPage={currentPage}
        setCurrentPage={(v) => dispatch({ type: 'SET_CURRENT_PAGE', value: v })}
        attendanceLogsCount={totalCount}
        limit={limit}
        onLimitChange={(v) => { setLimit(v); dispatch({ type: 'SET_CURRENT_PAGE', value: 1 }); }}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        gridCard={renderAccessCard}
        searchKeys={['name', 'department']}
        searchQuery={searchInput}
        onSearchChange={(v) => dispatch({ type: 'SET_SEARCH_INPUT', value: v })}
        startDate={startDate}
        endDate={endDate}
        // minDate={mindate}
        maxDate={maxDateDefault}
        onDateRangeChange={({ start, end }) => {
          const toIso = (d) =>
            d instanceof Date ? d.toISOString().split('T')[0] : d;

          dispatch({
            type: 'SET_START_DATE',
            value: start ? toIso(start) : '',
          });
          dispatch({
            type: 'SET_END_DATE',
            value: end ? toIso(end) : '',
          });
        }}
      >
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

        <LogsFilterPopover
          nvrIds={Array.isArray(nvrIds) ? nvrIds : []}
          setNvrId={(value) => {
            dispatch({ type: 'SET_NVR_IDS', value: value });
            if (value.length === 0) {
              dispatch({ type: 'SET_CHANNEL_IDS', value: [] });
            }
          }}
          nvrList={nvrList}
          cameraId={channelIds}
          setCameraId={(value) => {
            dispatch({ type: 'SET_CHANNEL_IDS', value: value });
          }}
          cameraList={cameraList}
          departments={departments}
          selectedDepartments={selectedDepartments}
          setSelectedDepartments={(v) =>
            dispatch({ type: 'SET_SELECTED_DEPARTMENTS', value: v })
          }
          showTimeRange={false}
          showUnknownFilter={true}
          removeUnknown={state.removeUnknown}
          setRemoveUnknown={(v) =>
            dispatch({ type: 'SET_REMOVE_UNKNOWN', value: v })
          }
          setFromTime={(v) => dispatch({ type: 'SET_FROM_TIME', value: v })}
          setToTime={(v) => dispatch({ type: 'SET_TO_TIME', value: v })}
          fromTime={fromTime}
          toTime={toTime}
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
            setManualTrigger((prev) => prev + 1);
          }}
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
    </>
  );
};

export default AccessLogs;
