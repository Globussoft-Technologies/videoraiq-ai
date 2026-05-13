import React from 'react';
import { Button } from '@/components/ui/button';
import PlaybackVideo from '../PlaybackVideo';

const VideoSection = ({
  isLoading,
  videoRef,
  playbackUrl,
  handleSmartZoom,
  timelineZoomLevel,
  dateRange,
  handleTimeRangeSelect,
  selectedNVRId,
  selectedCameraId,
  selectedCamera,
  zoomLevel,
  onPlaybackUrlRetry,

}) => {


  return (
    <div className="relative">
      <PlaybackVideo
      videoRef={videoRef}
      selectedCamera={selectedCamera}
      isLoading={isLoading}
        src={playbackUrl}
        thumbnailSrc={""}
        maxminBtnclass=""
        maxsize="text-base"
        minsize="text-base w-4 h-4"
        isInModal={true}
        onTimeRangeSelect={handleTimeRangeSelect}
        selectedDate={dateRange.start}
        selectedEndDate={dateRange.end}
        nvrId={selectedNVRId}
        cameraId={selectedCameraId}
        channel={selectedCamera?.streamId}
        zoomLevel={zoomLevel}
        onZoomIn={() => handleSmartZoom('in')}
        onZoomOut={() => handleSmartZoom('out')}
        onPlaybackUrlRetry={onPlaybackUrlRetry}
    
      />

      {/* <div className="absolute top-4 left-4 bg-[#3F3F3F80] text-white text-[10px] font-normal px-3 py-[6px] rounded-full">
        {playbackUrl ? '▶ Playback' : '▶ Live'}
      </div> */}
      

      {/* <div className="absolute bottom-[35vh] right-5 flex flex-col gap-2">
        <Button 
          variant="ghost" 
          className="bg-[#3F3F3F80] text-white hover:bg-[#3F3F3FCC] w-8 h-8 p-0"
          onClick={() => handleSmartZoom('in')}
          disabled={timelineZoomLevel >= 4}
        >
          +
        </Button>
        <Button 
          variant="ghost" 
          className="bg-[#3F3F3F80] text-white hover:bg-[#3F3F3FCC] w-8 h-8 p-0"
          onClick={() => handleSmartZoom('out')}
          disabled={timelineZoomLevel <= 0.5}
        >
          -
        </Button>
      </div> */}
    </div>
  );
};

export default VideoSection;
