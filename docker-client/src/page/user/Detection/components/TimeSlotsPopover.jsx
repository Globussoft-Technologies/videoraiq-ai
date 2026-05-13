import React from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Clock } from 'lucide-react';

const mapFull = (d) => {
  const m = {
    Mon: 'Monday',
    Tue: 'Tuesday',
    Wed: 'Wednesday',
    Thu: 'Thursday',
    Fri: 'Friday',
    Sat: 'Saturday',
    Sun: 'Sunday',
  };
  return m[d] || d;
};

// 👉 helper to get text from slot (string or object)
const getSlotLabel = (slot) => {
  if (typeof slot === 'string') return slot;
  if (!slot || typeof slot !== 'object') return '';
  if (slot.label) return slot.label;
  if (slot.startTime && slot.endTime) return `${slot.startTime} - ${slot.endTime}`;
  return '';
};

const TimeSlotsPopover = ({
  day,
  slots = [],
  triggerClassName = 'text-xs text-[#07486A] ml-1 px-2 py-1 rounded-md hover:underline cursor-pointer bg-[#E6F4FB]',
  onSelect,
}) => {
  const remaining = slots.slice(2);
  if (!remaining || remaining.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={triggerClassName}
          aria-label={`Show more time slots for ${day}`}
        >
          {`+${remaining.length} More`}
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        className="w-48 rounded-lg bg-white shadow-lg border border-[#E6E6E6] p-0 overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E6E6E6]">
          <h4 className="text-sm font-semibold text-[#333333]">{mapFull(day)}</h4>
          <Clock className="w-4 h-4 text-[#333333]" />
        </div>

        <div className="max-h-56 overflow-auto">
          <div className="flex flex-col">
            {remaining.map((slot, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onSelect?.(slot)}
                className={`px-4 py-3 text-sm text-[#333333] text-left ${
                  idx !== remaining.length - 1 ? 'border-transparent' : ''
                }`}
              >
                {getSlotLabel(slot)}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default TimeSlotsPopover;
