import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  DateRangePicker,
  Group,
  Button,
  Popover,
  Dialog,
  RangeCalendar,
  CalendarCell,
  CalendarGrid,
  Heading,
  Calendar,
  DatePicker,
} from 'react-aria-components';
import { CalendarDate } from '@internationalized/date';
import { useResponsivePlacement } from './Placement';


export function DateRangePickerComponent({
  startDate,
  endDate,
  onRangeChange,
  minDate = null,
  maxDate = null,
  buttonClassName = 'flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
  buttonContent = 'Select date range',
  popoverClassName = 'mt-2',
  calendarClassName = 'p-4 bg-popover rounded-xl border border-border shadow-md',
  hideInstructionText = false
}) {
  const placement = useResponsivePlacement();

  const calendarRange = React.useMemo(() => {
    if (!startDate || !endDate) return null;
    return {
      start: new CalendarDate(startDate.getFullYear(), startDate.getMonth() + 1, startDate.getDate()),
      end: new CalendarDate(endDate.getFullYear(), endDate.getMonth() + 1, endDate.getDate())
    };
  }, [startDate, endDate]);

  const minCalendarDate = React.useMemo(() => {
    if (!minDate) return undefined;
    const d = (minDate instanceof Date) ? minDate : new Date(minDate);
    return new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }, [minDate]);

  const maxCalendarDate = React.useMemo(() => {
    if (!maxDate) return undefined;
    const d = (maxDate instanceof Date) ? maxDate : new Date(maxDate);
    return new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }, [maxDate]);

  const handleChange = (range) => {
    if (!range || !range.start || !range.end || !onRangeChange) return;
    const newStartDate = new Date(range.start.year, range.start.month - 1, range.start.day);
    const newEndDate = new Date(range.end.year, range.end.month - 1, range.end.day);
    onRangeChange({ start: newStartDate, end: newEndDate });
  };

  const handleReset = () => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
  
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
  
    onRangeChange?.({ start: startOfDay, end: endOfDay });
  };
  

  return (
    <DateRangePicker value={calendarRange} onChange={handleChange} aria-label="Date range picker">
      <Group className="flex">
        <Button className={buttonClassName} aria-label="Choose date range">
          <span className="flex items-center gap-2">
            {buttonContent}
          </span>
        </Button>
      </Group>
      <Popover className={popoverClassName} placement={placement}>
        <Dialog className={calendarClassName}>
          <RangeCalendar aria-label="Date range calendar" minValue={minCalendarDate} maxValue={maxCalendarDate}>
            <header className="flex items-center justify-between mb-4">
              <Button
                slot="previous"
                className="h-8 w-8  hover:bg-[#E0E7EF] rounded-lg flex items-center justify-center text-black cursor-pointer transition-colors duration-150 p-1"
                aria-label="Previous month"
              >
                <ChevronLeft size={18}  />
              </Button>
              <Heading className="text-sm font-medium" />
              <Button
                slot="next"
                className="h-8 w-8  hover:bg-[#E0E7EF] rounded-lg flex items-center justify-center text-black cursor-pointer transition-colors duration-150 p-1"
                aria-label="Next month"
              >
                <ChevronRight size={18}  />
              </Button>
            </header>
            <CalendarGrid className="border-collapse w-full cursor-pointer">
              {(date) => (
                <CalendarCell
                  date={date}
                  className={({ isSelected, isSelectionStart, isSelectionEnd, isWithinRange, isDisabled }) => `
                    w-9 h-9 font-normal flex items-center justify-center rounded-full text-sm relative
                    ${isDisabled ? 'text-muted-foreground opacity-50' : 'text-foreground'}
                    ${isSelectionStart ? 'bg-[#07486A] text-white ' : ''}
                    ${isSelectionEnd ? 'bg-[#07486A] text-white ' : ''}
                    ${isWithinRange ? 'bg-[#07486A]' : ''}
                    ${isSelected && !isSelectionStart && !isSelectionEnd ? 'bg-[#07486A]/20' : ''}
                    ${!isSelected && !isWithinRange ? 'hover:bg-accent hover:text-accent-foreground' : ''}
                  `}
                />
              )}
            </CalendarGrid>
          </RangeCalendar>
        
          <div className="flex justify-between mt-4">
            <span className={`text-[10px] max-w-[150px] text-black ${hideInstructionText ? 'opacity-0' : ''}`}>Double-tap to pick one date or select a range.</span>
            <Button onPress={handleReset} className="inline-flex hover:bg-[#07486A] hover:text-white cursor-pointer items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input h-9 px-4 py-2">
              Reset
            </Button>
          </div>
        </Dialog>
      </Popover>
    </DateRangePicker>
  );
}

