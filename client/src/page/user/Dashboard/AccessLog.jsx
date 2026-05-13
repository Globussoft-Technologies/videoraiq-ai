
import React, { useEffect, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { LuMouse } from "react-icons/lu";
import getAccessToken from '@/utils/getAccessToken';
import { DateRangePickerComponent } from '@/components/ui/calendar';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, Dot, Mouse, Image as ImageIcon, Video, Clapperboard, FileImage, Play, TvMinimal, TvMinimalPlay, CalendarOff } from 'lucide-react';
import Month from '../../../assets/Calendar.svg';
import {  formatDateCorrectDetection, formatDateRange } from '@/utils/formatDateRange';
import { OBJECT_ICONS, ICON_CLASS } from '@/page/user/Streams/CameraStreamsModal/StreamModal';
import { RiLink } from 'react-icons/ri';

// Define detection types and their display names
const detectionTypes = [
  { id: 'genericObjectDetection', label: 'Object Detection' },
  { id: 'countPersons', label: 'Person Count' },
  { id: 'countVehicles', label: 'Vehicle Count' },
];
// Shared utility for icon rendering
function getIconForObject(objectType) {
  const t = objectType.toLowerCase().trim();
  const icon = OBJECT_ICONS[t] || OBJECT_ICONS['default'];
  if (React.isValidElement(icon)) {
    return React.cloneElement(icon, { className: ICON_CLASS + ' text-[#333333] !w-4 !h-4' });
  }
  return icon;
}

function renderObjectIconCount(type, count) {
  return (
    <div className="flex flex-wrap gap-1.5 w-full">
      <div className="flex items-center px-1 py-0.5 bg-[#E9E9E9] rounded-[4px] mb-0.5">
        <div className="flex-shrink-0">{getIconForObject(type)}</div>
        <span className="text-[10px] md:text-xs font-[500] text-[#414141]">{count}</span>
      </div>
    </div>
  );
}

const HOST = import.meta.env.VITE_BACKEND;


// Base columns shared by all detection types
const baseColumns = [
  {
    accessorKey: 'cameraInfo',
    header: 'Camera/NVR',
    cell: (info) => (
      <div className="flex items-center whitespace-nowrap text-[#414141] space-x-0.5">
        <span className="font-medium text-[9px] sm:text-[10px] md:text-xs">
          {info.getValue().cameraName}
        </span>
        <span className="text-[9px] sm:text-[10px] md:text-xs">•</span>
        <span className="text-[9px] sm:text-[10px] md:text-xs">
          {info.getValue().nvrName}
        </span>
      </div>
    ),
  },
  {
    accessorKey: 'zone',
    header: 'Zone',
    cell: (info) => (
      <span className="whitespace-nowrap">{info.getValue()}</span>
    ),
  },
  {
    accessorKey: 'timeOfIncident',
    header: 'Date',
    cell: (info) => {
      const value = info.getValue();
      if (!value) return '';
      const dateObj = new Date(value);

      // Format: 02 July 2025, 14:35:27
      return (
        <span className="whitespace-nowrap">
          {dateObj.toLocaleString('en-GB', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false, // Set to true if you want 12-hour format with AM/PM
          })}
        </span>
      );
    },
  },
  {
    accessorKey: 'severity',
    header: 'Severity',
    cell: (info) => {
      const severity = info.getValue();
      return (
        <span
          className={`inline-block px-1.5 sm:px-2.5 py-0.5 sm:py-1.5 rounded-[4px] sm:rounded-[5px] text-[9px] sm:text-[10px] md:text-xs font-[500] ${
            severity === 'high'
              ? 'text-[#CE241C]  bg-[#FFDBD9]'
              : severity === 'moderate'
                ? 'text-[#EF8000]  bg-[#FFE4C5]'
                : 'text-[#338904]  bg-[#E8FFDB]'
          }`}
        >
          {severity}
        </span>
      );
    },
  },
  {
    accessorKey: 'Image',
    header: 'Media',
    cell: (info) => (
      <div className="flex flex-col gap-1.5">
        {info.getValue() && (
          <a
            href={info.getValue()}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#E9E9E9] border border-[#e5e7eb] hover:bg-[#07486A] hover:border-[#07486A] hover:text-white group transition-all duration-200"
          >
            <FileImage className="h-3.5 w-3.5 group-hover:text-white text-[#07486A]" />
            <span className="text-[9px] md:text-xs font-medium">Image</span>
          </a>
        )}
        {info.row.original.videoLink && (
          <a
            href={info.row.original.videoLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#E9E9E9] border border-[#e5e7eb] hover:bg-[#07486A] hover:border-[#07486A] hover:text-white group transition-all duration-200"
          >
            <TvMinimalPlay className="h-3.5 w-3.5 group-hover:text-white text-[#07486A]" />
            <span className="text-[9px] md:text-xs font-medium">Video</span>
          </a>
        )}
      </div>
    ),
  },
];

