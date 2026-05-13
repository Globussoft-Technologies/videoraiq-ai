import React, { useContext, useEffect, useRef, useState } from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Circle,
  Package,
} from 'lucide-react';

import StatCards from './StatCards';
import RecentAlerts from './RecentAlerts';
import AccessLog from './AccessLog';
import EmployeesOnDuty from './EmployeesOnDuty';
import UserContext from '@/context/UserContext/Context';
import { Checkbox } from '@/components/ui/checkbox';
import { BsFillBoxSeamFill } from 'react-icons/bs';
import AlertGauge from './AlertGauge';
import ActivityChart from './ActivityChart';
import { MdDoNotStep } from 'react-icons/md';
import { IoIosPeople } from 'react-icons/io';
import { TbArrowsCross } from 'react-icons/tb';
import people from '@/assets/Peoplesvg.svg';
import { FaRunning } from 'react-icons/fa';
import unAuthorizedAccessImage from '@/assets/unauthorizedAccess.svg';
import { getFiltersNvrNames, getCamerasBasedOnNvr } from './Api/get';
import CameraStream from '../Streams/CameraPlay/CameraStream';
import getAccessToken from '@/utils/getAccessToken';
import { useAuth } from '@/context/AuthContext';
import { getDepartments } from './Api/get';
import { getLocations } from './Api/get';
import 'react-loading-skeleton/dist/skeleton.css';
import MultiSelect from '@/components/ui/multiselect';
import Skeleton from 'react-loading-skeleton';

