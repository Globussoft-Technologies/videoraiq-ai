import React, { useState, useRef, useEffect } from 'react';
import { Clock, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import {
  generateHourOptions,
  generateMinuteOptions,
  generatePeriodOptions,
} from './timeUtils';

const hourOptions = generateHourOptions();
const minuteOptions = generateMinuteOptions();
const periodOptions = generatePeriodOptions();

// Hour Input Combobox Component
export const HourCombobox = ({ value, onChange, label }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);
  };

  const handleSelect = (hour) => {
    setInputValue(hour);
    onChange(hour);
    setIsOpen(false);
  };

  const handleFocus = () => {
    setIsOpen(true);
  };

  const handleBlur = (e) => {
    if (!containerRef.current?.contains(e.relatedTarget)) {
      setIsOpen(false);
    }
  };

  // Show all options when empty or when dropdown is open, filter when user types
  const displayOptions =
    !inputValue || (isOpen && !inputValue)
      ? hourOptions
      : hourOptions.filter((hour) => hour.includes(inputValue));

  return (
    <div className="space-y-1 flex-1">
      <span className="text-xs text-gray-500">{label}</span>
      <div className="relative" ref={containerRef}>
        <Input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="--"
          maxLength="2"
          className="border border-[#D9D9D9] rounded-lg py-2 shadow-none text-sm text-[#333] h-10 w-full bg-white pr-8 text-center cursor-pointer"
        />
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />

        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#D9D9D9] rounded-lg shadow-md z-50 max-h-60 overflow-y-auto">
            {displayOptions.length > 0 ? (
              displayOptions.map((hour) => (
                <button
                  key={hour}
                  onClick={() => handleSelect(hour)}
                  onMouseDown={(e) => e.preventDefault()}
                  className="w-full text-left px-3 py-2 hover:bg-[#E9F3FA] text-sm text-[#333] transition-colors"
                >
                  {hour}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-gray-500">
                No hours match
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Minute Input Combobox Component
export const MinuteCombobox = ({ value, onChange, label }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);
  };

  const handleSelect = (minute) => {
    setInputValue(minute);
    onChange(minute);
    setIsOpen(false);
  };

  const handleFocus = () => {
    setIsOpen(true);
  };

  const handleBlur = (e) => {
    if (!containerRef.current?.contains(e.relatedTarget)) {
      setIsOpen(false);
    }
  };

  // Show all options when empty or when dropdown is open, filter when user types
  const displayOptions =
    !inputValue || (isOpen && !inputValue)
      ? minuteOptions
      : minuteOptions.filter((minute) => minute.includes(inputValue));

  return (
    <div className="space-y-1 flex-1">
      <span className="text-xs text-gray-500">{label}</span>
      <div className="relative" ref={containerRef}>
        <Input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="--"
          maxLength="2"
          className="border border-[#D9D9D9] rounded-lg py-2 shadow-none text-sm text-[#333] h-10 w-full bg-white pr-8 text-center cursor-pointer"
        />
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />

        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#D9D9D9] rounded-lg shadow-md z-50 max-h-60 overflow-y-auto">
            {displayOptions.length > 0 ? (
              displayOptions.map((minute) => (
                <button
                  key={minute}
                  onClick={() => handleSelect(minute)}
                  onMouseDown={(e) => e.preventDefault()}
                  className="w-full text-left px-3 py-2 hover:bg-[#E9F3FA] text-sm text-[#333] transition-colors"
                >
                  {minute}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-gray-500">
                No minutes match
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Period (AM/PM) Select Component
export const PeriodSelect = ({ value, onChange, label }) => {
  return (
    <div className="space-y-1 flex-1">
      <span className="text-xs text-gray-500">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10 text-[#333333] font-medium cursor-pointer select-none rounded-lg border border-[#D9D9D9] text-sm w-full">
          <SelectValue placeholder="Period" />
        </SelectTrigger>
        <SelectContent className="text-[#333333] cursor-pointer font-[400] text-sm">
          {periodOptions.map((period) => (
            <SelectItem key={period} value={period}>
              {period}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export const UnifiedTimePicker = ({
  hour,
  minute,
  period,
  onChange,
  placeholder = '--:-- --',
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (type, value) => {
    onChange(type, value);
  };

  const displayTime =
    hour && minute && period ? `${hour}:${minute} ${period}` : '';

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <div className="relative cursor-pointer group">
          <Input
            readOnly
            value={displayTime}
            placeholder={placeholder}
            className="border border-[#D9D9D9] rounded-lg py-2 shadow-none text-sm text-[#333] h-10 w-full bg-white pr-10 text-left pl-3 cursor-pointer group-hover:border-[#07486A] transition-colors"
          />
          <Clock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none group-hover:text-[#07486A] transition-colors" />
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 rounded-lg shadow-xl border border-gray-200 bg-white overflow-hidden"
        align="start"
      >
        {/* Selection Header - Matching image style */}
        <div className="flex gap-1 p-2 bg-gray-50 border-b border-gray-100">
          <div
            className={`flex-1 text-center py-1.5 rounded-[4px] text-sm font-bold border transition-colors ${
              hour
                ? 'bg-[#07486A] text-white border-[#07486A]'
                : 'bg-white text-gray-400 border-gray-200'
            }`}
          >
            {hour || 'HH'}
          </div>
          <div
            className={`flex-1 text-center py-1.5 rounded-[4px] text-sm font-bold border transition-colors ${
              minute
                ? 'bg-[#07486A] text-white border-[#07486A]'
                : 'bg-white text-gray-400 border-gray-200'
            }`}
          >
            {minute || 'MM'}
          </div>
          <div
            className={`flex-1 text-center py-1.5 rounded-[4px] text-sm font-bold border transition-colors ${
              period
                ? 'bg-[#07486A] text-white border-[#07486A]'
                : 'bg-white text-gray-400 border-gray-200'
            }`}
          >
            {period || 'AM'}
          </div>
        </div>

        <div className="flex h-[240px] divide-x divide-gray-100">
          {/* Hour Column */}
          <div className="flex flex-col overflow-y-auto w-[70px] py-1 custom-scrollbar">
            {hourOptions.map((h) => (
              <button
                key={h}
                onClick={() => handleSelect('hour', h)}
                className={`w-full text-center py-2 text-sm transition-colors ${
                  hour === h
                    ? 'text-[#07486A] font-bold bg-[#E9F3FA]'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {h}
              </button>
            ))}
          </div>

          {/* Minute Column */}
          <div className="flex flex-col overflow-y-auto w-[70px] py-1 custom-scrollbar">
            {minuteOptions.map((m) => (
              <button
                key={m}
                onClick={() => handleSelect('minute', m)}
                className={`w-full text-center py-2 text-sm transition-colors ${
                  minute === m
                    ? 'text-[#07486A] font-bold bg-[#E9F3FA]'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Period Column */}
          <div className="flex flex-col w-[70px] py-1">
            {periodOptions.map((p) => (
              <button
                key={p}
                onClick={() => handleSelect('period', p)}
                className={`w-full text-center py-2 text-sm transition-colors ${
                  period === p
                    ? 'text-[#07486A] font-bold bg-[#E9F3FA]'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <style jsx>{`
          .custom-scrollbar::-webkit-scrollbar {
            width: 4px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #e5e7eb;
            border-radius: 10px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: #d1d5db;
          }
        `}</style>

        <div className="p-2 border-t border-gray-100 flex justify-between items-center bg-gray-50/50">
          <button
            onClick={() => {
              handleSelect('hour', '');
              handleSelect('minute', '');
              handleSelect('period', '');
            }}
            className="text-[11px] text-gray-400 hover:text-gray-600 px-2"
          >
            Clear
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="text-xs font-bold bg-[#07486A] text-white px-4 py-1.5 rounded-md hover:bg-[#0a5a81] transition-colors shadow-sm"
          >
            Done
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
