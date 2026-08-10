import moment from 'moment-timezone';

export const initialState = {
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

  // status (present / half_day / absent / checked_in) — '' means no filter
  statusFilter: '',

  // logs
  attendanceLogs: [],
  attendanceLogsCount: 0,
  // Status totals for the whole filtered result set, from the server. Not
  // derived from the loaded page — that made the KPI tiles report out of the
  // page size (10) instead of the full match.
  statusCounts: {
    present: 0,
    halfDay: 0,
    absent: 0,
    checkedIn: 0,
    earlyLeave: 0,
    notCheckedIn: 0,
    checkinLogs: 0,
    checkoutLogs: 0,
  },
  // Registered employees for this org — a roster count, so unlike the status
  // totals it is independent of the date range and filters.
  totalEmployees: 0,
  loading: false,

  // departments
  departments: [],
  selectedDepartments: [],

  // NVR / Camera
  nvrIds: '',
  nvrList: [],
  cameraList: [],
  cameraId: '',

  // pagination
  currentPage: 1,
  limit: 12,

  // time range
  fromTime: '',
  toTime: '',
  timeType: '',

  // location (stores locationName strings to match backend contract)
  employeeLocations: [],
  locationList: [],

  // date range
  dateRange: { start: null, end: null },

  // constants
  BASE_URL: import.meta.env.VITE_BACKEND + '/uploads',
  USER_AVTAR_INITIALS: import.meta.env.VITE_INITIALS_URL,
  todayISO: moment().format('YYYY-MM-DD'),
};

export function reducer(state, action) {
  switch (action.type) {
    case 'RESET_BASIC_VIEW':
      return {
        ...state,
        searchInput: '',
        statusFilter: '',
        selectedDepartments: [],
        nvrIds: '',
        cameraId: '',
        currentPage: 1,
        fromTime: '',
        toTime: '',
        timeType: '',
        employeeLocations: [],
        dateRange: { start: state.todayISO, end: state.todayISO },
        startDate: state.todayISO,
        endDate: state.todayISO,
      };
    case 'SET_SELECTED_LOG':
      return { ...state, selectedLog: action.value };
    case 'SET_SHOW_PREVIEW':
      return { ...state, showPreview: action.value };
    case 'SET_SELECTED_PROFILE':
      return { ...state, selectedProfile: action.value };
    case 'SET_SHOW_PROFILE_DIALOG':
      return { ...state, showProfileDialog: action.value };

    case 'SET_SELECTED_BREAK_LOG':
      return { ...state, selectedBreakLog: action.value };
    case 'SET_SHOW_BREAK_LOGS':
      return { ...state, showBreakLogs: action.value };

    case 'SET_SORT_FIELD':
      return { ...state, sortField: action.value };
    case 'SET_SORT_ORDER':
      return { ...state, sortOrder: action.value };

    case 'SET_SEARCH_INPUT':
      return { ...state, searchInput: action.value };
    case 'SET_STATUS_FILTER':
      return { ...state, statusFilter: action.value, currentPage: 1 };

    case 'SET_START_DATE':
      return { ...state, startDate: action.value };
    case 'SET_END_DATE':
      return { ...state, endDate: action.value };
    case 'SET_MIN_DATE':
      return { ...state, minDate: action.value };
    case 'SET_DATE_RANGE':
      return { ...state, dateRange: action.value };

    case 'SET_ATTENDANCE_LOGS':
      return { ...state, attendanceLogs: action.value };
    case 'SET_ATTENDANCE_COUNT':
      return { ...state, attendanceLogsCount: action.value };
    case 'SET_STATUS_COUNTS':
      return { ...state, statusCounts: action.value };
    case 'SET_TOTAL_EMPLOYEES':
      return { ...state, totalEmployees: action.value };
    case 'SET_LOADING':
      return { ...state, loading: action.value };

    case 'SET_DEPARTMENTS':
      return { ...state, departments: action.value };
    case 'SET_SELECTED_DEPARTMENTS':
      return { ...state, selectedDepartments: action.value };

    case 'SET_NVR_ID':
      return { ...state, nvrIds: action.value };
    case 'SET_NVR_LIST':
      return { ...state, nvrList: action.value };
    case 'SET_CAMERA_LIST':
      return { ...state, cameraList: action.value };
    case 'SET_CAMERA_ID':
      return { ...state, cameraId: action.value };

    case 'SET_CURRENT_PAGE':
      return { ...state, currentPage: action.value };
    case 'SET_LIMIT':
      return { ...state, limit: action.value, currentPage: 1 };

    case 'SET_FROM_TIME':
      return { ...state, fromTime: action.value };
    case 'SET_TO_TIME':
      return { ...state, toTime: action.value };
    case 'SET_TIME_TYPE':
      return { ...state, timeType: action.value };

    case 'SET_EMPLOYEE_LOCATIONS':
      return { ...state, employeeLocations: action.value };
    case 'SET_LOCATION_LIST':
      return { ...state, locationList: action.value };

    default:
      return state;
  }
}
