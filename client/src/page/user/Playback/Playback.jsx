import React, { useReducer, useEffect, useRef, useCallback, useMemo, useState } from 'react';
import PlaybackVideo from './PlaybackVideo';
import axios from 'axios';
import camera1 from '../../../assets/camera1.png';
import camera2 from '../../../assets/camera2.png';
import getAccessToken from '@/utils/getAccessToken';
import { formatDateCorrect } from '@/utils/formatDateRange';
import { debounce } from 'lodash';
import PlaybackHeader from './components/PlaybackHeader';
import VideoSection from './components/VideoSection';
import Cookies from 'js-cookie';
import { v4 as uuidv4 } from 'uuid';
import { useSocket } from '@/context/Sockets/SocketContext';
import { usePermissions } from '@/context/Permission/PermissionContext';
import AccessDenied from '@/components/AccessDenied';
import PageLoader from '@/components/PageLoader';
import { useLocation } from 'react-router-dom';

let initialLoad = true;
import { toast } from 'sonner';

const HOST = import.meta.env.VITE_BACKEND;
const socket_Url = import.meta.env.VITE_SOCKET_URL;

// Initial state for the reducer
const initialState = {
  dateRange: (() => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { start: today, end: today };
  })(),
  allNVRs: [],
  selectedNVRId: '',
  cameras: [],
  selectedCameraId: '',
  selectedCamera: null,
  isLoading: false,
  playbackUrl: null,
  controlSocket: null,
  searchInputValue: '',
  cameraSearchResults: null,
  showSearchResults: false,
  timelineZoomLevel: 1,
  zoomLevel: 7,
  // New state for filters
  locations: [],
  selectedLocation: '',
  departments: [],
  selectedDepartment: '',
  selectedCameraTypes: [],
};

// Reducer function
const playbackReducer = (state, action) => {
  switch (action.type) {
    case 'SET_DATE_RANGE':
      return { ...state, dateRange: action.payload };
    case 'SET_ALL_NVRS':
      return { ...state, allNVRs: action.payload };
    case 'SET_SELECTED_NVR_ID':
      return { ...state, selectedNVRId: action.payload };
    case 'SET_CAMERAS':
      return { ...state, cameras: action.payload };
    case 'SET_SELECTED_CAMERA_ID':
      return { ...state, selectedCameraId: action.payload };
    case 'SET_SELECTED_CAMERA':
      return { ...state, selectedCamera: action.payload };
    case 'SET_IS_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_PLAYBACK_URL':
      return { ...state, playbackUrl: action.payload };
    case 'SET_CONTROL_SOCKET':
      return { ...state, controlSocket: action.payload };
    case 'SET_SEARCH_INPUT_VALUE':
      return { ...state, searchInputValue: action.payload };
    case 'SET_CAMERA_SEARCH_RESULTS':
      return { ...state, cameraSearchResults: action.payload };
    case 'SET_SHOW_SEARCH_RESULTS':
      return { ...state, showSearchResults: action.payload };
    case 'SET_TIMELINE_ZOOM_LEVEL':
      return { ...state, timelineZoomLevel: action.payload };
    case 'SET_ZOOM_LEVEL':
      return { ...state, zoomLevel: action.payload };
    // New reducer cases for filters
    case 'SET_LOCATIONS':
      return { ...state, locations: action.payload };
    case 'SET_SELECTED_LOCATION':
      return { ...state, selectedLocation: action.payload };
    case 'SET_DEPARTMENTS':
      return { ...state, departments: action.payload };
    case 'SET_SELECTED_DEPARTMENT':
      return { ...state, selectedDepartment: action.payload };
    case 'RESET_SEARCH_STATE':
      return {
        ...state,
        searchInputValue: '',
        cameraSearchResults: [],
        showSearchResults: false,
      };
    case 'RESET_FILTERS':
      return {
        ...state,
        selectedLocation: '',
        selectedDepartment: '',
        selectedNVRId: '',
        selectedCameraId: '',
        selectedCamera: null,
        searchInputValue: '',
        cameraSearchResults: [],
        showSearchResults: false,
      };
    case 'SET_SELECTED_CAMERA_TYPES':
      return { ...state, selectedCameraTypes: action.payload };
    default:
      return state;
  }
};

