import React, { useRef, useEffect, useState } from 'react';
import { TiArrowSortedDown } from "react-icons/ti";
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

const toValidDate = (input) => {
  const date = new Date(input);
  return isNaN(date.getTime()) ? null : date;
};

const Timeline = ({
  selectedCamera,
  loading,
  availableSegments,
  selectedRange,
  currentTime,
  duration,
  currentSegmentIndex,
  setZoomLevel,
  zoomLevel,
  selectedDate,
  selectedEndDate,
  handleTimeSelect,
  videoRef,
  formatTimeUTC,
  getTimePosition,
  getSegmentWidth,
  clickedTime,
  setClickedTime
}) => {
  const timelineInnerRef = useRef(null);
  const [hoverTime, setHoverTime] = useState(null);
  const [hoverPosition, setHoverPosition] = useState(null);
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const [isPlayheadHovered, setIsPlayheadHovered] = useState(false);

  const startDate = toValidDate(selectedRange?.start);
  const currentProgress = startDate && currentTime !== null
    ? getTimePosition(new Date(startDate.getTime() + currentTime * 1000))
    : 0;

  useEffect(() => {
    if (timelineInnerRef.current && duration > 0 && currentTime !== null) {
      const percentage = (currentTime / duration);
      const containerWidth = timelineInnerRef.current.scrollWidth;
      const viewportWidth = timelineInnerRef.current.parentElement.clientWidth;
      const scrollPosition = (percentage * containerWidth) - (viewportWidth / 2);
      timelineInnerRef.current.scrollLeft = Math.max(0, Math.min(scrollPosition, containerWidth - viewportWidth));
    }
  }, [currentTime, duration, zoomLevel]);

  useEffect(() => {
    if (!videoRef?.current) return;
    const video = videoRef.current;

    const handleTimeUpdate = () => {
      if (video && selectedRange) {
        handleTimeSelect(selectedRange, currentSegmentIndex, video.currentTime, selectedCamera);
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [videoRef, selectedRange, currentSegmentIndex, handleTimeSelect, selectedCamera]);

  const handleMouseMove = (e) => {
    const startDate = toValidDate(selectedRange?.start);
    if (!startDate || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const percent = mouseX / rect.width;
    const timeAtCursor = percent * duration;
    const absoluteTime = new Date(startDate.getTime() + timeAtCursor * 1000);
    
    setHoverTime(absoluteTime);
    setHoverPosition({ x: mouseX, y: e.clientY - rect.top });
  };

  const handleMouseLeave = () => {
    setHoverTime(null);
    setHoverPosition(null);
  };


  useEffect(() => {
    console.log(videoRef, "videoRef?.current")
    if (!videoRef?.current) return;
    const video = videoRef?.current;
  
    const handleTimeUpdate = () => {
      if (video && selectedRange) {
        handleTimeSelect(selectedRange, currentSegmentIndex, video.currentTime, selectedCamera);
      }
    };
  
    // 🎹 Keyboard Hotkeys
    const handleKeyDown = (e) => {
      if (!video) return;
      let newTime = video.currentTime;
      console.log(e.key, "e.key")
      if (e.key === 'ArrowRight') {
        newTime = Math.min(video.duration, video.currentTime + 10); // jump forward 10 sec
      } else if (e.key === 'ArrowLeft') {
        newTime = Math.max(0, video.currentTime - 10); // jump backward 10 sec
      } else {
        return; // ignore other keys
      }
  
      video.currentTime = newTime;
  
      const startDate = toValidDate(selectedRange?.start);
      if (startDate) {
        const absoluteTime = new Date(startDate.getTime() + newTime * 1000);
        setClickedTime(absoluteTime);
        handleTimeSelect(selectedRange, currentSegmentIndex, newTime, selectedCamera);
      }
    };
  
    window.addEventListener('keydown', handleKeyDown);
    video.addEventListener('timeupdate', handleTimeUpdate);
  
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [videoRef, selectedRange, currentSegmentIndex, handleTimeSelect, selectedCamera, setClickedTime]);
  
  return (
    loading ? (
      <div className="relative overflow-hidden bg-[#dfdfdf] h-[91px] flex items-end">
        <SkeletonTheme baseColor="#ebebeb" highlightColor="#07486A">
          <div className="min-w-full">
            <Skeleton height={46} />
          </div>
        </SkeletonTheme>
      </div>
    ) : (
      <div
        className="relative overflow-visible bg-[#dfdfdf] h-[91px] flex items-end"
        onWheel={(e) => {
          if (e.ctrlKey) {
            e.preventDefault();
            e.stopPropagation();
            setZoomLevel((prev) => {
              const newZoom = e.deltaY < 0 ? prev + 0.2 : prev - 0.2;
              return Math.min(Math.max(newZoom, 0.5), 5);
            });
          }
        }}
      >
        <div
          ref={timelineInnerRef}
          className="relative overflow-visible h-[46px] min-w-full bg-gray-100"
          style={{ width: `${100 * zoomLevel}%` }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={(e) => {
            const startDate = toValidDate(selectedRange?.start);
            if (!startDate || !videoRef.current) return;

            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const percent = clickX / rect.width;
            const newTime = percent * duration;

            videoRef.current.currentTime = newTime;
            setClickedTime(new Date(startDate.getTime() + newTime * 1000));
            handleTimeSelect({ start: newTime, end: newTime + 1 }, undefined, newTime, selectedCamera);
          }}
        >
          {/* Base background */}
          <div className="absolute inset-0 bg-[#D8F2FF] cursor-not-allowed">
            {/* Playback progress bar */}
            <div
              className="absolute h-full bg-[#07486A] transition-all duration-200"
              style={{ width: `${currentProgress}%` }}
            />

            {/* NEW: Buffered indicator (lighter blue overlay) */}
            <div
              className="absolute h-full bg-[#A6D8FF]/50"
              style={{ width: `${bufferedPercent || 0}%` }}
            />

            {/* Grid overlay */}
            {/* <div
              className="absolute -top-[11px] left-0 w-full"
              style={{
                height: '12px',
                backgroundImage: `
                  repeating-linear-gradient(
                    to right,
                    #7D7D7D, #7D7D7D 1px,
                    transparent 1px,
                    transparent calc(100% / 29)
                  ),
                  repeating-linear-gradient(
                    to right,
                    #7D7D7D, #7D7D7D 1px,
                    transparent 1px,
                    transparent calc(100% / 7.25)
                  )`,
                backgroundSize: '100% 7px, 100% 12px',
                backgroundPosition: '0 4px, 0 0',
                backgroundRepeat: 'no-repeat',
              }}
            /> */}

            {/* Time bars + labels */}
            {(() => {
              const elements = [];
              const start = toValidDate(selectedRange?.start);
              const end = toValidDate(selectedRange?.end);
              if (start && end) {
                const step = 30 * 60 * 1000;
                for (let time = start.getTime(); time <= end.getTime(); time += step) {
                  const labelDate = new Date(time);
                  const left = getTimePosition(labelDate);
                  elements.push(
                    <React.Fragment key={time}>
                      <div
                        className="absolute top-0 h-full w-[1px] bg-gray-300"
                        style={{ left: `${left}%` }}
                      />
                      <div
                        className="absolute z-50 text-[6px] text-[#333333] top-[24px] transform -translate-x-1/2 whitespace-nowrap"
                        style={{ left: `${left}%` }}
                      >
                        {labelDate.toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true,
                        })}
                      </div>
                    </React.Fragment>
                  );
                }
              }
              return elements;
            })()}

            {/* Segments */}
            {availableSegments.map((segment, index) => {
              const segmentStart = toValidDate(segment.start);
              const segmentEnd = toValidDate(segment.end);
              if (!segmentStart || !segmentEnd) return null;

              const left = getTimePosition(segmentStart);
              const width = getSegmentWidth(segmentStart, segmentEnd);

              return (
                <Tooltip key={index}>
                  <TooltipTrigger asChild>
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const clickX = e.clientX - rect.left;
                        const percentWithinSegment = clickX / rect.width;
                        const segmentDurationSeconds = (segmentEnd - segmentStart) / 1000;
                        const timeOffsetWithinSegment = percentWithinSegment * segmentDurationSeconds;
                        const absoluteClickTime = new Date(segmentStart.getTime() + timeOffsetWithinSegment * 1000);
                        handleTimeSelect(segment, index, absoluteClickTime, selectedCamera);
                        setClickedTime(absoluteClickTime);
                      }}
                      className={`absolute h-full cursor-pointer transition-colors `}
                      style={{
                        left: `${left}%`,
                        width: `${Math.max(1, width)}%`,
                        minWidth: '4px',
                        borderRadius: '2px',
                      }}
                    >
                    </div>
                  </TooltipTrigger>

                </Tooltip>
              );
            })}
          </div>

          {/* Segment indicators outside the blue box */}
          {availableSegments.map((segment, index) => {
            const segmentStart = toValidDate(segment.start);
            if (!segmentStart) return null;

            const left = getTimePosition(segmentStart);

            return (
              <div key={`indicator-${index}`} className="absolute top-[-25px] flex items-center gap-1" style={{ left: `${left}%` }}>
                <div className="w-[3px] h-[3px] bg-[#333] rounded-full shadow-sm"></div>
                <span className="text-[9px] text-gray-600">{formatTimeUTC(segmentStart)}</span>
              </div>
            );
          })}

          {/* Playhead indicator */}
          {clickedTime && (
            <div
              className="absolute -top-5 bottom-0 w-[2px] bg-black z-20"
              style={{ left: `${getTimePosition(clickedTime.date || clickedTime)}%` }}
              onMouseEnter={() => setIsPlayheadHovered(true)}
              onMouseLeave={() => setIsPlayheadHovered(false)}
            >
              <div>
                <div className="absolute top-2 left-1/2 -translate-x-1/2">
                  <TiArrowSortedDown className="text-black w-6 h-6" />
                </div>
                {isPlayheadHovered && (() => {
                  const position = getTimePosition(clickedTime.date || clickedTime);
                  const alignment = position < 10 ? 'left' : position > 90 ? 'right' : 'center';

                  const tooltipClasses = {
                    center: 'left-1/2 -translate-x-1/2',
                    left: 'left-0',
                    right: 'right-0'
                  };

                  const arrowClasses = {
                    center: 'left-1/2 -translate-x-1/2',
                    left: 'left-0',
                    right: 'right-0'
                  };

                  return (
                    <div
                      className={`absolute top-[-50px] bg-gray-900 text-white rounded-md px-2 py-2 shadow-lg z-30 border border-gray-700 ${tooltipClasses[alignment]}`}
                    >
                      {/* Tooltip content */}
                      <div className="flex items-center gap-2 text-[10px] font-medium">
                        <span className="whitespace-nowrap">
                          {clickedTime.seconds !== undefined
                            ? `${clickedTime.seconds}s`
                            : new Date(clickedTime).toLocaleString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: true,
                              })}
                        </span>
                      </div>
                      {/* Arrow */}
                      <div className={`absolute top-full -mt-px ${arrowClasses[alignment]}`}>
                        <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  );
};

export default Timeline;