// Reusable style for description cell
const descriptionCellClass =
  'line-clamp-3 min-w-[150px] min-[1750px]:line-clamp-none ';

// Type-specific columns
const detectionTypeColumns = {
  genericObjectDetection: [
    { accessorKey: 'incidentName', header: 'Detection' },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: (info) => (
        <span className={descriptionCellClass}>{info.getValue()}</span>
      ),
    },
    {
      accessorKey: 'objectsDetected',
      header: 'Objects Detected',
      cell: (info) => {
        const objects = info.getValue();
        if (!objects || !Array.isArray(objects)) return 'N/A';
        return (
          <div className="flex flex-wrap gap-1 w-full">
            {objects.flatMap((obj, index) =>
              Object.entries(obj).map(([objectType, count]) => (
                <div
                  key={`${index}-${objectType}`}
                  className="flex items-center px-1 py-1 bg-[#E9E9E9] rounded-[4px] mb-1"
                >
                  <div className="flex-shrink-0 mr-1">
                    {getIconForObject(objectType)}
                  </div>
                  <span className="text-[10px] md:text-xs font-[500] text-[#414141]">
                    {count}
                  </span>
                </div>
              ))
            )}
          </div>
        );
      },
    },
    ...baseColumns,
  ],
  countPersons: [
    { accessorKey: 'incidentName', header: 'Detection' },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: (info) => (
        <span className={descriptionCellClass}>{info.getValue()}</span>
      ),
    },
    {
      accessorKey: 'count',
      header: 'Person Count',
      cell: (info) => renderObjectIconCount('person', info.getValue()),
    },
    ...baseColumns,
  ],
  countVehicles: [
    { accessorKey: 'incidentName', header: 'Detection' },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: (info) => (
        <span className={descriptionCellClass}>{info.getValue()}</span>
      ),
    },
    {
      accessorKey: 'count',
      header: 'Vehicle Count',
      cell: (info) => renderObjectIconCount('vehicle', info.getValue()),
    },
    ...baseColumns,
  ],
};

const IncidentsTable = ({ onVisibilityChange }) => {
  const [activeTab, setActiveTab] = useState(detectionTypes[0].id);
  const [detectionsData, setDetectionsData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    skip: 0,
    limit: 10,
    totalCount: 0,
  });
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - 7)),
    end: new Date(),
  });
  const [displayedColumns, setDisplayedColumns] = useState([]);
