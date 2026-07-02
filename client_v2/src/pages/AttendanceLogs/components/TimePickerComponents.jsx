import React, { useState } from 'react';
import { Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverTrigger, PopoverContent } from './Popover';
import {
  generateHourOptions,
  generateMinuteOptions,
  generatePeriodOptions,
} from './timeUtils';

const hourOptions = generateHourOptions();
const minuteOptions = generateMinuteOptions();
const periodOptions = generatePeriodOptions();

/**
 * Combined hour/minute/period picker. Themed via CSS vars for dark/light mode.
 * Kept API-compatible with the V1 component (hour, minute, period, onChange).
 */
export const UnifiedTimePicker = ({
  hour,
  minute,
  period,
  onChange,
  placeholder = '--:-- --',
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (type, value) => onChange(type, value);

  const displayTime = hour && minute && period ? `${hour}:${minute} ${period}` : '';

  const chip = (val) =>
    `flex-1 text-center py-1.5 rounded-[4px] text-sm font-bold border transition-colors ${
      val
        ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
        : 'bg-[var(--bg2)] text-[var(--tx3)] border-[var(--bd)]'
    }`;

  const cell = (active) =>
    `w-full text-center py-2 text-sm transition-colors cursor-pointer ${
      active
        ? 'text-[var(--brand)] font-bold bg-[var(--brand)]/10'
        : 'text-[var(--tx2)] hover:bg-[var(--bg2)]'
    }`;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <div className="relative cursor-pointer group w-full">
          <Input
            readOnly
            value={displayTime}
            placeholder={placeholder}
            className="h-10 pr-10 text-left pl-3 cursor-pointer group-hover:border-[var(--brand)] transition-colors"
          />
          <Clock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--tx3)] pointer-events-none group-hover:text-[var(--brand)] transition-colors" />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 overflow-hidden" align="start">
        {/* Selection header */}
        <div className="flex gap-1 p-2 bg-[var(--bg2)] border-b border-[var(--bd)]">
          <div className={chip(hour)}>{hour || 'HH'}</div>
          <div className={chip(minute)}>{minute || 'MM'}</div>
          <div className={chip(period)}>{period || 'AM'}</div>
        </div>

        <div className="flex h-[240px] divide-x divide-[var(--bd)]">
          <div className="flex flex-col overflow-y-auto w-[70px] py-1 customscrollbar">
            {hourOptions.map((h) => (
              <button key={h} onClick={() => handleSelect('hour', h)} className={cell(hour === h)}>
                {h}
              </button>
            ))}
          </div>
          <div className="flex flex-col overflow-y-auto w-[70px] py-1 customscrollbar">
            {minuteOptions.map((m) => (
              <button key={m} onClick={() => handleSelect('minute', m)} className={cell(minute === m)}>
                {m}
              </button>
            ))}
          </div>
          <div className="flex flex-col w-[70px] py-1">
            {periodOptions.map((p) => (
              <button key={p} onClick={() => handleSelect('period', p)} className={cell(period === p)}>
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="p-2 border-t border-[var(--bd)] flex justify-between items-center bg-[var(--bg2)]">
          <button
            onClick={() => {
              handleSelect('hour', '');
              handleSelect('minute', '');
              handleSelect('period', '');
            }}
            className="text-[11px] text-[var(--tx3)] hover:text-[var(--tx)] px-2"
          >
            Clear
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="text-xs font-bold bg-[var(--brand)] text-white px-4 py-1.5 rounded-md hover:opacity-95 transition-opacity shadow-sm"
          >
            Done
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default UnifiedTimePicker;
