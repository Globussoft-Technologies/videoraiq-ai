import moment from 'moment-timezone';

export const IST_ZONE = 'Asia/Kolkata';

export const styles = {
  text: 'text-[var(--tx)] text-xs font-normal',
};

export const initialState = {
  // core table
  rows: [],
  loading: false,
  error: null,
  totalCount: 0,
  currentPage: 1,

  // sorting
  sortOrder: '',
  sortField: '',

  // search / date
  searchInput: '',
  startDate: moment().format('YYYY-MM-DD'),
  endDate: moment().format('YYYY-MM-DD'),

  // NVR / channel
  nvrList: [],
  cameraList: [],
  nvrIds: [],
  channelIds: [],

  // additional filters
  severity: '',
  status: '', // ON / OFF (conveyor only)

  // pagination
  limit: 12,
};

export function reducer(state, action) {
  switch (action.type) {
    case 'SET_ROWS':
      return { ...state, rows: action.value };
    case 'SET_LOADING':
      return { ...state, loading: action.value };
    case 'SET_ERROR':
      return { ...state, error: action.value };
    case 'SET_TOTAL_COUNT':
      return { ...state, totalCount: action.value };
    case 'SET_CURRENT_PAGE':
      return { ...state, currentPage: action.value };

    case 'SET_SORT_FIELD':
      return { ...state, sortField: action.value };
    case 'SET_SORT_ORDER':
      return { ...state, sortOrder: action.value };

    case 'SET_SEARCH_INPUT':
      return { ...state, searchInput: action.value };
    case 'SET_START_DATE':
      return { ...state, startDate: action.value };
    case 'SET_END_DATE':
      return { ...state, endDate: action.value };

    case 'SET_NVR_LIST':
      return { ...state, nvrList: action.value };
    case 'SET_CAMERA_LIST':
      return { ...state, cameraList: action.value };
    case 'SET_NVR_IDS':
      return { ...state, nvrIds: action.value };
    case 'SET_CHANNEL_IDS':
      return { ...state, channelIds: action.value };

    case 'SET_SEVERITY':
      return { ...state, severity: action.value };
    case 'SET_STATUS':
      return { ...state, status: action.value };

    case 'SET_LIMIT':
      return { ...state, limit: action.value, currentPage: 1 };

    case 'RESET_FILTERS':
      return { ...state, nvrIds: [], channelIds: [], severity: '', status: '' };

    default:
      return state;
  }
}
