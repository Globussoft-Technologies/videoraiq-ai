import React, { useCallback, useReducer, useEffect, useState, useRef } from 'react';
import { useFormikContext } from 'formik';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
// import { timezones } from '@/utils/Alltimezone';
import ScheduleRow from '@/components/Schedule/ScheduleRow';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import ResetConfirmationDialog from '@/components/ui/ResetConfirmationDialog';
import { getTimeZones, rawTimeZones, timeZonesNames, abbreviations } from "@vvo/tzdb";

const days = [
  { label: 'Mon', value: 'Mon' },
  { label: 'Tue', value: 'Tue' },
  { label: 'Wed', value: 'Wed' },
  { label: 'Thu', value: 'Thu' },
  { label: 'Fri', value: 'Fri' },
  { label: 'Sat', value: 'Sat' },
  { label: 'Sun', value: 'Sun' },
];

// Default schedule: 8 AM to 6 PM expressed as an interval

// Helper: convert an array of hour ints to compact intervals
const hoursToIntervals = (hours = []) => {
  if (!hours || hours.length === 0) return [];
  const uniq = Array.from(new Set(hours.map(h => ((h % 24) + 24) % 24))).sort((a, b) => a - b);

  // Build contiguous sequences
  const sequences = [];
  let seqStart = uniq[0];
  let prev = uniq[0];

  for (let i = 1; i < uniq.length; i++) {
    const cur = uniq[i];
    if (cur === prev + 1) {
      prev = cur;
      continue;
    }
    sequences.push([seqStart, prev]);
    seqStart = cur;
    prev = cur;
  }
  sequences.push([seqStart, prev]);

  // If it wraps (last ends at 23 and first starts at 0) merge into a single overnight
  if (sequences.length > 1 && sequences[0][0] === 0 && sequences[sequences.length - 1][1] === 23) {
    const first = sequences.shift();
    const last = sequences.pop();
    // merged: last.start -> first.end
    sequences.unshift([last[0], first[1]]);
  }

  // Convert sequences to interval objects. end is exclusive.
  return sequences.map(([s, e]) => ({
    startTime: String(s).padStart(2, '0') + ':00',
    endTime: String(((e + 1) % 24)).padStart(2, '0') + ':00'
  }));
};

// Reducer for schedule state management (intervals per day)
const scheduleReducer = (state, action) => {
  switch (action.type) {
    case 'UPDATE_DAY_INTERVALS':
      return {
        ...state,
        [action.payload.day]: action.payload.intervals
      };

    case 'COPY_TO_DAYS': {
      const { sourceDay, targetDays } = action.payload;
      const daySchedule = state[sourceDay] || [];
      const newState = { ...state };
      targetDays.forEach(day => {
        newState[day] = daySchedule.map(i => ({ ...i }));
      });
      return newState;
    }

    case 'COPY_TO_ALL': {
      const sourceSchedule = state[action.payload.day] || [];
      return days.reduce((acc, day) => ({
        ...acc,
        [day.value]: sourceSchedule.map(i => ({ ...i }))
      }), 
      {});
    }

    case 'RESET_DAY':
      return {
        ...state,
        [action.payload.day]: []
      };

    case 'RESET_ALL':
      return days.reduce((acc, day) => ({
        ...acc,
        [day.value]: []
      }), {});

    case 'INITIALIZE':
      return action.payload;

    default:
      return state;
  }
};

const timeZones = getTimeZones();

// You can also provide an optional parameter to include UTC in the result.
// This adds a time zone with the name "UTC" and a fixed offset of 0.
const timeZonesWithUtc = getTimeZones({ includeUtc: true });


