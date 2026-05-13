import React, { useMemo, useState, useEffect } from 'react';
import { Filter, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import MultiSelect from '@/components/ui/multiselect';
import { UnifiedTimePicker } from './TimePickerComponents';
import { parseTime, formatTime } from './timeUtils';

const LogsFilterPopover = ({
  // NVR props
  nvrIds,
  setNvrId,
  nvrList = [],

  // Camera props
  cameraId,
  setCameraId,
  cameraList = [],

  // Department props
  departments = [],
  selectedDepartments = [],
  setSelectedDepartments,

  // Time range props (optional)
  showTimeRange = false,
  setTimeType,
  setToTime,
  setFromTime,
  fromTime,
  toTime,
  showUnknownFilter,
  removeUnknown,
  setRemoveUnknown,
  timeType,

  // Location props (optional)
  showLocationFilter = false,
  employeeLocations = [],
  setEmployeeLocations,
  locationOptions = [],
}) => {
  // Calculate active filters count
  const activeFiltersCount = [
    Array.isArray(nvrIds) && nvrIds.length > 0,
    Array.isArray(cameraId) && cameraId.length > 0,
    selectedDepartments && selectedDepartments.length > 0,
    fromTime,
    toTime,
    showUnknownFilter && removeUnknown !== false,
    showLocationFilter && Array.isArray(employeeLocations) && employeeLocations.length > 0,
  ].filter(Boolean).length;

  let authorizationValue;
  if (removeUnknown === true) {
    authorizationValue = 'authorized';
  }

  const nvrOptions = useMemo(
    () =>
      nvrList.map((nvr) => ({
        label: nvr.nvrName,
        id: nvr._id || nvr.id,
      })),
    [nvrList]
  );

  const cameraOptions = useMemo(
    () =>
      cameraList.map((cam) => ({
        label: cam.customName || cam.name,
        id: cam.id || cam._id,
      })),
    [cameraList]
  );

  // State for time parts
  const [fromTimeParts, setFromTimeParts] = useState(parseTime(fromTime));
  const [toTimeParts, setToTimeParts] = useState(parseTime(toTime));

  // Sync with props
  useEffect(() => {
    setFromTimeParts(parseTime(fromTime));
  }, [fromTime]);

  useEffect(() => {
    setToTimeParts(parseTime(toTime));
  }, [toTime]);

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
        <Button className="flex bg-[linear-gradient(94.16deg,#FFFFFF_0.77%,#AAE2FF_99.4%)] rounded-lg text-[#333333] cursor-pointer items-center gap-2 relative">
          <Filter className="w-4 h-4" />
          Filters
          {activeFiltersCount > 0 && (
            <span className="bg-[#005480] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] h-5 flex items-center justify-center">
              {activeFiltersCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[350px] rounded-xl p-4" align="end">
        <div className="space-y-4">
          <div className="border-b border-b-gray-200 pb-2">
            <h4 className="font-semibold text-base text-[#333333]">
              Additional Filters
            </h4>
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
              // disabled={!Array.isArray(nvrIds) || nvrIds.length === 0 }
              className="w-full"
              maxHeight="max-h-40"
              msg="No Camera Found"
            />

            <div className="space-y-1">
              <MultiSelect
                options={departments}
                value={selectedDepartments}
                onChange={(selected) => setSelectedDepartments(selected || [])}
                placeholder="Select Department"
                searchable={true}
                className="w-full"
                maxHeight="max-h-40"
              />
            </div>

            {showLocationFilter && (
              <div className="space-y-1">
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
              </div>
            )}

            {showTimeRange && (
              <div className="space-y-3">
                <label className="text-sm font-bold text-[#333333]">
                  Time Frame
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-600 block mb-2">
                      From
                    </label>
                    <div className="flex items-end gap-1.5">
                      <UnifiedTimePicker
                        hour={fromTimeParts.hour}
                        minute={fromTimeParts.minute}
                        period={fromTimeParts.period}
                        onChange={handleFromTimeChange}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-600 block mb-2">
                      To
                    </label>
                    <div className="flex items-end gap-1.5">
                      <UnifiedTimePicker
                        hour={toTimeParts.hour}
                        minute={toTimeParts.minute}
                        period={toTimeParts.period}
                        onChange={handleToTimeChange}
                      />
                    </div>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full h-10 rounded-lg border-[#D9D9D9]"
                  onClick={() => {
                    setFromTime('');
                    setToTime('');
                    setTimeType('');
                  }}
                >
                  <RotateCcw className="w-4 h-4 text-[#07486A] mr-2" />
                  Reset Time
                </Button>
              </div>
            )}

            {showUnknownFilter && (
              <div className="space-y-1">
                <div className="h-10 flex items-center px-3 rounded-lg border border-[#D9D9D9] bg-white">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="authorized-user-toggle"
                      checked={removeUnknown}
                      onCheckedChange={(checked) =>
                        setRemoveUnknown(Boolean(checked))
                      }
                    />
                    <label
                      htmlFor="authorized-user-toggle"
                      className="text-[#181717ef] text-[20px] sm:text-xs font-medium "
                    >
                      Authorized User Only
                    </label>
                  </div>
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
