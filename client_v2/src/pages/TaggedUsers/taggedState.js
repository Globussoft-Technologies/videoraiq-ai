import moment from 'moment-timezone';

export const initialState = {
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

export const todayISO = moment().format('YYYY-MM-DD');
export const maxDateDefault = moment().endOf('day').toDate();

/**
 * Map a raw access-log entry (tagged) into the flat row shape the table/grid
 * and dialogs consume. `nasUrl` is the backend base URL, `unknownimg` the
 * avatar fallback.
 */
export const mapAccessLog = (log, nasUrl, unknownimg) => {
  const sessions = log.sessions || [];
  const firstSessionImg = sessions
    .map((s) => s?.images?.faceImage || s?.images?.personImage || s?.images?.frameImage)
    .find(Boolean);
  const image =
    log.userInfo?.profilePics?.length > 0
      ? `${nasUrl}/api/v1/uploads${log.userInfo.profilePics[0]}`
      : firstSessionImg
        ? `${nasUrl}/api/v1/uploads${firstSessionImg}`
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
      return img ? `${nasUrl}/api/v1/uploads${img}` : null;
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
    location: log.userInfo?.location || '--',
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
};

export function reducer(state, action) {
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
