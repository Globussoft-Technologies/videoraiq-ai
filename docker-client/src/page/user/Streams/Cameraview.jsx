import React, { useState, useEffect, useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RiArrowDownSLine } from 'react-icons/ri';
import { ArrowLeft, CctvIcon, Search, Maximize2 } from 'lucide-react';
import axios from 'axios';
import MultiSelect from '@/components/ui/multiselect';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Dialog } from '@/components/ui/dialog';
import Pagination from '@/components/Pagination';
import CameraviewSkeleton from './Cameraview/CameraviewSkeleton';
import CameraTwo from './Cameraview/CameraTwo';
import CameraStreamDisplay from './Cameraview/CameraStreamDisplay';
import GridViewModal from './Cameraview/GridViewModal';
import getAccessToken from '@/utils/getAccessToken';
import { usePermissions } from '@/context/Permission/PermissionContext';
import AccessDenied from '@/components/AccessDenied';
import PageLoader from '@/components/PageLoader';
import { useDashboardFiltersContext } from '@/context/UserContext/DashboardFiltersContext';
import UserContext from '@/context/UserContext/Context';
// Assets
import mynaui_grid from '../../../assets/mynaui_grid.svg';
import camera1 from '../../../assets/camera1.png';
import camera2 from '../../../assets/camera2.png';
import camera3 from '../../../assets/camera5.png';
import camera4 from '../../../assets/camera6.png';

const HOST = import.meta.env.VITE_BACKEND;
const gridOptions = [
  { id: 1, label: 'Grid 1x1', icon: camera1, perPage: 1, cols: 1 },
  { id: 2, label: 'Grid 2x2', icon: camera2, perPage: 4, cols: 2 },
  { id: 3, label: 'Grid 3x3', icon: camera3, perPage: 9, cols: 3 },
  { id: 4, label: 'Grid 4x4', icon: camera4, perPage: 16, cols: 4 },
];

export const customStyles = {
  control: (base) => ({
    ...base,
    borderRadius: '0.5rem',
    borderColor: '#D1D5DB',
    boxShadow: 'none',
    height: '2.5rem',
    cursor: 'pointer',
  }),
  option: (base, { isDisabled }) => ({
    ...base,
    backgroundColor: 'transparent',
    color: isDisabled ? '#9CA3AF' : '#111827',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: '#FFFFFF',
    borderRadius: '0.5rem',
    marginTop: 4,
  }),
  indicatorSeparator: () => ({ display: 'none' }),
};

