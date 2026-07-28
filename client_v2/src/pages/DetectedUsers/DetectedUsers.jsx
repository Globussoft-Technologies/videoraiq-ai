import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import moment from 'moment-timezone';
import { usePermissions } from '@/context/PermissionContext';
import AccessDenied from '@/components/AccessDenied';
import { getGroupedFaceImages, deleteFaceImages } from './Api';
import { mapGroup, useDebounce, REFRESH_KEY, INTERVAL_KEY } from './detectedUtils';
import FolderGridView from './components/FolderGridView';
import FolderDetailView from './components/FolderDetailView';
import TagFolderModal from './components/TagFolderModal';

// "Detected Users" logs page. Landing view is a folder grid (one folder per dsId
// group of face images); opening a folder shows its images. Folders and images
// can be selected + deleted, and a folder can be tagged to an authorized user
// via "Save Folder". Ported from the V1 Flagged Users page and themed for V2
// (dark/light) with responsive layout.
const DetectedUsers = () => {
  const { permissions, loading: permissionsLoading } = usePermissions();

  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeDsId, setActiveDsId] = useState(null);
  const [tagModalFolder, setTagModalFolder] = useState(null);
  const [fullscreenIndex, setFullscreenIndex] = useState(null);
  const [selectedImageIds, setSelectedImageIds] = useState([]);
  const [selectedFolderIds, setSelectedFolderIds] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteFolders, setConfirmDeleteFolders] = useState(false);
  const [confirmDeleteImages, setConfirmDeleteImages] = useState(false);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(35);
  const [totalCount, setTotalCount] = useState(0);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);

  // Date-range filter (by group latestCreatedAt). Defaults to today.
  const [dateRange, setDateRange] = useState(() => {
    const today = new Date();
    return { start: today, end: today };
  });
  const startDate = dateRange.start ? moment(dateRange.start).format('YYYY-MM-DD') : '';
  const endDate = dateRange.end ? moment(dateRange.end).format('YYYY-MM-DD') : '';

  // Inside-folder image pagination (client-side over loaded images).
  const [folderPage, setFolderPage] = useState(1);
  const [folderLimit, setFolderLimit] = useState(35);

  const [autoRefresh, setAutoRefresh] = useState(() => {
    const saved = localStorage.getItem(REFRESH_KEY);
    return saved !== null ? saved === 'true' : true;
  });
  const [refreshInterval, setRefreshInterval] = useState(() => {
    const parsed = parseInt(localStorage.getItem(INTERVAL_KEY), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 30;
  });

  useEffect(() => localStorage.setItem(REFRESH_KEY, autoRefresh), [autoRefresh]);
  useEffect(() => localStorage.setItem(INTERVAL_KEY, refreshInterval), [refreshInterval]);

  /* ─────────────── Permissions ─────────────── */
  // Logs permissions may be flat, nested per sub-section, or global.
  const resolveLogPerm = (action) => {
    const logs = permissions?.logs;
    if (!logs) return false;
    if (typeof logs.detectedUsersLogs?.[action] === 'boolean') return logs.detectedUsersLogs[action];
    if (typeof logs.accessLogs?.[action] === 'boolean') return logs.accessLogs[action];
    if (typeof logs.global?.[action] === 'boolean') return logs.global[action];
    if (typeof logs[action] === 'boolean') return logs[action];
    return false;
  };
  const canView = resolveLogPerm('view');
  // "Save Folder" tags/registers a new authorized user — a create action —
  // and the delete-selected actions need the delete grant, same as any other
  // module's action buttons.
  const canCreate = resolveLogPerm('create');
  const canDelete = resolveLogPerm('delete');

  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  const goToPage = (p) => setPage(Math.min(Math.max(p, 1), totalPages));
  const handleLimitChange = (newLimit) => {
    setLimit(newLimit);
    setPage(1);
  };

  /* ─────────────── Data fetch ─────────────── */
  const fetchFolders = useCallback(
    async ({ silent = false } = {}) => {
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
        console.error('Failed to load detected users', err);
        if (!silent) setError(err);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [page, limit, debouncedSearch, startDate, endDate]
  );

  // Reset to the first page whenever the search term or date range changes.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, startDate, endDate]);

  useEffect(() => {
    if (canView) fetchFolders();
  }, [canView, fetchFolders]);

  // Auto-refresh on the configured interval. Skips the full-page spinner and
  // pauses while any selection is active so it can't disrupt an in-progress
  // delete. A silent /grouped re-pull refreshes an open folder too.
  useEffect(() => {
    if (!canView || !autoRefresh || refreshInterval <= 0) return undefined;
    if (selectedImageIds.length > 0 || selectedFolderIds.length > 0) return undefined;
    const id = setInterval(() => fetchFolders({ silent: true }), refreshInterval * 1000);
    return () => clearInterval(id);
  }, [
    canView,
    autoRefresh,
    refreshInterval,
    selectedImageIds.length,
    selectedFolderIds.length,
    fetchFolders,
  ]);

  const activeFolder = folders.find((f) => f.dsId === activeDsId) || null;

  const openFolder = (folder) => {
    setActiveDsId(folder.dsId);
    setFullscreenIndex(null);
    setSelectedImageIds([]);
    setSelectedFolderIds([]);
    setFolderPage(1);
  };
  const closeFolder = () => {
    setActiveDsId(null);
    setFullscreenIndex(null);
    setSelectedImageIds([]);
    setFolderPage(1);
  };

  /* ─────────────── Inside-folder image pagination ─────────────── */
  const folderImageCount = activeFolder?.images.length || 0;
  const folderTotalPages = Math.max(1, Math.ceil(folderImageCount / folderLimit));
  const safeFolderPage = Math.min(folderPage, folderTotalPages);
  const folderStart = (safeFolderPage - 1) * folderLimit;

  const goToFolderPage = (p) => setFolderPage(Math.min(Math.max(p, 1), folderTotalPages));
  const handleFolderLimitChange = (newLimit) => {
    setFolderLimit(newLimit);
    setFolderPage(1);
  };

  /* ─────────────── Image selection + delete ─────────────── */
  const toggleImageSelected = (imageId) =>
    setSelectedImageIds((prev) =>
      prev.includes(imageId) ? prev.filter((id) => id !== imageId) : [...prev, imageId]
    );

  const allImagesSelected =
    !!activeFolder &&
    activeFolder.imageIds.length > 0 &&
    selectedImageIds.length === activeFolder.imageIds.length;

  const toggleSelectAllImages = () => {
    if (!activeFolder) return;
    setSelectedImageIds(allImagesSelected ? [] : [...activeFolder.imageIds]);
  };

  const handleDeleteSelectedImages = async () => {
    if (!canDelete) return;
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

  /* ─────────────── Folder selection + delete ─────────────── */
  const toggleFolderSelected = (dsId) =>
    setSelectedFolderIds((prev) =>
      prev.includes(dsId) ? prev.filter((id) => id !== dsId) : [...prev, dsId]
    );

  const allFoldersSelected =
    folders.length > 0 && selectedFolderIds.length === folders.length;

  const toggleSelectAllFolders = () =>
    setSelectedFolderIds(allFoldersSelected ? [] : folders.map((f) => f.dsId));

  const selectedFoldersImageCount = folders
    .filter((f) => selectedFolderIds.includes(f.dsId))
    .reduce((sum, f) => sum + f.imageIds.length, 0);

  // Delete every image across the selected folders; empty folders drop out of
  // /grouped, so the folders themselves disappear.
  const handleDeleteSelectedFolders = async () => {
    if (!canDelete) return;
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
      toast.success(`${folderCount} folder${folderCount > 1 ? 's' : ''} deleted`);
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

  /* ─────────────── Fullscreen viewer ─────────────── */
  const openFullscreen = (index) => setFullscreenIndex(index);
  const closeFullscreen = () => setFullscreenIndex(null);
  const goFullscreenImage = (delta) => {
    if (!activeFolder || fullscreenIndex === null) return;
    const len = activeFolder.images.length;
    setFullscreenIndex((prev) => (prev + delta + len) % len);
  };

  const handleTagged = () => {
    setTagModalFolder(null);
    fetchFolders();
  };

  // Save Folder guard: a folder that already carries an authorizedUser has
  // been tagged/registered — re-tagging it would just fail or duplicate, so
  // surface a clear message instead of opening the tag modal.
  const handleSaveFolder = (folder) => {
    if (!canCreate) return;
    if (folder?.authorizedUser) {
      toast.info(
        `This detected user is already ${folder.authorizedUser.name ? `tagged to "${folder.authorizedUser.name}"` : 'tagged'}.`
      );
      return;
    }
    setTagModalFolder(folder);
  };

  /* ─────────────── Guards ─────────────── */
  if (permissionsLoading) return null;
  if (!canView) {
    return <AccessDenied message="You don't have permission to view Logs." />;
  }

  return (
    <div className="p-3 sm:p-4 lg:p-[22px] flex flex-col min-h-full">
      {activeFolder ? (
        <FolderDetailView
          folder={activeFolder}
          onBack={closeFolder}
          selectedImageIds={selectedImageIds}
          toggleImageSelected={toggleImageSelected}
          allImagesSelected={allImagesSelected}
          toggleSelectAllImages={toggleSelectAllImages}
          onDeleteImagesClick={() => setConfirmDeleteImages(true)}
          deleting={deleting}
          onSaveFolder={() => handleSaveFolder(activeFolder)}
          canCreate={canCreate}
          canDelete={canDelete}
          autoRefresh={autoRefresh}
          setAutoRefresh={setAutoRefresh}
          refreshInterval={refreshInterval}
          setRefreshInterval={setRefreshInterval}
          onManualRefresh={() => fetchFolders()}
          folderStart={folderStart}
          folderLimit={folderLimit}
          safeFolderPage={safeFolderPage}
          folderTotalPages={folderTotalPages}
          goToFolderPage={goToFolderPage}
          onFolderLimitChange={handleFolderLimitChange}
          fullscreenIndex={fullscreenIndex}
          openFullscreen={openFullscreen}
          closeFullscreen={closeFullscreen}
          goFullscreenImage={goFullscreenImage}
          confirmDeleteImages={confirmDeleteImages}
          setConfirmDeleteImages={setConfirmDeleteImages}
          onConfirmDeleteImages={handleDeleteSelectedImages}
        />
      ) : (
        <FolderGridView
          folders={folders}
          loading={loading}
          error={error}
          debouncedSearch={debouncedSearch}
          onOpenFolder={openFolder}
          search={search}
          setSearch={setSearch}
          dateRange={dateRange}
          onDateRangeChange={(range) => setDateRange(range)}
          selectedFolderIds={selectedFolderIds}
          toggleFolderSelected={toggleFolderSelected}
          allFoldersSelected={allFoldersSelected}
          toggleSelectAllFolders={toggleSelectAllFolders}
          onDeleteFoldersClick={() => setConfirmDeleteFolders(true)}
          deleting={deleting}
          canDelete={canDelete}
          autoRefresh={autoRefresh}
          setAutoRefresh={setAutoRefresh}
          refreshInterval={refreshInterval}
          setRefreshInterval={setRefreshInterval}
          onManualRefresh={() => fetchFolders()}
          page={page}
          totalPages={totalPages}
          goToPage={goToPage}
          limit={limit}
          onLimitChange={handleLimitChange}
          totalCount={totalCount}
          confirmDeleteFolders={confirmDeleteFolders}
          setConfirmDeleteFolders={setConfirmDeleteFolders}
          selectedFoldersImageCount={selectedFoldersImageCount}
          onConfirmDeleteFolders={handleDeleteSelectedFolders}
        />
      )}

      <TagFolderModal
        open={!!tagModalFolder}
        folder={tagModalFolder}
        onClose={() => setTagModalFolder(null)}
        onTagged={handleTagged}
      />
    </div>
  );
};

export default DetectedUsers;
