import React from 'react';
import { useInnerSettings } from './InnerSettingsContext';
import TimeSlotsPopover from './TimeSlotsPopover';

const LABEL_TO_DAY_KEY = {
  Mon: 'monday',
  Tue: 'tuesday',
  Wed: 'wednesday',
  Thu: 'thursday',
  Fri: 'friday',
  Sat: 'saturday',
  Sun: 'sunday',
};

const BasicSettings = () => {
  const {  appliedProfileData } = useInnerSettings();
  const days = appliedProfileData?.profile?.basics?.days || [];
  const appliedProfile = appliedProfileData;
  const basics = appliedProfile?.profile?.basics || appliedProfile?.basics || {};
  const basicsDays = basics.days || {};

  const getTimeSlotsForDay = (dayLabel) => {
    const dayKey = LABEL_TO_DAY_KEY[dayLabel];
    if (!dayKey) return [];
    const ranges = basicsDays[dayKey] || [];
    return ranges.map((r) => ({ startTime: r.startTime, endTime: r.endTime, label: `${r.startTime} - ${r.endTime}` }));
  };

  const dayMap = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

const selectedDays = Object.entries(days)
  .filter(([_, slots]) => slots.length > 0)
  .map(([day]) => dayMap[day]);


  return (
    <div>
      <div className="mb-4">
        <h3 className="text-sm md:text-xs 2xl:text-sm font-semibold text-[#333333]">Basic</h3>
      </div>
      
      <div className="space-y-4 md:space-y-3 2xl:space-y-4">
        <div>
          <label className="text-xs md:text-[11px] 2xl:text-xs text-[#878787] mb-2 md:mb-1.5 2xl:mb-2 block">Time-Zone</label>
          <p className="text-xs md:text-[11px] 2xl:text-xs text-[#333333] font-medium">{basics?.timeZone || '-'}</p>
        </div>

        <div>
          <label className="text-xs md:text-[11px] 2xl:text-xs text-[#878787] mb-2 md:mb-1.5 2xl:mb-2 block">Repetition (Days)</label>
          {selectedDays?.length > 0 ? (
            <div className="flex gap-1.5 md:gap-1 2xl:gap-1.5 flex-wrap">
              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((label,i)=> (
                <button key={i} type="button" disabled className={`w-8 h-8 text-white text-[10px] font-semibold rounded-lg transition-colors cursor-not-allowed ${selectedDays.includes(label) ? 'bg-[#07486A]' : 'bg-[#D0D0D0]'}`}>{label}</button>
              ))}
            </div>
          ) : (
            <p className="text-xs md:text-[11px] 2xl:text-xs text-[#878787] italic">No days selected</p>
          )}
        </div>
        <div>
          <label className="text-xs md:text-[11px] 2xl:text-xs text-[#878787] mb-2 md:mb-1.5 2xl:mb-2 block">Time</label>
          {selectedDays?.length > 0 ? (
            <div className="space-y-2 md:space-y-1.5 2xl:space-y-2">
              {selectedDays?.map((day) => {
                const slots = getTimeSlotsForDay(day);
                if (!slots || slots.length === 0) return null;
                return (
                  <div key={day} className="flex items-start gap-3 md:gap-2 2xl:gap-3">
                    <p className="text-xs md:text-[11px] 2xl:text-xs text-[#333333] font-medium w-10">{day}</p>
                    <div className="flex items-center gap-2 md:gap-1.5 2xl:gap-2 flex-wrap">
                      {slots.slice(0, 2).map((slot, idx) => (
                        <span key={idx} className="text-xs bg-white px-3 py-1 rounded-md text-[#333333]">{slot.label}</span>
                      ))}
                      {slots.length > 2 && (
                        <TimeSlotsPopover 
                          day={day} 
                          slots={slots}
                          onSelect={(slot) => console.log('Selected:', slot)}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className='text-xs md:text-[11px] 2xl:text-xs text-[#878787] italic'>No time slots available for selected days</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BasicSettings;
