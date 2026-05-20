import React, { useContext, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { LuMaximize, LuMinimize } from 'react-icons/lu';
import { Loader, LoaderCircle } from 'lucide-react';
import UserContext from '@/context/UserContext/Context';
import StreamModal from '../Streams/CameraStreamsModal/StreamModal';
import MediaControls from '../Playback/components/MediaControls';
import CameraLogo from '@/assets/cameralogo.svg';
// 
const toValidDate = (input) => {
  const date = new Date(input);
  return isNaN(date.getTime()) ? null : date;
};

const PlaybackVideoCanvasStream = ({
  availableSegments,
  selectedCamera,
  videoRef,
  isLoading,
  hlsUrl = '',
  maxminBtnclass = '',
  maxsize = '',
  minsize = '',
  clickedTime,
  setClickedTime,
  selectedRange,
  currentTime, 
  setCurrentTime,
  onControlsReady, // New callback to pass control functions to parent
  isFullscreen,
  setIsFullscreen,
  playbackRate,
  changePlaybackRate
}) => {
   const hlsRef = useRef(null);
  const containerRef = useRef(null);
  const { streamModalShow, setStreamModalShow } = useContext(UserContext);
  const baseUrl = import.meta.env.VITE_STREAM_URL;
  // const [playbackRate, setPlaybackRate] = useState(1);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(-1);
  const closeModal = () => setStreamModalShow(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [duration, setDuration] = useState(0);
  const [controlsTimeout, setControlsTimeout] = useState(null);
  
  useEffect(() => {
  const video = videoRef?.current;
  if (!video) return;
}, [playbackRate]);

  useEffect(() => {
    const video = videoRef?.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const startDate = toValidDate(selectedRange?.start);
      if (!startDate) return;
      const newTime = video.currentTime;
      setCurrentTime(newTime);
      setClickedTime(new Date(startDate.getTime() + video.currentTime * 1000));
    };

    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [selectedRange, setClickedTime]);

  // Pass control functions and states to parent
  useEffect(() => {
    if (onControlsReady) {
      onControlsReady({
        videoRef,
        currentSegmentIndex,
        handlePreviousSegment,
        skipBackward,
        togglePlayPause,
        isBuffering,
        isPlaying,
        skipForward,
        handleNextSegment,
        availableSegments,
        changePlaybackRate,
        playbackRate,
        currentTime,
        duration,
        isMuted,
        toggleMute,
        seekVideo,
        toggleFullscreen,
        isFullscreen,
        handleZoomIn,
        handleZoomOut,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentSegmentIndex,
    isBuffering,
    isPlaying,
    playbackRate,
    currentTime,
    duration,
    isMuted,
    isFullscreen
  ]);

  const togglePlayPause = () => {
    const video = videoRef?.current;
    if (!video) return;

    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    const video = videoRef?.current;
    if (!video) return;

    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const seekVideo = (value) => {
    const video = videoRef?.current;
    if (!video) return;

    video.currentTime = value;
    setCurrentTime(value);
  };

  // Add a new useEffect to manage video events and buffering state
  useEffect(() => {
    const video = videoRef?.current;
    if (!video) return;

    const handleWaiting = () => {
      console.log("Video is waiting/buffering...");
      setIsBuffering(true);
    };
    const handlePlaying = () => {
      setIsBuffering(false);
    };
    const handleCanPlay = () => {
        setIsBuffering(false);
    }

    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('canplay', handleCanPlay);

    return () => {
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('canplay', handleCanPlay);
    };
  }, []);

  useEffect(() => {
    if (!hlsUrl) return;
    const video = videoRef?.current;
    if (!video) return;

    const retryDelay = 1000;
    let retryTimer;

    const getStatusCode = (data) =>
      data?.response?.status || data?.response?.code || data?.networkDetails?.status || null;

    const cleanup = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };

    const scheduleRetry = () => {
      cleanup();
      retryTimer = window.setTimeout(() => {
        tryStreamUrls();
      }, retryDelay);
    };

    const tryStreamUrls = async () => {
      const fullUrl = baseUrl + hlsUrl;
      if (Hls.isSupported()) {
        setIsVideoLoading(true)
        const hls = new Hls({
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
        });
        hlsRef.current = hls;

        try {
          hls.attachMedia(video);
          hls.loadSource(fullUrl);

          let segmentLoaded = false;

          hls.on(Hls.Events.FRAG_LOADED, () => {
            segmentLoaded = true;
            setIsVideoLoading(false)
          });

          hls.on(Hls.Events.MANIFEST_PARSED, async () => {
            const waitForSegment = () =>
              new Promise((resolve) => {
                const interval = setInterval(() => {
                  if (segmentLoaded) {
                    clearInterval(interval);
                    resolve();
                  }
                }, 500);
              });

            console.log("Waiting for segment...");
            await waitForSegment();
            setIsBuffering(true);
           
            video
              .play()
              .then(() => {
                console.log("Playback started");
                setIsBuffering(false);
                setIsVideoLoading(false)
              })
              .catch((err) => {
                console.error("Play error:", err);
                setIsBuffering(false);
                scheduleRetry();
              });
          });

          hls.on(Hls.Events.ERROR, (_, data) => {
            const statusCode = getStatusCode(data);
            if (statusCode === 404) {
              console.warn("HLS 404 received, retrying stream URL in 1s:", fullUrl);
              scheduleRetry();
              return;
            }

            console.warn("HLS Error", data);
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  hls.startLoad();
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  hls.recoverMediaError();
                  break;
                default:
                  hls.destroy();
                  break;
              }
              setIsBuffering(false);
              scheduleRetry();
            }
          });
        } catch (err) {
          console.warn("Failed to load HLS stream:", fullUrl, err);
          setIsBuffering(false);
          scheduleRetry();
        }
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = fullUrl;
        try {
          await video.play();
          setIsBuffering(false);
        } catch (err) {
          console.warn("Native HLS play failed:", fullUrl, err);
          setIsBuffering(false);
          setIsVideoLoading(false)
          scheduleRetry();
        }
      }
    };

    tryStreamUrls();

    return () => {
      cleanup();
    };
    // Note: Removed isLoading from dependencies to prevent unnecessary stream reloads
  }, [hlsUrl, baseUrl]);

  const handlePreviousSegment = () => {
    if (videoRef?.current && currentSegmentIndex > 0) {
      const newIndex = currentSegmentIndex - 1;
      setCurrentSegmentIndex(newIndex);
      videoRef.current.currentTime = availableSegments[newIndex].startTime;
    }
  };

  const handleNextSegment = () => {
    if (videoRef?.current && currentSegmentIndex < availableSegments.length - 1) {
      const newIndex = currentSegmentIndex + 1;
      setCurrentSegmentIndex(newIndex);
      videoRef.current.currentTime = availableSegments[newIndex].startTime;
    }
  };

  const skipBackward = () => {
    if (videoRef?.current) {
      videoRef.current.currentTime -= 5;
    }
  };

  const skipForward = () => {
    if (videoRef?.current) {
      videoRef.current.currentTime += 5;
    }
  };

  // const changePlaybackRate = () => {
  //   const rates = [1, 1.5, 2];
  //   const currentIndex = rates.indexOf(playbackRate);
  //   const nextIndex = (currentIndex + 1) % rates.length;
  //   const newRate = rates[nextIndex];
  //   setPlaybackRate(newRate);
  //   if (videoRef?.current) {
  //     videoRef.current.playbackRate = newRate;
  //   }
  // };

  useEffect(() => {
  const video = videoRef?.current;
  if (!video) return;

  video.playbackRate = playbackRate;
  video.defaultPlaybackRate = playbackRate;

  console.log("Playback rate reapplied:", playbackRate);
}, [playbackRate, hlsUrl]);


  const handleZoomIn = () => {
    console.log("Zoom In");
  };

  const handleZoomOut = () => {
    console.log("Zoom Out");
  };

  const toggleFullscreen = () => {
    setIsFullscreen(prev => !prev);
  };

  // Add escape key handler to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    if (isFullscreen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);
 
  return (
    <div 
      ref={containerRef} 
      className={`relative w-full h-full ${isFullscreen ? 'fixed inset-0 z-[9999] bg-black' : ''}`}
    >

      {/* Camera Logo overlay - always show in fullscreen, positioned above everything */}
      {isFullscreen && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 z-[10000] flex items-center justify-center pointer-events-none">
          <div className=" shadow-lg px-6 rounded-lg">
            <img src={CameraLogo} alt="Camera Logo" className="h-14 w-auto object-contain" />
          </div>
        </div>
      )}

      {selectedCamera  &&  (
        <>
          {/* Video Element */}
          <video
            ref={videoRef}
            className="w-full h-full object-contain"
            autoPlay
            muted
            playsInline
          />
  
          {/*
            Loading Spinner (LoaderCircle) — previously rendered while
            `isVideoLoading` was true. It covered the initial HLS startup
            window: from `setIsVideoLoading(true)` inside `tryStreamUrls()`
            until the first `FRAG_LOADED` event (or `video.play()` resolving
            / native-HLS play failure). It is now unified with the
            wifi-style "Buffering..." overlay below so the same indicator
            shows for every loading/stall case in playback.
          */}
          {/* {isVideoLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black bg-opacity-50">
              <LoaderCircle className="w-12 h-12 text-[#07486A] animate-spin mb-2" />
            </div>
          )} */}

          {/* Buffering Animation — shown for ALL playback loading/stall cases:
              initial HLS startup (was isVideoLoading) AND mid-stream stalls
              (waiting/seek/network slow). */}
          {(isBuffering || isVideoLoading) && (
            <div className="absolute inset-0 flex items-center justify-center text-white bg-black bg-opacity-50">
              <div className="flex flex-col items-center">
                <div className="w-12 text-[#07486A]">
                  <svg
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M12,21L15.6,16.2C14.6,15.45 13.35,15 12,15C10.65,15 9.4,15.45 8.4,16.2L12,21"
                      opacity="1"
                    ></path>
                    <path
                      d="M12,9C9.3,9 6.81,9.89 4.8,11.4L6.6,13.8C8.1,12.67 9.97,12 12,12C14.03,12 15.9,12.67 17.4,13.8L19.2,11.4C17.19,9.89 14.7,9 12,9Z"
                      opacity="0.3"
                    >
                      <animate
                        attributeName="opacity"
                        dur="1.5s"
                        values="0.3;1;0.3"
                        repeatCount="indefinite"
                        begin="0.5s"
                      ></animate>
                    </path>
                    <path
                      d="M12,3C7.95,3 4.21,4.34 1.2,6.6L3,9C5.5,7.12 8.62,6 12,6C15.38,6 18.5,7.12 21,9L22.8,6.6C19.79,4.34 16.05,3 12,3"
                      opacity="0.2"
                    >
                      <animate
                        attributeName="opacity"
                        dur="1.5s"
                        values="0.2;1;0.2"
                        repeatCount="indefinite"
                        begin="1s"
                      ></animate>
                    </path>
                  </svg>
                </div>
                <span className="text-[#07486A] ml-2 text-xl">Buffering...</span>
              </div>
            </div>
          )}
  
          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className={`${maxminBtnclass} cursor-pointer z-50 absolute top-2 right-2`}
          >
            {isFullscreen ? (
              <LuMinimize className={minsize} />
            ) : (
              <LuMaximize className={maxsize} />
            )}
          </button>
        </>
      )}
    </div>
  );
  
};

export default PlaybackVideoCanvasStream;