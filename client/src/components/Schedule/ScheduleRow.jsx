import React, { useState, useCallback, useRef } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/Tooltip';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Copy, RotateCcw, X } from 'lucide-react';
import CustomTimePicker from './CustomTimePicker';
import { TbClock24 } from "react-icons/tb";
import ResetConfirmationDialog from '@/components/ui/ResetConfirmationDialog';

// Format hour to 24-hour time - moved outside component for performance
const formatTime = (hour, minutes = 0) => {
  const h = Math.floor(hour);
  const m = Math.floor(minutes);
  if (h === 24 && m === 0) return '24:00';
  const normalizedH = h % 24;
  return `${normalizedH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

// Pixel-perfect time calculation helper
const calculateTimeFromPixel = (x, rectWidth) => {
  const totalMinutes = Math.round((x / rectWidth) * 24 * 60);
  if (totalMinutes >= 24 * 60) {
    return { hour: 24, minute: 0 };
  } else {
    return {
      hour: Math.floor(totalMinutes / 60),
      minute: totalMinutes % 60
    };
  }
};

// Convert time string to total minutes
const timeStringToMinutes = (timeString) => {
  if (timeString === '24:00') return 24 * 60;
  const [h, m] = timeString.split(':').map(Number);
  return h * 60 + m;
};

const ScheduleRow = ({ 
  day, 
  selectedHours, 
  onHoursChange, 
  onCopySchedule, 
  onResetSchedule,
  allDays 
}) => {
  const [rangeStart, setRangeStart] = useState(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [pickerState, setPickerState] = useState({ open: false, index: null, start: '00:00', end: '00:00', left: '50%', top: '-160px' });
  const [selectedDays, setSelectedDays] = useState([]);
  const [copyToAll, setCopyToAll] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);

  const timelineRef = useRef(null);

  const [floatingTooltip, setFloatingTooltip] = useState({ visible: false, left: 0, top: -36, text: '' });

  const handleHourClick = useCallback((e) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    
    // Pixel-perfect calculation using helper function
    const { hour: currentHour, minute: currentMinute } = calculateTimeFromPixel(x, rect.width);
    if (rangeStart === null) {
      // First click - start the range with precise time
      setRangeStart({ hour: currentHour, minute: currentMinute });
    } else {
      // Second click - complete the range with precise time
      const startTimeMinutes = rangeStart.hour * 60 + rangeStart.minute;
      const endTimeMinutes = currentHour * 60 + currentMinute;
      
      // Ensure start is before end
      const [startMin, endMin] = startTimeMinutes <= endTimeMinutes 
        ? [startTimeMinutes, endTimeMinutes]
        : [endTimeMinutes, startTimeMinutes];
      
      // Prevent creating zero-width intervals
      if (startMin === endMin) {
        setRangeStart(null);
        return;
      }
      
      const startH = Math.floor(startMin / 60);
      const startM = startMin % 60;
      const endH = Math.floor(endMin / 60);
      const endM = endMin % 60;
      
      // Create new interval with precise times
      const newInterval = {
        startTime: `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`,
        endTime: endMin === 24 * 60 ? '24:00' : `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
      };
      
      // Check if this overlaps with existing intervals
      const existingIntervals = selectedHours || [];
      let updatedIntervals = [...existingIntervals];
      
      // Calculate the size of the new selection in minutes
      const selectionDuration = endMin - startMin;
      
      // Special handling: Check if there's a 24-hour selection
      const has24HourSelection = existingIntervals.some(
        interval => interval.startTime === '00:00' && interval.endTime === '24:00'
      );
      
      if (has24HourSelection && selectionDuration < 1440) {
        // If there's a 24-hour selection and user is making a partial selection,
        // replace the 24-hour selection with the new selection
        updatedIntervals = [newInterval];
      } else {
        // Normal logic for other cases
        // Check if clicking within an existing interval to remove it
        const clickedInterval = selectionDuration < 15 ? existingIntervals.find(interval => {
          const iStart = timeStringToMinutes(interval.startTime);
          const iEnd = timeStringToMinutes(interval.endTime);
          
          // Check if both start and end of new selection are within this interval
          return startMin >= iStart && endMin <= iEnd;
        }) : null;
        
        if (clickedInterval) {
          // Remove the clicked interval (only for small selections)
          updatedIntervals = existingIntervals.filter(interval => interval !== clickedInterval);
        } else {
          // Add new interval and merge overlapping ones
          updatedIntervals.push(newInterval);
        
          // Sort intervals by start time
          updatedIntervals.sort((a, b) => {
            const aStart = timeStringToMinutes(a.startTime);
            const bStart = timeStringToMinutes(b.startTime);
            return aStart - bStart;
          });
          
          // Merge overlapping or adjacent intervals
          const merged = [];
          for (const interval of updatedIntervals) {
            const currStart = timeStringToMinutes(interval.startTime);
            const currEnd = timeStringToMinutes(interval.endTime);
            
            if (merged.length === 0) {
              merged.push(interval);
            } else {
              const last = merged[merged.length - 1];
              const lastEnd = timeStringToMinutes(last.endTime);
              
              // If intervals overlap or are adjacent, merge them
              if (currStart <= lastEnd) {
                const mergedEnd = Math.max(lastEnd, currEnd);
                const mergedEndH = Math.floor(mergedEnd / 60);
                const mergedEndM = mergedEnd % 60;
                last.endTime = mergedEnd === 24 * 60 ? '24:00' : `${String(mergedEndH).padStart(2, '0')}:${String(mergedEndM).padStart(2, '0')}`;
              } else {
                merged.push(interval);
              }
            }
          }
          updatedIntervals = merged;
        }
      }
      
      onHoursChange(updatedIntervals);
      
      // Reset range start
      setRangeStart(null);
    }
  }, [rangeStart, selectedHours, onHoursChange]);

  const handleDayToggle = useCallback((dayValue) => {
    setSelectedDays(prev => 
      prev.includes(dayValue) ? prev.filter(d => d !== dayValue) : [...prev, dayValue]
    );
  }, []);

  const handleCopyToAllToggle = useCallback((checked) => {
    setCopyToAll(checked);
    if (checked) {
      setSelectedDays(allDays.map(d => d.value).filter(d => d !== day.value));
    } else {
      setSelectedDays([]);
    }
  }, [allDays, day.value]);

  const handleSaveCopy = useCallback(() => {
    // Clear any incomplete selection
    setRangeStart(null);
    
    if (copyToAll) {
      onCopySchedule();
    } else {
      onCopySchedule(selectedDays);
    }
    setPopoverOpen(false);
    setSelectedDays([]);
    setCopyToAll(false);
  }, [copyToAll, selectedDays, onCopySchedule]);

  const handleCancelCopy = useCallback(() => {
    // Clear any incomplete selection
    setRangeStart(null);
    
    setPopoverOpen(false);
    setSelectedDays([]);
    setCopyToAll(false);
  }, []);

  return (
    <div className="flex items-center gap-1  2xl:gap-2 mb-3 md:mb-4">
      {/* Day Label */}
      <div className="w-5 sm:w-6 md:w-8 mt-3 text-[9px] sm:text-[10px] md:text-xs text-[#7A7A7A] font-[500] flex-shrink-0">
        {day.label}
      </div>

      {/* Time Selection Container */}
      <div className="flex-1 relative overflow-visible">
       

        {/* Hour numbers at top */}
        <div className="flex mb-1">
          {Array.from({ length: 25 }, (_, i) => {
            const hour = i;
            return (
              <div key={hour} className={`flex-1 text-center text-[10px] text-[#BABABA] ${hour === 0 ? '-ml-2' : hour === 24 ? '-mr-2' : ''}`}>
                {hour % 2 === 0 ? (hour === 24 ? 24 : hour) : <div className="w-px h-2 bg-[#BABABA] mx-auto mt-1"></div>}
              </div>
            );
          })}
        </div>

  {/* Timeline bar container */}
  <div 
    ref={timelineRef} 
    className="relative w-full h-6"
    onMouseEnter={() => setFloatingTooltip(prev => ({ ...prev, visible: true }))}
    onMouseLeave={() => setFloatingTooltip(prev => ({ ...prev, visible: false }))}
    onMouseMove={(e) => {
      if (!timelineRef.current || pickerState.open) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      
      // Calculate total minutes with better precision
      const totalMinutes = (x / rect.width) * 24 * 60;
      
      // Snap to nearest 5-minute interval for stable tooltip display
      const snappedMinutes = Math.round(totalMinutes / 5) * 5;
      const clampedMinutes = Math.min(snappedMinutes, 24 * 60);
      
      const displayHour = Math.floor(clampedMinutes / 60);
      const displayMinute = clampedMinutes % 60;
      
      // Check if mouse is over a selected time range using the snapped value
      const isOverSelectedRange = selectedHours && selectedHours.some(interval => {
        const startTotalMinutes = timeStringToMinutes(interval.startTime);
        const endTotalMinutes = timeStringToMinutes(interval.endTime);
        return clampedMinutes >= startTotalMinutes && clampedMinutes <= endTotalMinutes;
      });
      
      // Update tooltip position and text - snap to 5-minute intervals
      const tooltipText = displayHour === 24 && displayMinute === 0 ? '24:00' : `${formatTime(displayHour, displayMinute)}`;
      
      setFloatingTooltip(prev => ({ 
        ...prev, 
        left: x,
        top: -36,
        text: tooltipText,
        visible: !isOverSelectedRange // Hide if over selected range
      }));
    }}
  >
          {/* Background line */}
          <div className="absolute inset-0 h-3/4 bg-white border border-[#D9D9D9]" />
          
          {/* Clickable hour slots (invisible but functional) */}
          <div className="absolute inset-0 flex">
            {Array.from({ length: 24 }, (_, i) => {
              const hour = i;
              
              return (
                <button
                  key={hour}
                  type="button"
                  onClick={handleHourClick}
                  className="
                    flex-1 h-3/4 relative
                    
                    transition-colors cursor-pointer
                  "
                />
              );
            })}
          </div>
          

          {/* Selected time bars overlay */}
          <div className="absolute inset-0 pointer-events-none">
            {selectedHours && selectedHours.length > 0 && selectedHours.map((interval, idx) => {
              // Convert time strings to total minutes for precise pixel positioning
              const startTotalMinutes = timeStringToMinutes(interval.startTime);
              const endTotalMinutes = timeStringToMinutes(interval.endTime);
              
              // Calculate precise pixel positions
              const leftPercent = (startTotalMinutes / (24 * 60)) * 100;
              const widthPercent = ((endTotalMinutes - startTotalMinutes) / (24 * 60)) * 100;

              return (
                <Popover
                  key={idx}
                  open={pickerState.open && pickerState.index === idx}
                  onOpenChange={(open) => {
                    if (!open) {
                      setPickerState(prev => ({ ...prev, open: false }));
                    }
                  }}
                >
                  <Tooltip delayDuration={200}>
                    <PopoverTrigger asChild>
                      <TooltipTrigger asChild>
                        <div
                          className="absolute top-0 h-3/4 bg-[#07486A] overflow-visible cursor-pointer pointer-events-auto"
                          style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                          onClick={handleHourClick}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setPickerState({ open: true, index: idx, start: interval.startTime, end: interval.endTime });
                          }}
                        />
                      </TooltipTrigger>
                    </PopoverTrigger>
                    <TooltipContent 
                      side="top" 
                      sideOffset={5}
                      className="text-white shadow-md text-[10px] sm:text-xs px-2 py-1 rounded-md"
                      style={{ background: 'linear-gradient(180deg, #57CDFF 0%, #003E58 54.81%)' }}
                      arrowClassName="fill-[#003E58] bg-[#003E58]"
                    >
                      {interval.startTime} - {interval.endTime} <span className="text-[8px] text-white sm:text-[9px]">(Double-click to edit)</span>
                    </TooltipContent>
                  </Tooltip>

                  <PopoverContent side="top" align="center" sideOffset={8} className="p-0 border-none bg-transparent relative">
                    <CustomTimePicker
                      open={true}
                      onClose={() => setPickerState(prev => ({ ...prev, open: false }))}
                      start={interval.startTime}
                      end={interval.endTime}
                      onSave={(newStart, newEnd) => {
                        const updated = (selectedHours || []).map((it, i) => i === idx ? { startTime: newStart, endTime: newEnd } : it);
                        onHoursChange(updated);
                        setPickerState(prev => ({ ...prev, open: false }));
                      }}
                      onDelete={() => {
                        const updated = (selectedHours || []).filter((_, i) => i !== idx);
                        onHoursChange(updated);
                        setPickerState(prev => ({ ...prev, open: false }));
                      }}
                    />
                  </PopoverContent>
                </Popover>
              );
            })}
          </div>

          {/* Preview overlay while drawing */}
          {rangeStart !== null && (
            <div className="absolute inset-0 pointer-events-none">
              {(() => {
                // Calculate current mouse position for preview end
                const rect = timelineRef.current?.getBoundingClientRect();
                const currentX = rect ? Math.max(0, Math.min(floatingTooltip.left, rect.width)) : 0;
                const { hour: currentHour, minute: currentMinute } = calculateTimeFromPixel(currentX, rect?.width || 1);
                
                // Use precise total minutes calculation for pixel-perfect positioning
                const startTotalMinutes = rangeStart.hour * 60 + rangeStart.minute;
                const endTotalMinutes = currentHour * 60 + currentMinute;
                
                const [start, end] = startTotalMinutes <= endTotalMinutes 
                  ? [startTotalMinutes, endTotalMinutes]
                  : [endTotalMinutes, startTotalMinutes];
                
                const leftPercent = (start / (24 * 60)) * 100;
                const widthPercent = ((end - start) / (24 * 60)) * 100;
                
                return (
                  <div
                    className="absolute top-0 h-3/4 bg-[#07486A] border-2 border-[#07486A]"
                    style={{
                      left: `${leftPercent}%`,
                      width: `${widthPercent}%`,
                    }}
                  />
                );
              })()}
            </div>
          )}

          {/* Floating tooltip */}
          {floatingTooltip.visible && (
            <div
              className="absolute z-50 text-white shadow-md text-[10px] sm:text-xs px-2 py-1 rounded-md pointer-events-none"
              style={{
                left: `${floatingTooltip.left}px`,
                top: `${floatingTooltip.top}px`,
                background: 'linear-gradient(180deg, #57CDFF 0%, #003E58 54.81%)',
                transform: 'translateX(-50%)',
                whiteSpace: 'nowrap'
              }}
            >
              {floatingTooltip.text}
              <div
                className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent"
                style={{ borderTopColor: '#003E58' }}
              />
            </div>
          )}
        </div>
      </div>
      

      {/* Action Buttons */}
      <div className="flex items-center gap-0.5 mt-3 flex-shrink-0">
        <Popover open={popoverOpen} onOpenChange={(open) => {
          // Clear any incomplete selection when opening the popover
          if (open) {
            setRangeStart(null);
          }
          setPopoverOpen(open);
        }}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="w-5 h-5 flex items-center cursor-pointer  justify-center rounded-[4px] hover:bg-gray-50 transition-colors active:scale-95"
              title="Copy to other days"
            >
              <Copy className="w-[10px] h-[10px] sm:w-[12px] sm:h-[12px] md:w-[14px] md:h-[14px] text-[#07486A]" strokeWidth={1.5} />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] sm:w-[320px] md:w-70 px-2 py-0 rounded-lg bg-white border-none" align="start" sideOffset={5}>
            <div className="p-3 sm:p-4 md:p-5">
              <div className="flex items-center justify-between mb-4 sm:mb-5 md:mb-6">
                <h3 className="text-xs sm:text-sm md:text-base font-[600] text-black">Copy Time Frame</h3>
                <button
                  type="button"
                  onClick={handleCancelCopy}
                  className="text-[#333333] cursor-pointer absolute right-2 top-2 mb-2 transition-colors active:scale-90"
                >
                  <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              </div>

              <div className="space-y-2 sm:space-y-3 mb-3 sm:mb-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                  {allDays.filter(d => d.value !== day.value).map((d) => (
                    <div key={d.value} className="flex items-center space-x-1.5 sm:space-x-2">
                      <Checkbox
                        id={`day-${d.value}`}
                        checked={selectedDays.includes(d.value) || copyToAll}
                        onCheckedChange={() => handleDayToggle(d.value)}
                        disabled={copyToAll}
                        className="rounded-[3px] sm:rounded-[4px] border-[#4A4A4A] cursor-pointer h-3.5 w-3.5 sm:h-4 sm:w-4"
                      />
                      <label htmlFor={`day-${d.value}`} className="text-[10px] sm:text-xs font-[600] text-[#4A4A4A] cursor-pointer">
                        {d.label}
                      </label>
                    </div>
                  ))}
                </div>

                <div className="flex items-center space-x-1.5 sm:space-x-2 pt-3 sm:pt-5">
                  <Checkbox
                    id="copy-to-all"
                    checked={copyToAll}
                    onCheckedChange={handleCopyToAllToggle}
                    className="rounded-[3px] sm:rounded-[4px] border-[#4A4A4A] cursor-pointer h-3.5 w-3.5 sm:h-4 sm:w-4"
                  />
                  <label htmlFor="copy-to-all" className="font-[600] text-[10px] sm:text-xs text-[#4A4A4A] cursor-pointer">
                    Copy to all
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 pt-1.5 sm:pt-2">
                <Button
                  type="button"
                  onClick={handleSaveCopy}
                  disabled={!copyToAll && selectedDays.length === 0}
                  className="flex-1 bg-[#07486A] cursor-pointer hover:bg-[#05364f] active:bg-[#043551] text-white h-7 sm:h-8 md:h-9 rounded-md text-[10px] sm:text-xs md:text-sm font-normal disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save
                </Button>
                <Button
                  type="button"
                  onClick={handleCancelCopy}
                  variant="outline"
                  className="flex-1 text-[#595959] cursor-pointer hover:bg-gray-50 border-[#C8C8C8] h-7 sm:h-8 md:h-9 rounded-md text-[10px] sm:text-xs md:text-sm font-normal"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <button
          type="button"
          onClick={() => {
            // Clear any incomplete selection before showing reset dialog
            setRangeStart(null);
            setShowResetDialog(true);
          }}
          className="w-5 h-5  flex items-center cursor-pointer justify-center rounded-[3px] hover:bg-gray-50 transition-colors active:scale-95"
          title="Reset to default"
        >
          <RotateCcw className="w-[10px] h-[10px] sm:w-[12px] sm:h-[12px] md:w-[14px] md:h-[14px] hover:animate-spin text-[#07486A]" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={() => {
            // Clear any incomplete selection before setting full day
            setRangeStart(null);
            onHoursChange([{ startTime: "00:00", endTime: "24:00" }]);
          }}
          className="w-5 h-5 sm:w-[18px] sm:h-[18px] md:w-5 md:h-5 flex items-center cursor-pointer  justify-center rounded-[4px] hover:bg-gray-50 transition-colors active:scale-95"
          title="Select Full Day"
        >
          <TbClock24 className="h-4 w-4 text-[#07486A]" strokeWidth={1.5} />
        </button>
      </div>

      {/* Reset Confirmation Dialog */}
      <ResetConfirmationDialog
        open={showResetDialog}
        onClose={() => setShowResetDialog(false)}
        onConfirm={() => {
          onResetSchedule();
          setShowResetDialog(false);
        }}
        title="Reset Schedule"
        message={<span><strong>Warning:</strong> This will reset the schedule for {day.label} to its default state. This action cannot be undone.</span>}
      />
    </div>
  );
};

export default ScheduleRow;
