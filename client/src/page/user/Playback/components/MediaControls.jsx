import React from 'react';
import { 
  IoPlayBack, 
  IoStopSharp, 
  IoPlay, 
  IoPlaySkipForward,
  IoVolumeHigh,
  IoVolumeMute 
} from "react-icons/io5";
import { MdExposurePlus1 } from "react-icons/md";
import { TbExposureMinus1 } from "react-icons/tb";
import { 
  MdSkipPrevious, 
  MdSkipNext,
  MdFullscreen,
  MdFullscreenExit 
} from "react-icons/md";
import { RotateCw, Rewind, FastForward, SkipBack, SkipForward } from "lucide-react";
import AutoHideWrapper from './AutoHideWrapper';

const MediaControls = ({
  currentSegmentIndex,
  videoRef,
  handlePreviousSegment,
  skipBackward,
  togglePlayback,
  isBuffering,
  isPlaying,
  selectedRange,
  skipForward,
  handleNextSegment,
  availableSegments,
  changePlaybackRate,
  playbackRate,
  handleZoomIn,
  handleZoomOut,
  toggleFullscreen,
  isFullscreen,
  maxminBtnclass,
  maxsize,
  minsize,
  setPosition,
  position,
  currentTime,
  targetRef, // Ref to the video container for auto-hide
}) => {
  const baseButtonClass = "group relative flex items-center justify-center rounded-full transition-all duration-300 ease-in-out transform active:scale-95 focus:outline-none   cursor-pointer";
  
  const enabledButtonClass = "bg-gradient-to-br from-slate-700 to-slate-800 text-white shadow-lg  backdrop-blur-sm";
  
  const disabledButtonClass = "bg-gray-400/50 text-gray-300 cursor-not-allowed opacity-50 backdrop-blur-sm";
  
  const primaryButtonClass = "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-blue-500/50 ";
  
  const hasSegments = availableSegments.length > 0;

  const jumpSeconds = (sec) => {

    const totalDuration = 24 * 60 * 60; // 86400s in a day
  
    setPosition((prev) => Math.min(Math.max(prev + sec, 0)+(currentTime || 0), totalDuration));

  };

  return (
    // <AutoHideWrapper className="w-full" hideDelay={2000} targetRef={targetRef}>
      <div className="bg-transparent p-2 md:p-2.5 ml-4 justify-center flex items-center relative rounded-lg">
        
        {/* Main Controls - Center */}
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-2 md:gap-2.5 bg-black/30 px-3 py-1.5 rounded-full  border border-[#07486A]">
            
            {/* Skip Backward */}
            <button
              onClick={() => jumpSeconds(-60)}
              // disabled={!availableSegments.length >0}
              className={`${baseButtonClass} w-7 h-7 md:w-8 md:h-8 ${availableSegments.length === 0 ? disabledButtonClass : enabledButtonClass}`}
              title="Skip Backward"
            >
              <MdSkipPrevious className="w-4 h-4 md:w-5 md:h-5" />
            </button>

            {/* Rewind 30 sec */}
            <button
              onClick={() => jumpSeconds(-30)}
              // disabled={!availableSegments.length >0}
              className={`${baseButtonClass} w-7 h-7 md:w-8 md:h-8 ${!hasSegments ? disabledButtonClass : enabledButtonClass}`}
              title="Rewind 30 sec"
            >
              <Rewind className="w-4 h-4 md:w-5 md:h-5" />
            </button>

            {/* Play/Pause Button */}
            <button
              onClick={togglePlayback}
              disabled={isBuffering}
              className={`${baseButtonClass} w-9 h-9 md:w-10 md:h-10 ${!hasSegments || isBuffering ? disabledButtonClass : primaryButtonClass}`}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isBuffering ? (
                <RotateCw className="w-4 h-4 md:w-5 md:h-5 animate-spin" />
              ) : isPlaying ? (
                <IoStopSharp className="w-4 h-4 md:w-5 md:h-5" />
              ) : (
                <IoPlay className="w-4 h-4 md:w-5 md:h-5 ml-0.5" />
              )}
            </button>

            {/* Fast Forward 30 sec */}
            <button
              onClick={() => jumpSeconds(30)}
              // disabled={!availableSegments.length >0}
              className={`${baseButtonClass} w-7 h-7 md:w-8 md:h-8 ${!hasSegments ? disabledButtonClass : enabledButtonClass}`}
              title="Fast Forward 30 sec"
            >
              <FastForward className="w-4 h-4 md:w-5 md:h-5" />
            </button>

            {/* Skip Forward */}
            <button
              onClick={() => jumpSeconds(60)}
              // disabled={!availableSegments.length >0}
              className={`${baseButtonClass} w-7 h-7 md:w-8 md:h-8 ${!hasSegments ? disabledButtonClass : enabledButtonClass}`}
              title="Skip Forward"
            >
              <MdSkipNext className="w-4 h-4 md:w-5 md:h-5" />
            </button>

            {/* Playback Speed */}
            <button
             onClick={changePlaybackRate}
             disabled={false} // enable only when segments exist
             className={`${baseButtonClass} ${enabledButtonClass} w-9 h-7 md:w-10 md:h-8 font-semibold text-xs`}
             title="Playback Speed"
            >
              {playbackRate}x
            </button>


            {/* Volume Control */}
          
          </div>
        </div>

        {/* Fullscreen Control - Right */}
        <div className='absolute right-3 md:right-4 top-1/2 -translate-y-1/2'>
          <button
            onClick={toggleFullscreen}
            className={`${maxminBtnclass || `${baseButtonClass} ${enabledButtonClass} w-8 h-8 md:w-9 md:h-9`}`}
            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {isFullscreen ? (
              <MdFullscreenExit className={`${minsize || 'w-4 h-4 md:w-5 md:h-5'}`} />
            ) : (
              <MdFullscreen className={`${maxsize || 'w-4 h-4 md:w-5 md:h-5'}`} />
            )}
          </button>
        </div>
      </div>
      
    // </AutoHideWrapper>
  );
};

export default MediaControls;
