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
} from 'lucide-react';
import { toast } from 'sonner';
import { getGroupedFaceImages, deleteFaceImages } from './Api/faceImages';
import TagFlaggedUserModal from './components/TagFlaggedUserModal';
import AutoRefreshComponent from './components/AutoRefreshComponent';
import Pagination from '@/components/Pagination';
import { usePermissions } from '@/context/Permission/PermissionContext';
import AccessDenied from '@/components/AccessDenied';

const ROWS_OPTIONS = [30, 60, 100];

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

// Map a raw /grouped API group into the folder shape the UI renders.
// Keep `images` (full URLs, already absolute) and `imageIds` index-aligned so a
// selected image's id is available for the delete endpoint.
const mapGroup = (group) => {
  const valid = (group.images || []).filter((i) => i && i.image);
  return {
    dsId: group.dsId,
    authorizedUser: group.authorizedUser || null,
    images: valid.map((i) => i.image),
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
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(30);
  const [totalCount, setTotalCount] = useState(0);
  const [pageInput, setPageInput] = useState('');
  // Inside-folder image pagination (client-side over the loaded images).
  const [folderPage, setFolderPage] = useState(1);
  const [folderLimit, setFolderLimit] = useState(30);
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
      const res = await getGroupedFaceImages(skip, limit);
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
  }, [page, limit]);

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
    if (selectedImageIds.length > 0) return;
    const id = setInterval(() => {
      fetchFolders({ silent: true });
    }, refreshInterval * 1000);
    return () => clearInterval(id);
  }, [canView, autoRefresh, refreshInterval, selectedImageIds.length, fetchFolders]);

  const activeFolder = folders.find((f) => f.dsId === activeDsId) || null;

  const openFolder = (folder) => {
    setActiveDsId(folder.dsId);
    setFullscreenIndex(null);
    setSelectedImageIds([]);
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

  const handleDeleteSelected = async () => {
    if (deleting || selectedImageIds.length === 0) return;
    setDeleting(true);
    try {
      await deleteFaceImages(selectedImageIds);
      toast.success(
        `${selectedImageIds.length} image${selectedImageIds.length > 1 ? 's' : ''} deleted`
      );
      setSelectedImageIds([]);
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
            <Users className="w-6 h-6 text-[#333333]" strokeWidth={1.2} />Detected Users
          </div>

          <div className="flex items-center gap-3">
            {selectedImageIds.length > 0 && (
              <button
                type="button"
                onClick={handleDeleteSelected}
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
              onClick={() => setTagModalFolder(activeFolder)}
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
                  className={`group relative w-32 sm:w-36 aspect-square rounded-2xl overflow-hidden bg-[#F3F3F3] border shadow-sm ${
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
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <Maximize2 className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>

                  {/* Selection checkbox (top-left), above the fullscreen trigger */}
                  <label
                    className="absolute top-2 left-2 z-10 flex items-center justify-center cursor-pointer"
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
      </div>
    );
  }

  return (
    <div className="py-4 sm:py-6 px-6 sm:px-10 lg:px-14 min-h-[calc(100vh-140px)] flex flex-col">
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <h1 className="text-lg sm:text-xl font-semibold text-[#07486A]">Detected Users</h1>
        <AutoRefreshComponent
          isActive={autoRefresh}
          onActiveChange={setAutoRefresh}
          refreshInterval={refreshInterval}
          onIntervalChange={setRefreshInterval}
          onManualRefresh={() => fetchFolders()}
        />
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
          No flagged users found.
        </div>
      ) : (
        <div className="flex flex-wrap gap-4 sm:gap-5">
          {folders.map((folder) => (
            <div key={folder.dsId} className="group flex flex-col items-center w-32 sm:w-36">
              <button
                type="button"
                onClick={() => openFolder(folder)}
                className="relative w-full aspect-square rounded-2xl overflow-hidden bg-[#F3F3F3] border border-gray-100 shadow-sm group-hover:shadow-md transition-shadow cursor-pointer"
              >
                <img
                  src={folder.images[0]}
                  alt="Folders"
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 left-2 bg-black/45 text-white rounded-full p-1">
                  <Folder className="w-3.5 h-3.5" />
                </div>
                {folder.authorizedUser && (
                  <div className="absolute top-2 right-2 bg-[#1F6B3A] text-white rounded-full p-1">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                )}
                {/* Image count, bottom-right */}
                <span className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[10px] font-medium leading-none px-1.5 py-1 rounded-full">
                  {folder.images.length}
                </span>
              </button>
              {folder.authorizedUser?.name && (
                <p
                  className="mt-1.5 w-full text-center text-xs font-medium text-gray-700 truncate"
                  title={folder.authorizedUser.name}
                >
                  {folder.authorizedUser.name}
                </p>
              )}
            </div>
          ))}
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
    </div>
  );
};

export default FlaggedUsers;