export function DatePickerComponent({
  selectedDate,
  onDateChange,
  minDate = null,
  maxDate = null,
  buttonClassName = 'flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
  buttonContent = 'Select date',
  popoverClassName = 'mt-2',
  calendarClassName = 'p-4 bg-popover rounded-xl border border-border shadow-md',
  hideInstructionText = false
}) {
  const placement = useResponsivePlacement();

  const calendarDate = React.useMemo(() => {
    if (!selectedDate) return null;
    return new CalendarDate(selectedDate.getFullYear(), selectedDate.getMonth() + 1, selectedDate.getDate());
  }, [selectedDate]);

  const minCalendarDate = React.useMemo(() => {
    if (!minDate) return undefined;
    const d = (minDate instanceof Date) ? minDate : new Date(minDate);
    return new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }, [minDate]);
  

  const maxCalendarDate = React.useMemo(() => {
    if (!maxDate) return undefined;
    const d = (maxDate instanceof Date) ? maxDate : new Date(maxDate);
    return new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }, [maxDate]);

  const handleChange = (date) => {
    if (!date || !onDateChange) return;
    const newDate = new Date(date.year, date.month - 1, date.day);
    onDateChange(newDate);
  };

  const handleReset = () => {
    const today = new Date();
    onDateChange?.(today);
  };

  return (
    <DatePicker value={calendarDate} onChange={handleChange} aria-label="Date picker">
      <Group className="flex">
        <Button className={buttonClassName} aria-label="Choose date">
          <span className="flex items-center gap-2">
            {buttonContent}
          </span>
        </Button>
      </Group>
      <Popover className={popoverClassName} placement={placement}>
        <Dialog className={calendarClassName}>
          <Calendar aria-label="Calendar" minValue={minCalendarDate} maxValue={maxCalendarDate}>
            <header className="flex items-center justify-between mb-4">
              <Button
                slot="previous"
                className="h-8 w-8 hover:bg-[#E0E7EF] rounded-lg flex items-center justify-center text-black cursor-pointer transition-colors duration-150 p-1"
                aria-label="Previous month"
              >
                <ChevronLeft size={18} />
              </Button>
              <Heading className="text-sm font-medium" />
              <Button
                slot="next"
                className="h-8 w-8 hover:bg-[#E0E7EF] rounded-lg flex items-center justify-center text-black cursor-pointer transition-colors duration-150 p-1"
                aria-label="Next month"
              >
                <ChevronRight size={18} />
              </Button>
            </header>
            <CalendarGrid className="border-collapse w-full cursor-pointer">
              {(date) => (
                <CalendarCell
                  date={date}
                  className={({ isSelected, isDisabled }) => `
                    w-9 h-9 font-normal flex items-center justify-center rounded-full text-sm
                    ${isDisabled ? 'text-muted-foreground opacity-50' : 'text-foreground'}
                    ${isSelected ? 'bg-[#07486A] text-white' : 'hover:bg-accent hover:text-accent-foreground'}
                  `}
                />
              )}
            </CalendarGrid>
          </Calendar>
          <div className="flex justify-between mt-4">
            <span className={`text-[10px] max-w-[150px] text-black ${hideInstructionText ? 'opacity-0' : ''}`}>Double-tap to pick one date or select a range.</span>
            <Button
              onPress={handleReset}
              className="inline-flex hover:bg-[#07486A] hover:text-white cursor-pointer items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input h-9 px-4 py-2"
            >
              Reset
            </Button>
          </div>
        </Dialog>
      </Popover>
    </DatePicker>
  );
}