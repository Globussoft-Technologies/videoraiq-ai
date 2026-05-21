import React, { useRef, useState, useEffect } from 'react';
import { Minimize2, Play, Pause, SkipBack, SkipForward, RotateCw, Search, SearchCheck, SearchCode } from 'lucide-react';
import { LuMaximize } from 'react-icons/lu';
import { GoDownload } from "react-icons/go";
import { GrFormNext, GrFormPrevious } from "react-icons/gr";
import { TbCut } from "react-icons/tb";
import { Switch } from '@/components/ui/switch';
import playplay from "../../../assets/playplay.svg";
import mute from "../../../assets/mute.svg";
import recordedImage from "../../../assets/recordedImage.svg";
import { IoPlayBack } from "react-icons/io5";
import { IoStopSharp } from "react-icons/io5";
import { IoPlay } from "react-icons/io5";
import { CiVolumeMute } from "react-icons/ci";
import { IoPlaySkipForward } from "react-icons/io5";
import skipBack from "../../../assets/skipBack.svg";
import axios from 'axios';
import { IoPlaySkipForwardCircleOutline } from "react-icons/io5";
import getAccessToken from '@/utils/getAccessToken';
import { FaRegPlayCircle } from "react-icons/fa";
import { PlaybackStreams } from '../Streams/CameraPlay/PlaybackStreams';
import PlayBackTime from './components/PlayBackTime';
import Timeline from './components/Timeline';
import MediaControls from './components/MediaControls';
import RecordedScreens from './components/RecordedScreens';
import VideoCanvasStream from '../Dashboard/VideoCanvasStream';
import PlaybackVideoCanvasStream from '../Dashboard/PlaybackVideoCanvasStream';
const HOST = import.meta.env.VITE_BACKEND;
import { v4 as uuidv4 } from 'uuid'; // For generating a unique session ID
import Cookies from 'js-cookie';
import TimePicker24Hour from './components/TimelineBar';
import { toast } from 'sonner';

