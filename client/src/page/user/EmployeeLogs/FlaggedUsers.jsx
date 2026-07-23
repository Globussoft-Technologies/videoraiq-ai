import React, { useState, useEffect, useCallback } from 'react';
import {
  Folder,
  Users,
  Save,
  Check,
  X,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Trash2,
  Image as ImageIcon,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { getGroupedFaceImages, deleteFaceImages } from './Api/faceImages';
import TagFlaggedUserModal from './components/TagFlaggedUserModal';
import AutoRefreshComponent from './components/AutoRefreshComponent';
import ConfirmationModal from '@/page/user/Detection/components/DeleteConfirmation';
import Pagination from '@/components/Pagination';
import useDebounce from '@/hooks/useDebounce';
import { usePermissions } from '@/context/Permission/PermissionContext';
import AccessDenied from '@/components/AccessDenied';
import { DateRangePickerComponent } from '@/components/ui/calendar';
import { formatDateRange } from '@/utils/formatDateRange';
import Month from '@/assets/Calendar.svg';
import moment from 'moment-timezone';

const ROWS_OPTIONS = [35, 60, 100];

const REFRESH_KEY = 'flagged_users_auto_refresh_enabled';
const INTERVAL_KEY = 'flagged_users_auto_refresh_interval';

// Shared pagination bar: page numbers + go-to-page + rows-per-page selector.
const PaginationBar = ({
  page,
  totalPages,
  onPageChange,
  pageInput,
  onPageInputChange,
  onGoToPage,
  limit,
  onLimitChange,
  rowsOptions = ROWS_OPTIONS,
}) => (
  <div className="relative flex items-center justify-center flex-wrap gap-4">
    {/* Page numbers — centered across the full width */}
    <Pagination
      currentPage={page}
      totalPages={totalPages}
      onPageChange={onPageChange}
      className="flex justify-center"
    />

    {/* Go-to-page + rows — anchored to the right */}
    <div className="flex items-center gap-4 md:absolute md:right-0">
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <span>Page</span>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={pageInput}
          onChange={(e) => onPageInputChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onGoToPage()}
          placeholder={`${page}`}
          className="w-14 h-8 px-2 border border-[#C7C7C7] rounded-lg text-sm text-center focus:outline-none focus:ring-1 focus:ring-[#07486A]"
        />
        <button
          type="button"
          onClick={onGoToPage}
          className="h-8 px-3 bg-[#07486A] text-white rounded-lg text-sm cursor-pointer hover:bg-[#063a56]"
        >
          Go
        </button>
      </div>

      <div className="flex items-center gap-2 text-sm text-gray-600">
        <span>Rows:</span>
        <select
          value={limit}
          onChange={(e) => onLimitChange(Number(e.target.value))}
          className="h-8 px-2 border border-[#C7C7C7] rounded-lg text-sm cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#07486A]"
        >
          {rowsOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    </div>
  </div>
);

// The /grouped API returns image fields as relative paths, so build the full
// upload URL from VITE_BACKEND here.
const uploadDomain = import.meta.env.VITE_BACKEND + '/api/v1/uploads';

// Map a raw /grouped API group into the folder shape the UI renders.
// Prepend `uploadDomain` to each image and keep `images` / `imageIds`
// index-aligned so a selected image's id is available for the delete endpoint.
const mapGroup = (group) => {
  const valid = (group.images || []).filter((i) => i && i.image);
  return {
    dsId: group.dsId,
    authorizedUser: group.authorizedUser || null,
    images: valid.map((i) => `${uploadDomain}/${i.image.replace(/^\/+/, '')}`),
    imageIds: valid.map((i) => i._id),
  };
};

// Folder-grid landing page for Flagged Users. Each folder is a dsId group of
// face images from GET /api/v1/faceImages/grouped: the first image is the
// thumbnail, opening a folder shows all images. "Save Folder" tags the dsId to
// an authorized user (existing or newly registered).
const FlaggedUsers = () => {
  const { permissions, loading: permissionsLoading } = usePermissions();
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeDsId, setActiveDsId] = useState(null);
  const [tagModalFolder, setTagModalFolder] = useState(null);
  const [fullscreenIndex, setFullscreenIndex] = useState(null);
  const [selectedImageIds, setSelectedImageIds] = useState([]);
  // Folder-grid selection (whole folders, by dsId) — separate from the
  // inside-folder per-image selection above.
  const [selectedFolderIds, setSelectedFolderIds] = useState([]);
  const [deleting, setDeleting] = useState(false);
  // Controls the "delete selected folders" confirmation modal.
  const [confirmDeleteFolders, setConfirmDeleteFolders] = useState(false);
  // Controls the inside-folder "delete selected images" confirmation modal.
  const [confirmDeleteImages, setConfirmDeleteImages] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(35);
  const [totalCount, setTotalCount] = useState(0);
  const [pageInput, setPageInput] = useState('');
  // Folder-grid search (by dsId or tagged user name); debounced before fetching.
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  // Date-range filter (by group latestCreatedAt). Defaults to the current date.
  const [dateRange, setDateRange] = useState(() => {
    const today = new Date();
    return { start: today, end: today };
  });
  const startDate = dateRange.start
    ? moment(dateRange.start).format('YYYY-MM-DD')
    : '';
  const endDate = dateRange.end
    ? moment(dateRange.end).format('YYYY-MM-DD')
    : '';
  // Inside-folder image pagination (client-side over the loaded images).
  const [folderPage, setFolderPage] = useState(1);
  const [folderLimit, setFolderLimit] = useState(35);
  const [folderPageInput, setFolderPageInput] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(() => {
    const saved = localStorage.getItem(REFRESH_KEY);
    return saved !== null ? saved === 'true' : true;
  });
  const [refreshInterval, setRefreshInterval] = useState(() => {
    const parsed = parseInt(localStorage.getItem(INTERVAL_KEY), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 30;
  });

  useEffect(() => {
    localStorage.setItem(REFRESH_KEY, autoRefresh);
  }, [autoRefresh]);
  useEffect(() => {
    localStorage.setItem(INTERVAL_KEY, refreshInterval);
  }, [refreshInterval]);

  const resolveLogPerm = (action) => {
    const logs = permissions?.logs;
    if (!logs) return false;
    if (typeof logs.accessLogs?.[action] === 'boolean') return logs.accessLogs[action];
    if (typeof logs.global?.[action] === 'boolean') return logs.global[action];
    if (typeof logs[action] === 'boolean') return logs[action];
    return false;
  };
  const canView = resolveLogPerm('view');

  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  const goToPage = (p) => {
    const clamped = Math.min(Math.max(p, 1), totalPages);
    setPage(clamped);
  };

  const handleGoToPage = () => {
    const p = parseInt(pageInput, 10);
    if (Number.isFinite(p)) goToPage(p);
    setPageInput('');
  };

  const handleLimitChange = (newLimit) => {
    setLimit(newLimit);
    setPage(1);
  };

  const fetchFolders = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const skip = (page - 1) * limit;
      const res = await getGroupedFaceImages(skip, limit, debouncedSearch, startDate, endDate);
      const data = res?.data?.body?.data || {};
      const groups = Array.isArray(data.groups) ? data.groups : [];
      setFolders(groups.map(mapGroup));
      setTotalCount(data.totalCount || 0);
    } catch (err) {
      console.error('Failed to load flagged users', err);
      if (!silent) setError(err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, limit, debouncedSearch, startDate, endDate]);

  // Reset to the first page whenever the search term or date range changes so
  // results start from the top of the filtered set.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, startDate, endDate]);

  useEffect(() => {
    if (canView) fetchFolders();
  }, [canView, fetchFolders]);

  // Auto-refresh on the configured interval. Runs both on the folder grid and
  // inside an open folder (a silent /grouped re-pull refreshes the open folder's
  // images too, since activeFolder is derived from folders). Skips the full-page
  // spinner so it doesn't flash, and pauses while images are selected so it
  // can't disrupt an in-progress delete.
  useEffect(() => {
    if (!canView || !autoRefresh || refreshInterval <= 0) return;
    if (selectedImageIds.length > 0 || selectedFolderIds.length > 0) return;
    const id = setInterval(() => {
      fetchFolders({ silent: true });
    }, refreshInterval * 1000);
    return () => clearInterval(id);
  }, [canView, autoRefresh, refreshInterval, selectedImageIds.length, selectedFolderIds.length, fetchFolders]);

  const activeFolder = folders.find((f) => f.dsId === activeDsId) || null;

  const openFolder = (folder) => {
    setActiveDsId(folder.dsId);
    setFullscreenIndex(null);
    setSelectedImageIds([]);
    setSelectedFolderIds([]);
    setFolderPage(1);
    setFolderPageInput('');
  };
  const closeFolder = () => {
    setActiveDsId(null);
    setFullscreenIndex(null);
    setSelectedImageIds([]);
    setFolderPage(1);
  };

  // Client-side pagination over the open folder's images.
  const folderImageCount = activeFolder?.images.length || 0;
  const folderTotalPages = Math.max(1, Math.ceil(folderImageCount / folderLimit));
  // Clamp in case a silent refresh shrank the image list below the current page.
  const safeFolderPage = Math.min(folderPage, folderTotalPages);
  const folderStart = (safeFolderPage - 1) * folderLimit;

  const goToFolderPage = (p) => {
    setFolderPage(Math.min(Math.max(p, 1), folderTotalPages));
  };
  const handleFolderGoToPage = () => {
    const p = parseInt(folderPageInput, 10);
    if (Number.isFinite(p)) goToFolderPage(p);
    setFolderPageInput('');
  };
  const handleFolderLimitChange = (newLimit) => {
    setFolderLimit(newLimit);
    setFolderPage(1);
  };

  const toggleImageSelected = (imageId) => {
    setSelectedImageIds((prev) =>
      prev.includes(imageId)
        ? prev.filter((id) => id !== imageId)
        : [...prev, imageId]
    );
  };

  // Inside-folder select-all: every image in the open folder is selected/cleared.
  const allImagesSelected =
    !!activeFolder &&
    activeFolder.imageIds.length > 0 &&
    selectedImageIds.length === activeFolder.imageIds.length;

  const toggleSelectAllImages = () => {
    if (!activeFolder) return;
    setSelectedImageIds(allImagesSelected ? [] : [...activeFolder.imageIds]);
  };

  // Delete the selected images. Called from the confirmation modal's Confirm.
  const handleDeleteSelected = async () => {
    if (deleting || selectedImageIds.length === 0) return;
    setDeleting(true);
    try {
      await deleteFaceImages(selectedImageIds);
      toast.success(
        `${selectedImageIds.length} image${selectedImageIds.length > 1 ? 's' : ''} deleted`
      );
      setSelectedImageIds([]);
      setConfirmDeleteImages(false);
      await fetchFolders();
    } catch (err) {
      console.error('Failed to delete images', err);
      toast.error(
        err?.response?.data?.body?.message ||
          err?.response?.data?.message ||
          'Failed to delete images'
      );
    } finally {
      setDeleting(false);
    }
  };

  // ---- Folder-grid selection (whole folders) ----
  const toggleFolderSelected = (dsId) => {
    setSelectedFolderIds((prev) =>
      prev.includes(dsId) ? prev.filter((id) => id !== dsId) : [...prev, dsId]
    );
  };

  const allFoldersSelected =
    folders.length > 0 && selectedFolderIds.length === folders.length;

  const toggleSelectAllFolders = () => {
    setSelectedFolderIds(allFoldersSelected ? [] : folders.map((f) => f.dsId));
  };

  // Image count across the currently selected folders (for the confirm message).
  const selectedFoldersImageCount = folders
    .filter((f) => selectedFolderIds.includes(f.dsId))
    .reduce((sum, f) => sum + f.imageIds.length, 0);

  // Delete every image across the selected folders. Once a folder has no images
  // left it drops out of /grouped, so the folders themselves disappear.
  // Called from the confirmation modal's Confirm action.
  const confirmDeleteSelectedFolders = async () => {
    if (deleting || selectedFolderIds.length === 0) return;
    const imageIds = folders
      .filter((f) => selectedFolderIds.includes(f.dsId))
      .flatMap((f) => f.imageIds);
    if (imageIds.length === 0) {
      setConfirmDeleteFolders(false);
      return;
    }
    const folderCount = selectedFolderIds.length;
    setDeleting(true);
    try {
      await deleteFaceImages(imageIds);
      toast.success(
        `${folderCount} folder${folderCount > 1 ? 's' : ''} deleted`
      );
      setSelectedFolderIds([]);
      setConfirmDeleteFolders(false);
      await fetchFolders();
    } catch (err) {
      console.error('Failed to delete folders', err);
      toast.error(
        err?.response?.data?.body?.message ||
          err?.response?.data?.message ||
          'Failed to delete folders'
      );
    } finally {
      setDeleting(false);
    }
  };

  const openFullscreen = (index) => setFullscreenIndex(index);
  const closeFullscreen = () => setFullscreenIndex(null);
  const goFullscreenImage = (delta) => {
    if (!activeFolder || fullscreenIndex === null) return;
    const len = activeFolder.images.length;
    setFullscreenIndex((prev) => (prev + delta + len) % len);
  };

  // Both tag paths refetch so the folder reflects its newly-linked user.
  const handleTagged = () => {
    setTagModalFolder(null);
    fetchFolders();
  };

  // Save Folder guard: a folder that already carries an authorizedUser has
  // been tagged/registered — re-tagging it would just fail or duplicate, so
  // surface a clear message instead of opening the tag modal.
  const handleSaveFolder = (folder) => {
    if (folder?.authorizedUser) {
      toast.info(
        `This detected user is already ${folder.authorizedUser.name ? `tagged to "${folder.authorizedUser.name}"` : 'tagged'}.`
      );
      return;
    }
    setTagModalFolder(folder);
  };

  if (permissionsLoading) return null;
  if (!canView) {
    return <AccessDenied message="You don't have permission to view Logs." />;
  }

  // Inside a folder: plain grid of the current page's images, no carousel.
  if (activeFolder) {
    const pagedImages = activeFolder.images.slice(folderStart, folderStart + folderLimit);
    return (
      <div className="py-4 sm:py-6 px-6 sm:px-10 lg:px-14 min-h-[calc(100vh-140px)] flex flex-col">
        <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={closeFolder}
              className="p-2 bg-white cursor-pointer rounded-[7px] border border-gray-200 hover:bg-gray-50 transition-colors"
              title="Back to Detected Users"
            >
              <ChevronLeft className="w-6 h-6 text-[#333333]" strokeWidth={1.2} />
            </button>
            <Users className="w-6 h-6 text-[#333333] shrink-0" strokeWidth={1.2} />
            {/* Heading = tagged/registered user's name, else the dsId. */}
            <span
              className="text-base sm:text-lg font-semibold text-[#333333] truncate max-w-[50vw]"
              title={activeFolder.authorizedUser?.name || activeFolder.dsId}
            >
              {activeFolder.authorizedUser?.name || activeFolder.dsId}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {folderImageCount > 0 && (
              <button
                type="button"
                onClick={toggleSelectAllImages}
                className="flex items-center gap-1.5 bg-white text-[#07486A] border border-[#07486A] rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-[#07486A]/5"
              >
                {allImagesSelected ? (
                  <X className="w-4 h-4" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {allImagesSelected ? 'Unselect All' : 'Select All'}
              </button>
            )}
            {selectedImageIds.length > 0 && (
              <button
                type="button"
                onClick={() => setConfirmDeleteImages(true)}
                disabled={deleting}
                className="flex items-center gap-1.5 bg-red-600 text-white rounded-lg px-3 py-2 text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Delete ({selectedImageIds.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => handleSaveFolder(activeFolder)}
              className="flex items-center gap-1.5 bg-[#07486A] text-white rounded-lg px-3 py-2 text-sm cursor-pointer"
            >
              <Save className="w-4 h-4" />
              Save Folder
            </button>
            <AutoRefreshComponent
              isActive={autoRefresh}
              onActiveChange={setAutoRefresh}
              refreshInterval={refreshInterval}
              onIntervalChange={setRefreshInterval}
              onManualRefresh={() => fetchFolders()}
            />
          </div>
        </div>

        <div className="flex-1">
          <div className="flex flex-wrap gap-4 sm:gap-5">
            {pagedImages.map((img, idx) => {
              const i = folderStart + idx; // absolute index within the folder
              const imageId = activeFolder.imageIds[i];
              const isSelected = selectedImageIds.includes(imageId);
              return (
                <div
                  key={imageId || i}
                  className={`group relative w-48 sm:w-52 aspect-square rounded-2xl overflow-hidden bg-[#F3F3F3] border shadow-sm ${
                    isSelected ? 'border-red-500 ring-2 ring-red-400' : 'border-gray-100'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => openFullscreen(i)}
                    className="absolute inset-0 w-full h-full cursor-pointer"
                  >
                    <img
                      src={img}
                      alt={`Detected user face ${i + 1}`}
                      className="w-full h-full object-cover object-top"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <Maximize2 className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>

                  {/* Image icon (top-left) by default; hidden once the card is
                      hovered or the image is selected so the checkbox can show. */}
                  <div
                    className={`absolute top-2 left-2 z-10 bg-black/45 text-white rounded-full p-1 transition-opacity ${
                      isSelected ? 'opacity-0' : 'opacity-100 group-hover:opacity-0'
                    }`}
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                  </div>

                  {/* Selection checkbox (top-left), shown on hover or when selected. */}
                  <label
                    className={`absolute top-2 left-2 z-20 flex items-center justify-center cursor-pointer transition-opacity ${
                      isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleImageSelected(imageId)}
                      className="w-5 h-5 rounded accent-red-600 cursor-pointer"
                    />
                  </label>
                </div>
              );
            })}
          </div>
        </div>

        {/* Inside-folder image pagination, pinned to the bottom */}
        {folderImageCount > 0 && (
          <div className="mt-8 pt-4 border-t border-gray-100">
            <PaginationBar
              page={safeFolderPage}
              totalPages={folderTotalPages}
              onPageChange={goToFolderPage}
              pageInput={folderPageInput}
              onPageInputChange={setFolderPageInput}
              onGoToPage={handleFolderGoToPage}
              limit={folderLimit}
              onLimitChange={handleFolderLimitChange}
            />
          </div>
        )}

        {/* Fullscreen image viewer — same pattern as ANPR Logs' image-column preview */}
        {fullscreenIndex !== null && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={closeFullscreen}
          >
            <div
              className="relative inline-block"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={activeFolder.images[fullscreenIndex]}
                alt="Detected user face"
                className="block h-[85vh] w-auto max-w-[90vw] object-contain rounded-lg"
              />

              <button
                onClick={closeFullscreen}
                className="absolute top-3 right-3 z-10 bg-white rounded-full p-1.5 cursor-pointer shadow-lg hover:bg-gray-100"
                title="Close"
              >
                <X className="w-5 h-5 text-[#333333]" />
              </button>

              {activeFolder.images.length > 1 && (
                <>
                  <button
                    onClick={() => goFullscreenImage(-1)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 z-10 bg-white rounded-full p-2 cursor-pointer shadow-lg hover:bg-gray-100"
                    title="Previous"
                  >
                    <ChevronLeft className="w-6 h-6 text-[#333333]" />
                  </button>
                  <button
                    onClick={() => goFullscreenImage(1)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-10 bg-white rounded-full p-2 cursor-pointer shadow-lg hover:bg-gray-100"
                    title="Next"
                  >
                    <ChevronRight className="w-6 h-6 text-[#333333]" />
                  </button>
                  <span className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs font-medium px-2.5 py-1 rounded-full">
                    {fullscreenIndex + 1}/{activeFolder.images.length}
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        <TagFlaggedUserModal
          open={!!tagModalFolder}
          folder={tagModalFolder}
          onClose={() => setTagModalFolder(null)}
          onTagged={handleTagged}
        />

        {/* Confirm deleting the selected images inside this folder. */}
        <ConfirmationModal
          open={confirmDeleteImages}
          title="Delete Images"
          icon={<Trash2 className="w-6 h-6 text-red-600" />}
          message={
            <>
              Delete{' '}
              <span className="font-semibold text-gray-800">
                {selectedImageIds.length} image
                {selectedImageIds.length > 1 ? 's' : ''}
              </span>{' '}
              from this folder?
            </>
          }
          confirmLabel="Delete"
          confirmClass="bg-red-600 text-white hover:bg-red-700"
          loading={deleting}
          onClose={() => !deleting && setConfirmDeleteImages(false)}
          onConfirm={handleDeleteSelected}
        />
      </div>
    );
  }

  return (
    <div className="py-4 sm:py-6 px-4 sm:px-6 lg:px-8 min-h-[calc(100vh-140px)] flex flex-col">
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <h1 className="text-lg sm:text-xl font-semibold text-[#07486A]">Detected Users</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ID or name"
              className="w-56 sm:w-64 pl-3 pr-9 h-9 text-sm border border-[#C7C7C7] rounded-lg text-[#595959] focus:outline-none focus:ring-1 focus:ring-[#07486A]"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#595959] hover:text-[#333] cursor-pointer"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#595959] pointer-events-none" />
            )}
          </div>

          {/* Date-range filter (by group latestCreatedAt), defaults to today */}
          <DateRangePickerComponent
            startDate={dateRange.start}
            endDate={dateRange.end}
            maxDate={new Date()}
            onRangeChange={(range) => setDateRange(range)}
            buttonClassName="h-9 text-[#5D5D5D] font-medium cursor-pointer py-1.5 px-2 bg-white rounded-lg text-xs border border-[#C7C7C7] flex items-center justify-between min-w-[160px] hover:shadow-sm transition-shadow"
            buttonContent={
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center overflow-hidden whitespace-nowrap">
                  <img src={Month} className="w-3.5 h-3.5 mr-1.5 shrink-0" alt="Calendar" />
                  <span className="truncate text-left">
                    {dateRange.start && dateRange.end
                      ? formatDateRange(dateRange.start, dateRange.end)
                      : 'Select Date'}
                  </span>
                </div>
                <ChevronRight className="w-3 h-3 rotate-90 text-[#5D5D5D] ml-1.5 shrink-0" />
              </div>
            }
            popoverClassName="mt-1 z-50"
            calendarClassName="p-3 bg-white shadow-lg border border-[#D8D8D8]"
          />

          {!loading && !error && folders.length > 0 && (
            <button
              type="button"
              onClick={toggleSelectAllFolders}
              className="flex items-center gap-1.5 bg-white text-[#07486A] border border-[#07486A] rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-[#07486A]/5"
            >
              {allFoldersSelected ? (
                <X className="w-4 h-4" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {allFoldersSelected ? 'Unselect All' : 'Select All'}
            </button>
          )}
          {selectedFolderIds.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmDeleteFolders(true)}
              disabled={deleting}
              className="flex items-center gap-1.5 bg-red-600 text-white rounded-lg px-3 py-2 text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Delete ({selectedFolderIds.length})
            </button>
          )}
          <AutoRefreshComponent
            isActive={autoRefresh}
            onActiveChange={setAutoRefresh}
            refreshInterval={refreshInterval}
            onIntervalChange={setRefreshInterval}
            onManualRefresh={() => fetchFolders()}
          />
        </div>
      </div>

      <div className="flex-1">
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-20 text-gray-400 text-sm">
          Failed to load flagged users.
        </div>
      ) : folders.length === 0 ? (
        <div className="text-center py-20 text-gray-400 text-sm">
          {debouncedSearch
            ? `No Detected users found for "${debouncedSearch}".`
            : 'No Detected users found.'}
        </div>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-7 gap-4 sm:gap-5">
          {folders.map((folder) => {
            const isFolderSelected = selectedFolderIds.includes(folder.dsId);
            return (
            <div key={folder.dsId} className="group flex flex-col items-center">
              <div
                className={`relative w-full aspect-square rounded-2xl overflow-hidden bg-[#F3F3F3] border shadow-sm group-hover:shadow-md transition-shadow ${
                  isFolderSelected ? 'border-red-500 ring-2 ring-red-400' : 'border-gray-100'
                }`}
              >
                <button
                  type="button"
                  onClick={() => openFolder(folder)}
                  className="absolute inset-0 w-full h-full cursor-pointer"
                >
                  <img
                    src={folder.images[0]}
                    alt="Folders"
                    className="w-full h-full object-cover object-top"
                  />
                </button>

                {/* Folder icon (top-left) by default; hidden once the card is
                    hovered or the folder is selected so the checkbox can show. */}
                <div
                  className={`absolute top-2 left-2 z-10 bg-black/45 text-white rounded-full p-1 transition-opacity ${
                    isFolderSelected ? 'opacity-0' : 'opacity-100 group-hover:opacity-0'
                  }`}
                >
                  <Folder className="w-3.5 h-3.5" />
                </div>

                {/* Selection checkbox (top-left), shown on hover or when selected. */}
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
                    className="w-5 h-5 rounded accent-red-600 cursor-pointer"
                  />
                </label>

                {folder.authorizedUser && (
                  <div className="absolute top-2 right-2 z-10 bg-[#1F6B3A] text-white rounded-full p-1">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                )}
                {/* Image count, bottom-right */}
                <span className="absolute bottom-1.5 right-1.5 z-10 bg-black/60 text-white text-[10px] font-medium leading-none px-1.5 py-1 rounded-full">
                  {folder.images.length}
                </span>
              </div>
              {/* Show the tagged/registered user's name; fall back to the dsId.
                  Small font + break-all so the full UUID dsId fits without
                  truncating. */}
              <p
                className="mt-1.5 w-full text-center text-[10px] leading-tight font-medium text-gray-700 break-all"
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

      {/* Pagination pinned to the bottom of the page */}
      {!loading && !error && folders.length > 0 && (
        <div className="mt-8 pt-4 border-t border-gray-100">
          <PaginationBar
            page={page}
            totalPages={totalPages}
            onPageChange={goToPage}
            pageInput={pageInput}
            onPageInputChange={setPageInput}
            onGoToPage={handleGoToPage}
            limit={limit}
            onLimitChange={handleLimitChange}
          />
        </div>
      )}

      {/* Confirm deleting the selected folders (all their images). */}
      <ConfirmationModal
        open={confirmDeleteFolders}
        title="Delete Folders"
        icon={<Trash2 className="w-6 h-6 text-red-600" />}
        message={
          <>
            Delete{' '}
            <span className="font-semibold text-gray-800">
              {selectedFolderIds.length} folder
              {selectedFolderIds.length > 1 ? 's' : ''}
            </span>{' '}
            ({selectedFoldersImageCount} image
            {selectedFoldersImageCount > 1 ? 's' : ''})?
          </>
        }
        confirmLabel="Delete"
        confirmClass="bg-red-600 text-white hover:bg-red-700"
        loading={deleting}
        onClose={() => !deleting && setConfirmDeleteFolders(false)}
        onConfirm={confirmDeleteSelectedFolders}
      />
    </div>
  );
};

export default FlaggedUsers;
