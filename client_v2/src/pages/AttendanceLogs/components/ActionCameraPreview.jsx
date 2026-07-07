import React, { useState, useEffect, useCallback, memo, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, Zap, Calendar, Clock, Camera, ScanFace } from 'lucide-react';
import moment from 'moment-timezone';

/**
 * Image preview + capture details for attendance / access-log rows.
 * Theme-aware (uses the V2 CSS-var tokens), styled to match UserDetailModal.
 */

const DetailItem = ({ icon: Icon, label, value }) => (
  <div className="flex flex-col gap-1 p-3 rounded-xl bg-[var(--bg2)] border border-[var(--bd)] transition-all">
    <div className="flex items-center gap-2 text-[var(--tx3)]">
      <Icon className="w-4 h-4" />
      <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
    </div>
    <span
      className="text-sm font-semibold text-[var(--tx)] break-words line-clamp-2"
      title={value || '—'}
    >
      {value || '—'}
    </span>
  </div>
);

const ActionCameraPreview = ({ module = '', selectedLog = {}, isOpen = false, onClose = () => {} }) => {
  const BASE_URL = import.meta.env.VITE_BACKEND + '/api/v1/uploads';

  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);

  const region = moment.tz.guess();
  const convertToRegionTime = (utcTime) => {
    if (!utcTime || utcTime === '--') return '—';
    return moment.utc(utcTime).tz(region).format('hh:mm:ss A');
  };

  const isAttendance = module === 'attendancelogs';

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
  }, [fullImageUrls.length]);

  const handlePrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + fullImageUrls.length) % fullImageUrls.length);
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
    if (isOpen) setCurrentIndex(0);
  }, [isOpen]);

  // Re-arm the spinner whenever the shown image changes.
  useEffect(() => {
    setImageLoaded(false);
  }, [currentIndex, isOpen]);

  const cameraType = module === 'accesslogs'
    ? selectedLog?.channelInfo?.name || 'checkin'
    : fullCameraTypes[currentIndex] || '—';

  const dateValue = module === 'accesslogs' && selectedLog?.date
    ? moment.utc(selectedLog.date).tz(region).format('DD/MM/YYYY')
    : selectedLog?.login || selectedLog?.logout
      ? moment.utc(selectedLog.login || selectedLog.logout).tz(region).format('DD/MM/YYYY')
      : '—';

  const timeValue = isAttendance
    ? convertToRegionTime(fullTimestamps[currentIndex])
    : convertToRegionTime(fullTimestamp[currentIndex]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="w-[95vw] max-w-4xl p-0 overflow-hidden bg-[var(--bg1solid)] border border-[var(--bd)] rounded-3xl shadow-2xl top-1/2 left-1/2 translate-x-[-50%] translate-y-[-50%]"
        closeBtn="text-[var(--tx2)] hover:text-[var(--tx)] top-4 right-4"
        aria-describedby={undefined}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>
            {isAttendance ? 'Attendance Preview' : 'Access Log Preview'} - {selectedLog?.name || 'Employee'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col md:flex-row h-full max-h-[90vh]">
          {/* Left: capture carousel */}
          <div className="w-full md:w-1/2 min-w-0 bg-[var(--bg2)] flex flex-col items-center justify-center p-6 relative">
            <div className="relative w-full aspect-square max-w-md rounded-2xl overflow-hidden shadow-xl bg-black flex items-center justify-center">
              {fullImageUrls.length === 0 ? (
                <div className="flex flex-col items-center gap-3 text-[var(--tx3)]">
                  <Camera className="w-10 h-10" />
                  <span className="text-sm">No images available</span>
                </div>
              ) : (
                <>
                  {!imageLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-20">
                      <div className="w-10 h-10 border-[3px] border-[var(--bg3)] border-t-[var(--blue)] rounded-full animate-spin" />
                    </div>
                  )}
                  <img
                    src={fullImageUrls[currentIndex]}
                    alt={`Capture ${currentIndex + 1}`}
                    className={`w-full h-full object-contain transition-opacity duration-500 ${
                      imageLoaded ? 'opacity-100' : 'opacity-0'
                    }`}
                    onLoad={() => setImageLoaded(true)}
                    onError={() => setImageLoaded(true)}
                  />

                  {fullImageUrls.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={handlePrevious}
                        className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-[var(--bg1solid)]/90 text-[var(--tx)] shadow-lg hover:scale-110 transition-all cursor-pointer z-30"
                        aria-label="Previous image"
                      >
                        <ChevronLeft className="w-6 h-6" />
                      </button>
                      <button
                        type="button"
                        onClick={handleNext}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-[var(--bg1solid)]/90 text-[var(--tx)] shadow-lg hover:scale-110 transition-all cursor-pointer z-30"
                        aria-label="Next image"
                      >
                        <ChevronRight className="w-6 h-6" />
                      </button>
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-30">
                        {fullImageUrls.map((_, idx) => (
                          <div
                            key={idx}
                            className={`h-1.5 rounded-full transition-all ${
                              idx === currentIndex ? 'w-6 bg-[var(--blue)]' : 'w-1.5 bg-[var(--bd2)]'
                            }`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            <div className="mt-6 text-center">
              <h2 className="text-2xl font-bold text-[var(--tx)] break-words">
                {selectedLog?.name || 'Employee Name'}
              </h2>
              <p className="text-sm text-[var(--tx3)] font-medium mt-0.5">
                {isAttendance ? 'Attendance capture' : 'Access-log capture'}
              </p>
              <div className="mt-3 inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-[var(--blue)]/15 text-[var(--blue)]">
                {isAttendance ? 'Attendance' : 'Access Log'}
              </div>
            </div>
          </div>

          {/* Right: capture details */}
          <div className="w-full md:w-1/2 min-w-0 p-6 md:p-8 overflow-y-auto vq-scroll">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-[var(--tx)] flex items-center gap-2">
                <ScanFace className="w-5 h-5 text-[var(--blue)]" />
                {isAttendance ? 'Attendance Preview' : 'Access Log Preview'}
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DetailItem icon={Zap} label="Camera Type" value={cameraType} />
              {isAttendance && (
                <DetailItem icon={Camera} label="Checkin Cam" value={selectedLog?.checkinCam} />
              )}
              {isAttendance && (
                <DetailItem icon={Camera} label="Checkout Cam" value={selectedLog?.checkoutCam} />
              )}
              <DetailItem icon={Calendar} label="Date" value={dateValue} />
              <DetailItem icon={Clock} label="Time" value={timeValue} />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default memo(ActionCameraPreview);