const Playback = () => {
  const { permissions, loading: permissionsLoading } = usePermissions();
  const canView = permissions?.playbacks?.view;
  const location = useLocation();
  const { nvrIdFromNvr } = location.state || {};
  const fromNvrSettings = location.state?.from === 'nvr-settings';
  
  const [state, dispatch] = useReducer(playbackReducer, initialState);
  const {
    dateRange,
    allNVRs,
    selectedNVRId,
    cameras,
    selectedCameraId,
    selectedCamera,
    isLoading,
    playbackUrl,
    controlSocket,
    searchInputValue,
    cameraSearchResults,
    showSearchResults,
    timelineZoomLevel,
    zoomLevel,
    locations,
    selectedLocation,
    departments,
    selectedDepartment,
    selectedCameraTypes,
  } = state;
  
  const { currentVideoRef, resetCurrentVideoRef } = useSocket();
  const [hasUsedNvrFromNav, setHasUsedNvrFromNav] = useState(false);
  const containerRef = useRef(null);
  const retryPlaybackUrlRef = useRef(null);

  // Fetch locations using new API
  const fetchLocations = useCallback(async (filterData = {}) => {
    try {
      const payload = {
        nvrIds: selectedNVRId ? [selectedNVRId] : [],
        channelsIds: [],
        departmentIds: selectedDepartment ? [selectedDepartment] : [],
        ...filterData
      };

      const response = await axios.post(
        `${HOST}/api/v1/authorizedChannels/locations`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-access-token': getAccessToken(),
          },
        }
      );
      
      const locationsData = response.data?.body?.data || [];
      dispatch({ type: 'SET_LOCATIONS', payload: locationsData });
    } catch (error) {
      console.error('Failed to load locations:', error);
    }
  }, [selectedNVRId, selectedDepartment]);

  // Fetch departments using new API
  const fetchDepartments = useCallback(async (filterData = {}) => {
    try {
      const payload = {
        nvrIds: selectedNVRId ? [selectedNVRId] : [],
        channelsIds: [],
        selectedLocations: selectedLocation ? [selectedLocation] : [],
        ...filterData
      };

      const response = await axios.post(
        `${HOST}/api/v1/authorizedChannels/departments`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-access-token': getAccessToken(),
          },
        }
      );

      const departmentsData = response.data?.body?.data || [];
      dispatch({ type: 'SET_DEPARTMENTS', payload: departmentsData });
    } catch (error) {
      console.error('Failed to load departments:', error);
    }
  }, [selectedNVRId, selectedLocation]);

  // Fetch NVRs using new API
  const fetchNVRs = useCallback(async (filterData = {}) => {
    try {
      dispatch({ type: 'SET_IS_LOADING', payload: true });
      
      const payload = {
        channelsIds: [],
        departmentIds: selectedDepartment ? [selectedDepartment] : [],
        selectedLocations: selectedLocation ? [selectedLocation] : [],
                ...filterData
      };

      const response = await axios.post(
        `${HOST}/api/v1/authorizedChannels/getNVRS`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-access-token': getAccessToken(),
          },
        }
      );
      
      const nvrsData = response.data?.body?.data || [];
      // const filterNvrsData = nvrsData.filter(nvr => nvr.brand !== 'cpplus');
      const formattedNvrs = nvrsData.map(nvr => ({
        _id: nvr._id,
        nvrName: nvr.nvrName || nvr.name,
        id: nvr._id
      }));
      
      dispatch({ type: 'SET_ALL_NVRS', payload: formattedNvrs });
      
      // Handle NVR selection logic
      if (nvrIdFromNvr && !hasUsedNvrFromNav) {
        dispatch({ type: 'SET_SELECTED_NVR_ID', payload: nvrIdFromNvr });
        setHasUsedNvrFromNav(true);
      } else if (formattedNvrs.length > 0 && !selectedNVRId) {
        dispatch({ type: 'SET_SELECTED_NVR_ID', payload: formattedNvrs[0]._id });
      }
    } catch (error) {
      console.error('Failed to load NVRs:', error);
    } finally {
      dispatch({ type: 'SET_IS_LOADING', payload: false });
    }
  }, [selectedDepartment, selectedLocation, selectedNVRId, nvrIdFromNvr, hasUsedNvrFromNav]);

  // Fetch cameras using new API
  const fetchCameras = useCallback(async (search = '') => {
    if (!selectedNVRId) return;

    try {
      dispatch({ type: 'SET_IS_LOADING', payload: true });
      const payload = {
        nvrIds: [selectedNVRId],
        departmentIds: selectedDepartment ? [selectedDepartment] : [],
        selectedLocations: selectedLocation ? [selectedLocation] : [],
        camType:selectedCameraTypes
          
      };

      const response = await axios.post(
        `${HOST}/api/v1/authorizedChannels/getChannels`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-access-token': getAccessToken(),
          },
        }
      );
      const channels = response.data?.body?.data || [];
      // Filter by search term if provided
      let filteredChannels = channels;
      if (search) {
        filteredChannels = channels.filter(channel => {
          const channelName = (channel.customName || channel.name || `Camera ${channel.channelId}`).toLowerCase();
          return channelName.includes(search.toLowerCase());
        });
      }
      const cameraOptions = filteredChannels.map(channel => ({
        id: channel._id,
        name: channel.customName || channel.name || `Camera ${channel.channelId}`,
        channelId: channel.channelId,
        streamId: channel.rtspChannels?.[0]?.id || '102',
        nvrId: channel.nvrId
      }));
      dispatch({ type: 'SET_CAMERAS', payload: cameraOptions });
      if (cameraOptions.length > 0) {
        dispatch({ type: 'SET_SELECTED_CAMERA_ID', payload: cameraOptions[0].id });
        dispatch({ type: 'SET_SELECTED_CAMERA', payload: cameraOptions[0] });
        initialLoad = false;
      } else if (cameraOptions.length === 0) {
        // Reset camera selection if no cameras found
        dispatch({ type: 'SET_SELECTED_CAMERA_ID', payload: '' });
        dispatch({ type: 'SET_SELECTED_CAMERA', payload: null });
        resetCurrentVideoRef();
      }
    } catch (error) {
      console.error('Failed to load cameras:', error);
    } finally {
      dispatch({ type: 'SET_IS_LOADING', payload: false });
    }
  }, [selectedNVRId, selectedLocation, selectedDepartment, resetCurrentVideoRef, selectedCameraTypes]);
  
  useEffect(() => {
    fetchCameras();
  }, [selectedCameraTypes]);

  // Debounced search handler
  const debouncedSearch = useCallback(
    debounce((searchTerm) => {
      if (searchTerm && searchTerm.length > 2) {
        handleCameraSearch(searchTerm);
      } else {
        dispatch({ type: 'SET_CAMERA_SEARCH_RESULTS', payload: [] });
        dispatch({ type: 'SET_SHOW_SEARCH_RESULTS', payload: false });
        // If search is cleared, refetch all cameras
        if (!searchTerm) {
          fetchCameras('');
        }
      }
    }, 500),
    [selectedNVRId, selectedLocation, selectedDepartment]
  );

  const handleSearchChange = (e) => {
    const value = e.target.value;
    dispatch({ type: 'SET_SEARCH_INPUT_VALUE', payload: value });
    debouncedSearch(value);
  };

  const handleCameraSearch = async (searchTerm) => {
    if (!selectedNVRId) return;

    try {
      dispatch({ type: 'SET_IS_LOADING', payload: true });
      
      const payload = {
        nvrIds: [selectedNVRId],
        departmentIds: selectedDepartment ? [selectedDepartment] : [],
        selectedLocations: selectedLocation ? [selectedLocation] : [],
      };

      const response = await axios.post(
        `${HOST}/api/v1/authorizedChannels/getChannels${searchTerm ? `?searchQuery=${searchTerm}`: ""}`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-access-token': getAccessToken(),
          },
        }
      );
      
      const channels = response.data?.body?.data || [];
      
      // Filter channels based on search term
      const filteredChannels = channels.filter(channel => {
        const channelName = (channel.customName || channel.name || `Camera ${channel.channelId}`).toLowerCase();
        return channelName.includes(searchTerm.toLowerCase());
      });
      
      const searchResults = filteredChannels.map(channel => ({
        id: channel._id,
        name: (channel.customName || channel.name) || `Camera ${channel.channelId}`,
        channelId: channel.channelId,
        streamId: channel.rtspChannels?.[0]?.id || '102',
        nvrId: channel.nvrId
      }));
      
      dispatch({ type: 'SET_CAMERA_SEARCH_RESULTS', payload: searchResults });
      dispatch({ type: 'SET_SHOW_SEARCH_RESULTS', payload: searchResults.length > 0 });
    } catch (error) {
      console.error('Failed to search cameras:', error);
      dispatch({ type: 'SET_CAMERA_SEARCH_RESULTS', payload: [] });
      dispatch({ type: 'SET_SHOW_SEARCH_RESULTS', payload: false });
    } finally {
      dispatch({ type: 'SET_IS_LOADING', payload: false });
    }
  };

  const handleSelectSearchResult = (camera) => {
    dispatch({ type: 'SET_SELECTED_CAMERA_ID', payload: camera.id });
    dispatch({ type: 'SET_SELECTED_CAMERA', payload: camera });
    dispatch({ type: 'SET_SEARCH_INPUT_VALUE', payload: camera.name });
    dispatch({ type: 'SET_SHOW_SEARCH_RESULTS', payload: false });
    
    // Set today's date range
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    dispatch({ type: 'SET_DATE_RANGE', payload: { start: today, end: tomorrow } });
    
    // Trigger playback for today
    handleTimeRangeSelect(today, tomorrow, camera);
  };

  // Clean up WebSocket connection
  const cleanupWebSocket = useCallback(() => {
    if (controlSocket) {
      controlSocket.close();
      dispatch({ type: 'SET_CONTROL_SOCKET', payload: null });
    }
    dispatch({ type: 'SET_PLAYBACK_URL', payload: null });
  }, [controlSocket]);

  // Smart zoom functionality for timeline
  const handleSmartZoom = (direction) => {
    dispatch({ type: 'SET_ZOOM_LEVEL', payload: ((prev) => {
      const zoomFactor = 1.5;
      const minZoom = 0.5;
      const maxZoom = 30;
      
      let newZoom = direction === 'in' 
        ? prev * zoomFactor 
        : prev / zoomFactor;
      
      newZoom = Math.min(Math.max(newZoom, minZoom), maxZoom);
      return Math.round(newZoom * 10) / 10;
    })(zoomLevel) });
  };

  // Fetch initial data on component mount
  useEffect(() => {
    const initLoad = async () => {
      await fetchNVRs();
    };
    initLoad();
    
    return () => cleanupWebSocket();
  }, [cleanupWebSocket]);

  // Fetch dependent data when filters change
  useEffect(() => {
    if (selectedNVRId) {
      const filterData = { nvrIds: [selectedNVRId] };
      fetchLocations(filterData);
      fetchDepartments(filterData);
      fetchCameras();
    }
  }, [selectedNVRId]);

  useEffect(() => {
    fetchNVRs();
    fetchCameras();
  }, [selectedLocation, selectedDepartment]);

  // Reset filters when component mounts
  useEffect(() => {
    dispatch({ type: 'SET_SELECTED_DEPARTMENT', payload: '' });
    dispatch({ type: 'SET_SELECTED_LOCATION', payload: '' });
  }, []);

  // Set selected camera when camera ID changes
  useEffect(() => {
    if (selectedCameraId && cameras.length > 0) {
      const camera = cameras.find(cam => cam.id === selectedCameraId);
      dispatch({ type: 'SET_SELECTED_CAMERA', payload: camera });
    }
  }, [selectedCameraId, cameras]);

  // Handle time range selection and fetch playback URL with retry logic
  const handleTimeRangeSelect = useCallback(async (startTime, endTime, selectedCamera) => {
    if (!selectedCamera) return;
     
    // Parse custom timestamp format (e.g. 20251104T102824Z)
    const parseCustomDate = (ts) => {
      const match = ts.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
      if (!match) return null;
      const [_, y, m, d, hh, mm, ss] = match;
      return new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
    };
  
    const startDate = parseCustomDate(startTime);
    if (!startDate) {
      console.error('Invalid startTime format:', startTime);
      return;
    }
  
    const nowUTC = new Date(new Date().toISOString());

    if (startDate > new Date(Date.now() + (5.5 * 60 * 60 * 1000) - (5 * 60 * 1000))) {
      toast.warning('Playback for future time is not available.');
      return;
    }
  
    // Set end time to 23:59:59 of same date (in UTC)
    const endOfDay = new Date(startDate);
    endOfDay.setUTCHours(23, 59, 59, 999);
  
    // Convert back to the same format (YYYYMMDDTHHmmssZ)
    const pad = (n) => String(n).padStart(2, '0');
    const finalEndTime =
      `${endOfDay.getUTCFullYear()}${pad(endOfDay.getUTCMonth() + 1)}${pad(endOfDay.getUTCDate())}` +
      `T${pad(endOfDay.getUTCHours())}${pad(endOfDay.getUTCMinutes())}${pad(endOfDay.getUTCSeconds())}Z`;
  
    let sessionId = Cookies.get('playback_session_id');
    if (!sessionId) {
      sessionId = uuidv4();
      Cookies.set('playback_session_id', sessionId, { expires: 1 });
    }
  
    let retryCount = 0;
    const maxRetries = 5;
    const retryDelay = 60000; // 1 minute delay

    const fetchPlaybackUrl = async () => {
      try {
        dispatch({ type: 'SET_IS_LOADING', payload: true });

        const response = await axios.post(
          `${HOST}/api/v1/channel/playback-url`,
          {
            channelId: selectedCamera.id,
            streamId: selectedCamera.streamId,
            startTime,
            endTime: finalEndTime,
            sessionId,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'x-access-token': getAccessToken(),
            },
          }
        );
    
        dispatch({ type: 'SET_IS_LOADING', payload: false });
    
        if (response.data?.statusCode !== 200) {
          console.warn(`Playback URL API returned status ${response.data?.statusCode} - Retrying in 1 minute...`);
          scheduleRetry();
          return;
        }
    
        const playbackUrl = response?.data?.body?.data?.playbackUrl;
        console.log(playbackUrl, "playbackUrl")
        dispatch({ type: 'SET_PLAYBACK_URL', payload: playbackUrl });
      } catch (err) {
        dispatch({ type: 'SET_IS_LOADING', payload: false });
        console.error('Error fetching playback URL:', err);
        scheduleRetry();
      }
    };

    const scheduleRetry = () => {
      retryCount++;
      if (retryCount < maxRetries) {
        console.warn(`Retrying playback URL fetch in 1 minute... (${retryCount}/${maxRetries})`);
        setTimeout(fetchPlaybackUrl, retryDelay);
      } else {
        console.error('Max retries reached for playback URL. Could not fetch stream.');
        toast.error('Failed to load playback URL after multiple retries.');
        dispatch({ type: 'SET_IS_LOADING', payload: false });
      }
    };

    // Store retry function for stream 404 errors
    retryPlaybackUrlRef.current = scheduleRetry;

    await fetchPlaybackUrl();
  }, [selectedCamera, cleanupWebSocket, timelineZoomLevel]);

  const nvrOptions = useMemo(() => allNVRs.map(nvr => ({
    value: nvr._id || nvr.id,
    label: nvr.nvrName || nvr.name || `NVR ${nvr._id || nvr.id}`
  })), [allNVRs]);

  const cameraOptions = useMemo(() => cameras.map(camera => ({
    value: camera?.id,
    label: camera?.name
  })), [cameras]);

  const locationOptions = useMemo(() => 
    locations.map(location => ({
      value: location,
      label: location
    })), [locations]);

  const departmentOptions = useMemo(() => 
    departments.map(dept => ({
      value: dept._id || dept.id,
      label: dept.departmentName || dept.name || `Department ${dept._id || dept.id}`
    })), [departments]);

  // Handler for location change
  const handleLocationChange = (value) => {
    dispatch({ type: 'SET_SELECTED_LOCATION', payload: value });
    // Reset camera selection when location changes
    dispatch({ type: 'SET_SELECTED_CAMERA_ID', payload: '' });
    dispatch({ type: 'SET_SELECTED_CAMERA', payload: null });
  };

  // Handler for department change
  const handleDepartmentChange = (value) => {
    dispatch({ type: 'SET_SELECTED_DEPARTMENT', payload: value });
    // Reset camera selection when department changes
    dispatch({ type: 'SET_SELECTED_CAMERA_ID', payload: '' });
    dispatch({ type: 'SET_SELECTED_CAMERA', payload: null });
  };

  // Handler for NVR change
  const handleNVRChange = (value) => {
  dispatch({ type: 'SET_SELECTED_NVR_ID', payload: value });
  dispatch({ type: 'RESET_SEARCH_STATE' });

  // Reset ONLY when a valid NVR is selected
  if (value) {
    dispatch({ type: 'SET_SELECTED_LOCATION', payload: '' });
    dispatch({ type: 'SET_SELECTED_DEPARTMENT', payload: '' });
  }
};



  // Handler for camera change
  const handleCameraChange = (value) => {
    dispatch({ type: 'SET_SELECTED_CAMERA_ID', payload: value });
    const selected = cameras.find(camera => camera.id === value);
    if (selected) {
      dispatch({ type: 'SET_SELECTED_CAMERA', payload: selected });
    }
  };

  // Handler for resetting all filters
  const handleResetFilters = () => {
    dispatch({ type: 'RESET_FILTERS' });
    // Refetch initial data after reset
    fetchNVRs();
  };

  if (permissionsLoading) return <PageLoader />;
  if (!canView) {
    return <AccessDenied message="You don't have permission to view Playbacks." />;
  }

  return (
    <div className="bg-[#fff] rounded-t-[18px] overflow-hidden" ref={containerRef}>
      <PlaybackHeader
        state={{
          dateRange,
          searchInputValue,
          showSearchResults,
          cameraSearchResults,
          nvrOptions,
          selectedNVRId,
          cameraOptions,
          selectedCameraId,
          isLoading,
          selectedCamera,
          locations: locationOptions,
          selectedLocation,
          departments: departmentOptions,
          selectedDepartment,
          selectedCameraTypes,
        }}
        actions={{
          setDateRange: (range) => dispatch({ type: 'SET_DATE_RANGE', payload: range }),
          handleSearchChange,
          handleSelectSearchResult,
          setShowSearchResults: (show) => dispatch({ type: 'SET_SHOW_SEARCH_RESULTS', payload: show }),
          setSelectedNVRId: handleNVRChange,
          setSearchInputValue: (value) => dispatch({ type: 'SET_SEARCH_INPUT_VALUE', payload: value }),
          setCameraSearchResults: (results) => dispatch({ type: 'SET_CAMERA_SEARCH_RESULTS', payload: results }),
          setSelectedCameraId: handleCameraChange,
          handleNVRChange,
          handleCameraChange,
          handleLocationChange,
          handleDepartmentChange,
          handleResetFilters,
          setSelectedCameraTypes: (types) => dispatch({ type: 'SET_SELECTED_CAMERA_TYPES', payload: types }),
        }}
      />

      <VideoSection 
        videoRef={currentVideoRef}
        selectedCamera={selectedCamera}
        isLoading={isLoading}
        playbackUrl={playbackUrl}
        handleSmartZoom={handleSmartZoom}
        timelineZoomLevel={timelineZoomLevel}
        dateRange={dateRange}
        handleTimeRangeSelect={handleTimeRangeSelect}
        selectedNVRId={selectedNVRId}
        selectedCameraId={selectedCameraId}
        zoomLevel={zoomLevel}
        onPlaybackUrlRetry={() => retryPlaybackUrlRef.current?.()}
      />
    </div>
  );
};

export default Playback;