const PlaybackVideo = ({
  videoRef,
  selectedCamera,
  isLoading,
  src,
  maxminBtnclass,
  maxsize,
  minsize,
  thumbnailSrc,
  isInModal = false,
  onTimeRangeSelect,
  selectedDate,
  selectedEndDate,
  nvrId,
  cameraId,
  channel,
  zoomLevel,
  setZoomLevel,
  onPlaybackUrlRetry,
}) => {
  const containerRef = useRef(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [availableSegments, setAvailableSegments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [autoPlayRecordings, setAutoPlayRecordings] = useState(false);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(-1);
  const [pendingSeekTime, setPendingSeekTime] = useState(null);
  const progressIntervalRef = useRef(null);
  const playbackInstanceRef = useRef(null);
  const [clickedTime, setClickedTime] = useState(null);
  const [videoControls, setVideoControls] = useState(null);
  const [position, setPosition] = useState(0); // timeline position in seconds
  const [selectedRange, setSelectedRange] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false); // Persist fullscreen state
  // Cleanup function
  const cleanupPlayback = () => {
    if (playbackInstanceRef.current) {
      playbackInstanceRef.current.destroy();
      playbackInstanceRef.current = null;
    }
    pauseVideo();
  };

  useEffect(() => {
    const videoElement = videoRef?.current;
    if (!videoElement) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => setIsBuffering(false);

    videoElement.addEventListener('play', handlePlay);
    videoElement.addEventListener('pause', handlePause);
    videoElement.addEventListener('waiting', handleWaiting);
    videoElement.addEventListener('playing', handlePlaying);

    return () => {
      videoElement.removeEventListener('play', handlePlay);
      videoElement.removeEventListener('pause', handlePause);
      videoElement.removeEventListener('waiting', handleWaiting);
      videoElement.removeEventListener('playing', handlePlaying);
    };
  }, []);



  const togglePlayback = () => {
    if (videoRef?.current) {
      if (isPlaying) {
        videoRef?.current.pause();
      } else {
        videoRef?.current.play();
      }
    }
  };

  const handlePreviousSegment = () => {
    if (videoRef?.current && currentSegmentIndex > 0) {
      const newIndex = currentSegmentIndex - 1;
      setCurrentSegmentIndex(newIndex);
      videoRef.current.currentTime = availableSegments[newIndex].startTime;
    }
  };

  const handleNextSegment = () => {
    if (currentSegmentIndex < availableSegments.length - 1) {
      const nextIndex = currentSegmentIndex + 1;
      setCurrentSegmentIndex(nextIndex);
      handleTimeSelect(availableSegments[nextIndex], nextIndex, selectedCamera);
    } else {
      pauseVideo();
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

  const changePlaybackRate = () => {
    const rates = [1, 1.5, 2];
    const currentIndex = rates.indexOf(playbackRate);
    const nextRate = rates[(currentIndex + 1) % rates.length];

    setPlaybackRate(nextRate);

    if (videoRef.current) {
      videoRef.current.playbackRate = nextRate;
    }
  };


  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
      videoRef.current.defaultPlaybackRate = playbackRate;
    }
  }, [playbackRate]);

  const handleZoomIn = () => {
    // Implement zoom logic here, e.g., for a waveform display
  };

  const handleZoomOut = () => {
    // Implement zoom logic here
  };

  // Fetch timeline data when date range or camera changes
  useEffect(() => {
    if (selectedDate && selectedEndDate && nvrId && cameraId) {
      fetchRecordedTimeline(selectedDate, selectedEndDate);
    }
    return () => {
      cleanupPlayback();
      clearInterval(progressIntervalRef.current);
    };
  }, [selectedDate, selectedEndDate, nvrId, cameraId]);

  const fetchRecordedTimeline = async (startDate, endDate) => {
    const sessionId = uuidv4();
    Cookies.set('playback_session_id', sessionId, { expires: 1 });
    try {
      setLoading(true);
      cleanupPlayback();

      const startDateUTC = new Date(Date.UTC(
          startDate.getFullYear(),
          startDate.getMonth(),
          startDate.getDate(),
        0, 0, 0, 0
      ));
      const endDateUTC = new Date(Date.UTC(
          endDate.getFullYear(),
          endDate.getMonth(),
          endDate.getDate(),
        23, 59, 59, 999
      ));

      const response = await axios.post(
        `${HOST}/api/v1/channel/playback-timeline`,
        {
          nvrId: nvrId,
          cameraId: cameraId,
          channel: channel,
          startTime: startDateUTC.toISOString(),
          endTime: endDateUTC.toISOString()
        },
        {
          headers: {
            'accept': 'application/json',
            'x-access-token': getAccessToken(),
            'Content-Type': 'application/json'
          }
        }
      );

      const segments = processRecordedData(response?.data?.body?.data?.timeline?.CMSearchResult?.matchList?.searchMatchItem);
      setAvailableSegments(segments);
      if (segments.length > 0) {
        setCurrentSegmentIndex(0);
        handleTimeSelect(segments[0], undefined, undefined, selectedCamera);
      }

      // else{
      //   toast.error("No segment available on this date");

      // }
    } catch (error) {
      console.error('Error fetching playback timeline:', error);
      setAvailableSegments([]);
      setCurrentSegmentIndex(-1);
    } finally {
      setLoading(false);
    }
  };


  const startProgressTracking = () => {
    clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = setInterval(() => {
      if (videoRef?.current && !isSeeking) {
        setCurrentTime(videoRef?.current.currentTime);

        // Check if we're near the end of the current segment
        if (videoRef?.current.currentTime >= duration - 2 && isPlaying) {
          handleNextSegment();
        }
      }
    }, 100);
  };
  

  const processRecordedData = (matchItems) => {
    if (!matchItems || matchItems.length === 0) return [];

    return matchItems.map(item => ({
        start: new Date(item.timeSpan.startTime),
        end: new Date(item.timeSpan.endTime),
      uri: item.mediaSegmentDescriptor.playbackURI
    })).sort((a, b) => a.start - b.start);
  };

  // Initialize playback when selected range changes
  useEffect(() => {
    if (selectedRange && videoRef?.current) {
      initializePlayback(selectedRange);
    }
  }, [selectedRange]);

  // Seek to pending time after segment is loaded
  useEffect(() => {
    if (selectedRange && pendingSeekTime !== null && videoRef?.current) {
      videoRef.current.currentTime = pendingSeekTime;
      setCurrentTime(pendingSeekTime);
      setPendingSeekTime(null); // Reset pending seek time
    }
  }, [selectedRange, pendingSeekTime, videoRef?.current]);

  const initializePlayback = (segment) => {
    cleanupPlayback();

    // Here you would initialize your playback stream with the segment URI
    // This is a placeholder - replace with your actual playback initialization
    playbackInstanceRef.current = {
      uri: segment.uri,
      destroy: () => {
        // Cleanup logic for the playback instance
      },
    };

    // Reset video state
    setCurrentTime(0);
    setDuration(segment.end - segment.start);

    if (autoPlayRecordings) {
      playVideo();
    }
  };



  const playVideo = () => {
    if(!videoRef?.current) return
    setIsPlaying(true);
    if (videoRef?.current) {
      videoRef?.current?.play()?.catch(e => {
        console.error("Playback failed:", e);
        setIsPlaying(false);
      });
    }
    startProgressTracking();
  };

  const pauseVideo = () => {
    setIsPlaying(false);
    clearInterval(progressIntervalRef.current);
    if (videoRef?.current) {
      // videoRef?.current?.pause();
    }
  };

  

  const handleTimeSelect = (segment, index, seekToTime = null,selectedCamera) => {
    cleanupPlayback();
    // If user clicked inside segment, adjust the start to clicked time
    const updatedSegment = {
      ...segment,
      start: seekToTime ? seekToTime : segment.start,
    };

    setSelectedRange(updatedSegment);

    if (typeof index !== 'undefined') {
      setCurrentSegmentIndex(index);
    }

    onTimeRangeSelect(updatedSegment.start, updatedSegment.end, selectedCamera);

    if (seekToTime !== null) {
      setPendingSeekTime(seekToTime);
    }
  };
  


  const handleProgressMouseDown = () => {
    setIsSeeking(true);
  };

  const handleProgressMouseUp = (e) => {
    seekToPosition(e);
    setIsSeeking(false);
  };

  const handleProgressClick = (e) => {
    seekToPosition(e);
  };

  const seekToPosition = (e) => {
    if (!videoRef?.current || !selectedRange) return;

    const progressBar = e.currentTarget;
    const clickPosition = e.clientX - progressBar.getBoundingClientRect().left;
    const percentClicked = clickPosition / progressBar.clientWidth;
    const newTime = percentClicked * duration;

    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);

    if (!isPlaying) {
      playVideo();
    }
  };

  const formatTime = (seconds) => {
    if (isNaN(seconds)) return '00:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const formatTimeUTC = (date) => {
    if (!date) return '--:--';
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const getTimePosition = (time) => {
    if (!selectedDate) return 0;

    let minTime, maxTime;

    if (availableSegments?.length > 0) {
      minTime = availableSegments[0]?.start?.getTime();
      maxTime = availableSegments[availableSegments?.length - 1]?.end?.getTime();
    } else {
      // Fallback to 24-hour day if no segments
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);
      minTime = startOfDay.getTime();
      maxTime = endOfDay.getTime();
    }

    const totalDuration = maxTime - minTime;
    if (totalDuration === 0) return 0; // Avoid division by zero

    const position = time.getTime() - minTime;

    return (position / totalDuration) * 100;
  };

  const getSegmentWidth = (start, end) => {
    if (!selectedDate || availableSegments.length === 0) {
      // Fallback to original calculation if no segments
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);
      const total = endOfDay.getTime() - startOfDay.getTime();
      return ((end.getTime() - start?.getTime()) / total) * 100;
    }

    const minTime = availableSegments[0].start?.getTime();
    const maxTime = availableSegments[availableSegments.length - 1].end.getTime();
    const totalDuration = maxTime - minTime;
    if (totalDuration === 0) return 0; // Avoid division by zero

    return ((end?.getTime() - start?.getTime()) / totalDuration) * 100;
  };


  return (
    <div className={`w-full ${isFullscreen ? 'fixed inset-0 z-[9998]' : ''}`}>
      <div
        ref={containerRef}
        className={`relative w-full rounded overflow-hidden bg-black ${
          isFullscreen 
            ? 'h-screen' 
            : 'min-h-[500px] max-h-[calc(100vh-220px)]'
        }`}
        style={!isFullscreen ? { height: 'calc(100vh - 220px)' } : {}}
      >
        {!selectedCamera && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0C0C0C] z-30">
            <div className="flex flex-col items-center text-center px-6">
              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-5">
                <SearchCode className="w-5 h-5 text-gray-500" />
              </div>
              <h3 className="text-gray-300 text-base font-medium tracking-tight mb-1">
                No Camera Selected
              </h3>
              <p className="text-gray-500 text-xs max-w-[240px] leading-relaxed">
                Choose an NVR or adjust your filters to view recorded footage.
              </p>
            </div>
          </div>
        )}
        {/* Playback time top right */}
        {/* <div className="absolute lg:top-3 lg:right-7 2xl:top-5 2xl:right-7 md:top-3 md:right-4 z-20 top-1.5 right-4">
        <PlayBackTime
  dateTime={
    selectedRange?.start
      ? new Date(new Date(selectedRange.start).getTime() + currentTime * 1000)
      : null
  }
  className='text-white'
/>
        </div> */}
        {src && !isLoading && (
          <PlaybackVideoCanvasStream
            handleNextSegment={handleNextSegment}
            selectedRange={selectedRange}
            clickedTime={clickedTime}
            videoRef={videoRef}
            setClickedTime={setClickedTime}
            isLoading={isLoading}
            hlsUrl={src}
            onControlsReady={setVideoControls}
            availableSegments={availableSegments}
            selectedCamera={selectedCamera}
            currentTime={currentTime}
            setCurrentTime={setCurrentTime}
            isFullscreen={isFullscreen}
            setIsFullscreen={setIsFullscreen}
            playbackRate={playbackRate}
            changePlaybackRate={changePlaybackRate}
            onPlaybackUrlRetry={onPlaybackUrlRetry}
          />
        )}
        {/* Removed maximize/minimize and live buttons */}

        <div
          className={`absolute bottom-0 left-0 right-0 ${isFullscreen ? 'z-[10000]' : 'z-10'}`}
        >
          {videoControls && (
            <div>
              <MediaControls
                targetRef={containerRef}
                position={position}
                setPosition={setPosition}
                videoRef={videoControls.videoRef}
                currentSegmentIndex={videoControls.currentSegmentIndex}
                handlePreviousSegment={videoControls.handlePreviousSegment}
                skipBackward={videoControls.skipBackward}
                togglePlayback={videoControls.togglePlayPause}
                isBuffering={videoControls.isBuffering}
                isPlaying={videoControls.isPlaying}
                selectedRange={videoControls.selectedRange}
                skipForward={videoControls.skipForward}
                handleNextSegment={videoControls.handleNextSegment}
                availableSegments={availableSegments}
                changePlaybackRate={changePlaybackRate}
                playbackRate={videoControls.playbackRate}
                currentTime={videoControls.currentTime}
                duration={videoControls.duration}
                isMuted={videoControls.isMuted}
                toggleMute={videoControls.toggleMute}
                seekVideo={videoControls.seekVideo}
                toggleFullscreen={videoControls.toggleFullscreen}
                isFullscreen={videoControls.isFullscreen}
                maxminBtnclass={maxminBtnclass}
                maxsize={maxsize}
                minsize={minsize}
                handleZoomIn={videoControls.handleZoomIn}
                handleZoomOut={videoControls.handleZoomOut}
              />
            </div>
          )}

          <TimePicker24Hour
            targetRef={containerRef}
            position={position}
            setPosition={setPosition}
            onTimeRangeSelect={onTimeRangeSelect}
            selectedCamera={selectedCamera}
            selectedDate={selectedDate}
            videoRef={videoControls?.videoRef}
            currentTime={currentTime}
            setCurrentTime={setCurrentTime}
            loading={loading}
            availableSegments={availableSegments}
            selectedRange={availableSegments[currentSegmentIndex] || null}
            duration={duration}
            currentSegmentIndex={currentSegmentIndex}
            setZoomLevel={setZoomLevel}
            zoomLevel={zoomLevel}
            selectedEndDate={selectedEndDate}
            handleTimeSelect={handleTimeSelect} // receives absolute Date from Timeline
            formatTimeUTC={formatTimeUTC}
            getTimePosition={getTimePosition}
            getSegmentWidth={getSegmentWidth}
            clickedTime={clickedTime}
            setClickedTime={setClickedTime}
            detections={[]} // pass your detections array here if available
            onDetectionClick={(det) => {
              // the Timeline will call handleTimeSelect with absolute Date already
              // Optional: you can also open a detection panel here
            }}
          />
        </div>
      </div>

      {/* <div>
        <div className='flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3'>
          <h3 className="text-base sm:text-lg md:text-xl lg:text-[20px] font-[500] text-[#000000]">
            Recorded Screens
          </h3>
          <div className='flex items-center gap-2'>
            <span className="text-xs md:text-[14px] font-[400] text-[#7a7a7a]">Auto Play</span>
            <Switch
              className="data-[state=checked]:bg-[#07486a]"
              checked={autoPlayRecordings}
              onCheckedChange={setAutoPlayRecordings}
            />
          </div>
        </div>
        <div className='flex justify-between items-center mt-1.5 sm:mt-2'>
          <span className='font-[400] text-[10px] sm:text-[11px] md:text-[12px] text-[#2c2c2c]'>
            {selectedDate?.toLocaleDateString('en-US', { 
              weekday: 'short', 
              day: 'numeric', 
              month: 'long', 
              year: 'numeric' 
            })}
          </span>
        </div>
      </div>
       */}
      {/* <RecordedScreens
        availableSegments={availableSegments}
        handleTimeSelect={handleTimeSelect}
        formatTimeUTC={formatTimeUTC}
      /> */}
    </div>
  );
};

export default PlaybackVideo;
