import React, { useEffect, useRef, useState, useMemo,useCallback } from 'react';
import { Minimize2, XIcon } from 'lucide-react';

import CameraCanvasModal from './CameraCanvasModal';
import {
  FaChevronLeft,
  FaChevronRight,
  FaTrafficLight,
  FaTv,
} from 'react-icons/fa';
// import { useDetection } from '@/context/Sockets/DetectionContext';
import { useAllDetections } from '@/context/Sockets/AllDetectionContext';
// Import icons from react-icons
import {
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Monitor,
  Laptop,
  Mouse,
  Keyboard,
  Armchair,
  Car,
  Bike,
  Truck,
  Bus,
  User,
  Briefcase,
  Wine,
  Smartphone,
  Flame,
  Cigarette,
  Stethoscope,
  UserCog,
  HardHat,
  Wallet,
  Crosshair,
  Utensils,
  Gavel,
  Package,
  Box,
  HelpCircle,
  CheckCircle,
  Clock,
  Camera,
} from 'lucide-react';
import Avatar1 from '@/assets/1.svg';
import AttendanceCheckLog from './AttendanceCheckLog';
import UserProfileDialog from './UserProfileDialog';
import ZoneSelector from './ZoneSelector';
import CameraLogo from '@/assets/cameralogo.svg';

const StatCard = ({ icon, value, label }) => (
  <div className="flex items-center gap-3 sm:gap-4">
    <div className="bg-[#E9F1FF] p-2.5 sm:p-3 md:p-3.5 rounded-full">
      {icon}
    </div>
    <div className="min-w-0">
      <p className="truncate text-sm sm:text-base font-semibold text-[#333]">
        {value ?? '--'}
      </p>
      <p className="truncate text-xs sm:text-sm text-muted-foreground">
        {label}
      </p>
    </div>
  </div>
);

export const ICON_CLASS = 'w-4 h-4 md:w-5 md:h-5';

const createIcon = (IconComponent) => (
  <IconComponent className={`${ICON_CLASS} text-black`} />
);

export const OBJECT_ICONS = {
  tv: createIcon(Monitor),
  laptop: createIcon(Laptop),
  mouse: createIcon(Mouse),
  keyboard: createIcon(Keyboard),
  chair: createIcon(Armchair),
  vehicle: createIcon(Car),
  motorcycle: createIcon(Bike),
  truck: createIcon(Truck),
  bus: createIcon(Bus),
  'traffic light': createIcon(ChevronRight),
  person: createIcon(User),
  backpack: createIcon(Briefcase),
  handbag: createIcon(Briefcase),
  suitcase: createIcon(Briefcase),
  bottle: createIcon(Wine),
  'cell phone': createIcon(Smartphone),
  fire: createIcon(Flame),
  smoke: createIcon(Cigarette),
  'surgeon uniform': createIcon(Stethoscope),
  'staff uniform': createIcon(UserCog),
  'construction work uniform': createIcon(HardHat),
  cash: createIcon(Wallet),
  gun: createIcon(Crosshair),
  knife: createIcon(Utensils),
  sword: createIcon(Gavel),
  cylinder: createIcon(Package),
  barrel: createIcon(Box),
  default: createIcon(HelpCircle),
};

