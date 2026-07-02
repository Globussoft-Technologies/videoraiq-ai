import React, { useState, useEffect, useCallback, memo, useMemo } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X, ChevronLeft, ChevronRight, Zap, Calendar, Clock, Camera } from 'lucide-react';
import moment from 'moment-timezone';

/**
 * Full-screen image preview carousel for attendance captures. Rendered as a
 * dark media lightbox (intentional in both themes, like a standard image
 * viewer). Supports keyboard nav and per-image capture details.
 */
const ActionCameraPreview = ({ module = '', selectedLog = {}, isOpen = false, onClose = () => {} }) => {
  const BASE_URL = import.meta.env.VITE_BACKEND + '/api/v1/uploads';

  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);

  const darkGradient = 'linear-gradient(135deg, #1E1E1E 0%, #333333 50%, #2A2A2A 100%)';
  const cardGradient = 'linear-gradient(135deg, #2A2A2A 0%, #333333 100%)';

  const region = moment.tz.guess();
  const convertToRegionTime = (utcTime) => {
    if (!utcTime || utcTime === '--') return '--';
    return moment.utc(utcTime).tz(region).format('hh:mm:ss A');
  };

  const fullImageUrls = useMemo(
    () =>
      (selectedLog?.imageUrls || []).map((item) => {
        if (typeof item === 'object' && item?.url) return BASE_URL + item.url;
        if (typeof item === 'string') return BASE_URL + item;
        return null;
      }),
    [selectedLog?.imageUrls, BASE_URL]
  );

  const fullTimestamps = useMemo(
    () => (selectedLog?.imageUrls || []).map((obj) => obj.timestamp),
    [selectedLog?.imageUrls]
  );
  const fullTimestamp = useMemo(() => selectedLog?.timestamp || [], [selectedLog?.timestamp]);
  const fullCameraTypes = useMemo(
    () => (selectedLog?.imageUrls || []).map((obj) => obj.cameraType || null),
    [selectedLog?.imageUrls]
  );

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % fullImageUrls.length);
    setImageLoaded(true);
  }, [fullImageUrls.length]);

  const handlePrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + fullImageUrls.length) % fullImageUrls.length);
    setImageLoaded(true);
  }, [fullImageUrls.length]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === 'ArrowLeft') handlePrevious();
      else if (e.key === 'ArrowRight') handleNext();
      else if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleNext, handlePrevious, onClose]);

  useEffect(() => {
    const handleResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(0);
      setImageLoaded(false);
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className={`fixed inset-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 overflow-hidden rounded-none md:rounded-xl p-0 shadow-2xl w-full h-full sm:w-[95vw] sm:h-[90vh] sm:max-w-[95vw] sm:max-h-[90vh] md:w-[90vw] md:h-[85vh] md:max-w-[900px] ${
          viewportHeight <= 700 ? 'md:max-h-[80vh]' : 'md:max-h-[70vh]'
        } border-0`}
        closeBtn="hidden"
        aria-describedby={undefined}
        style={{ background: darkGradient }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-50 cursor-pointer focus:outline-none text-white hover:text-blue-200 w-8 h-8 rounded-lg flex justify-center items-center transition-all duration-200"
          aria-label="Close preview"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="h-full p-3 md:p-4 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 grid-rows-[auto_1fr_auto] md:grid-rows-1">
          <div
            className="md:col-span-7 rounded-2xl overflow-hidden relative border border-gray-600/50 backdrop-blur-sm shadow-lg"
            style={{ background: cardGradient }}
          >
            {fullImageUrls.length > 1 && (
              <>
                <button
                  onClick={handlePrevious}
                  className="absolute left-4 top-1/2 -translate-y-1/2 z-30 w-8 h-8 md:w-10 md:h-10 rounded-xl bg-black/50 hover:bg-black/70 border border-gray-600/50 flex items-center justify-center text-white hover:text-blue-300 transition-all duration-300 backdrop-blur-sm shadow-lg"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
                </button>
                <button
                  onClick={handleNext}
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-30 w-8 h-8 md:w-10 md:h-10 rounded-xl bg-black/50 hover:bg-black/70 border border-gray-600/50 flex items-center justify-center text-white hover:text-blue-300 transition-all duration-300 backdrop-blur-sm shadow-lg"
                  aria-label="Next image"
                >
                  <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
                </button>
              </>
            )}

            <div className="relative w-full h-full flex items-center justify-center p-4 md:p-6">
              {fullImageUrls.length === 0 ? (
                <div className="text-gray-400 text-base md:text-lg flex flex-col items-center gap-3 md:gap-4">
                  <Camera className="w-10 h-10 md:w-12 md:h-12" />
                  No images available
                </div>
              ) : (
                <>
                  {!imageLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-20 backdrop-blur-sm">
                      <div className="w-10 h-10 md:w-12 md:h-12 border-[3px] border-gray-600 border-t-blue-400 rounded-full animate-spin shadow-lg" />
                    </div>
                  )}
                  <div className="relative w-full h-full max-w-4xl max-h-full rounded-lg overflow-hidden bg-black border border-gray-600/50 shadow-xl">
                    <img
                      src={fullImageUrls[currentIndex]}
                      alt={`Preview ${currentIndex + 1}`}
                      className={`w-full h-full object-contain transition-all duration-500 ${
                        imageLoaded ? 'opacity-100' : 'opacity-0'
                      }`}
                      onLoad={() => setImageLoaded(true)}
                      onError={() => setImageLoaded(true)}
                    />
                  </div>
                </>
              )}
            </div>

            {fullImageUrls.length > 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                <div className="px-3 py-1 rounded-xl bg-black/60 backdrop-blur-sm border border-gray-600/50 text-white text-xs font-medium shadow-lg">
                  {currentIndex + 1} / {fullImageUrls.length}
                </div>
              </div>
            )}
          </div>

          <div className="md:col-span-5 grid grid-rows-[auto_1fr_auto] gap-3 md:gap-4">
            <div
              className="rounded-2xl p-3 md:p-4 flex flex-col items-center justify-center text-center border border-gray-600/50 backdrop-blur-sm shadow-lg"
              style={{ background: cardGradient }}
            >
              <span className="text-white text-sm md:text-base lg:text-lg font-medium mb-2">
                {module === 'attendancelogs' ? 'ATTENDANCE PREVIEW' : 'ACCESSLOG PREVIEW'}
              </span>
              <span className="text-white text-sm md:text-base font-normal">
                {selectedLog?.name || 'Employee Name'}
              </span>
            </div>

            <div
              className="rounded-2xl p-3 md:p-4 border border-gray-600/50 backdrop-blur-sm shadow-lg overflow-y-auto"
              style={{ background: cardGradient }}
            >
              <h3 className="text-white font-medium mb-4 md:mb-6 flex items-center gap-2 text-sm md:text-base lg:text-lg">
                CAPTURE DETAILS
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                <div className="grid grid-rows-[auto_1fr] gap-2">
                  <div className="flex items-center gap-2 text-blue-200 text-sm font-medium uppercase tracking-wide">
                    <Zap className="w-3 h-3" /> camera type
                  </div>
                  <div className="text-white font-normal text-sm md:text-base pl-6">
                    {module === 'accesslogs'
                      ? selectedLog?.channelInfo?.name || 'checkin'
                      : fullCameraTypes[currentIndex] || '--'}
                  </div>
                </div>

                {module === 'attendancelogs' && (
                  <div className="grid grid-rows-[auto_1fr] gap-2">
                    <div className="flex items-center gap-2 text-blue-200 text-sm font-medium uppercase tracking-wide">
                      <Zap className="w-3 h-3" /> checkin Cam
                    </div>
                    <div className="text-white font-normal text-sm md:text-base pl-6">
                      {selectedLog?.checkinCam}
                    </div>
                  </div>
                )}

                {module === 'attendancelogs' && (
                  <div className="grid grid-rows-[auto_1fr] gap-2">
                    <div className="flex items-center gap-2 text-blue-200 text-sm font-medium uppercase tracking-wide">
                      <Zap className="w-3 h-3" /> checkout Cam
                    </div>
                    <div className="text-white font-normal text-sm md:text-base pl-6">
                      {selectedLog?.checkoutCam}
                    </div>
                  </div>
                )}

                <div className="grid grid-rows-[auto_1fr] gap-2">
                  <div className="flex items-center gap-2 text-blue-200 text-sm font-medium uppercase tracking-wide">
                    <Calendar className="w-3 h-3" /> Date
                  </div>
                  <div className="text-white font-normal text-sm md:text-base pl-6">
                    {module === 'accesslogs' && selectedLog?.date
                      ? moment.utc(selectedLog.date).tz(region).format('DD/MM/YYYY')
                      : selectedLog?.login || selectedLog?.logout
                        ? moment.utc(selectedLog.login || selectedLog.logout).tz(region).format('DD/MM/YYYY')
                        : '--/--/----'}
                  </div>
                </div>

                <div className="grid grid-rows-[auto_1fr] gap-2">
                  <div className="flex items-center gap-2 text-blue-200 text-sm font-medium uppercase tracking-wide">
                    <Clock className="w-3 h-3" /> Time
                  </div>
                  <div className="text-white font-normal text-sm md:text-base pl-6">
                    {module === 'attendancelogs'
                      ? convertToRegionTime(fullTimestamps[currentIndex])
                      : convertToRegionTime(fullTimestamp[currentIndex])}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default memo(ActionCameraPreview);