const [tabDataStatus, setTabDataStatus] = useState({
  genericObjectDetection: false,
  countPersons: false,
  countVehicles: false,
});

  // Fetch detection data
  const fetchDetections = async (type) => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams({
        detectionType: type,
        day: 'dateFilter',
        skip: pagination.skip,
        limit: pagination.limit,
      });

      const response = await fetch(
        `${HOST}/api/v1/dashboard/getDetections?${queryParams}`,
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'x-access-token': getAccessToken(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            startDate: formatDateCorrectDetection(dateRange.start),
            endDate: formatDateCorrectDetection(dateRange.end),
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.statusCode === 200 && data.body.status === 'success') {
        let detectionList =data.body.data.detectionData
        setDetectionsData((prev) => ({
          ...prev,
          [type]: data.body.data.detectionData.map((detection) => ({
            ...detection,
            cameraInfo: {
              cameraName: detection.channelData?.name || detection.cameraId,
              nvrName: detection.nvrData?.nvrName || 'N/A',
            },
          })),
        }));
        setPagination((prev) => ({
          ...prev,
          totalCount: data.body.data.totalCount,
        }));



        setTabDataStatus((prev) => ({
    ...prev,
    [type]: detectionList.length > 0,
      }));


      } else {
        throw new Error(data.body?.message || 'Failed to fetch detections');
      }
    } catch (error) {
      console.error('Error fetching detections:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch data when tab, pagination, or date range changes
  useEffect(() => {
    fetchDetections(activeTab);
  }, [activeTab, pagination.skip, pagination.limit, dateRange]);

  // Effect to update displayed columns based on data availability
  useEffect(() => {
    const currentDetections = detectionsData[activeTab] || [];
    const hasMedia = currentDetections.some((d) => d.Image || d.videoLink);

    let columnsToDisplay = detectionTypeColumns[activeTab];

    if (!hasMedia) {
      columnsToDisplay = columnsToDisplay.filter(
        (col) => col.accessorKey !== 'Image'
      );
    }

    setDisplayedColumns(columnsToDisplay);
  }, [detectionsData, activeTab]); // Depend on detectionsData and activeTab

  const table = useReactTable({
    data: detectionsData[activeTab] || [],
    columns: displayedColumns, // Change this line
    getCoreRowModel: getCoreRowModel(),
  });

  const skeletonRowCount = 10;
const allTabsEmpty =
  !loading &&
  !tabDataStatus.genericObjectDetection &&
  !tabDataStatus.countPersons &&
  !tabDataStatus.countVehicles;

  useEffect(() => {
    if (onVisibilityChange) {
      onVisibilityChange(!allTabsEmpty);
    }
  }, [allTabsEmpty, onVisibilityChange]);

if (allTabsEmpty) {
  return null; // hide the entire UI completely
}

  return (
    <div className="bg-[#fafafa]  rounded-lg px-[8px] 2xl:col-span-6 xl:col-span-7 col-span-12">
      <div className="flex items-center justify-between py-6 xl:py-4">
        <div className="flex items-center">
          <h3 className="text-xs 2xl:text-sm font-[500] text-[#7a7a7a] pl-[25px] xl:pl-[20px]">
            Detection Data
          </h3>
        </div>
        <div className="flex items-center space-x-4">
          <DateRangePickerComponent
            startDate={dateRange.start}
            endDate={dateRange.end}
            onRangeChange={(data) => {
              setDateRange(data);
            }}
            buttonClassName="h-8 px-2 rounded-[8px] border cursor-pointer border-[#C7C7C7] bg-white text-[#2B2B2B] text-xs md:text-sm font-medium flex items-center gap-1.5 hover:shadow-sm transition"
            buttonContent={
              <div className="flex items-center gap-1.5">
                <Calendar
                  className="w-4.5 h-4.5 text-[#5D5D5D]"
                  strokeWidth={2}
                />
                <span className="truncate text-[#595959] text-xs xl:text-sm font-[400]">
                  {dateRange.start && dateRange.end
                    ? formatDateRange(dateRange.start, dateRange.end)
                    : 'Select Date'}
                </span>
              </div>
            }
            popoverClassName="mt-2 z-50"
            calendarClassName="p-4 bg-white shadow-lg border border-[#D8D8D8]"
          />
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="border-b border-gray-200 px-4">
        <nav className="-mb-px flex space-x-4">
          {detectionTypes
          .filter((type) => tabDataStatus[type.id]) // only show tabs that have data
          .map((type) => (
            <button
              key={type.id}
              onClick={() => {
                setActiveTab(type.id);
                setPagination((prev) => ({ ...prev, skip: 0 }));
              }}
              className={`whitespace-nowrap font-[500] py-1 md:py-2 px-0.5 border-b-3 cursor-pointer text-[9px] md:text-xs ${
                activeTab === type.id
                  ? 'border-[#07486A] text-[#07486A]'
                  : 'border-transparent text-[#333333] hover:border-gray-300'
              }`}
            >
              {type.label}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <div className="text-red-500 p-4 text-center">Error: {error}</div>
      )}

      <div className="overflow-x-auto overflow-y-auto h-[410px] w-full">
        <table className="w-full mt-3 min-w-[750px]">
          <thead className="whitespace-nowrap">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr
                key={headerGroup.id}
                className="bg-[#F5F5F5] rounded-[10px] border-b-8 border-[#FAFAFA]"
              >
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-2 text-left text-[9px] md:text-xs font-medium text-[#333333] tracking-normal"
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="bg-[#F5F5F5] rounded-[10px] divide-y-8 divide-[#FAFAFA] text-[#414141] font-[500] text-xs">
            {loading
              ? Array(skeletonRowCount)
                  .fill(0)
                  .map((_, rowIndex) => (
                    <tr key={rowIndex} className="hover:bg-gray-50">
                      {detectionTypeColumns[activeTab].map(
                        (column, colIndex) => (
                          <td
                            key={colIndex}
                            className="px-2 sm:px-4 py-2 sm:py-3 text-[10px] md:text-xs font-medium text-[#414141] align-middle first:pl-3 sm:first:pl-6 last:pr-3 sm:last:pr-6 first:rounded-l-[8px] sm:first:rounded-l-[10px] last:rounded-r-[8px] sm:last:rounded-r-[10px]"
                          >
                            <Skeleton width="80%" height={16} />
                          </td>
                        )
                      )}
                    </tr>
                  ))
              : table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={`px-4 py-3 text-xs font-medium text-[#414141] align-middle first:pl-6 last:pr-6 first:rounded-l-[10px] last:rounded-r-[10px] ${cell.column.id === 'objectsDetected' ? 'min-w-[180px]' : ''}`}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>

        {!loading &&
          !error &&
          (!detectionsData[activeTab] ||
            detectionsData[activeTab].length === 0) && (
            <div className="flex flex-col items-center justify-center h-[300px] w-full text-center text-gray-500 py-10 xl:py-6 xl:text-[14px]">
              <CalendarOff className="w-10 h-10 mb-2 text-[#C7C7C7]" />
              <span>
                No detections found for{' '}
                {detectionTypes.find((t) => t.id === activeTab)?.label}.
              </span>
            </div>
          )}
      </div>

      {/* Pagination */}
      {loading ? (
        <div className="flex items-center justify-between px-2 py-3 border-t border-gray-200">
          <div className="w-48">
            <Skeleton width={180} height={16} />
          </div>
          <div className="flex space-x-2">
            {/* Previous Button Skeleton */}
            <div className="w-24 sm:w-28">
              <Skeleton height={32} borderRadius={4} />
            </div>
            {/* Next Button Skeleton */}
            <div className="w-24 sm:w-28">
              <Skeleton height={32} borderRadius={4} />
            </div>
          </div>
        </div>
      ) : (
        !error &&
        detectionsData[activeTab]?.length > 0 && (
          <div className="flex items-center justify-between px-2 py-3 border-t border-gray-200">
            {/* compute current page / total pages for correct pagination UI */}
            {(() => {
              const currentPage =
                Math.floor(pagination.skip / pagination.limit) + 1;
              const totalPages = Math.max(
                1,
                Math.ceil(pagination.totalCount / pagination.limit)
              );
              const isFirst = pagination.skip === 0;
              const isLast =
                pagination.skip + pagination.limit >= pagination.totalCount;

              return (
                <>
                  <div className="md:text-sm text-[10px] text-[#979797] font-[500]">
                    Page {currentPage} to {totalPages} of {pagination.totalCount}{' '}
                    detections
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() =>
                        setPagination((prev) => ({
                          ...prev,
                          skip: Math.max(0, prev.skip - prev.limit),
                        }))
                      }
                      disabled={isFirst}
                      aria-disabled={isFirst}
                      className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-[3px] sm:rounded-[4px] text-[10px] md:text-xs flex items-center justify-center gap-1 sm:gap-2 border ${
                        isFirst
                          ? 'bg-white text-[#979797] border-[#C7C7C7] cursor-not-allowed'
                          : 'bg-[#07486A] text-white border-[#07486A] hover:bg-[#065072] cursor-pointer'
                      }`}
                    >
                      <ChevronLeft
                        className={`${isFirst ? 'text-[#979797]' : 'text-white'} w-7 h-7`}
                        strokeWidth={1}
                      />
                      <span
                        className={isFirst ? 'text-[#979797]' : 'text-white'}
                      >
                        Previous
                      </span>
                    </button>

                    <button
                      onClick={() =>
                        setPagination((prev) => ({
                          ...prev,
                          skip: prev.skip + prev.limit,
                        }))
                      }
                      disabled={isLast}
                      aria-disabled={isLast}
                      className={`px-3 sm:px-4 py-0.5 sm:py-1 w-24 sm:w-28 rounded-[3px] cursor-pointer md:rounded-[4px] text-[10px] md:text-xs flex items-center justify-between  ${
                        isLast
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-[#07486A] text-white hover:bg-[#065072] cursor-pointer'
                      }`}
                    >
                      <span
                        className={`ml-auto flex items-center gap-2 ${isLast ? 'text-gray-400' : 'text-white'}`}
                      >
                        Next
                        <ChevronRight
                          className={`${isLast ? 'text-gray-400' : 'text-white'} w-7 h-7`}
                          strokeWidth={1}
                        />
                      </span>
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        )
      )}
    </div>
  );
};
export default IncidentsTable;
