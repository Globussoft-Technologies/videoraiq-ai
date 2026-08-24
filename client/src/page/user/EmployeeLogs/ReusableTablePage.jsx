import React, { useState, useMemo, useEffect, memo } from 'react';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Play,
  ListFilter,
  ArrowDownUp,
  LayoutGrid,
  List as ListIcon,
  Loader2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { formatDateRange } from '@/utils/formatDateRange';
import Month from '@/assets/Calendar.svg';
import ProfilesTable from './ProfilesTable';
import { DateRangePickerComponent } from '@/components/ui/calendar';
import moment from 'moment';
import notfound from '@/assets/notfound.svg';

const PAGE_SIZE_OPTIONS = [12, 20, 60, 100];

const ReusableTablePage = ({
  title,
  data,
  columns,
  searchKeys,
  children,
  searchQuery,
  onSearchChange,
  startDate,
  endDate,
  onDateRangeChange,
  minDate,
  maxDate,
  attendanceLogsCount,
  currentPage,
  setCurrentPage,
  onPageChange,
  loading,
  from,
  gridCard,
  viewMode,
  onViewModeChange,
  limit: limitProp,
  onLimitChange,
}) => {
  const [internalSearchInput, setInternalSearchInput] = useState('');
  const [internalViewMode, setInternalViewMode] = useState('table');
  const [internalLimit, setInternalLimit] = useState(12);
  const currentViewMode =
    typeof viewMode === 'string' ? viewMode : internalViewMode;
  const setViewMode =
    typeof onViewModeChange === 'function'
      ? onViewModeChange
      : setInternalViewMode;
  const showGrid =
    currentViewMode === 'grid' && typeof gridCard === 'function';
  const searchInput =
    typeof searchQuery === 'string' ? searchQuery : internalSearchInput;
  const setSearchInput =
    typeof onSearchChange === 'function'
      ? onSearchChange
      : setInternalSearchInput;
  const [onLoading, setOnLoading] = useState(false);
  const [pageInput, setPageInput] = useState('');
  const limit = typeof limitProp === 'number' ? limitProp : internalLimit;
  const setLimit = typeof onLimitChange === 'function'
    ? (v) => { onLimitChange(v); setCurrentPage(1); }
    : (v) => { setInternalLimit(v); setCurrentPage(1); };
  const [internalDateRange, setInternalDateRange] = useState({
    start: null,
    end: null,
  });
  const propStart = startDate
    ? moment(startDate).startOf('day').toDate()
    : null;

  const propEnd = endDate ? moment(endDate).endOf('day').toDate() : null;

  // Use either external props or internal state
  const dateRange =
    startDate || endDate
      ? { start: propStart, end: propEnd }
      : internalDateRange;

  // Handle setting date range
  const setDateRange = (range) => {
    if (!range) return;

    // Normalize dates
    const normalized = {
      start: range.start ? moment(range.start).endOf('day').toDate() : null,
      end: range.end ? moment(range.end).endOf('day').toDate() : null,
    };

    if (typeof onDateRangeChange === 'function') {
      onDateRangeChange(normalized);
    } else {
      setInternalDateRange(normalized);
    }
  };

  const filtered = useMemo(() => {
    if (!searchInput) return data || [];
    const q = String(searchInput).toLowerCase();
    return (data || []).filter((item) =>
      (searchKeys || []).some((key) => {
        const v = item?.[key];
        if (v === null || v === undefined) return false;
        return String(v).toLowerCase().includes(q);
      })
    );
  }, [data, searchKeys, searchInput]);

  const useServerPagination =
    typeof attendanceLogsCount === 'number' && attendanceLogsCount >= 0;
  const totalPages = useServerPagination
    ? Math.max(1, Math.ceil(attendanceLogsCount / limit))
    : Math.max(1, Math.ceil((filtered || []).length / limit));

  // useEffect(() => {
  //   // Simulate loading when search changes
  //   setOnLoading(true);
  //   const t = setTimeout(() => setOnLoading(false), 300);
  //   return () => clearTimeout(t);
  // }, [searchInput]);

  const paginated = useMemo(() => {
    if (useServerPagination) {
      return data || [];
    }
    const start = (currentPage - 1) * limit;
    return (filtered || []).slice(start, start + limit);
  }, [filtered, currentPage, limit, data, useServerPagination]);

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
    if (useServerPagination && typeof onPageChange === 'function') {
      onPageChange(page);
    }
  };

  // "Go to page" input handler — clamp to a valid page, ignore empty/invalid.
  const handleGoToPage = () => {
    const page = parseInt(pageInput, 10);
    if (!Number.isFinite(page)) return;
    const clamped = Math.min(Math.max(page, 1), totalPages);
    handlePageChange(clamped);
    setPageInput('');
  };

  // Reset to first page when filters/search/data change. For server pagination, also request page 1.
  useEffect(() => {
    setCurrentPage(1);
    if (useServerPagination && typeof onPageChange === 'function') {
      onPageChange(1);
    }
  }, [searchInput, startDate, endDate]);

  return (
    <div className="min-h-screen ">
      <div className="w-full overflow-x-auto p-3 sm:p-4 space-y-5 md:space-y-7 xl:space-y-8 bg-white rounded-[18px]">
        <div className="border-gray-200 rounded-[8px] xl:rounded-[20px] bg-[#FAFAFA] p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4">
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <div className="relative w-full md:w-[15%]">
              <Input
                type="text"
                placeholder="Search"
                className="pl-4 pr-10 shadow-none border border-[#C7C7C7] text-[#595959] h-9 md:h-10"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 xl:w-5 xl:h-5 text-[#595959]" />
            </div>
           {from !== 'visibility' && (
            <DateRangePickerComponent
              startDate={dateRange.start}
              endDate={dateRange.end}
              minDate={minDate}
              maxDate={maxDate}
              onRangeChange={(range) => {
                if (typeof setDateRange === 'function') setDateRange(range);
              }}
              buttonClassName="h-9 transition-shadow duration-300 ease-in-out hover:shadow-sm text-[#5D5D5D] font-medium cursor-pointer py-1.5 px-2 bg-[#FFFFFF] rounded-lg text-xs border border-[#C7C7C7] flex items-center justify-between w-full max-w-[280px] sm:min-w-[160px] md:w-auto md:px-2 2xl:h-10 2xl:py-2 2xl:px-4 2xl:rounded-[10px] 2xl:text-sm 2xl:min-w-[180px]"
              buttonContent={
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center overflow-hidden whitespace-nowrap">
                    <img
                      src={Month}
                      className="w-3.5 h-3.5 mr-1.5 shrink-0 2xl:w-4 2xl:h-4 2xl:mr-2 mt-0.5"
                      alt="Calendar Icon"
                    />
                    <span className="truncate block md:mt-0.5 w-[100px] text-left  2xl:w-[120px]">
                      {dateRange.start && dateRange.end
                        ? formatDateRange(dateRange.start, dateRange.end)
                        : 'Select Date'}
                    </span>
                  </div>
                  <ChevronDown className="w-[12px] h-[12px] text-[#5D5D5D] ml-1.5 shrink-0 2xl:w-[14px] 2xl:h-[14px] 2xl:ml-2" />
                </div>
              }
              popoverClassName="mt-1 z-50 2xl:mt-2"
              calendarClassName="p-3 bg-white shadow-lg border border-[#D8D8D8] 2xl:p-4"
            />)}

            {/* Spacer on md+ so the button moves to the end */}
            <div className="w-full md:flex md:items-center md:ml-auto md:w-auto gap-3">
              {children}
              {typeof gridCard === 'function' && (
                <div className="flex items-center rounded-[8px] border border-[#C7C7C7] overflow-hidden h-8 2xl:h-10">
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    className={`flex items-center justify-center w-8 h-full transition-colors cursor-pointer ${
                      currentViewMode === 'grid'
                        ? 'bg-[#07486A] text-white'
                        : 'bg-white text-[#595959] hover:bg-gray-50'
                    }`}
                    title="Grid view"
                    aria-label="Grid view"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                  <div className="w-px h-full bg-[#C7C7C7]" />
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    className={`flex items-center justify-center w-8 h-full transition-colors cursor-pointer ${
                      currentViewMode === 'table'
                        ? 'bg-[#07486A] text-white'
                        : 'bg-white text-[#595959] hover:bg-gray-50'
                    }`}
                    title="Table view"
                    aria-label="Table view"
                  >
                    <ListIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {/* <div className="w-full md:w-auto">
                <button className="h-9 md:h-10.5 rounded-[10px] border border-[#C7C7C7] bg-white px-3 flex items-center justify-center xl:justify-start gap-2">
                  <ListFilter className=" text-[#777777]" size={20} />
                  <span className='font-[500] text-[#595959] text-sm hidden xl:flex'>Filter</span>
                </button>
              </div> */}
            </div>
          </div>

          {loading ? (
            // While the API is pending (filter change / navigation), show a
            // single centered spinner instead of stale rows.
            <div className="flex items-center justify-center min-h-[60vh]">
              <Loader2 className="w-10 h-10 text-[#07486A] animate-spin" />
            </div>
          ) : (
            <>
              {showGrid ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
                  {(paginated || []).map((item, idx) => (
                    <React.Fragment key={item?.id ?? item?.email ?? idx}>
                      {gridCard(item, idx)}
                    </React.Fragment>
                  ))}
                </div>
              ) : (
                <div className="w-full overflow-x-auto overflow-y-auto max-h-[60vh]">
                  <ProfilesTable
                    data={paginated}
                    columns={columns}
                    loading={onLoading}
                  />
                </div>
              )}
              {(paginated || []).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 min-h-[60vh]">
                  <img
                    src={notfound}
                    alt="No logs found"
                    className="w-64 h-64 mb-4"
                  />
                </div>
              ) : null}
            </>
          )}
        </div>
        {!loading && (paginated || []).length > 0 && (
          <div className="mt-6 pt-4 border-t border-[#EEEEEE] grid grid-cols-3 items-center gap-4">
            <div
              className={`ml-6 text-sm text-[#333333] bg-[#F5F5F5] border border-[#E5E5E5] px-3 py-1.5 font-[400] rounded-[5px] w-fit max-w-full inline-flex items-center gap-2 whitespace-nowrap
           ${from === 'visibility' ? "invisible" : ""}`}
            >
              <span className="truncate">Total logs -</span>
              <span className="shrink-0 text-white font-semibold bg-[#07486A] px-2.5 py-1 rounded-md">
                {useServerPagination
                  ? attendanceLogsCount ?? 0
                  : (filtered || []).length}
              </span>
            </div>
            <div className="flex items-center justify-center gap-2">
              {/* Previous Button */}
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className={`flex items-center justify-center w-8 h-8 rounded ${
                  currentPage === 1
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-gray-100 cursor-pointer'
                }`}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {/* Page Numbers */}
              {(() => {
                const pages = [];
                const maxVisiblePages = 5;

                if (totalPages <= maxVisiblePages) {
                  // Show all pages if total is small
                  for (let i = 1; i <= totalPages; i++) {
                    pages.push(i);
                  }
                } else {
                  // Show smart pagination
                  if (currentPage <= 3) {
                    // Show first 4 pages + ... + last
                    for (let i = 1; i <= 4; i++) pages.push(i);
                    if (totalPages > 5) pages.push('...');
                    pages.push(totalPages);
                  } else if (currentPage >= totalPages - 2) {
                    // Show first + ... + last 4 pages
                    pages.push(1);
                    if (totalPages > 5) pages.push('...');
                    for (let i = totalPages - 3; i <= totalPages; i++)
                      pages.push(i);
                  } else {
                    // Show first + ... + current-1, current, current+1 + ... + last
                    pages.push(1);
                    pages.push('...');
                    for (let i = currentPage - 1; i <= currentPage + 1; i++)
                      pages.push(i);
                    pages.push('...');
                    pages.push(totalPages);
                  }
                }

                return pages.map((page, index) =>
                  page === '...' ? (
                    <span
                      key={`ellipsis-${index}`}
                      className="flex items-center justify-center w-8 h-8 text-gray-400"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={page}
                      onClick={() => handlePageChange(page)}
                      className={`flex items-center justify-center w-8 h-8 rounded text-sm font-medium ${
                        currentPage === page
                          ? 'bg-[#07486A] text-white cursor-pointer'
                          : 'text-gray-600 hover:bg-gray-100 cursor-pointer'
                      }`}
                    >
                      {page}
                    </button>
                  )
                );
              })()}

              {/* Next Button */}
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className={`flex items-center justify-center w-8 h-8 rounded ${
                  currentPage === totalPages
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-gray-100 cursor-pointer'
                }`}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-end gap-3">
              {/* Go to page */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[#595959] whitespace-nowrap">Go to:</span>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleGoToPage();
                  }}
                  placeholder="Page"
                  className="h-9 w-16 border border-[#C7C7C7] rounded-lg text-xs text-[#595959] bg-white px-2 focus:outline-none focus:ring-1 focus:ring-[#07486A]"
                />
                <button
                  type="button"
                  onClick={handleGoToPage}
                  disabled={pageInput === ''}
                  className="h-9 px-3 rounded-lg text-xs font-medium bg-[#07486A] text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#063a55]"
                >
                  Go
                </button>
              </div>

              {/* Rows per page */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[#595959] whitespace-nowrap">Rows:</span>
                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="h-9 border border-[#C7C7C7] rounded-lg text-xs text-[#595959] bg-white px-2 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#07486A]"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(ReusableTablePage);
