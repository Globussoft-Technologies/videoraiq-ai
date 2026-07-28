import React, { useState, useMemo, useEffect, memo } from 'react';
import {
  Search,
  SearchX,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List as ListIcon,
  Loader2,
} from 'lucide-react';
import moment from 'moment';
import { toast } from 'sonner';
import ProfilesTable from './ProfilesTable';
import DateRangePicker from './DateRangePicker';
import StatCards from './StatCards';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

/**
 * Reusable table/grid wrapper for the log pages. Theme-aware (dark/light) via
 * CSS vars: search, date-range filter, grid/table toggle, server/client
 * pagination, rows-per-page. The table header row always renders so row/table
 * view always shows the column headings; the "no logs" illustration appears
 * below the table when the result set is empty.
 */
const ReusableTablePage = ({
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
  stats,
}) => {
  const [internalSearchInput, setInternalSearchInput] = useState('');
  const [internalViewMode, setInternalViewMode] = useState('table');
  const [internalLimit, setInternalLimit] = useState(10);
  const [pageInput, setPageInput] = useState('');
  const [internalDateRange, setInternalDateRange] = useState({ start: null, end: null });

  const currentViewMode = typeof viewMode === 'string' ? viewMode : internalViewMode;
  const setViewMode = typeof onViewModeChange === 'function' ? onViewModeChange : setInternalViewMode;
  const hasGrid = typeof gridCard === 'function';
  const showGrid = hasGrid && currentViewMode === 'grid';

  const searchInput = typeof searchQuery === 'string' ? searchQuery : internalSearchInput;
  const setSearchInput = typeof onSearchChange === 'function' ? onSearchChange : setInternalSearchInput;

  const limit = typeof limitProp === 'number' ? limitProp : internalLimit;
  const setLimit =
    typeof onLimitChange === 'function'
      ? (v) => {
          onLimitChange(v);
          setCurrentPage(1);
        }
      : (v) => {
          setInternalLimit(v);
          setCurrentPage(1);
        };

  const propStart = startDate ? moment(startDate).startOf('day').toDate() : null;
  const propEnd = endDate ? moment(endDate).endOf('day').toDate() : null;
  const dateRange = startDate || endDate ? { start: propStart, end: propEnd } : internalDateRange;

  const setDateRange = (range) => {
    if (!range) return;
    const normalized = {
      start: range.start ? moment(range.start).endOf('day').toDate() : null,
      end: range.end ? moment(range.end).endOf('day').toDate() : null,
    };
    if (typeof onDateRangeChange === 'function') onDateRangeChange(normalized);
    else setInternalDateRange(normalized);
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

  const paginated = useMemo(() => {
    if (useServerPagination) return data || [];
    const start = (currentPage - 1) * limit;
    return (filtered || []).slice(start, start + limit);
  }, [filtered, currentPage, limit, data, useServerPagination]);

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
    if (useServerPagination && typeof onPageChange === 'function') onPageChange(page);
  };

  const handleGoToPage = () => {
    const raw = String(pageInput).trim();
    if (!raw) return;
    if (!/^[1-9]\d*$/.test(raw)) {
      toast.error('You can only enter positive numbers');
      setPageInput('');
      return;
    }
    const page = parseInt(raw, 10);
    const clamped = Math.min(Math.max(page, 1), totalPages);
    handlePageChange(clamped);
    setPageInput('');
  };

  useEffect(() => {
    setCurrentPage(1);
    if (useServerPagination && typeof onPageChange === 'function') onPageChange(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, startDate, endDate]);

  const isEmpty = (paginated || []).length === 0;

  return (
    <div className="w-full flex flex-1 flex-col">
      {Array.isArray(stats) && stats.length > 0 && (
        <div className="mb-[18px]">
          <StatCards stats={stats} />
        </div>
      )}
      <div className="w-full flex flex-1 flex-col bg-[var(--bg1)] border border-[var(--bd)] rounded-[16px] p-4 sm:p-5 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full md:w-[240px] flex items-center h-10 rounded-[10px] bg-[var(--bg2)] border border-[var(--bd)] focus-within:border-[var(--violet)] focus-within:ring-2 focus-within:ring-[var(--violet)]/15 transition-colors">
            <Search className="absolute left-3 w-4 h-4 text-[var(--tx3)] pointer-events-none" />
            <input
              type="text"
              placeholder="Search"
              className="w-full h-full bg-transparent border-0 outline-none pl-9 pr-3 text-sm text-[var(--tx)] placeholder:text-[var(--tx3)]"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          {from !== 'visibility' && (
            <DateRangePicker
              startDate={dateRange.start}
              endDate={dateRange.end}
              minDate={minDate}
              maxDate={maxDate}
              onRangeChange={(range) => setDateRange(range)}
            />
          )}

          <div className="w-full md:flex md:items-center md:ml-auto md:w-auto gap-3 flex flex-wrap">
            {hasGrid && (
              <div className="flex items-center gap-[3px] bg-[var(--bg2)] border border-[var(--bd)] rounded-[8px] p-[3px] h-10">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`flex items-center gap-1.5 h-full px-3 rounded-[6px] text-xs font-semibold transition-colors cursor-pointer ${
                    currentViewMode === 'table'
                      ? 'bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white shadow-sm'
                      : 'text-[var(--tx2)] hover:text-[var(--tx)]'
                  }`}
                  title="List view"
                  aria-label="List view"
                >
                  <ListIcon className="w-3.5 h-3.5" />
                  List
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`flex items-center gap-1.5 h-full px-3 rounded-[6px] text-xs font-semibold transition-colors cursor-pointer ${
                    currentViewMode === 'grid'
                      ? 'bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white shadow-sm'
                      : 'text-[var(--tx2)] hover:text-[var(--tx)]'
                  }`}
                  title="Grid view"
                  aria-label="Grid view"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Grid
                </button>
              </div>
            )}
            {children}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="w-10 h-10 text-[var(--brand)] animate-spin" />
          </div>
        ) : (
          <>
            {showGrid ? (
              !isEmpty && (
                <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2.5 sm:gap-6">
                  {(paginated || []).map((item, idx) => (
                    <React.Fragment key={item?.id ?? item?.email ?? idx}>
                      {gridCard(item, idx)}
                    </React.Fragment>
                  ))}
                </div>
              )
            ) : (
              <div className="w-full overflow-x-auto overflow-y-auto max-h-[60vh] rounded-xl border border-[var(--bd)]">
                <ProfilesTable data={paginated} columns={columns} loading={false} />
              </div>
            )}
            {isEmpty && (
              <div className="flex flex-1 flex-col items-center justify-center py-16">
                <div className="w-16 h-16 rounded-full bg-[var(--bg2)] border border-[var(--bd)] flex items-center justify-center mb-4">
                  <SearchX className="w-7 h-7 text-[var(--tx3)]" />
                </div>
                <p
                  className="text-[18px] font-semibold text-[var(--tx)]"
                  style={{ fontFamily: 'var(--disp)' }}
                >
                  No logs found
                </p>
                <p className="text-sm text-[var(--tx3)] mt-1.5 max-w-[320px] text-center">
                  There are no records for the selected date range or filters. Try widening the range
                  or clearing filters.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      {!loading && !isEmpty && (
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 items-center gap-4">
          <div
            className={`text-sm text-[var(--tx2)] bg-[var(--bg2)] px-3 py-1.5 font-normal rounded-[8px] w-fit inline-flex items-center gap-2 ${
              from === 'visibility' ? 'invisible' : ''
            }`}
          >
            Total logs -{' '}
            <span className="text-[var(--violet)] font-semibold bg-[var(--violet)]/10 px-2.5 py-1 rounded-md">
              {useServerPagination ? attendanceLogsCount ?? 0 : (filtered || []).length}
            </span>
          </div>

          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className={`flex items-center justify-center w-8 h-8 rounded ${
                currentPage === 1
                  ? 'text-[var(--tx3)] cursor-not-allowed'
                  : 'text-[var(--tx2)] hover:bg-[var(--bg2)] cursor-pointer'
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {(() => {
              const pages = [];
              const maxVisiblePages = 5;
              if (totalPages <= maxVisiblePages) {
                for (let i = 1; i <= totalPages; i++) pages.push(i);
              } else if (currentPage <= 3) {
                for (let i = 1; i <= 4; i++) pages.push(i);
                if (totalPages > 5) pages.push('...');
                pages.push(totalPages);
              } else if (currentPage >= totalPages - 2) {
                pages.push(1);
                if (totalPages > 5) pages.push('...');
                for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
              } else {
                pages.push(1, '...');
                for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
                pages.push('...', totalPages);
              }
              return pages.map((page, index) =>
                page === '...' ? (
                  <span
                    key={`ellipsis-${index}`}
                    className="flex items-center justify-center w-8 h-8 text-[var(--tx3)]"
                  >
                    ...
                  </span>
                ) : (
                  <button
                    key={page}
                    onClick={() => handlePageChange(page)}
                    className={`flex items-center justify-center w-8 h-8 rounded text-sm font-medium cursor-pointer ${
                      currentPage === page
                        ? 'bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white'
                        : 'text-[var(--tx2)] hover:bg-[var(--bg2)]'
                    }`}
                  >
                    {page}
                  </button>
                )
              );
            })()}

            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className={`flex items-center justify-center w-8 h-8 rounded ${
                currentPage === totalPages
                  ? 'text-[var(--tx3)] cursor-not-allowed'
                  : 'text-[var(--tx2)] hover:bg-[var(--bg2)] cursor-pointer'
              }`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-center lg:justify-end gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[var(--tx2)] whitespace-nowrap">Go to:</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[1-9][0-9]*"
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGoToPage()}
                placeholder="Page"
                className="h-9 w-16 border border-[var(--bd)] rounded-lg text-xs text-[var(--tx)] bg-[var(--bg2)] px-2 focus:outline-none focus:border-[var(--brand)]"
              />
              <button
                type="button"
                onClick={handleGoToPage}
                disabled={String(pageInput).trim() === ''}
                className="h-9 px-3 rounded-lg text-xs font-medium bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-95 transition-opacity"
              >
                Go
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[var(--tx2)] whitespace-nowrap">Rows:</span>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="h-9 border border-[var(--bd)] rounded-lg text-xs text-[var(--tx)] bg-[var(--bg2)] px-2 cursor-pointer focus:outline-none focus:border-[var(--brand)]"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(ReusableTablePage);