const BasicsStep = ({ form, setForm }) => {
  const formik = useFormikContext() || {};
  const { errors = {}, touched = {}, setFieldValue } = formik;
  // Map our short day values to lowercase full names for saved payload
  const dayValueToFull = {
    Mon: 'monday',
    Tue: 'tuesday',
    Wed: 'wednesday',
    Thu: 'thursday',
    Fri: 'friday',
    Sat: 'saturday',
    Sun: 'sunday',
  };

  // Initialize schedule state with intervals shape. Support multiple incoming shapes:
  // - form.schedule.days: { monday: [...intervals] }
  // - legacy form.schedule: { Mon: [hours...] }
  const initialSchedule = (() => {
    // Support top-level `form.days` structure as well
    if (form.days && typeof form.days === 'object') {
      const daysObj = form.days;
      const result = {};
      days.forEach(d => {
        const full = dayValueToFull[d.value];
        const val = daysObj[full] || [];
        if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'number') {
          result[d.value] = hoursToIntervals(val);
        } else {
          result[d.value] = Array.isArray(val) ? val : [];
        }
      });
      return result;
    }
    // If saved as { days: { monday: [...] } }
    if (form.schedule && form.schedule.days && typeof form.schedule.days === 'object') {
      const daysObj = form.schedule.days;
      const result = {};
      days.forEach(d => {
        const full = dayValueToFull[d.value];
        const val = daysObj[full] || [];
        // if val is numbers array, convert to intervals
        if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'number') {
          result[d.value] = hoursToIntervals(val);
        } else {
          result[d.value] = Array.isArray(val) ? val : [];
        }
      });
      return result;
    }

    // Legacy: form.schedule with short keys -> either intervals or numeric arrays
    if (form.schedule && typeof form.schedule === 'object') {
      const sampleDay = Object.keys(form.schedule)[0];
      const sample = sampleDay ? form.schedule[sampleDay] : null;
      if (Array.isArray(sample) && sample.length > 0 && typeof sample[0] === 'number') {
        const converted = {};
        Object.keys(form.schedule).forEach(k => {
          converted[k] = hoursToIntervals(form.schedule[k]);
        });
        // ensure all days present
        return days.reduce((acc, day) => ({ ...acc, [day.value]: converted[day.value] || [] }), {});
      }
      // assume already in intervals per-day shape
      return days.reduce((acc, day) => ({ ...acc, [day.value]: form.schedule[day.value] || [] }), {});
    }

    return days.reduce((acc, day) => ({ ...acc, [day.value]: [] }), {});
  })();

  const [schedule, dispatch] = useReducer(scheduleReducer, initialSchedule);

  const [showResetDialog, setShowResetDialog] = useState(false);

  const updateField = useCallback((key, value) => {
    // setForm may be either a state updater (setForm(prev=>...)) or Formik's setFieldValue
    if (typeof setFieldValue === 'function') {
      setFieldValue(key, value);
    } else if (typeof setForm === 'function') {
      // If setForm expects two args (likely setFieldValue passed in), call as (key,value)
      try {
        if (setForm.length >= 2) {
          setForm(key, value);
        } else {
          // assume setForm is a state updater: setForm(prev => ({ ...prev, [key]: value }))
          setForm((prev) => ({ ...prev, [key]: value }));
        }
      } catch (e) {
        // fallback: try calling as field setter
        try { setForm(key, value); } catch (err) { /* ignore */ }
      }
    }
  }, [form, setForm, setFieldValue]);
  useEffect(() => {
  const result = {};
  const savedDays = {};

  // read saved schedule from form
  if (form?.schedule?.days) {
    Object.assign(savedDays, form.schedule.days);
  } else if (form?.days) {
    Object.assign(savedDays, form.days);
  }

  // always include default Mon–Sun
  days.forEach(d => {
    const full = dayValueToFull[d.value];
    let val = savedDays[full] || [];

    if (Array.isArray(val) && typeof val[0] === 'number') {
      val = hoursToIntervals(val);
    }

    result[d.value] = Array.isArray(val) ? val : [];
  });

  // ✅ include dynamically added days
  Object.keys(savedDays).forEach(dayKey => {
    const alreadyMapped = Object.values(dayValueToFull).includes(dayKey);
    if (!alreadyMapped) {
      let val = savedDays[dayKey];
      if (Array.isArray(val) && typeof val[0] === 'number') {
        val = hoursToIntervals(val);
      }
      result[dayKey] = Array.isArray(val) ? val : [];
    }
  });

  dispatch({ type: 'INITIALIZE', payload: result });
}, [form.schedule, form.days]);


  // Sync schedule to form after a short delay to batch updates
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      // map internal keys to lowercase full day names under `days` key
      const payload = { days: {} };
      days.forEach(d => {
        const full = dayValueToFull[d.value];
        payload.days[full] = schedule[d.value] || [];
      });

      if (typeof setFieldValue === 'function') {
        setFieldValue('schedule', payload);
      } else if (typeof setForm === 'function') {
        // if setForm looks like setFieldValue (two args) call that way
        if (setForm.length >= 2) {
          try { setForm('schedule', payload); } catch (e) { /* ignore */ }
        } else {
          try { setForm((prev) => ({ ...prev, schedule: payload })); } catch (e) { /* ignore */ }
        }
      }
    }, 50); // 50ms debounce

    return () => clearTimeout(timeoutId);
  }, [schedule, setFieldValue, setForm]);

  // Update intervals for a day
  const updateDayHours = useCallback((day, intervals) => {
    dispatch({
      type: 'UPDATE_DAY_INTERVALS',
      payload: { day, intervals }
    });
    // mark unsaved
    if (typeof setFieldValue === 'function') {
      setFieldValue('scheduleSaved', false);
    } else if (typeof setForm === 'function') {
      if (setForm.length >= 2) {
        try { setForm('scheduleSaved', false); } catch (e) { /* ignore */ }
      } else {
        try { setForm(prev => ({ ...prev, scheduleSaved: false })); } catch (e) { /* ignore */ }
      }
    }
  }, []);

  // Copy schedule to selected days or all days
  const copySchedule = useCallback((day, selectedDays = null) => {
    if (selectedDays === null || selectedDays === undefined) {
      // Copy to all days
      dispatch({ type: 'COPY_TO_ALL', payload: { day } });
    } else {
      // Copy to selected days only
      dispatch({ type: 'COPY_TO_DAYS', payload: { sourceDay: day, targetDays: selectedDays } });
    }
  }, []);

  // Reset a single day schedule
  const resetSchedule = useCallback((day) => {
    dispatch({
      type: 'RESET_DAY',
      payload: { day }
    });
  }, []);

  // Reset all schedules to default
  const resetAllSchedules = useCallback(() => {
    dispatch({ type: 'RESET_ALL' });
  }, []);
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const payload = { days: {} };

      days.forEach(d => {
        const full = dayValueToFull[d.value];
        payload.days[full] = schedule[d.value] || [];
      });

      if (typeof setFieldValue === 'function') {
        setFieldValue('schedule', payload);
      } else if (typeof setForm === 'function') {
        if (setForm.length >= 2) {
          try { setForm('schedule', payload); } catch (e) { /* ignore */ }
        } else {
          try { setForm(prev => ({ ...prev, schedule: payload })); } catch (e) { /* ignore */ }
        }
      }
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [schedule, setFieldValue, setForm]);
  const timeZones = getTimeZones();