export default function Cameraview() {
  const { permissions, loading: permissionsLoading } = usePermissions();
  const canView = permissions?.LIVE?.view;

  if (permissionsLoading) return <PageLoader />;
  if (!canView) {
    return (
      <AccessDenied message="You don't have permission to view Streaming." />
    );
  }

  const navigate = useNavigate();
  const location = useLocation();
  const { nvrIdFromNvr } = location.state || {};
  const fromNvrSettings = location.state?.from === 'nvr-settings';

  // === STATES ===
  const [selectedNVRId, setSelectedNVRId] = useState([]);
  const [allNVRs, setAllNVRs] = useState([]);
  const [cameraData, setCameraData] = useState([]);
  const [formattedCameraOptions, setFormattedCameraOptions] = useState([]);
  const [selectedCameras, setSelectedCameras] = useState([]);
  // const [selectedDepartment, setSelectedDepartment] = useState([]);
  // const [selectedLocation, setSelectedLocation] = useState([]);
  // const [departments, setDepartments] = useState([]);
  // const [locations, setLocations] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasUsedNvrFromNav, setHasUsedNvrFromNav] = useState(false);
  const [selectedGrid, setSelectedGrid] = useState(() => {
    const saved = localStorage.getItem('selectedGrid');
    return saved ? Number(saved) : 2; // default 2
  });
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
   const [itemsPerPage, setItemsPerPage] = useState(() => {
   const saved = localStorage.getItem("selectedGrid");
   const gridId = saved ? Number(saved) : 2;
   const grid = gridOptions.find((g) => g.id === gridId);
   return grid ? grid.perPage : 4;
  });
  const [totalItems, setTotalItems] = useState(0);
  const [totalChannels, setTotalChannels] = useState([]);
  const [allChannels, setAllChannels] = useState([]);
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const [appliedSearch, setAppliedSearch] = useState('');
  const { streamModalShow, setStreamModalShow } = useContext(UserContext);
  const [prevLocation, setPrevLocation] = useState([]);
  const [selectedcameratype, setselectedcameratype] = useState([]);
  const [isGridViewOpen, setIsGridViewOpen] = useState(false);
  const {
    selectedDepartment,
    setSelectedDepartment,
    departments,
    setDepartments,
    selectedLocation,
    setSelectedLocation,
    locations,
    setLocations,
    fetchLocations,
    fetchDepartments,
  } = useDashboardFiltersContext();

  useEffect(() => {
    setSelectedDepartment([]);
    setSelectedLocation([]);
  }, []);
  // useEffect(()=>{
  //   if(selectedLocation.length === 0)
  //   {
  //     setSelectedDepartment([])
  //     setSelectedNVRId([])
  //     setSelectedCameras([])
  //   }
  // },[selectedLocation])

  useEffect(() => {
    setCurrentPage(1);
  }, [
    selectedNVRId,
    selectedDepartment,
    selectedLocation,
    selectedCameras,
    appliedSearch,
  ]);

  useEffect(() => {
    if (selectedNVRId) {
      const data = {
        nvrIds: selectedNVRId,
        channelsIds: selectedCameras,
      };
      // fetchLocations(data)
      fetchDepartments(data);
    }
  }, [selectedNVRId, selectedCameras]);

  useEffect(() => {
    setStreamModalShow(false);
    setSelectedVideo(null);
  }, [cameraData, currentPage, selectedCameras, selectedNVRId]);

  // Stop preview instance when GridViewModal opens, restart when it closes
  useEffect(() => {
    if (isGridViewOpen) {
      // Stop the preview when GridView modal opens
      setStreamModalShow(false);
      setSelectedVideo(null);
    }
  }, [isGridViewOpen, setStreamModalShow]);

  useEffect(() => {
    setCurrentPage(1)
  }, [selectedcameratype]);

  // === FETCH ALL CHANNELS (non-paginated) ===
  const fetchAllChannels = async (
    search = '',
    selectedCameras = [],
    selectedDepartment = [],
    selectedLocation = []
  ) => {
    try {
      const activeNvrId =
        hasUsedNvrFromNav || !nvrIdFromNvr ? selectedNVRId : nvrIdFromNvr;
      if (!activeNvrId) return;
      const params = new URLSearchParams({
        nvrId: activeNvrId.toString(),
      });

      if (search) params.append('search', search);
      if (selectedCameras.length)
        params.append('_id', selectedCameras.join(','));
      if (selectedDepartment.length)
        params.append('department', selectedDepartment.join(','));
      if (selectedLocation.length)
        params.append('location', selectedLocation.join(','));

      const camTypeValues = selectedcameratype.map((item) => item.id);

      if (camTypeValues.length) {
        params.append('camType', selectedcameratype);
      }

      const res = await axios.get(
        `${HOST}/api/v1/channel/all-channels?${params}`,
        {
          headers: { 'x-access-token': getAccessToken() },
        }
      );

      const { channels = [] } = res.data?.body?.data || [];
      setAllChannels(channels);

      //Format all channels for camera dropdown
      const allCameraOptions = channels.map((ch, i) => {
        const { ip, rtspPort, username, password, _id: NvrId } = ch.nvrId || {};
        const { customName, name, channelId, rtspChannels, _id, streamingUrl } =
          ch;
        const rtspChannel = rtspChannels?.[1]?.id;
        const displayName = customName || name;

        return {
          label: displayName,
          id: _id,
        };
      });
      setFormattedCameraOptions(allCameraOptions);
    } catch (err) {
      console.error('All Channels fetch failed:', err);
      setAllChannels([]);
      setFormattedCameraOptions([]);
    }
  };

  const fetchInitialCameras = async (
    currentPage,
    itemsPerPage,
    search = '',
    selectedCameras = [],
    selectedDepartment = [],
    selectedLocation = []
  ) => {
    try {
      setLoading(true);
      const filterData = {
        departmentIds: selectedDepartment,
        selectedLocations: selectedLocation,
        channelsIds: selectedCameras,
      };
      // Load NVRs if not loaded
      // if (allNVRs.length === 0) {
      const nvrRes = await axios.post(
        `${HOST}/api/v1/authorizedChannels/getNVRS`,
        filterData,
        {
          headers: { 'x-access-token': getAccessToken() },
        }
      );
      const nvrs = nvrRes.data?.body?.data || [];
      const formattedNvrs = nvrs.map((nvr) => ({
        id: nvr._id,
        label: nvr.nvrName,
      }));
      setAllNVRs(formattedNvrs);

      if (nvrIdFromNvr && !hasUsedNvrFromNav) {
        setSelectedNVRId([nvrIdFromNvr]);
        setHasUsedNvrFromNav(true);
      }
      // else if (formattedNvrs.length && selectedNVRId.length === 0) {
      //   setSelectedNVRId([formattedNvrs[0].id]);
      // }
      // }

      const activeNvrId =
        hasUsedNvrFromNav || !nvrIdFromNvr ? selectedNVRId : nvrIdFromNvr;
      if (!activeNvrId) return;

      const params = new URLSearchParams({
        nvrId: activeNvrId.toString(),
        skip: ((currentPage - 1) * itemsPerPage).toString(),
        limit: itemsPerPage.toString(),
      });

      const camTypeValues = selectedcameratype.map((item) => item.id);

      if (camTypeValues.length) {
        params.append('camType', selectedcameratype);
      }

      if (search) params.append('search', search);
      if (selectedCameras.length)
        params.append('_id', selectedCameras.join(','));
      if (selectedDepartment.length)
        params.append('department', selectedDepartment.join(','));
      if (selectedLocation.length)
        params.append('location', selectedLocation.join(','));

      const res = await axios.get(`${HOST}/api/v1/channel?${params}`, {
        headers: { 'x-access-token': getAccessToken() },
      });

      const { channels = [], total = 0 } = res.data?.body?.data || {};
      setTotalChannels(channels);
      setTotalItems(total);

      await fetchAllChannels(
        search,
        selectedCameras,
        selectedDepartment,
        selectedLocation
      );

      const streamConfigs = channels.map((ch) => {
        const { ip, rtspPort, username, password, _id: NvrId } = ch.nvrId;
        const { customName, name, channelId, rtspChannels, _id, streamingUrl } =
          ch;
        const rtspChannel = rtspChannels?.[1]?.id;
        const displayName = customName || name;

        return {
          label: displayName,
          name: displayName,
          value: _id,
          config: {
            IP: ip,
            Port: rtspPort,
            Username: username,
            Password: password,
            ChannelId: channelId,
            RtspChannel: rtspChannel,
            StreamingUrl: streamingUrl,
            cameraId: _id,
            NvrId,
          },
        };
      });

      setCameraData(streamConfigs);
      // setFormattedCameraOptions(
      //   streamConfigs.map((cam, i) => ({
      //     label: cam.label || `Camera ${i + 1}`,
      //     value: cam.value || `camera-${i}`,
      //   }))
      // );
    } catch (err) {
      console.error('Camera fetch failed:', err);
      setCameraData([]);
      setTotalItems(0);
    } finally {
      setTimeout(() => setLoading(false), 1000);
    }
  };

  // 2 Filters & Pagination

  useEffect(() => {
    fetchInitialCameras(
      currentPage,
      itemsPerPage,
      appliedSearch,
      (selectedCameras || []).filter(Boolean),
      selectedDepartment,
      selectedLocation
    );
  }, [
    currentPage,
    itemsPerPage,
    appliedSearch,
    selectedCameras,
    selectedDepartment,
    selectedLocation,
    selectedNVRId,
    selectedcameratype,
  ]);

  // 3 Debounced Search
  useEffect(() => {
    if (allNVRs.length === 0) return;

    const trimmed = searchQuery.trim();

    const handler = setTimeout(() => {
      setAppliedSearch(trimmed); // triggers page reset → API
    }, 600);

    return () => clearTimeout(handler);
  }, [searchQuery]);

  // === HANDLERS ===
  const handlePageChange = (page) => setCurrentPage(page);

  const handleSelectGrid = (id) => {
    const grid = gridOptions.find((g) => g.id === id);

    if (grid) {
      setSelectedGrid(id);
      setItemsPerPage(grid.perPage);
      setCurrentPage(1);
    }
  };

    useEffect(() => {
    localStorage.setItem("selectedGrid", String(selectedGrid));
  }, [selectedGrid]);

  useEffect(() => {
  const grid = gridOptions.find((g) => g.id === selectedGrid);

  if (grid) {
    setItemsPerPage(grid.perPage);
  }
}, [selectedGrid, gridOptions]);


  const handleSearchSubmit = () => {
    // Update applied search state for pagination
    setAppliedSearch(searchQuery);

    // Reset to first page and fetch cameras immediately
    setCurrentPage(1);
  };

  useEffect(() => {
    const locationsChanged =
      JSON.stringify(prevLocation) !== JSON.stringify(selectedLocation);

    if (locationsChanged) {
      setSelectedDepartment([]);
      setSelectedNVRId([]);
      setSelectedCameras([]);
      fetchDepartments(selectedLocation);
    }

    setPrevLocation(selectedLocation);
  }, [selectedLocation]);

  const cameraTypeOptions = [
    { id: 'checkin', label: 'Check In' },
    { id: 'checkout', label: 'Check Out' },
  ];

  const isSpecialCase = (cameraData?.length || 0) <= 3;

  // === JSX ===
  return (
    <div
      className={
        isSpecialCase
          ? 'h-screen flex flex-col overflow-hidden bg-gray-50'
          : 'min-h-screen bg-gray-50 pb-8 flex flex-col'
      }
    >
      {/* BACK BUTTON */}
      {fromNvrSettings && (
        <div className="pb-4 sticky z-20">
          <button
            className="group flex items-center cursor-pointer transition-all duration-200"
            onClick={() => navigate('/nvr-settings')}
          >
            <div className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 md:w-12 md:h-12 rounded-full bg-white/30 backdrop-blur-sm border border-white/30 shadow-sm mr-1.5 sm:mr-2">
              <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-[#333333] group-hover:text-[#07486A]" />
            </div>
            <span className="text-[12px] sm:text-[14px] md:text-[18px] font-[400] text-[#333333] bg-white backdrop-blur-sm px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg group-hover:text-[#07486A]">
              Go Back to NVR Settings
            </span>
          </button>
        </div>
      )}

      <div
        className={
          isSpecialCase
            ? 'p-4 md:p-5 bg-white rounded-[16px] shadow-md flex-1 flex flex-col min-h-0 overflow-hidden'
            : 'p-4 md:p-8 bg-white rounded-[16px] shadow-md'
        }
      >
        {/* HEADER + GRID */}
        <div className="flex justify-between pb-4 border-b border-[#dbdbdb] md:items-center md:flex-row flex-col gap-6">
          <h2 className="md:text-2xl text-xl text-[#333333] font-medium mb-1">
            Live CCTV Streams
          </h2>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="h-10 shadow-none min-h-[45px] px-5 bg-white rounded-[10px] border border-[#c7c7c7] flex items-center justify-between min-w-[200px]"
              >
                <div className="flex items-center justify-between w-full">
                  <img src={mynaui_grid} className="w-5 h-5 mr-2" alt="Grid" />
                  <span className="truncate font-[500] text-[#5D5D5D]">
                    Select View Grid
                  </span>
                  <RiArrowDownSLine className="w-[15px] h-[16px] text-[#5D5D5D]" />
                </div>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="border border-[#C7C7C7] bg-white shadow-lg flex flex-col items-center w-auto"
              side="bottom"
            >
              <div className="mb-2 font-[400] text-center text-[#595959] text-xs md:text-sm w-full">
                Normal Split
              </div>
              <div className="flex flex-row gap-2 md:gap-3 mb-2 justify-center">
                {gridOptions.map((grid) => (
                  <Button
                    key={grid.id}
                    variant="outline"
                    onClick={() => handleSelectGrid(grid.id)}
                    className={`border-none p-0 ${selectedGrid === grid.id ? 'ring-2 ring-[#07486A] scale-105 shadow-lg' : 'hover:ring-2 hover:ring-[#a3a3a3] hover:scale-105'}`}
                  >
                    <img
                      src={grid.icon}
                      alt={grid.label}
                      className="w-full h-full"
                    />
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* FILTERS */}
        <div className="flex flex-wrap items-center gap-3 pt-4 rounded-lg">
          {/* Search */}
          <div className="relative w-full md:max-w-[240px]">
            <Input
              type="text"
              placeholder="Search cameras"
              className="h-10 text-sm rounded-lg border border-[#C7C7C7] shadow-none"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearchSubmit();
                }
              }}
            />
            <Search className="absolute right-3 cursor-pointer top-1/2 -translate-y-1/2 w-4 h-4 text-[#595959]" />
            {showSuggestions && searchSuggestions.length > 0 && (
              <div className="absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
                {searchSuggestions.map((s) => (
                  <div
                    key={s.value}
                    className="px-4 py-2 cursor-pointer hover:bg-gray-100"
                    onMouseDown={() => {
                      setSearchQuery(s.label);
                      handleSearchSubmit();
                    }}
                  >
                    {s.label}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Location */}
          <MultiSelect
            options={locations}
            value={selectedLocation}
            onChange={setSelectedLocation}
            placeholder="Select Location"
            searchable={true}
            searchPlaceholder="Search Locations..."
            className="w-full md:w-52"
            maxHeight="max-h-48"
            type="location"
          />

          {/* NVR */}
          <MultiSelect
            options={allNVRs}
            value={selectedNVRId}
            onChange={setSelectedNVRId}
            placeholder="Select NVR"
            searchable={true}
            searchPlaceholder="Search NVRs..."
            className="w-full md:w-52"
            maxHeight="max-h-48"
          />

          {/* Cameras */}
          <MultiSelect
            options={formattedCameraOptions}
            value={selectedCameras}
            onChange={setSelectedCameras}
            placeholder="Select Cameras"
            searchable={true}
            searchPlaceholder="Search Cameras..."
            className="w-full md:w-52"
            maxHeight="max-h-48"
          />
          {/* Department */}
          <MultiSelect
            options={departments}
            value={selectedDepartment}
            onChange={setSelectedDepartment}
            placeholder="Select Department"
            searchable={true}
            searchPlaceholder="Search Departments..."
            className="w-full md:w-52"
            maxHeight="max-h-48"
          />

          <MultiSelect
            options={cameraTypeOptions}
            value={selectedcameratype}
            onChange={setselectedcameratype}
            placeholder="Select Camera Type"
            searchable={true}
            searchPlaceholder="Search CameraType..."
            className="w-full md:w-52"
            maxHeight="max-h-48"
          />

          {/* Grid View Button */}
          <Button
            variant="outline"
            onClick={() => setIsGridViewOpen(true)}
            className="h-10 px-3 rounded-lg border border-[#C7C7C7] shadow-none flex items-center justify-center hover:bg-gray-50 ml-auto"
            title="Grid View"
          >
            <Maximize2 className="w-5 h-5 text-[#5D5D5D]" />
          </Button>
        </div>

        {/* CAMERA GRID */}
        <div
          className={
            isSpecialCase ? 'mt-5 flex-1 min-h-0 overflow-hidden' : 'mt-5'
          }
        >
          {loading ? (
            <CameraviewSkeleton
              selectedGrid={selectedGrid}
              itemsPerPage={itemsPerPage}
            />
          ) : cameraData.length === 0 ? (
            <div className="text-center text-gray-500 py-10 text-lg font-medium">
              No cameras available.
            </div>
          ) : (
            <CameraTwo
              selectedVideo={selectedVideo}
              setSelectedVideo={setSelectedVideo}
              currentPage={currentPage}
              cameraData={cameraData}
              selectedGrid={selectedGrid}
              cameraChannels={allChannels}
              // streamModalShow={streamModalShow}
              // setStreamModalShow={setStreamModalShow}
            />
          )}
        </div>

        {/* PAGINATION */}
        {cameraData.length === 0 ? (
          ''
        ) : (
          <div className="mt-8">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />
          </div>
        )}
      </div>

      <GridViewModal
        isOpen={isGridViewOpen}
        onOpenChange={setIsGridViewOpen}
        cameraData={cameraData}
        selectedVideo={selectedVideo}
        setSelectedVideo={setSelectedVideo}
        cameraChannels={allChannels}
        selectedGrid={selectedGrid}
        gridOptions={gridOptions}
        selectedDepartment={selectedDepartment}
        selectedCameras={selectedCameras}
      />
    </div>
  );
}