import { OBJECT_ICONS } from '../Streams/CameraStreamsModal/StreamModal';
import FireAlert from './Alertwidgets/alert';
import VideoCanvasStream from './VideoCanvasStream';
import { useAllDetections } from '@/context/Sockets/AllDetectionContext';
import { useDashboardFiltersContext } from '@/context/UserContext/DashboardFiltersContext';
import { usePermissions } from '@/context/Permission/PermissionContext';
import AccessDenied from '@/components/AccessDenied';
import PageLoader from '@/components/PageLoader';
// import { id } from 'date-fns/locale';
// import { a } from 'dist/assets/index-Dzkv6Rwb';
const Dashboard = () => {
  const { permissions, loading: permissionsLoading } = usePermissions();
  const canView = permissions?.dashboard?.view;
  const canEdit = permissions?.dashboard?.edit;
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const wsRef = useRef(null);
  const controlSocketRef = useRef(null);
  const [nvrList, setNvrList] = useState([]);
  const [selectedNvrId, setSelectedNvrId] = useState([]);
  const [cameraChannels, setCameraChannels] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [selectedNvrDetails, setSelectedNvrDetails] = useState(null);
  const [selectedConfig, setSelectedConfig] = useState(null);
  const [nvrNameLoading, setNvrNameLoading] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [showScrollButtons, setShowScrollButtons] = useState(false);
  const [streamModalShow, setStreamModalShow] = useState(false);
  const [prevLocation, setPrevLocation] = useState([]);
  const socket_Url = import.meta.env.VITE_SOCKET_URL;
  const { sidebarShow, setSidebarShow, switchOn, setSwitchOn } =
    useContext(UserContext);
  // We use this to determine layout in the UI - if exactly one toggle is on, we show a different layout
  const [layoutType, setLayoutType] = useState('default');
  const [isAccessLogVisible, setIsAccessLogVisible] = useState(true);
  const [selectedcameratype, setselectedcameratype] = useState([]);
  const [showDenied, setShowDenied] = useState(false);
  const userDetails = useAuth();
  const { allDetections } = useAllDetections();
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
  const cameraTypeOptions = [
    { id: 'checkin', label: 'Check In' },
    { id: 'checkout', label: 'Check Out' },
  ];
  // get detections only for selectedCamera
  const selectedCameraDetections = Array.isArray(allDetections)
    ? allDetections.filter((det) => det.cameraId === selectedCamera)
    : [];

  useEffect(() => {
    setSelectedDepartment([]);
    setSelectedLocation([]);
  }, []);

  useEffect(() => {
    const locationsChanged =
      JSON.stringify(prevLocation) !== JSON.stringify(selectedLocation);

    if (locationsChanged) {
      setSelectedDepartment([]);
      setSelectedNvrId([]);
      fetchDepartments(selectedLocation);
    }
    setPrevLocation(selectedLocation);
  }, [selectedLocation]);

  // keep only the latest detection event (per type if you want)
  // Group detections by incidentType, keep the latest one for each type
  const latestForSelectedCamera = Object.values(
    selectedCameraDetections.reduce((acc, det) => {
      if (
        !acc[det.incidentType] ||
        new Date(det.timestamp) > new Date(acc[det.incidentType].timestamp)
      ) {
        acc[det.incidentType] = det;
      }
      return acc;
    }, {})
  );

  const channelScrollRef = useRef(null);
  const [streamUrl, setStreamUrl] = useState(null);
  // Helper to get RTSP substream or mainstream
  const getRtspChannel = (channel) => {
    const rtspChannels = channel.rtspChannels || [];

    if (rtspChannels.length === 2) {
      return rtspChannels[1]?.id || null; // Prefer substream
    }

    if (rtspChannels.length === 1) {
      return rtspChannels[0]?.id || null; // Use main stream if substream not available
    }

    return null;
  };

  // Get camera config with correct NVR details
  const getConfig = (channel) => {
    if (!selectedNvrDetails) return null;
    return {
      IP: selectedNvrDetails?.ip,
      Port: selectedNvrDetails?.rtspPort,
      Username: selectedNvrDetails?.username,
      Password: selectedNvrDetails?.password,
      ChannelId: channel?.channelId,
      RtspChannel: getRtspChannel(channel),
      Resolution: '1280x720',
      StreamingUrl: channel?.streamingUrl || '',
      cameraId: channel._id,
    };
  };
  // Initialize WebSocket connection

  // getting nvr names

  useEffect(() => {
    const fetchNvrNames = async () => {
      setNvrNameLoading(true);
      const data = {
        selectedLocations: selectedLocation,
        departmentIds: selectedDepartment,
      };
      try {
        const response = await getFiltersNvrNames(data);
        if (response.statusCode === 200) {
          const nvrs = response.body.data;
          let formattedNvrs = nvrs.map((nvr) => ({
            id: nvr._id,
            label: nvr.nvrName,
          }));
          setNvrList(formattedNvrs);
          //    if (formattedNvrs.length > 0) {
          //    const firstNvrId = formattedNvrs[0].id;
          //    setSelectedNvrId([firstNvrId]);
          //    await getCamerasBasedOnNvrData(firstNvrId);
          // }
        } else {
          console.log('No NVRs found');
        }
      } catch (error) {
        console.error('Error fetching NVR names:', error);
      } finally {
        setNvrNameLoading(false);
      }
    };

    fetchNvrNames();
  }, [selectedLocation, selectedDepartment]);

  // refetching departments and locations

  useEffect(() => {
    if (selectedNvrId) {
      const data = {
        nvrIds: selectedNvrId,
      };
      // fetchLocations(data)
      fetchDepartments(data);
    }
  }, [selectedNvrId]);

  const handleNvrChange = async (selectedId) => {
    setSelectedNvrId(selectedId);
    getCamerasBasedOnNvrData(selectedId);
  };

  // getting cameras based on nvr

  const getCamerasBasedOnNvrData = async (
    nvrId,
    selectedDepartment,
    selectedLocation
  ) => {
    let cameraTypeToSend = selectedcameratype;

    // 🔁 Reverse logic: if both values → send "both"
    if (
      Array.isArray(selectedcameratype) &&
      selectedcameratype.includes("checkin") &&
      selectedcameratype.includes("checkout")
    ) {
      cameraTypeToSend = "checkin,checkout";
    }

    const response = await getCamerasBasedOnNvr(
      nvrId,
      selectedDepartment,
      selectedLocation,
      0,
      50,
      cameraTypeToSend
    );
    if (response && response.statusCode === 200) {
      const { channels } = response.body.data;
      const nvrData = response.body.data.channels.map((nvr) => nvr.nvrId);
      setCameraChannels(channels);
      setSelectedNvrDetails(nvrData);
    }
  };
  useEffect(() => {
    // const timeout = setTimeout(() => {
    if (nvrList.length > 0 && selectedNvrId)
      getCamerasBasedOnNvrData(
        selectedNvrId,
        selectedDepartment,
        selectedLocation
      );
    // }, 300);

    // return () => clearTimeout(timeout);
  }, [
    selectedDepartment,
    selectedLocation,
    nvrList,
    selectedNvrId,
    selectedcameratype,
  ]);

  // Auto-select first camera when cameraChannels change
  useEffect(() => {
    if (cameraChannels.length > 0) {
      handleCameraClick(cameraChannels[0]);
    }
  }, [cameraChannels]);

  const handleCameraClick = (channel) => {
    const config = getConfig(channel);
    if (!config || !config?.StreamingUrl) {
      console.error('No streaming URL available for this channel.');
      return;
    }
    setSelectedCamera(channel._id);
    setStreamUrl([config?.StreamingUrl]);
    setSelectedConfig(config);
  };

  const scrollChannels = (direction) => {
    const container = channelScrollRef.current;
    if (!container) return;
    const scrollAmount = 120;
    if (direction === 'left') {
      container.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    } else {
      container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };
  useEffect(() => {
    const checkOverflow = () => {
      const container = channelScrollRef.current;
      if (container) {
        setShowScrollButtons(container.scrollWidth > container.clientWidth);
      }
    };

    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [cameraChannels]);
  useEffect(() => {
    if (Array.isArray(switchOn) && switchOn.length > 0) {
      setLayoutType(switchOn.length >= 5 ? 'grid' : 'default');
    } else {
      setLayoutType('default');
    }
  }, [switchOn]);

  useEffect(() => {
    if (!canView) {
      const timer = setTimeout(() => {
        setShowDenied(true);
      }, 2000); // wait 2 seconds

      return () => clearTimeout(timer);
    } else {
      setShowDenied(false);
    }
  }, [canView]);

  if (permissionsLoading) return <PageLoader />;
  if (!canView) {
    return showDenied ? (
      <AccessDenied message="You don't have permission to view Dashboard." />
    ) : (
      <div></div> // loader / placeholder
    );
  }
  // Detection data preparation
  // Convert detections into dashboard cards
  const detectionData = latestForSelectedCamera
    .map((det) => {
      switch (det.incidentType) {
        case 'countPersons':
          return {
            icon: <IoIosPeople className="w-5 h-5 text-[#07486A]" />,
            label: 'People Detected',
            value: det.count || '--',
            show: det.count > 0,
          };
        case 'genericObjectDetection':
          return {
            icon: <BsFillBoxSeamFill className="w-5 h-5 text-[#07486A]" />,
            label: 'Objects Detected',
            value: det.objectsDetected
              ? det.objectsDetected.reduce(
                (total, obj) =>
                  total + Object.values(obj).reduce((s, v) => s + v, 0),
                0
              )
              : '--',
            show:
              Array.isArray(det.objectsDetected) &&
              det.objectsDetected.length > 0,
          };
        case 'lineCrossing':
          return {
            icon: <MdDoNotStep className="w-5 h-5 text-[#07486A]" />,
            label: 'Line Crossing',
            value:
              (det.atoB > 0 ? `Entry: ${det.atoB}` : '') +
              (det.btoA > 0 ? ` Exit: ${det.btoA}` : '') || '--',
            show: det.atoB > 0 || det.btoA > 0,
          };
        case 'motionDetection':
          return {
            icon: <FaRunning className="w-5 h-5 text-[#07486A]" />,
            label: 'Motion Detected',
            value: det.motion ? 'Motion' : '--',
            show: !!det.motion,
          };
        case 'unauthorizedAccess':
          return {
            icon: (
              <img
                src={unAuthorizedAccessImage}
                alt="Unauthorized Access"
                className="w-5 h-5 text-[#07486A]"
              />
            ),
            label: 'Unauthorized Access',
            value: det.unknownCount || '--',
            show: det.unknownCount > 0,
          };
        default:
          return null;
      }
    })
    .filter(Boolean);

  const hasDetectionData = detectionData.some((d) => d.show);

  // Detection Card Component
  const DetectionCard = ({ icon, label, value }) => {
    return (
      <div className="flex gap-3 sm:gap-[12px] items-center min-w-0">
        <div className="flex-shrink-0 2xl:h-12 2xl:w-12 h-10 w-10 rounded-full flex justify-center items-center bg-[#e5f6ff]">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="font-medium 2xl:text-[14px] text-xs text-[#333333]">
            {value}
          </p>
          <p className="font-normal 2xl:text-[12px] text-[10px] pt-1 text-[#7a7a7a]">
            {label}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full rounded-[18px] bg-white">
      <div className="py-[16px] xl:py-[20px] 2xl:py-[24px] px-[18px] xl:px-[24px] 2xl:px-[32px] overflow-hidden">
        {/* Welcome header */}
        {/* <p className="text-sm text-gray-500 font-normal md:text-[17px]">
          Dashboard
        </p> */}
        <div className="flex flex-col gap-4 mt-2 mb-5 md:flex-row md:justify-between md:items-start">
          <h1 className="text-lg xl:text-lg 2xl:text-2xl font-[500] text-gray-800 flex-shrink-0">
            {/* Hey,
            {userDetails?.user?.name_f
              ? userDetails.user.name_f.charAt(0).toUpperCase() +
                userDetails.user.name_f.slice(1)
              : 'User'} */}
          </h1>
          <div className="flex flex-col gap-2 rounded-[10px] w-full md:flex-row md:flex-wrap md:gap-3 md:w-auto xl:max-w-none">
            <MultiSelect
              options={locations || []}
              value={selectedLocation || []}
              onChange={setSelectedLocation}
              placeholder="Select Location"
              searchable={true}
              searchPlaceholder="Search locations..."
              className="w-full md:w-46 lg:w-56 xl:w-64 2xl:w-72 flex-shrink-0"
              maxHeight="max-h-48"
              type="location"
            />
            <MultiSelect
              options={nvrList}
              value={selectedNvrId}
              onChange={setSelectedNvrId}
              placeholder="Select NVR"
              searchPlaceholder="Search NVR..."
              searchable={true}
              className="w-full md:w-46 lg:w-56 xl:w-64 2xl:w-72 flex-shrink-0"
              maxHeight="max-h-48"
            />
            <MultiSelect
              options={departments || []}
              value={selectedDepartment || []}
              onChange={setSelectedDepartment}
              placeholder="Select Department"
              searchable={true}
              searchPlaceholder="Search Departments"
              className="w-full md:w-46 lg:w-56 xl:w-64 2xl:w-72 flex-shrink-0"
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
            {/* <Select value={selectedLocation} onValueChange={setSelectedLocation}>
              <SelectTrigger className="w-full md:w-40 text-xs border border-gray-300 rounded-lg">
                <SelectValue placeholder="Select Location" />
              </SelectTrigger>
              <SelectContent>
                {locations ? locations.map((location,index) => (
                  <SelectItem key={index} value={location}>
                    {location}
                  </SelectItem>
                )) : (
                  <SelectItem disabled>No locations</SelectItem>
                )}
              </SelectContent>
            </Select> */}
            {/* <select
           value={selectedNvrId || (nvrList[0]?._id ?? '')}
           onChange={(e) => setSelectedNvrId(e.target.value)}
           className="text-xs text-gray-700 border border-gray-300 rounded-lg px-2 py-1.5 w-36 bg-white focus:outline-none focus:ring-0 focus:border-gray-400"
           >
           {nvrList.map((nvr) => (
           <option key={nvr._id} value={nvr._id}>
           {nvr.nvrName}
          </option>
          ))}
         </select> */}
          </div>
        </div>
        {/* Stats cards */}
        <div className="mt-4 xl:mt-5 2xl:mt-6">
          <StatCards
            dashboardTitles={'dashboardTittles'}
            nvrId={selectedNvrId}
            channelId={selectedCamera}
            location={selectedLocation}
            department={selectedDepartment}
          />
        </div>
        {/* Conditional layout based on detections */}{' '}
        <div className="grid grid-cols-1 lg:grid-cols-9 gap-2 mt-[18px]">
          <div
            className={
              Array.isArray(switchOn) && switchOn.length === 1
                ? 'lg:col-span-3 grid gap-2 grid-cols-1 md:grid-cols-6'
                : 'lg:col-span-6 grid gap-2 grid-cols-1 md:grid-cols-6'
            }
          >
            <div
              className={
                Array.isArray(switchOn) && switchOn.length === 1
                  ? 'col-span-1 md:col-span-6'
                  : 'col-span-1 md:col-span-3'
              }
            >
              <div className="bg-[#fafafa]  rounded-[10px] p-2 md:p-4 w-full h-full">
                {/* Header with NVR selector */}
                {/* <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    {nvrNameLoading ? (
                      <div className="relative w-full">
                        <Skeleton
                          baseColor="#e5e7eb"
                          highlightColor="#f9fafb"
                          width={150}
                          borderRadius={5}
                          height={20}
                        />
                      </div>
                    ) : nvrList.length > 1 ? (
                      <Select
                        value={selectedNvrId}
                        onValueChange={handleNvrChange}
                      >
                        <SelectTrigger className="text-xs md:text-sm text-gray-700 border border-gray-300 rounded-md px-2 md:px-3 py-1 md:py-2 w-full">
                          <SelectValue placeholder="Select NVR" className="text-xs md:text-sm" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#C8C8C8]">
                          {nvrList.map((nvr) => (
                            <SelectItem key={nvr._id} value={nvr._id} className="text-xs md:text-sm">
                              {nvr.nvrName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs text-gray-700"></span>
                    )}
                  </div>
                  <span className="ml-3 md:ml-4 2xl:ml-5 text-gray-500 whitespace-nowrap">
                    {new Date().toLocaleString()}
                  </span>
                </div> */}

                {/* Camera tabs */}
                <div className="bg-white py-1.5 rounded-[10px] border border-[#EEEEEE] px-3">
                  {cameraChannels.length > 0 && selectedNvrDetails ? (
                    <div className="flex items-center mb-1.5 mt-2 gap-2">
                      {showScrollButtons && (
                        <button
                          type="button"
                          className="bg-white cursor-pointer border border-gray-300 rounded-full p-1 shadow hover:bg-gray-100 disabled:opacity-30 mr-2"
                          onClick={() => scrollChannels('left')}
                          tabIndex={-1}
                        >
                          <ChevronLeftIcon className="w-3 h-3" />
                        </button>
                      )}
                      <div
                        ref={channelScrollRef}
                        className="flex space-x-2 customscrollbar overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent  py-1"
                      >
                        {cameraChannels.map((channel) => {
                          // const rtspChannels = channel.rtspChannels || [];
                          // const streamToDisplay =
                          //   rtspChannels.length === 2
                          //     ? rtspChannels[1]
                          //     : rtspChannels[0];
                          // if (!streamToDisplay || !channel.name) return null;
                          const isSelected = selectedCamera === channel._id;
                          return (
                            <button
                              key={channel._id}
                              onClick={() => handleCameraClick(channel)}
                              className={` text-[10px] font-[400] text-[#595959] px-3 cursor-pointer py-1 rounded-[5px] transition-colors duration-150 whitespace-nowrap ${
                                isSelected
                                  ? 'bg-[#07486a] text-white border border-[#C8C8C8]/10'
                                  : 'bg-white border border-[#C8C8C8] text-[#595959] hover:bg-gray-200'
                                }`}
                            >
                              {channel.customName || channel.name}
                            </button>
                          );
                        })}
                      </div>
                      {showScrollButtons && (
                        <button
                          type="button"
                          className="bg-white border cursor-pointer border-gray-300 rounded-full p-1 shadow hover:bg-gray-100 disabled:opacity-30 ml-2"
                          onClick={() => scrollChannels('right')}
                          tabIndex={-1}
                        >
                          <ChevronRightIcon className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ) : cameraChannels.length === 0 && selectedNvrDetails ? (
                    <div className="flex items-center justify-center py-3 text-sm text-gray-500"></div>
                  ) : (
                    <div className="flex items-center 2xl:mb-3 mb-0 gap-2 w-full">
                      <div className="flex-1 min-w-0 flex customscrollbar space-x-2 overflow-x-auto px-2 py-1">
                        {[...Array(4)].map((_, i) => (
                          <Skeleton
                            key={`channel-skel-${i}`}
                            width={80}
                            height={32}
                            borderRadius={8}
                            baseColor="#f3f4f6"
                            highlightColor="#ffffff"
                            className="flex-shrink-0"
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Image section */}

                  <div
                    className={`relative sm:rounded-lg overflow-hidden mb-3 sm:mb-4 w-full ${
                      Array.isArray(switchOn) && switchOn.length === 1
                        ? 'aspect-video'
                        : 'aspect-[4/3] sm:aspect-video'
                      }`}
                  >
                    {cameraChannels.length === 0 ? (
                      <div className="flex items-center justify-center w-full h-full text-gray-500 text-sm bg-gray-50 rounded-lg">
                        No Cameras Available
                      </div>
                    ) : selectedConfig ? (
                      <VideoCanvasStream
                        config={selectedConfig}
                        cameraChannels={cameraChannels}
                        cameraId={selectedConfig?.cameraId}
                        hlsUrl={streamUrl}
                        maxminBtnclass="absolute top-[8px] md:top-[12px] right-1.5 sm:right-2 bg-[#3f3f3f] backdrop-blur-[106.64466094970703px] text-white w-[24px] h-[24px] md:w-[29px] md:h-[29px] rounded-full flex justify-center items-center"
                        maxsize="text-xs md:text-sm "
                        minsize="text-xs md:text-sm "
                        selectedVideo={selectedConfig}
                        setSelectedVideo={setSelectedVideo}
                        hideconnection="true"
                        polygonPoints={selectedCameraDetections}
                        streamModalShow={streamModalShow}
                        setStreamModalShow={setStreamModalShow}
                      // zoneName={zoneName}
                      />
                    ) : (
                      <Skeleton className="w-full h-full" borderRadius={10} />
                    )}
                    <span className="absolute bottom-2 right-2 bg-[#3F3F3F] text-white px-1.5 py-1 font-semibold text-[9px] rounded-[7px] flex items-center gap-1">
                      <span className="flex items-center justify-center w-full h-full gap-1">
                        <span className="flex items-center mt-0.5">Live</span>
                        <Circle
                          fill="#39C90D"
                          className="w-2 h-2 2xl:w-4 2xl:h-4 flex-shrink-0"
                        />
                      </span>
                    </span>
                  </div>
                </div>

                {/* Detection info */}

                <div className="grid grid-cols-2 text-[10px] 2xl:text-sm translate-x-5 gap-5 p-5">
                  {hasDetectionData ? (
                    detectionData
                      .filter((detection) => detection.show)
                      .map((detection, index) => (
                        <DetectionCard
                          key={index}
                          icon={detection.icon}
                          label={detection.label}
                          value={detection.value}
                        />
                      ))
                  ) : (
                    <div className="col-span-2 mr-4 flex items-center justify-center h-24">
                      <p className="font-[400] md:text-xs 2xl:text-sm text-[#676767]">
                        No Detections Found
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {/* Only show AlertGauge if we don't have exactly 1 toggle enabled or we're in default layout mode */}
            {(!Array.isArray(switchOn) || switchOn.length !== 1) && (
              <div className="col-span-1 md:col-span-3 grid">
                <AlertGauge
                  value={82}
                  nvrId={selectedNvrId}
                  department={selectedDepartment}
                  location={selectedLocation}
                />
              </div>
            )}
          </div>

          {/* If exactly one detection is on, display FireAlert to the right of the stream */}
          {Array.isArray(switchOn) && switchOn.length === 1 ? (
            <div className="lg:col-span-6">
              <FireAlert switchOn={switchOn} />
            </div>
          ) : (
            <div className="lg:col-span-3 grid">
              <ActivityChart
                nvrId={selectedNvrId}
                department={selectedDepartment}
                location={selectedLocation}
              />
            </div>
          )}
        </div>
        {/* Show AlertGauge and ActivityChart below when exactly one detection is on */}
        {Array.isArray(switchOn) && switchOn.length === 1 && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-[12px] mt-[18px]">
            <div>
              <AlertGauge
                value={82}
                nvrId={selectedNvrId}
                department={selectedDepartment}
                location={selectedLocation}
              />
            </div>
            <div className="xl:col-span-2">
              <ActivityChart
                nvrId={selectedNvrId}
                department={selectedDepartment}
                location={selectedLocation}
              />
            </div>
          </div>
        )}
        {/* Only render FireAlert below when NOT exactly one toggle is enabled */}
        {Array.isArray(switchOn) && switchOn.length !== 1 && (
          <div className="mt-2">
            <div className="grid grid-cols-1 gap-4">
              <FireAlert switchOn={switchOn} />
            </div>
          </div>
        )}
        {/* Access log and employees on duty */}
        <div className="grid grid-cols-1 2xl:grid-cols-9 xl:grid-cols-11 gap-3 mt-2 ">
          <div className={isAccessLogVisible ? 'contents' : 'hidden'}>
            <AccessLog onVisibilityChange={setIsAccessLogVisible} />
          </div>
          <div
            className={
              isAccessLogVisible
                ? '2xl:col-span-3 xl:col-span-4 col-span-12'
                : '2xl:col-span-9 xl:col-span-11 col-span-12'
            }
          >
            <EmployeesOnDuty
              canEdit={canEdit}
              isAccessLogVisible={isAccessLogVisible}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
