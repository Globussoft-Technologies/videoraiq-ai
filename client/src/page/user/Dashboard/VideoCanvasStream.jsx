import React, { useContext, useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { LuMaximize } from 'react-icons/lu';
import { BiTargetLock } from "react-icons/bi";
import UserContext from '@/context/UserContext/Context';
import StreamModal from '../Streams/CameraStreamsModal/StreamModal';
import CameraStreamWithDetection from '../Streams/CameraStreamsModal/CameraStreamWithDetection';
import useHlsPlayer from '@/hooks/useHlsPlayer';
import { useDetection } from '@/context/Sockets/DetectionContext';

const VideoCanvasStream = ({
  config,
  hlsUrl = [],
  maxminBtnclass = '',
  maxsize = '',
  minsize = '',
  selectedVideo,
  cameraId,
  label,
  setSelectedVideo,
  cameraChannels = [],
  hideconnection,
  polygonPoints,
  streamModalShow,
  setStreamModalShow,
  isMini = false,
  streamIndex = 0,
  onInteractionDisabledChange,
  // zoneName
}) => {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const baseUrl = import.meta.env.VITE_STREAM_URL;
  const status = import.meta.env.VITE_LOCAL_SETUP;
  const [isLoading, setIsLoading] = useState(true);
  const [isWaiting, setIsWaiting] = useState(streamIndex > 0);
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const memoizedUrl = useMemo(() => {
    const raw = Array.isArray(hlsUrl) ? hlsUrl[0] : hlsUrl;
    if (!raw) return null;

    if (status === 'true') {
      return raw; // local setup → full URL already
    }

    return baseUrl + raw;
  }, [hlsUrl, status, baseUrl]);

  // const memoizedUrl=useMemo(() => {
  //   return hlsUrl?.[0] ? hlsUrl[0] : null;
  // }, [hlsUrl]);

  //   const memoizedUrl = useMemo(() => {
  //   return Array.isArray(hlsUrl) && hlsUrl.length > 0 ? hlsUrl[0] : null;
  //  }, [hlsUrl]);

  // Hook usage
  //   const isModalActive =
  //   streamModalShow && selectedVideo?.cameraId === cameraId;

  //  // Use HLS only for modal camera
  //  useHlsPlayer(videoRef, memoizedUrl, {
  //    autoPlay: true,
  //    enabled: isModalActive
  //  });

  const enabled = !streamModalShow // when modal closed → stream all cameras
    ? true
    : selectedVideo?.cameraId === cameraId; // when modal open → stream only selected

  // const enabled = true; // grid streams always enabled
  useEffect(() => {
    setIsLoading(true);
    setIsWaiting(streamIndex > 0);
    setHasError(false);
    setErrorMsg('');
  }, [memoizedUrl, cameraId]);

  const handleStarted = useCallback(() => setIsWaiting(false), []);
  const handleError = useCallback((msg) => {
    setIsWaiting(false);
    setErrorMsg(msg);
    setIsLoading(false);
    setHasError(true);
  }, []);

  useHlsPlayer(videoRef, memoizedUrl, {
    autoPlay: true,
    enabled,
    startDelayMs: streamIndex * 1000,
    onStarted: handleStarted,
    onError: handleError,
  });

  useEffect(() => {
    onInteractionDisabledChange?.(isWaiting || isLoading || hasError);
  }, [isWaiting, isLoading, hasError, onInteractionDisabledChange]);

  const closeModal = () => {
    setStreamModalShow(false);
    setSelectedVideo(null);
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const fsElement =
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement;
      setIsFullscreen(!!fsElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener(
        'webkitfullscreenchange',
        handleFullscreenChange
      );
      document.removeEventListener(
        'msfullscreenchange',
        handleFullscreenChange
      );
    };
  }, []);

  const openModalInFullscreen = () => {
    if (streamModalShow && selectedVideo?.cameraId === cameraId) return;

    setSelectedVideo({
      cameraId: cameraId,
      config: config,
    });

    setStreamModalShow(true);
  };

  // Trigger fullscreen when modal opens
  // useEffect(() => {
  //   if (
  //     streamModalShow &&
  //     selectedVideo?.cameraId === cameraId
  //   ) {
  //     const container = containerRef.current;
  //     if (container && !document.fullscreenElement) {
  //       if (container.requestFullscreen) {
  //         container.requestFullscreen();
  //       } else if (container.webkitRequestFullscreen) {
  //         container.webkitRequestFullscreen();
  //       } else if (container.msRequestFullscreen) {
  //         container.msRequestFullscreen();
  //       }
  //     }
  //   }
  // }, [streamModalShow, selectedVideo,config]);

  return (
    <>
      <div
        ref={containerRef}
        onDoubleClick={isWaiting || isLoading || hasError ? undefined : openModalInFullscreen}
        className="relative w-full h-full bg-black"
      >
        {/* Loading Overlay */}
        {(isWaiting || isLoading) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-20">
            <div
              className={`loader border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin ${isMini ? 'w-5 h-5' : 'w-10 h-10'}`}
            ></div>
          </div>
        )}

        {/* Error Message */}
        {hasError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-sm bg-black/80 z-20 text-center">
            <p>Unable to load stream</p>
            <p className="text-xs opacity-70 mt-1">
              {errorMsg || 'Camera offline'}
            </p>
          </div>
        )}
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          autoPlay
          muted
          playsInline
          preload="metadata"
          controls={false}
          onCanPlay={() => {
            setIsLoading(false);
            setHasError(false);
          }}
          onPlaying={() => {
            setIsLoading(false);
            setHasError(false);
          }}
        />

        <CameraStreamWithDetection
          videoRef={videoRef}
          detections={polygonPoints}
        />

        {/* {!isMini && polygonPoints && polygonPoints.length > 0 && (
          <div className="absolute top-[14px] right-12 flex items-center gap-2">
            {polygonPoints.map((det, index) => {
              const isPresent = det.personPresent === true || det.vehiclePresent === true;
              const zoneName = det?.detectionSetting?.settings?.referencePoints?.zone_name || det.incidentType || 'Detection';

              let displayLabel = zoneName;
              if (det.incidentType === 'countPersons') {
                displayLabel = `Person Count :  ${det.count || 0}`;
              } else if (det.incidentType === 'countVehicles') {
                displayLabel = `Vehicle Count : ${det.count || 0}`;
              }

              return (
                <div
                  key={index}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/90 backdrop-blur-sm shadow-sm border border-gray-200 ${isPresent ? 'text-emerald-600' : 'text-red-500'} text-[11px] font-bold uppercase tracking-wider transition-all duration-300`}
                >
                  <BiTargetLock size={14} className={isPresent ? 'text-emerald-600/90' : 'text-red-600/90'} />
                  <span className="whitespace-nowrap">{displayLabel}</span>
                </div>
              );
            })}
          </div>
        )} */}

        {/* Camera Name overlay */}
        {label && (
          <div className={`absolute bottom-2 left-2 bg-black/50 text-white font-medium px-2 py-0.5 rounded ${isMini ? 'text-[10px]' : 'text-sm'}`}>
            {'Camera Name :' + label}
          </div>
        )}

        {!isMini && (
          <button
            onClick={openModalInFullscreen}
            disabled={isWaiting || isLoading || hasError}
            className={`${maxminBtnclass} transition-colors ${
              isWaiting || isLoading || hasError
                ? 'opacity-40'
                : 'cursor-pointer hover:bg-[#3f3f3fba]'
            }`}
          >
            <LuMaximize className={maxsize} />
          </button>
        )}
      </div>
      {streamModalShow && selectedVideo?.cameraId === cameraId && (
        <StreamModal
          config={config}
          streamUrl={memoizedUrl}
          cameraId={cameraId}
          isOpen={streamModalShow}
          onClose={closeModal}
          cameraChannels={cameraChannels}
          selectedVideo={selectedVideo}
          setSelectedVideo={setSelectedVideo}
          hideconnection={hideconnection}
        />
      )}
    </>
  );
};

export default React.memo(VideoCanvasStream);
