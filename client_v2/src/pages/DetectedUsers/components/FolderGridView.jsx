import React from 'react';
import { Folder, Check, X, Loader2, Trash2, Search, SearchX } from 'lucide-react';
import AutoRefreshComponent from '@/pages/AttendanceLogs/components/AutoRefreshComponent';
import DateRangePicker from '@/components/PresetDateRangePicker';
import ConfirmationModal from '@/components/DeleteConfirmation';
import PaginationBar from './PaginationBar';

// Folder-grid landing page for Detected Users. Each folder is a dsId group of
// face images; the first image is the thumbnail. Whole folders can be selected
// and deleted, searched by id/name, and filtered by date.
const FolderGridView = ({
  folders,
  loading,
  error,
  debouncedSearch,
  onOpenFolder,
  // search + date filter
  search,
  setSearch,
  dateRange,
  onDateRangeChange,
  // folder selection
  selectedFolderIds,
  toggleFolderSelected,
  allFoldersSelected,
  toggleSelectAllFolders,
  onDeleteFoldersClick,
  deleting,
  // auto refresh
  autoRefresh,
  setAutoRefresh,
  refreshInterval,
  setRefreshInterval,
  onManualRefresh,
  // pagination
  page,
  totalPages,
  goToPage,
  limit,
  onLimitChange,
  totalCount,
  // delete-folders confirm modal
  confirmDeleteFolders,
  setConfirmDeleteFolders,
  selectedFoldersImageCount,
  onConfirmDeleteFolders,
  canDelete,
}) => (
  <div className="flex flex-1 flex-col">
    <div className="flex flex-1 flex-col bg-[var(--bg1)] border border-[var(--bd)] rounded-[16px] p-4 sm:p-5 space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full md:w-[260px] flex items-center h-10 rounded-[10px] bg-[var(--bg2)] border border-[var(--bd)] focus-within:border-[var(--violet)] focus-within:ring-2 focus-within:ring-[var(--violet)]/15 transition-colors">
          <Search className="absolute left-3 w-4 h-4 text-[var(--tx3)] pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ID or name"
            className="w-full h-full bg-transparent border-0 outline-none pl-9 pr-9 text-sm text-[var(--tx)] placeholder:text-[var(--tx3)]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--tx3)] hover:text-[var(--tx)] cursor-pointer"
              title="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Date-range filter (by group latestCreatedAt), defaults to today */}
        <DateRangePicker
          startDate={dateRange.start}
          endDate={dateRange.end}
          maxDate={new Date()}
          onRangeChange={onDateRangeChange}
        />

        <div className="w-full md:w-auto md:ml-auto flex items-center gap-2 sm:gap-3 flex-wrap">
          {!loading && !error && folders.length > 0 && (
            <button
              type="button"
              onClick={toggleSelectAllFolders}
              className="flex items-center gap-1.5 h-10 bg-[var(--bg2)] text-[var(--tx2)] border border-[var(--bd)] rounded-lg px-3 text-sm font-medium cursor-pointer hover:text-[var(--tx)] hover:border-[var(--violet)] transition-colors"
            >
              {allFoldersSelected ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
              {allFoldersSelected ? 'Unselect All' : 'Select All'}
            </button>
          )}
          {canDelete && selectedFolderIds.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmDeleteFolders(true)}
              disabled={deleting}
              className="flex items-center gap-1.5 h-10 bg-[var(--crit)] text-white rounded-lg px-3 text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete ({selectedFolderIds.length})
            </button>
          )}
          <AutoRefreshComponent
            isActive={autoRefresh}
            onActiveChange={setAutoRefresh}
            refreshInterval={refreshInterval}
            onIntervalChange={setRefreshInterval}
            onManualRefresh={onManualRefresh}
          />
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center text-[var(--brand)]">
          <Loader2 className="w-10 h-10 animate-spin" />
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center py-16">
          <div className="w-16 h-16 rounded-full bg-[var(--crit)]/10 border border-[var(--crit)]/20 flex items-center justify-center mb-4">
            <SearchX className="w-7 h-7 text-[var(--crit)]" />
          </div>
          <p className="text-[18px] font-semibold text-[var(--tx)]" style={{ fontFamily: 'var(--disp)' }}>
            Failed to load
          </p>
          <p className="text-sm text-[var(--tx3)] mt-1.5 max-w-[320px] text-center">
            Something went wrong while loading detected users. Please refresh and try again.
          </p>
        </div>
      ) : folders.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-16">
          <div className="w-16 h-16 rounded-full bg-[var(--bg2)] border border-[var(--bd)] flex items-center justify-center mb-4">
            <SearchX className="w-7 h-7 text-[var(--tx3)]" />
          </div>
          <p className="text-[18px] font-semibold text-[var(--tx)]" style={{ fontFamily: 'var(--disp)' }}>
            No detected users found
          </p>
          <p className="text-sm text-[var(--tx3)] mt-1.5 max-w-[320px] text-center">
            {debouncedSearch
              ? `No results for "${debouncedSearch}". Try a different search or widen the date range.`
              : 'There are no detected users for the selected date range. Try widening the range or clearing filters.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-4 sm:gap-5">
          {folders.map((folder) => {
            const isFolderSelected = selectedFolderIds.includes(folder.dsId);
            return (
              <div key={folder.dsId} className="group flex flex-col items-center">
                <div
                  className={`relative w-full aspect-square rounded-2xl overflow-hidden bg-[var(--bg2)] border shadow-sm group-hover:shadow-md transition-shadow ${
                    isFolderSelected
                      ? 'border-[var(--crit)] ring-2 ring-[var(--crit)]/60'
                      : 'border-[var(--bd)]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onOpenFolder(folder)}
                    className="absolute inset-0 w-full h-full cursor-pointer"
                  >
                    <img
                      src={folder.images[0]}
                      alt="Folder"
                      className="w-full h-full object-cover object-top"
                    />
                  </button>

                  {/* Folder icon by default; hidden on hover / when selected. */}
                  <div
                    className={`absolute top-2 left-2 z-10 bg-black/45 text-white rounded-full p-1 transition-opacity ${
                      isFolderSelected ? 'opacity-0' : 'opacity-100 group-hover:opacity-0'
                    }`}
                  >
                    <Folder className="w-3.5 h-3.5" />
                  </div>

                  {/* Selection checkbox, shown on hover or when selected. */}
                  <label
                    className={`absolute top-2 left-2 z-20 flex items-center justify-center cursor-pointer transition-opacity ${
                      isFolderSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isFolderSelected}
                      onChange={() => toggleFolderSelected(folder.dsId)}
                      className="w-5 h-5 rounded accent-[var(--crit)] cursor-pointer"
                    />
                  </label>

                  {folder.authorizedUser && (
                    <div className="absolute top-2 right-2 z-10 bg-[var(--ok)] text-white rounded-full p-1">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  )}
                  {/* Image count, bottom-right */}
                  <span className="absolute bottom-1.5 right-1.5 z-10 bg-black/60 text-white text-[10px] font-medium leading-none px-1.5 py-1 rounded-full">
                    {folder.images.length}
                  </span>
                </div>
                {/* Tagged/registered user's name; fall back to the dsId. */}
                <p
                  className="mt-1.5 w-full text-center text-[10px] leading-tight font-medium text-[var(--tx2)] break-all"
                  title={folder.authorizedUser?.name || folder.dsId}
                >
                  {folder.authorizedUser?.name || folder.dsId}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>

    {/* Pagination */}
    {!loading && !error && folders.length > 0 && (
      <div className="mt-4">
        <PaginationBar
          page={page}
          totalPages={totalPages}
          onPageChange={goToPage}
          limit={limit}
          onLimitChange={onLimitChange}
          totalCount={totalCount}
          totalLabel="Total detected"
        />
      </div>
    )}

    {/* Confirm deleting selected folders */}
    <ConfirmationModal
      open={confirmDeleteFolders}
      title="Delete Folders"
      icon={<Trash2 className="w-6 h-6 text-[var(--crit)]" />}
      message={
        <>
          Delete{' '}
          <span className="font-semibold text-[var(--tx)]">
            {selectedFolderIds.length} folder{selectedFolderIds.length > 1 ? 's' : ''}
          </span>{' '}
          ({selectedFoldersImageCount} image{selectedFoldersImageCount > 1 ? 's' : ''})?
        </>
      }
      confirmLabel="Delete"
      loading={deleting}
      onClose={() => !deleting && setConfirmDeleteFolders(false)}
      onConfirm={onConfirmDeleteFolders}
    />
  </div>
);

export default FolderGridView;
