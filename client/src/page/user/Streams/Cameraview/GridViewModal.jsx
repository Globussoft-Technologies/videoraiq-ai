import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react';
import mynaui_grid from '../../../../assets/mynaui_grid.svg';
import CameraStreamDisplay from './CameraStreamDisplay';

const GridViewModal = ({
  isOpen,
  onOpenChange,
  cameraData,
  selectedVideo,
  setSelectedVideo,
  cameraChannels,
  selectedGrid,
  gridOptions,
}) => {
  const [currentPage, setCurrentPage] = React.useState(1);

  // Derive grid settings from selectedGrid and gridOptions
  const gridSettings = React.useMemo(() => {
    const grid = gridOptions?.find((g) => g.id === selectedGrid) || {
      perPage: 16,
      cols: 4,
    };
    return grid;
  }, [selectedGrid, gridOptions]);

  const itemsPerPage = gridSettings.perPage;
  const cols = gridSettings.cols;

  // Format all channels into the cameraData format for pagination
  const allCamerasFormatted = React.useMemo(() => {
    if (!cameraChannels) return [];
    return cameraChannels.map((ch) => {
      const { ip, rtspPort, username, password, _id: NvrId } = ch.nvrId || {};
      const { customName, name, channelId, rtspChannels, _id, streamingUrl } =
        ch;
      const rtspChannel = rtspChannels?.[1]?.id;
      const displayName = customName || name;

      return {
        label: displayName,
        name: displayName,
        value: _id,
        config: {
          IP: ip,
          Port: rtspPort,
          Username: username,
          Password: password,
          ChannelId: channelId,
          RtspChannel: rtspChannel,
          StreamingUrl: streamingUrl,
          cameraId: _id,
          NvrId,
        },
      };
    });
  }, [cameraChannels]);

  const totalPages = Math.ceil(allCamerasFormatted.length / itemsPerPage);
  const currentCameras = allCamerasFormatted.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const nextPage = React.useCallback(
    () => setCurrentPage((prev) => Math.min(prev + 1, totalPages)),
    [totalPages]
  );
  const prevPage = React.useCallback(
    () => setCurrentPage((prev) => Math.max(prev - 1, 1)),
    []
  );

  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;

      // Ignore if typing in an input/textarea
      const activeElement = document.activeElement;
      const isInputFocused =
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.tagName === 'SELECT' ||
        activeElement.isContentEditable;

      if (isInputFocused) return;

      if (e.key === 'ArrowRight') nextPage();
      if (e.key === 'ArrowLeft') prevPage();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, totalPages, nextPage, prevPage]);

  // Handle fullscreen on open
  React.useEffect(() => {
    if (isOpen) {
      const docElement = document.documentElement;
      if (docElement.requestFullscreen) {
        docElement.requestFullscreen().catch(() => {
          // Fullscreen request failed, continue without fullscreen
        });
      }
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {
          // Exit fullscreen failed
        });
      }
    }
  }, [isOpen]);
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        closeBtn="text-white hover:text-gray-300"
        className="
         fixed inset-0 z-[9999]
         !w-screen !h-screen !max-w-none !m-0 !p-0
         translate-x-0 translate-y-0 left-0 top-0
         overflow-hidden
         bg-black border-none shadow-none rounded-none
        "
      >
        <div className="absolute top-0 left-0 right-0 h-12 px-4 py-2 border-b border-gray-800 z-40 bg-black flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={mynaui_grid} className="w-5 h-5 invert" alt="Grid" />
            <span className="text-base font-medium text-white">
              Live Monitoring - {allCamerasFormatted.length} Channels
            </span>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-white hover:text-gray-300 transition-colors p-1"
            aria-label="Close"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="absolute top-12 left-0 right-0 bottom-0 overflow-hidden bg-black relative group/modal w-full h-full">
          {/* Subtle Scanline/Noise Effect */}
          <div className="fixed inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] z-10" />

          {/* Quick Nav Arrows (Hover based) */}
          {totalPages > 1 && (
            <>
              <button
                onClick={prevPage}
                disabled={currentPage === 1}
                className={`absolute left-4 top-1/2 -translate-y-1/2 z-30 p-3 rounded-full bg-white/5 border border-white/10 backdrop-blur-md transition-all duration-300 cursor-pointer ${currentPage === 1 ? 'opacity-0 scale-90 invisible' : 'opacity-0 group-hover/modal:opacity-100 group-hover/modal:translate-x-2'}`}
              >
                <ChevronLeft className="text-white w-6 h-6" />
              </button>
              <button
                onClick={nextPage}
                disabled={currentPage === totalPages}
                className={`absolute right-4 top-1/2 -translate-y-1/2 z-30 p-3 rounded-full bg-white/5 border border-white/10 backdrop-blur-md transition-all duration-300 cursor-pointer ${currentPage === totalPages ? 'opacity-0 scale-90 invisible' : 'opacity-0 group-hover/modal:opacity-100 group-hover/modal:translate-x-[-8px]'}`}
              >
                <ChevronRight className="text-white w-6 h-6" />
              </button>
            </>
          )}

          <div
            className={`grid gap-0 w-full h-full overflow-hidden transition-all duration-500 ease-in-out ${allCamerasFormatted.length === 1 ? 'grid-cols-1 grid-rows-1' : ''}`}
            style={
              allCamerasFormatted.length === 1
                ? {}
                : {
                    gridTemplateColumns: `repeat(${cols}, 1fr)`,
                    gridTemplateRows: `repeat(${Math.ceil(itemsPerPage / cols)}, 1fr)`,
                  }
            }
          >
            {currentCameras.map((camera, index) => (
              <div
                key={camera.value}
                className="group relative w-full h-full overflow-hidden bg-black border border-gray-900 hover:border-[#07486A] transition-all duration-300"
              >
                <div className="w-full h-full absolute inset-0">
                  <CameraStreamDisplay
                    camera={camera}
                    selectedVideo={selectedVideo}
                    setSelectedVideo={setSelectedVideo}
                    cameraChannels={cameraChannels}
                    isMini={true}
                  />
                </div>

                {/* Tech Overlay: Index and Status */}
                <div className="absolute top-0 left-0 right-0 p-1 flex justify-between items-start pointer-events-none z-20 font-mono">
                  <span className="text-[7px] font-mono text-white/30 bg-black/40 px-1 rounded-br-sm border-r border-b border-white/5">
                    {String(
                      (currentPage - 1) * itemsPerPage + index + 1
                    ).padStart(2, '0')}
                  </span>
                  <div className="flex items-center gap-1 bg-black/40 px-1 rounded-full backdrop-blur-sm border border-white/5 text-[6px] text-white/20">
                    LIVE_FEED
                    <div className="w-1 h-1 rounded-full bg-red-600 animate-pulse" />
                  </div>
                </div>

                <div className="absolute bottom-0 left-0 right-0 p-1 bg-gradient-to-t from-black/80 to-transparent translate-y-full group-hover:translate-y-0 transition-transform duration-200 z-20">
                  <span className="text-[8px] text-white/90 font-medium truncate block uppercase tracking-tight">
                    {camera.label}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom HUD Pagination */}
          {totalPages > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 px-6 py-2 rounded-full bg-black/40 border border-white/10 backdrop-blur-xl flex items-center gap-6 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
              <div className="flex items-center gap-1 font-mono text-[9px] text-[#00E5FF] tracking-widest opacity-80">
                <span className="animate-pulse">●</span>
                MOD.PAGINATION_SYS: [{String(currentPage).padStart(2, '0')}/
                {String(totalPages).padStart(2, '0')}]
              </div>

              <div className="h-4 w-[1px] bg-white/10" />

              <div className="flex gap-2 items-center">
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentPage(i + 1)}
                    className={`transition-all duration-300 rounded-[1px] cursor-pointer ${
                      currentPage === i + 1
                        ? 'w-3 h-1.5 bg-[#00E5FF] shadow-[0_0_8px_#00E5FF]'
                        : 'w-1.5 h-1.5 bg-white/20 hover:bg-white/40'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default React.memo(GridViewModal);
