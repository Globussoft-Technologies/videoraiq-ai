import moment from 'moment-timezone';

export const initialState = {
  // profile / preview
  selectedLog: null,
  showProfile: false,
  showPreview: false,

  // pagination / sorting
  currentPage: 1,
  sortOrder: '',
  sortField: '',

  // data
  totalCount: 0,
  rows: [],
  loading: false,
  error: null,

  // departments
  departments: [],
  selectedDepartments: [],

  // search / date
  searchInput: '',
  mindate: null,
  startDate: '',
  endDate: '',

  // NVR / camera
  nvrIds: [],
  nvrList: [],
  cameraList: [],
  channelIds: [],
  nvrValue: '',
  cameraValue: '',

  // filters
  removeUnknown: false,
  fromTime: '',
  toTime: '',

  // location (stores locationName strings to match backend's employeeLocations array)
  employeeLocations: [],
  locationList: [],

  // constants
  region: moment.tz.guess(),
  todayISO: moment().format('YYYY-MM-DD'),
  maxDateDefault: moment().endOf('day').toDate(),
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
