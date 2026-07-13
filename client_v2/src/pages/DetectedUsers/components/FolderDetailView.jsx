import React from 'react';
import {
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
} from 'lucide-react';
import AutoRefreshComponent from '@/pages/AttendanceLogs/components/AutoRefreshComponent';
import ConfirmationModal from '@/components/DeleteConfirmation';
import PaginationBar from './PaginationBar';

// Inside a folder: a responsive grid of the current page's images, per-image
// selection + delete, a "Save Folder" action, and a fullscreen viewer.
const FolderDetailView = ({
  folder,
  onBack,
  // selection
  selectedImageIds,
  toggleImageSelected,
  allImagesSelected,
  toggleSelectAllImages,
  onDeleteImagesClick,
  deleting,
  onSaveFolder,
  // auto refresh
  autoRefresh,
  setAutoRefresh,
  refreshInterval,
  setRefreshInterval,
  onManualRefresh,
  // pagination (client-side over loaded images)
  folderStart,
  folderLimit,
  safeFolderPage,
  folderTotalPages,
  goToFolderPage,
  onFolderLimitChange,
  // fullscreen
  fullscreenIndex,
  openFullscreen,
  closeFullscreen,
  goFullscreenImage,
  // delete-images confirm modal
  confirmDeleteImages,
  setConfirmDeleteImages,
  onConfirmDeleteImages,
}) => {
  const folderImageCount = folder?.images.length || 0;
  const pagedImages = folder.images.slice(folderStart, folderStart + folderLimit);

  return (
    <div className="flex flex-col">
      <div className="bg-[var(--bg1)] border border-[var(--bd)] rounded-[16px] p-4 sm:p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="p-2 bg-[var(--bg2)] cursor-pointer rounded-lg border border-[var(--bd)] hover:bg-[var(--bg3)] transition-colors"
            title="Back to Detected Users"
          >
            <ChevronLeft className="w-5 h-5 text-[var(--tx)]" strokeWidth={1.4} />
          </button>
          <Users className="w-6 h-6 text-[var(--tx)] shrink-0" strokeWidth={1.2} />
          <span
            className="text-base sm:text-lg font-semibold text-[var(--tx)] truncate max-w-[45vw]"
            title={folder.authorizedUser?.name || folder.dsId}
          >
            {folder.authorizedUser?.name || folder.dsId}
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {folderImageCount > 0 && (
            <button
              type="button"
              onClick={toggleSelectAllImages}
              className="flex items-center gap-1.5 h-10 bg-[var(--bg2)] text-[var(--tx2)] border border-[var(--bd)] rounded-lg px-3 text-sm font-medium cursor-pointer hover:text-[var(--tx)] hover:border-[var(--violet)] transition-colors"
            >
              {allImagesSelected ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
              {allImagesSelected ? 'Unselect All' : 'Select All'}
            </button>
          )}
          {selectedImageIds.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmDeleteImages(true)}
              disabled={deleting}
              className="flex items-center gap-1.5 h-10 bg-[var(--crit)] text-white rounded-lg px-3 text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete ({selectedImageIds.length})
            </button>
          )}
          <button
            type="button"
            onClick={onSaveFolder}
            className="flex items-center gap-1.5 h-10 bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white rounded-lg px-3 text-sm font-semibold shadow-sm hover:opacity-95 cursor-pointer transition-opacity"
          >
            <Save className="w-4 h-4" />
            Save Folder
          </button>
          <AutoRefreshComponent
            isActive={autoRefresh}
            onActiveChange={setAutoRefresh}
            refreshInterval={refreshInterval}
            onIntervalChange={setRefreshInterval}
            onManualRefresh={onManualRefresh}
          />
        </div>
      </div>

      {/* Image grid */}
      <div className="min-h-[50vh]">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {pagedImages.map((img, idx) => {
            const i = folderStart + idx; // absolute index within the folder
            const imageId = folder.imageIds[i];
            const isSelected = selectedImageIds.includes(imageId);
            return (
              <div
                key={imageId || i}
                className={`group relative aspect-square rounded-2xl overflow-hidden bg-[var(--bg2)] border shadow-sm ${
                  isSelected ? 'border-[var(--crit)] ring-2 ring-[var(--crit)]/60' : 'border-[var(--bd)]'
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

                {/* Image icon by default; hidden on hover / when selected. */}
                <div
                  className={`absolute top-2 left-2 z-10 bg-black/45 text-white rounded-full p-1 transition-opacity ${
                    isSelected ? 'opacity-0' : 'opacity-100 group-hover:opacity-0'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                </div>

                {/* Selection checkbox, shown on hover or when selected. */}
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
                    className="w-5 h-5 rounded accent-[var(--crit)] cursor-pointer"
                  />
                </label>
              </div>
            );
          })}
        </div>
      </div>
      </div>

      {/* Pagination */}
      {folderImageCount > 0 && (
        <div className="mt-4">
          <PaginationBar
            page={safeFolderPage}
            totalPages={folderTotalPages}
            onPageChange={goToFolderPage}
            limit={folderLimit}
            onLimitChange={onFolderLimitChange}
            totalCount={folderImageCount}
            totalLabel="Total images"
          />
        </div>
      )}

      {/* Fullscreen viewer */}
      {fullscreenIndex !== null && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={closeFullscreen}
        >
          <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
            <img
              src={folder.images[fullscreenIndex]}
              alt="Detected user face"
              className="block h-[80vh] w-auto max-w-[92vw] object-contain rounded-lg"
            />

            <button
              onClick={closeFullscreen}
              className="absolute top-3 right-3 z-10 bg-[var(--bg1solid)] rounded-full p-1.5 cursor-pointer shadow-lg hover:bg-[var(--bg2)] transition-colors"
              title="Close"
            >
              <X className="w-5 h-5 text-[var(--tx)]" />
            </button>

            {folder.images.length > 1 && (
              <>
                <button
                  onClick={() => goFullscreenImage(-1)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 z-10 bg-[var(--bg1solid)] rounded-full p-2 cursor-pointer shadow-lg hover:bg-[var(--bg2)] transition-colors"
                  title="Previous"
                >
                  <ChevronLeft className="w-6 h-6 text-[var(--tx)]" />
                </button>
                <button
                  onClick={() => goFullscreenImage(1)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-10 bg-[var(--bg1solid)] rounded-full p-2 cursor-pointer shadow-lg hover:bg-[var(--bg2)] transition-colors"
                  title="Next"
                >
                  <ChevronRight className="w-6 h-6 text-[var(--tx)]" />
                </button>
                <span className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs font-medium px-2.5 py-1 rounded-full">
                  {fullscreenIndex + 1}/{folder.images.length}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Confirm deleting selected images */}
      <ConfirmationModal
        open={confirmDeleteImages}
        title="Delete Images"
        icon={<Trash2 className="w-6 h-6 text-[var(--crit)]" />}
        message={
          <>
            Delete{' '}
            <span className="font-semibold text-[var(--tx)]">
              {selectedImageIds.length} image{selectedImageIds.length > 1 ? 's' : ''}
            </span>{' '}
            from this folder?
          </>
        }
        confirmLabel="Delete"
        loading={deleting}
        onClose={() => !deleting && setConfirmDeleteImages(false)}
        onConfirm={onConfirmDeleteImages}
      />
    </div>
  );
};

export default FolderDetailView;
