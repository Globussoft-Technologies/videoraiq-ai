import React, { useMemo, useState, useEffect } from 'react';
import { Filter, RotateCcw } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from './Popover';
import { Switch } from './Switch';
import MultiSelect from './MultiSelect';
import { UnifiedTimePicker } from './TimePickerComponents';
import { parseTime, formatTime } from './timeUtils';

/**
 * Filter popover for NVR / Camera / Department / Location, with optional time
 * range and "authorized only" toggle. Themed via CSS vars for dark/light mode.
 */
const LogsFilterPopover = ({
  nvrIds,
  setNvrId,
  nvrList = [],
  cameraId,
  setCameraId,
  cameraList = [],
  departments = [],
  selectedDepartments = [],
  setSelectedDepartments,
  showTimeRange = false,
  setTimeType,
  setToTime,
  setFromTime,
  fromTime,
  toTime,
  showUnknownFilter,
  removeUnknown,
  setRemoveUnknown,
  showLocationFilter = false,
  employeeLocations = [],
  setEmployeeLocations,
  locationOptions = [],
}) => {
  const activeFiltersCount = [
    Array.isArray(nvrIds) && nvrIds.length > 0,
    Array.isArray(cameraId) && cameraId.length > 0,
    selectedDepartments && selectedDepartments.length > 0,
    fromTime,
    toTime,
    showUnknownFilter && removeUnknown !== false,
    showLocationFilter && Array.isArray(employeeLocations) && employeeLocations.length > 0,
  ].filter(Boolean).length;

  const nvrOptions = useMemo(
    () => nvrList.map((nvr) => ({ label: nvr.nvrName, id: nvr._id || nvr.id })),
    [nvrList]
  );

  const cameraOptions = useMemo(
    () => cameraList.map((cam) => ({ label: cam.customName || cam.name, id: cam.id || cam._id })),
    [cameraList]
  );

  const [fromTimeParts, setFromTimeParts] = useState(parseTime(fromTime));
  const [toTimeParts, setToTimeParts] = useState(parseTime(toTime));

  useEffect(() => setFromTimeParts(parseTime(fromTime)), [fromTime]);
  useEffect(() => setToTimeParts(parseTime(toTime)), [toTime]);

  const handleFromTimeChange = (part, value) => {
    const newParts = { ...fromTimeParts, [part]: value };
    setFromTimeParts(newParts);
    setFromTime(formatTime(newParts.hour, newParts.minute, newParts.period));
  };

  const handleToTimeChange = (part, value) => {
    const newParts = { ...toTimeParts, [part]: value };
    setToTimeParts(newParts);
    setToTime(formatTime(newParts.hour, newParts.minute, newParts.period));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-10 px-4 rounded-lg bg-[linear-gradient(94.16deg,#FFFFFF_0.77%,#AAE2FF_99.4%)] text-[#333333] text-sm font-medium cursor-pointer items-center gap-2 relative"
        >
          <Filter className="w-4 h-4" />
          Filters
          {activeFiltersCount > 0 && (
            <span className="bg-[var(--brand)] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] h-5 flex items-center justify-center">
              {activeFiltersCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[350px] p-4" align="end">
        <div className="space-y-4">
          <div className="border-b border-[var(--bd)] pb-2">
            <h4 className="font-semibold text-base text-[var(--tx)]">Additional Filters</h4>
          </div>
          <div className="space-y-3">
            <MultiSelect
              options={nvrOptions}
              value={nvrIds}
              onChange={setNvrId}
              placeholder="Select NVR"
              searchable
              className="w-full"
              maxHeight="max-h-40"
              msg="No NVR Found"
            />

            <MultiSelect
              options={cameraOptions}
              value={cameraId}
              onChange={setCameraId}
              placeholder="Select Camera"
              searchable
              className="w-full"
              maxHeight="max-h-40"
              msg="No Camera Found"
            />

            <MultiSelect
              options={departments}
              value={selectedDepartments}
              onChange={(selected) => setSelectedDepartments(selected || [])}
              placeholder="Select Department"
              searchable
              className="w-full"
              maxHeight="max-h-40"
              msg="No Department Found"
            />

            {showLocationFilter && (
              <MultiSelect
                options={locationOptions}
                value={employeeLocations}
                onChange={(v) => setEmployeeLocations && setEmployeeLocations(v || [])}
                placeholder="Select Location"
                searchable
                className="w-full"
                maxHeight="max-h-40"
                msg="No Location Found"
              />
            )}

            {showTimeRange && (
              <div className="space-y-3">
                <label className="text-sm font-bold text-[var(--tx)]">Time Frame</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-[var(--tx2)] block mb-2">From</label>
                    <UnifiedTimePicker
                      hour={fromTimeParts.hour}
                      minute={fromTimeParts.minute}
                      period={fromTimeParts.period}
                      onChange={handleFromTimeChange}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--tx2)] block mb-2">To</label>
                    <UnifiedTimePicker
                      hour={toTimeParts.hour}
                      minute={toTimeParts.minute}
                      period={toTimeParts.period}
                      onChange={handleToTimeChange}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="w-full h-10 rounded-lg border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx)] text-sm flex items-center justify-center hover:border-[var(--brand)] transition-colors"
                  onClick={() => {
                    setFromTime('');
                    setToTime('');
                    setTimeType('');
                  }}
                >
                  <RotateCcw className="w-4 h-4 text-[var(--brand)] mr-2" />
                  Reset Time
                </button>
              </div>
            )}

            {showUnknownFilter && (
              <div className="h-10 flex items-center px-3 rounded-lg border border-[var(--bd)] bg-[var(--bg2)]">
                <div className="flex items-center gap-2">
                  <Switch
                    id="authorized-user-toggle"
                    checked={removeUnknown}
                    onCheckedChange={(checked) => setRemoveUnknown(Boolean(checked))}
                  />
                  <label htmlFor="authorized-user-toggle" className="text-[var(--tx)] text-xs font-medium">
                    Authorized User Only
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default LogsFilterPopover;
