import React, { useState, useContext } from 'react';
import VideoCanvasStream from '../../Dashboard/VideoCanvasStream';
import DynamicDateTime from '@/utils/DynamicDateTime';
import { useMemo } from 'react';
import { useDetection } from '@/context/Sockets/DetectionContext';
import { useAllDetections } from '@/context/Sockets/AllDetectionContext';
import UserContext from '@/context/UserContext/Context';
import { User, Car } from 'lucide-react';

const CameraStreamDisplay = ({
  camera,
  selectedVideo,
  setSelectedVideo,
  cameraChannels,
  isMini = false,
  streamIndex = 0,
}) => {
  const { streamModalShow, setStreamModalShow } = useContext(UserContext);
  const [isInteractionDisabled, setIsInteractionDisabled] = useState(true);
  const hlsUrlMemo = useMemo(
    () => camera?.config?.StreamingUrl || null,
    [camera?.config?.StreamingUrl]
  );

  const { allDetections } = useAllDetections();
  const selectedCameraDetections = allDetections.filter(
    (det) => det.cameraId === camera.value
  );

  // Calculate person and vehicle counts
  const personCount = useMemo(() => {
    return selectedCameraDetections.reduce((sum, det) => {
      if (det.incidentType === 'countPersons') {
        return sum + (det.count || 0);
      }
      return sum;
    }, 0);
  }, [selectedCameraDetections]);

  const vehicleCount = useMemo(() => {
    return selectedCameraDetections.reduce((sum, det) => {
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
  }, [selectedCameraDetections]);

  const openModal = (e) => {
    //  Prevent triggering again while modal is already open
    e.stopPropagation();
    if (streamModalShow && selectedVideo?.cameraId === camera.value) return;

    //Open modal normally
    setSelectedVideo({
      cameraId: camera.value,
      config: { ...camera.config, cameraId: camera.value },
    });
    setStreamModalShow(true);
  };

  return (
    <div
      className="relative overflow-hidden w-full h-full"
      onClick={!isMini && !isInteractionDisabled ? openModal : undefined}
    >
      <VideoCanvasStream
        config={{ ...camera.config, cameraId: camera.value }}
        cameraId={camera.value}
        hlsUrl={hlsUrlMemo}
        label={camera.label}
        maxminBtnclass="absolute top-[14px] right-2.5 bg-[#3f3f3f80]  text-white p-1.5 rounded-full flex justify-center items-center"
        maxsize="text-[18px]"
        minsize="text-[18px]"
        selectedVideo={selectedVideo}
        setSelectedVideo={setSelectedVideo}
        cameraChannels={cameraChannels}
        polygonPoints={selectedCameraDetections}
        streamModalShow={streamModalShow}
        setStreamModalShow={setStreamModalShow}
        isMini={isMini}
        streamIndex={streamIndex}
        onInteractionDisabledChange={setIsInteractionDisabled}
        // zoneName={zoneName}
      />

      {/* Date top-right */}
      {/* <div className="absolute top-[12px] right-[42px] px-2 py-1 rounded">
       <DynamicDateTime date={camera.datetime} className='text-white  font-[500]' />
      </div> */}

      {/* Camera Name bottom-left */}
      {!isMini && (
        <div className="absolute bottom-[15px] left-[15px] text-white xl:text-[16px] text-xs font-[500] px-2 py-0.5 rounded">
          {camera.title}
        </div>
      )}

      {/* Detection Counts bottom-right */}
      {!isMini && (personCount > 0 || vehicleCount > 0) && (
        <div className="absolute bottom-[15px] right-[15px] flex gap-2">
          {/* Person Count Badge */}
          {personCount > 0 && (
            <div className="bg-emerald-500/90 px-3 py-1 rounded-full flex items-center gap-1.5 backdrop-blur-sm">
              <User className="w-3.5 h-3.5 text-white" />
              <span className="text-white text-xs font-bold">{personCount}</span>
            </div>
          )}
          
          {/* Vehicle Count Badge */}
          {vehicleCount > 0 && (
            <div className="bg-amber-500/90 px-3 py-1 rounded-full flex items-center gap-1.5 backdrop-blur-sm">
              <Car className="w-3.5 h-3.5 text-white" />
              <span className="text-white text-xs font-bold">{vehicleCount}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default React.memo(CameraStreamDisplay);