const StreamModal = ({
  isOpen,
  onClose,
  config,
  cameraId,
  cameraChannels = [],
  selectedVideo,
}) => {
  const { allDetections, accessAllDetections, attendanceLogs } =
    useAllDetections();
  // const {cameraId}=selectedVideo||config;
  const scrollRef = useRef();
  const modalRef = useRef();
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showArrows, setShowArrows] = useState(false);

  // Draggable AttendanceCheckLog state
  const [attendancePosition, setAttendancePosition] = useState({
    x: 20,
    y: 100,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const attendanceRef = useRef(null);

  // UserProfileDialog state
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isAccessLogEntry, setIsAccessLogEntry] = useState(false);

  const handleProfileClick = (userData, isAccess = false) => {
    setSelectedUser(userData);
    setIsAccessLogEntry(isAccess);
    setProfileDialogOpen(true);
  };

  const handleFullScreen = () => {
    if (modalRef.current) {
      modalRef.current.requestFullscreen();
    }
  };

  useEffect(() => {
    if (isOpen) {
      handleFullScreen();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleFullScreenChange = () => {
      const isCurrentlyFullScreen = !!document.fullscreenElement;
      setIsFullScreen(isCurrentlyFullScreen);
      if (!isCurrentlyFullScreen) {
        onClose();
      }
    };
    document.addEventListener('fullscreenchange', handleFullScreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullScreenChange);
    document.addEventListener('mozfullscreenchange', handleFullScreenChange);
    document.addEventListener('MSFullscreenChange', handleFullScreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullScreenChange);
      document.removeEventListener(
        'webkitfullscreenchange',
        handleFullScreenChange
      );
      document.removeEventListener(
        'mozfullscreenchange',
        handleFullScreenChange
      );
      document.removeEventListener(
        'MSFullscreenChange',
        handleFullScreenChange
      );
    };
  }, []);

  // const currentConfig = selectedVideo || config;
  const [cameraIndex, setCameraIndex] = useState(() => {
    return cameraChannels.findIndex((cam) => cam._id === cameraId);
  });
  const currentCamera = cameraChannels[cameraIndex] || {};
  const status = import.meta.env.VITE_LOCAL_SETUP; // "true" or "false"

  const hlsUrl = useMemo(() => {
    if (!currentCamera) return '';

    const streamPath =
      currentCamera.streamingUrl || currentCamera.StreamingUrl || '';

    if (!streamPath) return '';

    // Local setup → URL already full
    if (status === 'true') {
      return streamPath;
    }

    return import.meta.env.VITE_STREAM_URL + streamPath;
  }, [currentCamera, status]);

  //  Filter detections for current camera
  const detectionsForCamera = allDetections.filter(
    (d) => d.cameraId === currentCamera?._id
  );

  console.log("Current Camera ID:", detectionsForCamera);
  // Access log detections for current camera
  const accessDetectionsForCamera = accessAllDetections.filter(
    (d) => d.cameraId === currentCamera?._id
  );

  const attendanceForCamera = attendanceLogs.filter(
    (attendance) => attendance?.attendance?.channelId === currentCamera?._id
  );

  // Calculate person and vehicle counts independently (no time filter)
  const personCount = useMemo(() => {
    return detectionsForCamera.reduce((sum, det) => {
      if (det.incidentType === 'countPersons') {
        return sum + (det.count || 0);
      }
      return sum;
    }, 0);
  }, [detectionsForCamera]);

  const vehicleCount = useMemo(() => {
    return detectionsForCamera.reduce((sum, det) => {
      // Handle countVehicles detection type
      if (det.incidentType === 'countVehicles') {
        return sum + (det.count || 0);
      }
      // Handle genericObjectDetection with vehicle objects
      if (det.incidentType === 'genericObjectDetection') {
        const objects = det.objectsDetected || [];
        return sum + objects.reduce((objSum, obj) => {
          return objSum + (obj.vehicle || obj.car || obj.bike || obj.truck || obj.bus || 0);
        }, 0);
      }
      return sum;
    }, 0);
  }, [detectionsForCamera]);

  // const stats = detectionsForCamera.flatMap((det) => {
  //   switch (det.incidentType) {
  //     case 'countPersons':
  //       return {
  //         icon: OBJECT_ICONS.person,
  //         value: det.count,
  //         label: 'People Detected',
  //         show: true,
  //       };

  //     case 'motionDetection':
  //       return {
  //         icon: <FaTrafficLight className={ICON_CLASS + ' text-black'} />,
  //         value: det.active ? 1 : 0,
  //         label: 'Motion Detected',
  //         show: det.active,
  //       };

  //     case 'genericObjectDetection': {
  //       const detectedObjects = det.objectsDetected || [];
  //       if (!Array.isArray(detectedObjects)) return [];

  //       const objectCounts = {};
  //       detectedObjects.forEach((obj) => {
  //         Object.entries(obj).forEach(([objectType, count]) => {
  //           const normalized = objectType.toLowerCase();
  //           objectCounts[normalized] = (objectCounts[normalized] || 0) + count;
  //         });
  //       });

  //       return Object.entries(objectCounts).map(([objectType, count]) => ({
  //         icon: OBJECT_ICONS[objectType] || OBJECT_ICONS.default,
  //         value: count,
  //         label:
  //           objectType.charAt(0).toUpperCase() +
  //           objectType.slice(1) +
  //           ' Detected',
  //         show: true,
  //       }));
  //     }

  //     case 'lineCrossing': {
  //       const statsArr = [];
  //       if (det.atoB > 0) {
  //         statsArr.push({
  //           icon: <ChevronRight className={ICON_CLASS + ' text-black'} />,
  //           value: det.atoB,
  //           label: 'Entry',
  //           show: true,
  //         });
  //       }
  //       if (det.btoA > 0) {
  //         statsArr.push({
  //           icon: <ChevronLeft className={ICON_CLASS + ' text-black'} />,
  //           value: det.btoA,
  //           label: 'Exit',
  //           show: true,
  //         });
  //       }
  //       return statsArr;
  //     }

  //     case 'unauthorizedAccess':
  //       return {
  //         icon: OBJECT_ICONS.default,
  //         value: 1,
  //         label: 'Unauthorized Access',
  //         show: true,
  //       };
    
  // case 'lightDetection':
  //       return {
  //         icon: <FaTrafficLight className={ICON_CLASS + ' text-black'} />,
  //         value: det.currentStatus,
  //         label: 'Light',
  //         show: true,
  //     }

  //     // Door detection: show Open/Closed/No Info
  //     case 'doorDetection':   
  //       return {
  //         icon: OBJECT_ICONS.default,
  //         value: det.currentStatus,
  //         label: 'Door',
  //         show: true,
  //     }
  //     case 'crowdDetection':

  //       return {
  //         icon: OBJECT_ICONS.default,
  //         value: det.croudCount,
  //         label: 'Crowd',
  //         show: true,
  //     }

  //     case 'personalProtectiveEquipment': {
  //       // Only show if detection was updated very recently (within 30 seconds)
  //       const detectionTime = new Date(det.updatedAt || det.createdAt).getTime();
  //       const now = new Date().getTime();
  //       const timeDiffSeconds = (now - detectionTime) / 1000;
        
  //       // Hide if data is older than 30 seconds (no fresh socket updates)
  //       if (timeDiffSeconds > 2) return [];

  //       const latestTimeSeries = det.timeSeries?.[det.timeSeries.length - 1];
  //       const croudCount = latestTimeSeries?.croudCount;
  //       const noHelmet = det.ppe?.helmet?.no;
  //       const noVest = det.ppe?.safety_jacket?.no;
        
  //       const stats = [];
  //       if (croudCount !== undefined && croudCount !== null) {
  //         stats.push({
  //           icon: createIcon(HardHat),
  //           value: croudCount,
  //           label: 'Person Count',
  //           show: true,
  //         });
  //       }
  //       if (noHelmet !== undefined && noHelmet !== null) {
  //         stats.push({
  //           icon: createIcon(HardHat),
  //           value: noHelmet,
  //           label: 'No Helmet',
  //           show: true,
  //         });
  //       }
  //       if (noVest !== undefined && noVest !== null) {
  //         stats.push({
  //           icon: createIcon(Wallet),
  //           value: noVest,
  //           label: 'No Vest',
  //           show: true,
  //         });
  //       }
  //       return stats;
  //     }

  //     default:
  //       return [];
  //   }
  // });
const stats = detectionsForCamera.flatMap((det) => {

  switch (det.incidentType) {

    // ❌ Skip time check for lineCrossing
    case 'lineCrossing': {
      const statsArr = [];

      if (det.atoB > 0) {
        statsArr.push({
          icon: <ChevronRight className={ICON_CLASS + ' text-black'} />,
          value: det.atoB,
          label: 'Entry',
          show: true,
        });
      }

      if (det.btoA > 0) {
        statsArr.push({
          icon: <ChevronLeft className={ICON_CLASS + ' text-black'} />,
          value: det.btoA,
          label: 'Exit',
          show: true,
        });
      }

      return statsArr;
    }

    // ✅ Apply 2-second rule for all others
    default: {
      const detectionTime = new Date(det.updatedAt || det.createdAt).getTime();
      const now = new Date().getTime();
      const timeDiffSeconds = (now - detectionTime) / 1000;

      if (timeDiffSeconds > 2) return [];

      switch (det.incidentType) {

        case 'countPersons':
          return {
            icon: OBJECT_ICONS.person,
            value: det.count,
            label: 'People Detected',
            show: true,
          };

        case 'motionDetection':
          return {
            icon: <FaTrafficLight className={ICON_CLASS + ' text-black'} />,
            value: det.active ? 1 : 0,
            label: 'Motion Detected',
            show: det.active,
          };

        case 'genericObjectDetection': {
          const detectedObjects = det.objectsDetected || [];
          if (!Array.isArray(detectedObjects)) return [];

          const objectCounts = {};
          detectedObjects.forEach((obj) => {
            Object.entries(obj).forEach(([objectType, count]) => {
              const normalized = objectType.toLowerCase();
              objectCounts[normalized] =
                (objectCounts[normalized] || 0) + count;
            });
          });

          return Object.entries(objectCounts).map(([objectType, count]) => ({
            icon: OBJECT_ICONS[objectType] || OBJECT_ICONS.default,
            value: count,
            label:
              objectType.charAt(0).toUpperCase() +
              objectType.slice(1) +
              ' Detected',
            show: true,
          }));
        }

        case 'unauthorizedAccess':
          return {
            icon: OBJECT_ICONS.default,
            value: 1,
            label: 'Unauthorized Access',
            show: true,
          };

        case 'lightDetection':
          return {
            icon: <FaTrafficLight className={ICON_CLASS + ' text-black'} />,
            value: det.currentStatus,
            label: 'Light',
            show: true,
          };

        case 'doorDetection':
          return {
            icon: OBJECT_ICONS.default,
            value: det.currentStatus,
            label: 'Door',
            show: true,
          };

        case 'crowdDetection':
          return {
            icon: OBJECT_ICONS.default,
            value: det.croudCount,
            label: 'Crowd',
            show: true,
          };

        case 'personalProtectiveEquipment': {
          const latestTimeSeries =
            det.timeSeries?.[det.timeSeries.length - 1];

          const stats = [];

          if (latestTimeSeries?.croudCount != null) {
            stats.push({
              icon: createIcon(HardHat),
              value: latestTimeSeries.croudCount,
              label: 'Person Count',
              show: true,
            });
          }

          if (det.ppe?.helmet?.no != null) {
            stats.push({
              icon: createIcon(HardHat),
              value: det.ppe.helmet.no,
              label: 'No Helmet',
              show: true,
            });
          }

          if (det.ppe?.safety_jacket?.no != null) {
            stats.push({
              icon: createIcon(Wallet),
              value: det.ppe.safety_jacket.no,
              label: 'No Vest',
              show: true,
            });
          }

          return stats;
        }

        default:
          return [];
      }
    }
  }
});

  useEffect(() => {
    const el = scrollRef.current;
    const container = modalRef.current;
    if (el && container && stats.length > 1) {
      const availableWidth = container.offsetWidth - 32;
      setShowArrows(el.scrollWidth > availableWidth);
    } else {
      setShowArrows(false);
    }
  }, [stats]);

  // Zone selector state
  const [selectedZone, setSelectedZone] = useState('');

  useEffect(() => {
    if (detectionsForCamera.length > 0) {
      setSelectedZone(detectionsForCamera[0]);
    } else {
      setSelectedZone('');
    }
  }, [cameraIndex]);

  const handleNextCamera = () => {
    if (cameraIndex < cameraChannels.length - 1) {
      const newIndex = cameraIndex + 1;
      setCameraIndex(newIndex);
    }
  };

  const handlePreviousCamera = () => {
    if (cameraIndex > 0) {
      const newIndex = cameraIndex - 1;
      setCameraIndex(newIndex);
    }
  };

  const handleEscape = useCallback(() => {
  // onClose?.();
    onClose()
  // navigate(-1);

  console.log("Escape pressed");
}, []);

useEffect(() => {
  const onKeyDown = (e) => {
    // Prevent arrow keys from scrolling page
    if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
    }

    if (e.key === "ArrowRight") handleNextCamera();
    if (e.key === "ArrowLeft") handlePreviousCamera();
    if (e.key === "Escape") handleEscape();
  };

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, [handleNextCamera, handlePreviousCamera, handleEscape]);

  // Drag handlers for AttendanceCheckLog
  const handleMouseDown = (e) => {
    if (attendanceRef.current && e.target.closest('.drag-handle')) {
      setIsDragging(true);
      const rect = attendanceRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging && attendanceRef.current) {
      const modalRect = modalRef.current?.getBoundingClientRect();
      if (!modalRect) return;

      let newX = e.clientX - modalRect.left - dragOffset.x;
      let newY = e.clientY - modalRect.top - dragOffset.y;

      // Constrain to modal boundaries
      const attendanceRect = attendanceRef.current.getBoundingClientRect();
      newX = Math.max(
        0,
        Math.min(newX, modalRect.width - attendanceRect.width)
      );
      newY = Math.max(
        0,
        Math.min(newY, modalRect.height - attendanceRect.height)
      );

      setAttendancePosition({ x: newX, y: newY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragOffset]);

  if (!isOpen) return null;

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 bg-black flex flex-col stream-modal"
    >
      {/* Camera Logo at the top - OVERLAY */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 z-50 flex items-center justify-center">
        <div className=" shadow-lg px-6  rounded-lg">
          <img
            src={CameraLogo}
            alt="Camera Logo"
            className="h-14 w-auto object-contain"
          />
        </div>
      </div>
      {/* Glassmorphism zone selector - DRAGGABLE */}
      <ZoneSelector
        detectionsForCamera={detectionsForCamera}
        selectedZone={selectedZone}
        setSelectedZone={setSelectedZone}
      />
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-50 cursor-pointer text-white backdrop-blur-md w-8 h-8 rounded-full flex justify-center items-center bg-[#3f3f3f80] p-2"
      >
        <Minimize2 className="h-4 w-4" />
      </button>

      {/* Full screen video container */}
      <div className="absolute inset-0 bg-black overflow-hidden">
        {/* Detection Stats Overlay - Top Left (Always Visible) */}
        <div className="absolute top-20 left-4 z-30 flex flex-col gap-3 mt-5">
          {/* Camera Name Card */}
          <div className="bg-[#1F40AF] border border-white/20 rounded-[10px] px-4 py-3 flex items-center gap-2 backdrop-blur-md shadow-lg">
            <div className="flex-shrink-0">
              <div className="bg-white/10 rounded-full p-2">
                <Camera className="w-4 h-4 md:w-5 md:h-5 text-white" />
              </div>
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs md:text-sm font-bold text-white">
                {currentCamera?.name || currentCamera?.channelName || 'Camera'}
              </p>
              <p className="truncate text-xs text-blue-200">
                Live Feed
              </p>
            </div>
          </div>

          {/* Person Count Card */}
          {personCount > 0 && (
            <div className="bg-[#10b981]/20 border border-emerald-500/50 rounded-[10px] px-4 py-3 flex items-center gap-2 backdrop-blur-md shadow-lg">
              <div className="flex-shrink-0">
                <div className="bg-emerald-500/30 rounded-full p-2">
                  <User className="w-4 h-4 md:w-5 md:h-5 text-emerald-400" />
                </div>
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs md:text-sm font-bold text-white">
                  {personCount}
                </p>
                <p className="truncate text-xs text-emerald-300">
                  Persons Detected
                </p>
              </div>
            </div>
          )}

          {/* Vehicle Count Card */}
          {vehicleCount > 0 && (
            <div className="bg-[#f59e0b]/20 border border-amber-500/50 rounded-[10px] px-4 py-3 flex items-center gap-2 backdrop-blur-md shadow-lg">
              <div className="flex-shrink-0">
                <div className="bg-amber-500/30 rounded-full p-2">
                  <Car className="w-4 h-4 md:w-5 md:h-5 text-amber-400" />
                </div>
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs md:text-sm font-bold text-white">
                  {vehicleCount}
                </p>
                <p className="truncate text-xs text-amber-300">
                  Vehicles Detected
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Camera switching arrows - OVERLAY */}
        {cameraChannels.length > 1 && (
          <>
            {cameraIndex > 0 && (
              <button
                className="absolute left-2 top-1/2 -translate-y-1/2 z-20 bg-[#3F3F3F]/50 text-white w-14 h-14 rounded-full flex items-center justify-center backdrop-blur-sm transition-all duration-200 hover:shadow-xl hover:scale-105 focus:outline-none cursor-pointer"
                onClick={handlePreviousCamera}
              >
                <ChevronLeft className="h-8 w-8" />
              </button>
            )}

            {cameraIndex < cameraChannels.length - 1 && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 z-20 bg-[#3F3F3F]/50 text-white w-14 h-14 rounded-full flex items-center justify-center backdrop-blur-sm transition-all duration-200 hover:shadow-xl hover:scale-105 focus:outline-none cursor-pointer"
                onClick={handleNextCamera}
              >
                <ChevronRight className="h-8 w-8" />
              </button>
            )}
          </>
        )}

        <CameraCanvasModal
          // config={config}
          src={isOpen ? hlsUrl : null}
          onClose={onClose}
          isInModal={true}
          selectedVideo={selectedVideo}
          cameraId={cameraId}
          minBtnClass="absolute top-4 right-4 bg-[#3f3f3f80] backdrop-blur-md text-white w-8 h-8 rounded-full flex justify-center items-center z-20"
          minIconSize="w-4 h-4"
          detections={selectedZone}
          isFullScreen={isFullScreen}
        />
        {/* Attendance and Access log component - DRAGGABLE */}
        {((Array.isArray(accessDetectionsForCamera) &&
          accessDetectionsForCamera.length > 0) ||
          (Array.isArray(attendanceForCamera) &&
            attendanceForCamera.length > 0)) && (
          <div
            ref={attendanceRef}
            style={{
              position: 'absolute',
              left: `${attendancePosition.x}px`,
              top: `${attendancePosition.y}px`,
              cursor: isDragging ? 'grabbing' : 'grab',
              zIndex: 30,
            }}
            onMouseDown={handleMouseDown}
          >
            <div className="drag-handle">
              <AttendanceCheckLog
                accessDetectionsForCamera={accessDetectionsForCamera}
                attendanceForCamera={attendanceForCamera}
                onProfileClick={handleProfileClick}
              />
            </div>
          </div>
        )}
      </div>

      {/* Stats overlay at bottom */}
      {stats.length > 0 && (
        <div className="absolute bottom-6 left-4 right-4 z-20 flex justify-center">
          {/* Glassmorphism overlay wrapper */}
          <div
            className={`rounded-[18px] bg-gradient-to-r from-white/6 via-white/4 to-white/6 border border-white/10 backdrop-blur-md shadow-2xl py-6 px-4 ${!showArrows ? 'w-auto' : 'w-full max-w-[1900px]'}`}
          >
            <div className="flex items-center gap-4">
              {showArrows && (
                <button
                  onClick={() =>
                    scrollRef.current.scrollBy({
                      left: -200,
                      behavior: 'smooth',
                    })
                  }
                  className="bg-white/10 hover:bg-white/20 text-white rounded-full p-2 w-10 h-10 flex items-center justify-center transition"
                  aria-label="scroll-left"
                >
                  <FaChevronLeft className="text-white text-lg" />
                </button>
              )}

              <div
                ref={scrollRef}
                className={`overflow-x-auto hide-scrollbar ${showArrows ? 'flex-1' : 'flex justify-center'}`}
              >
                <div className="flex items-center gap-6 min-w-max px-2">
                  {/* Camera Name Card - Always shown first */}
                  <div className="bg-[#1F40AF] border border-white/20 rounded-[10px] px-5 py-3 flex items-center gap-3 min-w-[220px] shadow-lg">
                    <div className="flex-shrink-0">
                      <div className="bg-white/10 rounded-full p-2 backdrop-blur-sm">
                        <Camera className="w-4 h-4 md:w-5 md:h-5 text-white" />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">
                        {currentCamera?.name || currentCamera?.channelName || 'Camera'}
                      </p>
                      <p className="truncate text-xs text-blue-200">
                        Live Feed
                      </p>
                    </div>
                  </div>
                  
                  {/* Person Count Card */}
                  {stats.some(s => s.label === 'People Detected') ? (
                    <div className="bg-[#10b981]/20 border border-emerald-500/50 rounded-[10px] px-5 py-3 flex items-center gap-3 min-w-[200px] shadow-lg">
                      <div className="flex-shrink-0">
                        <div className="bg-emerald-500/30 rounded-full p-2 backdrop-blur-sm">
                          <User className="w-4 h-4 md:w-5 md:h-5 text-emerald-400" />
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-white">
                          {stats.find(s => s.label === 'People Detected')?.value ?? '0'}
                        </p>
                        <p className="truncate text-xs text-emerald-300">
                          Persons Detected
                        </p>
                      </div>
                    </div>
                  ) : null}
                  
                  {/* Vehicle Count Card */}
                  {stats.some(s => s.label && s.label.includes('Detected') && (s.label.includes('vehicle') || s.label.includes('Vehicle') || s.label.includes('Bike') || s.label.includes('Truck') || s.label.includes('Bus') || s.label.includes('Car'))) ? (
                    <div className="bg-[#f59e0b]/20 border border-amber-500/50 rounded-[10px] px-5 py-3 flex items-center gap-3 min-w-[200px] shadow-lg">
                      <div className="flex-shrink-0">
                        <div className="bg-amber-500/30 rounded-full p-2 backdrop-blur-sm">
                          <Car className="w-4 h-4 md:w-5 md:h-5 text-amber-400" />
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-white">
                          {stats
                            .filter(s => s.label && s.label.includes('Detected') && (s.label.includes('vehicle') || s.label.includes('Vehicle') || s.label.includes('Bike') || s.label.includes('Truck') || s.label.includes('Bus') || s.label.includes('Car')))
                            .reduce((sum, s) => sum + (s.value || 0), 0)}
                        </p>
                        <p className="truncate text-xs text-amber-300">
                          Vehicles Detected
                        </p>
                      </div>
                    </div>
                  ) : null}
                  
                  {/* Other Detection Stats */}
                  {stats.map((stat, i) => (
                    <div
                      key={i}
                      className="bg-[#2D2C2C] border border-white/20 rounded-[10px] px-4 py-3 flex items-center gap-3 min-w-[200px] shadow-lg"
                    >
                      <div className="flex-shrink-0">
                        <div className="bg-[#E5F6FF] rounded-full p-2 backdrop-blur-sm">
                          {stat.icon}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">
                          {stat.value ?? '--'}
                        </p>
                        <p className="truncate text-xs text-[#EFEFEF]">
                          {stat.label}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {showArrows && (
                <button
                  onClick={() =>
                    scrollRef.current.scrollBy({
                      left: 200,
                      behavior: 'smooth',
                    })
                  }
                  className="bg-white/10 hover:bg-white/20 text-white rounded-full p-2 w-10 h-10 flex items-center justify-center transition"
                  aria-label="scroll-right"
                >
                  <FaChevronRight className="text-white text-lg" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* User Profile Dialog - Now outside the transformed containers but inside the fixed StreamModal */}
      <UserProfileDialog
        isOpen={profileDialogOpen}
        onClose={() => setProfileDialogOpen(false)}
        userData={selectedUser}
        isAccessLog={isAccessLogEntry}
      />
    </div>
  );
};

export default StreamModal;
