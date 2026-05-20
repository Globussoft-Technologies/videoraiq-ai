import React, { useEffect } from 'react';
import { MdOutlineCalendarMonth } from "react-icons/md";
import { ChevronDown, Search, X } from 'lucide-react';
import Month from '@/assets/Calendar.svg';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { DatePickerComponent, DateRangePickerComponent } from '@/components/ui/calendar';
import { formatDate, formatDateRange } from '@/utils/formatDateRange';
import MultiSelect from '@/components/ui/multiselect';

const PlaybackHeader = ({ state, actions }) => {
  const hasActiveFilters = state.selectedLocation || state.selectedDepartment;

const cameraTypeOptions = [
  { id: 'checkin', label: 'Check In' },
  { id: 'checkout', label: 'Check Out' },
];

  // useEffect(() => {
  //   if (state.selectedNVRId) {
  //     // Reset location and department whenever NVR changes
  //     actions.handleLocationChange('');
  //     actions.handleDepartmentChange('');
  //   }
  // }, [state.selectedNVRId]);
// useEffect(() => {
//   if (state.selectedNVRId !== '') {
//     actions.handleLocationChange('');
//     actions.handleDepartmentChange('');
//   }
// }, [state.selectedNVRId]);
  return (
    <div className="flex px-4 sm:px-6 md:px-8 justify-between md:items-center md:flex-row flex-col gap-3 sm:gap-4 pb-3 sm:pb-4 md:pb-2">
      <div className="flex gap-2 md:gap-3 flex-col">
        <h2 className="text-base sm:text-base md:text-sm 2xl:text-xl mt-1 sm:mt-2 text-[#333333] font-medium">CCTV Playbacks</h2>
      </div>

      <div className="flex gap-2 sm:gap-3 md:gap-4 md:flex-row flex-col w-full md:w-auto md:mt-5">
        <div className="flex flex-col sm:flex-row md:flex-row items-start sm:items-center md:items-center gap-2 sm:gap-2 md:gap-2 flex-wrap sm:flex-nowrap">

          {/* Search Input */}
          <div className="relative w-full sm:w-auto sm:min-w-[140px] md:min-w-[100px] lg:min-w-[150px] 2xl:min-w-[180px] h-auto">
  <div className="relative">
    <Input
      type="text"
      placeholder="Search cameras"
      className="pl-3 pr-9 h-10 text-xs rounded-lg border border-[#C7C7C7] shadow-none w-full"
      value={state.searchInputValue}
      onChange={actions.handleSearchChange}
      onFocus={() => (state.cameraSearchResults?.length > 0) && actions.setShowSearchResults(true)}
      onBlur={() => setTimeout(() => actions.setShowSearchResults(false), 200)}
    />

    <Search className="absolute right-3 cursor-pointer top-1/2 -translate-y-1/2 w-4 h-4 sm:w-4 sm:h-4 md:w-5 md:h-5 text-[#595959]" />

    {state.cameraSearchResults !=null && state.searchInputValue!="" && !state.isLoading&& (
      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-[10px] shadow-lg max-h-48 sm:max-h-52 md:max-h-60 overflow-auto">
        {state.cameraSearchResults && state.cameraSearchResults.length > 0 ? (
          state.cameraSearchResults.map((camera) => (
            <div
              key={camera.id}
              className="px-3 sm:px-3.5 md:px-3.5 py-1.5 sm:py-2 hover:bg-gray-100 cursor-pointer text-xs sm:text-xs md:text-xs lg:text-sm"
              onClick={() => actions.handleSelectSearchResult(camera, state.selectedCamera)}
            >
              {camera?.customName || camera?.name}
            </div>
          ))
        ) : (
          <> 
          {!state.isLoading&&
          <div className="px-3 sm:px-4 py-1.5 sm:py-2 text-gray-500 text-xs sm:text-sm">
            No search results found
          </div>
          }
          
          </>
        )}
      </div>
    )}
  </div>
</div>


          {/* Location Filter */}
          <div className="w-full sm:w-auto sm:min-w-[110px] md:min-w-[90px] lg:min-w-[130px] 2xl:min-w-[160px]">
  <Select
    value={state.selectedLocation || ''}
    onValueChange={(value) => {
      if (value === 'clear') {
        actions.handleLocationChange('');
      } else {
        actions.handleLocationChange(value);
      }
    }}
    disabled={state.isLoading}
  >
              <SelectTrigger className="h-10 text-xs rounded-lg border border-[#C7C7C7] shadow-none">
      <SelectValue placeholder="Select Location" />
    </SelectTrigger>
              <SelectContent className="text-[#333333] max-h-52 sm:max-h-56 md:max-h-60 cursor-pointer font-[400] text-xs sm:text-xs md:text-xs lg:text-sm"> 
              {state.selectedLocation && (
        <SelectItem 
          value="clear" 
          className="text-red-400 flex hover:text-red-600 hover:bg-red-50 cursor-pointer"
        >
          <div className="flex items-center gap-2">
            
            <span>Clear</span>
          </div>
        </SelectItem>
      )}
      {state.locations.length > 0 ? (
        state.locations.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="cursor-pointer hover:bg-gray-200">
                      {option.label}
                    </SelectItem>
                  ))
                ) : (
                  <div className="px-3 py-2 text-gray-500 text-xs sm:text-sm">No options available</div>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* NVR Filter */}
          <div className="w-full sm:w-auto sm:min-w-[100px] md:min-w-[85px] lg:min-w-[140px] 2xl:min-w-[180px]">
            <Select
              value={state.selectedNVRId || ''}
              onValueChange={(value) => {
                if (value === 'clear') {
                  actions.handleNVRChange('');
                } else {
                  actions.handleNVRChange(value);
                }
              }}
              disabled={state.isLoading}
            >
              <SelectTrigger className="h-10 text-xs rounded-lg border border-[#C7C7C7] shadow-none">
                <SelectValue placeholder="Select NVR" />
              </SelectTrigger>
              <SelectContent className="text-[#333333] max-h-52 sm:max-h-56 md:max-h-60 cursor-pointer font-[400] text-xs sm:text-xs md:text-xs lg:text-sm">
              {state.selectedNVRId && (
                  <SelectItem 
                    value="clear" 
                    className="text-red-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      
                      <span>Clear</span>
                    </div>
                  </SelectItem>
                )}
                {state.nvrOptions.length > 0 ? (
                  state.nvrOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="cursor-pointer hover:bg-gray-200">
                      {option.label}
                    </SelectItem>
                  ))
                ) : (
                  <div className="px-3 py-2 text-gray-500 text-xs sm:text-sm">No options available</div>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Camera Filter */}
          <div className="w-full sm:w-auto sm:min-w-[110px] md:min-w-[95px] lg:min-w-[140px] 2xl:min-w-[180px]">
            <Select
              value={state.selectedCameraId || ''}
              onValueChange={(value) => {
                if (value === 'clear') {
                  actions.handleCameraChange('');
                } else {
                  actions.handleCameraChange(value);
                }
              }}
              disabled={state.isLoading }
            >
              <SelectTrigger className="h-10 text-xs rounded-lg border border-[#C7C7C7] shadow-none">
                <SelectValue placeholder="Select Camera" />
              </SelectTrigger>
              <SelectContent className="text-[#333333] max-h-52 sm:max-h-56 md:max-h-60 cursor-pointer font-[400] text-xs sm:text-xs md:text-xs lg:text-sm">
              {state.selectedCameraId && (
          <SelectItem
            value="clear"
            className="text-red-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
          >
            <span className="flex items-center gap-2">
              Clear
            </span>
          </SelectItem>
        )}

                {state.cameraOptions.length > 0 ? (
                  state.cameraOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="cursor-pointer hover:bg-gray-200">
                      {option.label}
                    </SelectItem>
                  ))
                ) : (
                  <div className="px-3 py-2 text-gray-500 text-xs sm:text-sm">No options available</div>
                )}
              </SelectContent>
            </Select>
          </div>
           
           {/* Department Filter */}
          <div className="w-full sm:w-auto sm:min-w-[110px] md:min-w-[100px] lg:min-w-[140px] 2xl:min-w-[180px]">
            <Select
              value={state.selectedDepartment || ''}
              onValueChange={(value) => {
                if (value === 'clear') {
                  actions.handleDepartmentChange('');
                } else {
                  actions.handleDepartmentChange(value);
                }
              }}
              disabled={state.isLoading}
            >
              <SelectTrigger className="h-10 text-xs rounded-lg border border-[#C7C7C7] shadow-none">
                <SelectValue placeholder="Select Department" />
              </SelectTrigger>
              <SelectContent className="text-[#333333] max-h-52 sm:max-h-56 md:max-h-60 cursor-pointer font-[400] text-xs sm:text-xs md:text-xs lg:text-sm">

              {state.selectedDepartment && (
                  <SelectItem 
                    value="clear" 
                    className="text-red-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      
                      <span>Clear</span>
                    </div>
                  </SelectItem>
                )}
                {state.departments.length > 0 ? (
                  state.departments.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="cursor-pointer hover:bg-gray-200">
                      {option.label}
                    </SelectItem>
                  ))
                ) : (
                  <div className="px-3 py-2 text-gray-500 text-xs sm:text-sm">No options available</div>
                )}
              </SelectContent>
            </Select>
          </div>


          <MultiSelect
            options={cameraTypeOptions}
            value={state.selectedCameraTypes}
            onChange={actions.setSelectedCameraTypes}
            placeholder="Select Camera Type"
            searchable={true}
            searchPlaceholder="Search CameraType..."
            className="w-full md:w-52"
            maxHeight="max-h-48"
          />

          {/* Date Picker */}
          <div className="w-full sm:w-auto sm:min-w-[130px] md:min-w-[40px] lg:min-w-[50px] 2xl:min-w-[50px]">
            <DatePickerComponent
              selectedDate={state.dateRange.start}
              onDateChange={(newDate) => {
                actions.setDateRange({ start: newDate, end: newDate });
              }}
              maxDate={new Date()}
              buttonClassName="h-10 text-xs rounded-lg border border-[#C7C7C7] shadow-none w-full transition-shadow duration-300 ease-in-out hover:shadow-sm text-[#5D5D5D] font-medium cursor-pointer py-1.5 px-2 bg-[#FFFFFF] flex items-center justify-center"
              buttonContent={
                <div className="flex items-center w-full justify-center 2xl:justify-between">
                  <div className="hidden lg:flex items-center overflow-hidden whitespace-nowrap">
                    <span className="truncate text-xs font-[400] block w-[70px] sm:w-[80px] md:w-[85px] lg:w-[90px] 2xl:w-[100px] 2xl:text-left">
                      {state.dateRange.start
                        ? formatDate(state.dateRange.start, state.dateRange.end)
                        : 'Select Date'}
                    </span>
                  </div>
                  <MdOutlineCalendarMonth className=" md:w-4 md:h-4 lg:w-5 lg:h-5 text-[#595959] 2xl:ml-auto mr-0 lg:mr-2 mb-0.5 flex-shrink-0" />
                </div>
              }
             popoverClassName="mt-1 z-50 2xl:mt-2"
            calendarClassName="p-3 bg-white shadow-lg border border-[#D8D8D8] 2xl:p-4"
             hideInstructionText={true}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlaybackHeader;
