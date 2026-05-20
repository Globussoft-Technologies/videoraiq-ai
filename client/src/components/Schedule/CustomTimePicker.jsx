import React, { useEffect, useState } from 'react';
import { X, ChevronUp, ChevronDown, Clock } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

// Helpers
const pad = (n) => String(n).padStart(2, '0');

const CustomTimePicker = ({ open, onClose, start, end, onSave, onDelete }) => {

  // parse incoming HH:MM into parts (24-hour format)
  const parse = (time = '00:00') => {
    if (!time || typeof time !== 'string' || !time.includes(':')) return { hour: '00', minute: '00' };
    const [hh, mm] = time.split(':');
    // Handle 24:00 special case - display as 00:00 in input but preserve meaning
    const hour = hh === '24' ? '00' : pad(Number(hh));
    const minute = pad(Number(mm));
    return { hour, minute };
  };

  const [startParts, setStartParts] = useState(parse(start));
  const [endParts, setEndParts] = useState(parse(end));
  const [error, setError] = useState('');
  const [isEndOfDay, setIsEndOfDay] = useState(end === '24:00');

  useEffect(() => setStartParts(parse(start)), [start]);
  useEffect(() => {
    setEndParts(parse(end));
    setIsEndOfDay(end === '24:00');
  }, [end]);

  const [previousEndParts, setPreviousEndParts] = useState(null);

  // When isEndOfDay is checked/unchecked
  const handleEndOfDayToggle = (checked) => {
    setIsEndOfDay(checked);
    if (checked) {
      // Save current end parts before overriding
      setPreviousEndParts(endParts);
      // When checking: Set to 00:00 (which represents 24:00 - end of day)
      setEndParts({ hour: '00', minute: '00' });
    } else {
      // Restore previous end parts if available, otherwise set to 23:59
      if (previousEndParts) {
        setEndParts(previousEndParts);
        setPreviousEndParts(null);
      } else {
        setEndParts({ hour: '23', minute: '59' });
      }
    }
  };

  // Clear any save error when user edits inputs
  useEffect(() => {
    setError('');
  }, [startParts, endParts]);

  if (!open) return null;

  const handleSave = () => {
    // Build 24-hour strings from the inputs
    const sStr = `${pad(startParts.hour)}:${pad(startParts.minute)}`;
    let eStr;
    
    // If "End of Day" checkbox is checked, force end time to 24:00
    if (isEndOfDay) {
      eStr = '24:00';
    } else {
      eStr = `${pad(endParts.hour)}:${pad(endParts.minute)}`;
    }

    // Convert to minutes (use 1440 for '24:00')
    const startMinutes = parseInt(startParts.hour, 10) * 60 + parseInt(startParts.minute, 10);
    let endMinutes = eStr === '24:00' ? 24 * 60 : (parseInt(endParts.hour, 10) * 60 + parseInt(endParts.minute, 10));

    // Prevent same start and end time
    if (endMinutes === startMinutes) {
      setError('Start and end times cannot be the same — please select a different time range');
      return;
    }

    // Disallow crossing to next day: end must be strictly after start within same day
    if (endMinutes < startMinutes) {
      setError('End time must be after start time — schedule cannot cross midnight');
      return;
    }

    // Compute duration and ensure it does not exceed 24 hours
    const duration = endMinutes - startMinutes;
    if (duration > 24 * 60) {
      setError('Schedule cannot exceed 24 hours');
      return;
    }

    // All good — clear error and save
    setError('');
    if (onSave) onSave(sStr, eStr);
    onClose();
  };

  const inc = (partsSetter, field, delta) => {
    partsSetter((prev) => {
      const next = { ...prev };
      if (field === 'hour') {
        let v = Number(prev.hour) + delta;
        if (v < 0) v = 23;
        if (v > 23) v = 0;
        next.hour = pad(v);
      } else {
        let v = Number(prev.minute) + delta;
        if (v < 0) v = 59;
        if (v > 59) v = 0;
        next.minute = pad(v);
      }
      return next;
    });
  };

  // Helpers for keyboard input and blur validation
  const setPartRaw = (partsSetter, field, raw) => {
    // keep only digits
    const filtered = String(raw).replace(/\D+/g, '');
    // limit to two digits
    const val = filtered.slice(0, 2);
    partsSetter(prev => ({ ...prev, [field]: val }));
  };

  const commitPart = (partsSetter, field) => {
    partsSetter(prev => {
      let { hour, minute } = prev;
      if (field === 'hour') {
        let n = Number(hour);
        if (!Number.isFinite(n) || n < 0) n = 0;
        if (n > 23) n = 23;
        hour = pad(n);
      } else {
        let n = Number(minute);
        if (!Number.isFinite(n) || n < 0) n = 0;
        if (n > 59) n = 59;
        minute = pad(n);
      }
      return { ...prev, hour, minute };
    });
  };

  const handleKey = (e, partsSetter, field) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      inc(partsSetter, field, 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      inc(partsSetter, field, -1);
    }
  };

  return (
    <div onMouseLeave={onClose} className="z-50 w-[380px] rounded-xl bg-white shadow-2xl border border-gray-200/80 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#07486A] to-[#0a5a7f] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-white/10 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
              <Clock className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Edit Time Range</h3>
              <p className="text-[10px] text-white/70 mt-0.5">Adjust start and end times (24-hour format)</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-all flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Time Inputs */}
      <div className="p-4">
        <div className="grid grid-cols-2 gap-3 mb-3">
          {/* Start Time */}
          <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-lg p-3 border border-gray-200">
            <label className="text-[10px] font-semibold text-gray-600 mb-2 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full flex-shrink-0"></span>
              <span className="truncate">Start</span>
            </label>
            <div className="flex items-center justify-center gap-1">
              {/* Hour */}
              <div className="flex flex-col items-center flex-shrink-0">
                <button 
                  aria-label="Increase start hour" 
                  onClick={() => inc(setStartParts, 'hour', 1)} 
                  className="w-6 h-6 rounded-md bg-white hover:bg-[#07486A] hover:text-white shadow-sm border border-gray-200 flex items-center justify-center transition-all active:scale-95"
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
                <input
                  aria-label="Start hour"
                  className="my-1.5 text-xl font-bold w-11 text-center bg-white rounded-md py-1 outline-none focus:ring-2 focus:ring-[#07486A] border border-gray-200"
                  value={startParts.hour}
                  onChange={(e) => setPartRaw(setStartParts, 'hour', e.target.value)}
                  onBlur={() => commitPart(setStartParts, 'hour')}
                  onKeyDown={(e) => handleKey(e, setStartParts, 'hour')}
                  inputMode="numeric"
                />
                <button 
                  aria-label="Decrease start hour" 
                  onClick={() => inc(setStartParts, 'hour', -1)} 
                  className="w-6 h-6 rounded-md bg-white hover:bg-[#07486A] hover:text-white shadow-sm border border-gray-200 flex items-center justify-center transition-all active:scale-95"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>

              <div className="text-xl font-bold text-gray-400 flex-shrink-0">:</div>

              {/* Minute */}
              <div className="flex flex-col items-center flex-shrink-0">
                <button 
                  aria-label="Increase start minute" 
                  onClick={() => inc(setStartParts, 'minute', 1)} 
                  className="w-6 h-6 rounded-md bg-white hover:bg-[#07486A] hover:text-white shadow-sm border border-gray-200 flex items-center justify-center transition-all active:scale-95"
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
                <input
                  aria-label="Start minute"
                  className="my-1.5 text-xl font-bold w-11 text-center bg-white rounded-md py-1 outline-none focus:ring-2 focus:ring-[#07486A] border border-gray-200"
                  value={startParts.minute}
                  onChange={(e) => setPartRaw(setStartParts, 'minute', e.target.value)}
                  onBlur={() => commitPart(setStartParts, 'minute')}
                  onKeyDown={(e) => handleKey(e, setStartParts, 'minute')}
                  inputMode="numeric"
                />
                <button 
                  aria-label="Decrease start minute" 
                  onClick={() => inc(setStartParts, 'minute', -1)} 
                  className="w-6 h-6 rounded-md bg-white hover:bg-[#07486A] hover:text-white shadow-sm border border-gray-200 flex items-center justify-center transition-all active:scale-95"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* End Time */}
          <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-lg p-3 border border-gray-200">
            <label className="text-[10px] font-semibold text-gray-600 mb-2 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full flex-shrink-0"></span>
              <span className="truncate">End</span>
            </label>
            <div className="flex items-center justify-center gap-1">
              {/* Hour */}
              <div className="flex flex-col items-center flex-shrink-0">
                <button 
                  aria-label="Increase end hour" 
                  onClick={() => inc(setEndParts, 'hour', 1)} 
                  className="w-6 h-6 rounded-md bg-white hover:bg-[#07486A] hover:text-white shadow-sm border border-gray-200 flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isEndOfDay}
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
                <input
                  aria-label="End hour"
                  className="my-1.5 text-xl font-bold w-11 text-center bg-white rounded-md py-1 outline-none focus:ring-2 focus:ring-[#07486A] border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  value={endParts.hour}
                  onChange={(e) => setPartRaw(setEndParts, 'hour', e.target.value)}
                  onBlur={() => commitPart(setEndParts, 'hour')}
                  onKeyDown={(e) => handleKey(e, setEndParts, 'hour')}
                  inputMode="numeric"
                  disabled={isEndOfDay}
                />
                <button 
                  aria-label="Decrease end hour" 
                  onClick={() => inc(setEndParts, 'hour', -1)} 
                  className="w-6 h-6 rounded-md bg-white hover:bg-[#07486A] hover:text-white shadow-sm border border-gray-200 flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isEndOfDay}
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>

              <div className="text-xl font-bold text-gray-400 flex-shrink-0">:</div>

              {/* Minute */}
              <div className="flex flex-col items-center flex-shrink-0">
                <button 
                  aria-label="Increase end minute" 
                  onClick={() => inc(setEndParts, 'minute', 1)} 
                  className="w-6 h-6 rounded-md bg-white hover:bg-[#07486A] hover:text-white shadow-sm border border-gray-200 flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isEndOfDay}
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
                <input
                  aria-label="End minute"
                  className="my-1.5 text-xl font-bold w-11 text-center bg-white rounded-md py-1 outline-none focus:ring-2 focus:ring-[#07486A] border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  value={endParts.minute}
                  onChange={(e) => setPartRaw(setEndParts, 'minute', e.target.value)}
                  onBlur={() => commitPart(setEndParts, 'minute')}
                  onKeyDown={(e) => handleKey(e, setEndParts, 'minute')}
                  inputMode="numeric"
                  disabled={isEndOfDay}
                />
                <button 
                  aria-label="Decrease end minute" 
                  onClick={() => inc(setEndParts, 'minute', -1)} 
                  className="w-6 h-6 rounded-md bg-white hover:bg-[#07486A] hover:text-white shadow-sm border border-gray-200 flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isEndOfDay}
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* End of Day Checkbox */}
        <div className="mb-3 flex items-center gap-2 px-1">
          <Checkbox
            id="end-of-day"
            checked={isEndOfDay}
            onCheckedChange={handleEndOfDayToggle}
            className="border-[#777777] data-[state=checked]:bg-[#07486A] size-4 cursor-pointer data-[state=checked]:text-white"
          />
          <label htmlFor="end-of-day" className="text-xs text-gray-700 cursor-pointer select-none">
            End of Day (24:00) - Full day schedule
          </label>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-3 p-2.5 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2">
            <div className="w-4 h-4 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-red-600 text-[10px] font-bold">!</span>
            </div>
            <p className="text-[10px] text-red-700 leading-relaxed">{error}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { if (onDelete) onDelete(); onClose(); }}
            className="flex-1 border-2 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 rounded-lg py-2 text-xs font-semibold transition-all active:scale-95 flex items-center justify-center gap-1.5"
          >
            <X className="w-3.5 h-3.5" />
            Delete
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="flex-1 bg-gradient-to-r from-[#07486A] to-[#0a5a7f] hover:from-[#05364f] hover:to-[#074562] text-white rounded-lg py-2 text-xs font-semibold transition-all active:scale-95"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomTimePicker;