// You can also provide an optional parameter to include UTC in the result.
// This adds a time zone with the name "UTC" and a fixed offset of 0.
const timeZonesWithUtc = getTimeZones({ includeUtc: true });

  const [tzSearch, setTzSearch] = useState('');
const filteredTimezones = timeZones.filter((tz) =>
  tz.name.toLowerCase().includes(tzSearch.toLowerCase())
);

 const inputRef = useRef(null);      // <-- ref for search input
  const dropdownRef = useRef(null);   

  return (
    <div className=" mx-auto space-y-3 md:space-y-4 2xl:space-y-6 px-2 md:px-3 sm:px-4">
      {/* Profile Name and Timezone */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-0 ">
        <div>
          <label className="block text-[10px] md:text-sm text-xs text-[#7A7A7A] mb-1 ml-3 font-normal">Profile name *</label>
          <Input
            name="profileName"
             tabIndex={-1}
            value={form.profileName || ''}
            onChange={(e) => updateField('profileName', e.target.value)}
            placeholder="Enter Profile Name"
            className="h-7 md:h-8  border-gray-300 shadow-none w-full md:max-w-[80%] rounded-[10px] text-[10px] md:text-xs"
          />
          {errors.profileName && touched.profileName && (
            <div className="text-red-500 md:text-sm text-xs mt-1">{errors.profileName}</div>
          )}
        </div>
 <div>
  <label className="block text-[10px] md:text-sm text-xs text-[#7A7A7A] mb-1 ml-3 font-normal">
    TimeZone *
  </label>

  <Select
    value={form.timezone}
    onValueChange={(value) => {
      updateField("timezone", value);
      setTzSearch("");
      inputRef.current?.focus(); // keep focus
    }}
  >
    <SelectTrigger
      className="
        h-7 md:h-8
        border border-gray-300
        w-full sm:max-w-[80%]
        rounded-[10px]
        text-[10px] md:text-xs
        cursor-pointer
        bg-white
        flex items-center justify-between
        focus:ring-1 focus:ring-[#07486A]
      "
      onMouseDown={(e) => e.preventDefault()} // prevent trigger from stealing focus
    >
      <SelectValue placeholder="Select a Timezone" />
    </SelectTrigger>

    <SelectContent
      className="
        w-[var(--radix-select-trigger-width)]
        max-h-[240px]
        overflow-hidden
        rounded-lg
        border border-gray-200
        shadow-lg
        bg-white
        p-0
      "
      onCloseAutoFocus={(e) => {
        // prevent Radix from auto-blurring input
        e.preventDefault();
      }}
    >
      {/* Search Input */}
      <div className="sticky top-0 bg-white z-20 border-b border-gray-200 p-2">
        <Input
          ref={inputRef}
          placeholder="Search timezone..."
          value={tzSearch}
          onChange={(e) => setTzSearch(e.target.value)}
          className="h-7 text-[11px] rounded-md border-gray-300 focus:ring-1 focus:ring-[#07486A]"
          onBlur={(e) => {
            // prevent blur even on outside click
            e.preventDefault();
            inputRef.current?.focus();
          }}
        />
      </div>

      {/* Scrollable List */}
      <div ref={dropdownRef} className="max-h-[190px] overflow-y-auto">
        {filteredTimezones.length > 0 ? (
          filteredTimezones.map((tz) => (
            <SelectItem
              key={tz.name}
              value={tz.name}
              onMouseDown={(e) => e.preventDefault()} // prevent blur
              onClick={() => {
                updateField("timezone", tz.name);
                setTzSearch("");
                inputRef.current?.blur(); // only blur after selection
              }}
              className="
                text-[11px]
                px-3 py-2
                cursor-pointer
                focus:bg-gray-100
                hover:bg-gray-100
                data-[state=checked]:bg-[#07486A]
                data-[state=checked]:text-white
              "
            >
              {tz.name}
            </SelectItem>
          ))
        ) : (
          <div className="px-3 py-2 text-xs text-gray-500">
            No timezones found
          </div>
        )}
      </div>
    </SelectContent>
  </Select>

  {errors.timezone && touched.timezone && (
    <div className="text-red-500 md:text-sm text-xs mt-1">{errors.timezone}</div>
  )}
</div>

      </div>

      {/* Weekly Schedule */}
      <div className="w-full">
        {days.map((day) => {
          const selectedHours = schedule[day.value] || [];

          return (
            <ScheduleRow
              key={day.value}
              day={day}
              selectedHours={selectedHours}
              allDays={days}
              onHoursChange={(hours) => updateDayHours(day.value, hours)}
              onCopySchedule={(selectedDays) => copySchedule(day.value, selectedDays)}
              onResetSchedule={() => resetSchedule(day.value)}
            />
          );
        })}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2.5 mt-6 pt-2">
          <Button
            type="button"
            className="bg-[#07486A] cursor-pointer hover:bg-[#05364f] text-white px-4 h-8 rounded-md text-xs font-normal"
            onClick={() => {
              const payload = { days: {} };
              days.forEach(d => {
                const full = dayValueToFull[d.value];
                payload.days[full] = schedule[d.value] || [];
              });

              if (typeof setForm === 'function') {
                if (setForm.length >= 2) {
                  try { setForm('schedule', payload); } catch (e) { /* ignore */ }
                } else {
                  try { setForm(prev => ({ ...prev, schedule: payload })); } catch (e) { /* ignore */ }
                }
              }

              if (typeof setFieldValue === 'function') {
                setFieldValue('schedule', payload);
                setFieldValue('scheduleSaved', true);
              } else if (typeof setForm === 'function') {
                if (setForm.length >= 2) {
                  try { setForm('scheduleSaved', true); } catch (e) { /* ignore */ }
                } else {
                  try { setForm(prev => ({ ...prev, scheduleSaved: true })); } catch (e) { /* ignore */ }
                }
              }
            toast.success('Schedule saved successfully');

            }
          }
          >
            Save Setting 
          </Button>
     

        <Button
          type="button"
          variant="outline"
          className="text-[#595959] cursor-pointer hover:bg-gray-50 px-4 border-[#C8C8C8] h-8 rounded-md text-xs font-normal"
          onClick={() => setShowResetDialog(true)}
        >
          Delete all
        </Button>
        
      {form && form.scheduleSaved === false && (
        <div className="flex w-fit items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-1 rounded-xl text-sm">
          <AlertTriangle className="w-4 h-4 animate-pulse flex-shrink-0" />
          Please save the changes
        </div>
      )}
      </div>

      <ResetConfirmationDialog
        open={showResetDialog}
        onClose={() => setShowResetDialog(false)}
        onConfirm={() => {
          resetAllSchedules();
          setShowResetDialog(false);
        }}
        title="Delete All Schedules"
        message="Are you sure you want to delete all schedules? This action cannot be undone."
      />
    </div>
  );
};

export default BasicsStep;