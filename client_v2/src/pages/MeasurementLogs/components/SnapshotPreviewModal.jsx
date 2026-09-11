import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff, Maximize2, Minus, Plus, RotateCcw, X } from 'lucide-react';
import ImageWithLoader from '@/pages/AttendanceLogs/components/ImageWithLoader';

// Measurement records carry TWO frames per incident — the QR-cam capture
// (qrImageUrl) used to read the SKU/order payload, and the DS measurement
// frame (measurementImageUrl) the length/width/height come from. Both matter
// to a reviewer checking a Mismatch / QR Error row, so this modal switches
// between them via tabs rather than picking just one.
const TABS = [
  { key: 'qr', label: 'QR Capture' },
  { key: 'measurement', label: 'Measurement Frame' },
];

const SnapshotPreviewModal = ({
  qrImage,
  measurementImage,
  hasPrevious = false,
  hasNext = false,
  onPrevious,
  onNext,
  onClose,
}) => {
  const [tab, setTab] = useState(qrImage ? 'qr' : 'measurement');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, panX: 0, panY: 0 });

  // Prev/Next moves to a different RECORD, not a different image — keep the
  // user's chosen tab (QR vs Measurement) across records, only falling back
  // when the newly-loaded record is missing the currently selected image.
  useEffect(() => {
    setTab((current) => {
      const stillAvailable = current === 'qr' ? qrImage : measurementImage;
      if (stillAvailable) return current;
      return qrImage ? 'qr' : 'measurement';
    });
  }, [qrImage, measurementImage]);

  // Reset zoom/pan whenever the visible image changes (record or tab) — but
  // NOT fullscreen: Prev/Next changes qrImage/measurementImage as it moves to
  // the next record, and fullscreen should persist across that navigation
  // instead of closing.
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setDragging(false);
  }, [qrImage, measurementImage, tab]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (fullscreen) {
          setFullscreen(false);
          return;
        }
        onClose?.();
      }
      if (e.key === 'ArrowLeft' && hasPrevious) {
        e.preventDefault();
        onPrevious?.();
      }
      if (e.key === 'ArrowRight' && hasNext) {
        e.preventDefault();
        onNext?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullscreen, hasPrevious, hasNext, onPrevious, onNext, onClose]);

  const updateZoom = (next) => {
    setZoom((current) => {
      const value = typeof next === 'function' ? next(current) : next;
      const bounded = Math.min(4, Math.max(1, Number(value.toFixed(2))));
      if (bounded <= 1) setPan({ x: 0, y: 0 });
      return bounded;
    });
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const openFullscreen = () => {
    resetView();
    setFullscreen(true);
  };

  const closeFullscreen = () => {
    resetView();
    setFullscreen(false);
  };

  const handleWheel = (event) => {
    event.preventDefault();
    updateZoom((current) => current + (event.deltaY < 0 ? 0.12 : -0.12));
  };

  const handleMouseDown = (event) => {
    if (event.button !== 0 || zoom <= 1) return;
    event.preventDefault();
    setDragging(true);
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  useEffect(() => {
    if (!dragging) return undefined;
    const handleMouseMove = (event) => {
      const drag = dragRef.current;
      setPan({
        x: drag.panX + event.clientX - drag.startX,
        y: drag.panY + event.clientY - drag.startY,
      });
    };
    const handleMouseUp = () => setDragging(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging]);

  if (!qrImage && !measurementImage) return null;

  const src = tab === 'qr' ? qrImage : measurementImage;

  const zoomControls = (
    <div
      className={
        fullscreen
          ? 'absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 rounded-lg border border-white/20 bg-white/95 p-1 shadow-lg'
          : 'flex items-center gap-1 rounded-lg border border-[var(--bd)] bg-[var(--bg1solid)] p-1 shadow-sm'
      }
    >
      <button
        type="button"
        onClick={() => updateZoom((current) => current - 0.2)}
        className="h-7 w-7 rounded-md inline-flex items-center justify-center text-[var(--tx)] hover:bg-[var(--bg2)] cursor-pointer"
        title="Zoom out"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <span className="min-w-[40px] text-center text-[10.5px] font-semibold text-[var(--tx2)]">
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        onClick={() => updateZoom((current) => current + 0.2)}
        className="h-7 w-7 rounded-md inline-flex items-center justify-center text-[var(--tx)] hover:bg-[var(--bg2)] cursor-pointer"
        title="Zoom in"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={resetView}
        className="h-7 w-7 rounded-md inline-flex items-center justify-center text-[var(--tx)] hover:bg-[var(--bg2)] cursor-pointer"
        title="Reset zoom"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  const image = (
    <div
      className={
        fullscreen
          ? 'relative w-full h-full flex items-center justify-center overflow-hidden'
          : 'relative w-full rounded-xl overflow-hidden'
      }
    >
      {src ? (
        <ImageWithLoader
          src={src}
          alt={TABS.find((t) => t.key === tab)?.label}
          className={
            fullscreen
              ? 'w-full h-full flex items-center justify-center bg-black'
              : 'w-full rounded-xl min-h-[280px] max-h-[70vh] flex items-center justify-center'
          }
          imgClassName={
            fullscreen
              ? 'w-full h-full object-contain origin-center'
              : 'w-full max-h-[70vh] object-contain origin-center'
          }
          onMouseDown={handleMouseDown}
          onWheel={handleWheel}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transition: dragging ? 'none' : 'transform 120ms ease-out',
            cursor: zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in',
          }}
        />
      ) : (
        <div className="w-full rounded-xl min-h-[280px] max-h-[70vh] bg-[var(--bg2)] flex flex-col items-center justify-center gap-[6px] text-[var(--tx3)]">
          <ImageOff size={22} strokeWidth={1.6} />
          <span className="font-[var(--mono)] text-[10px]">No image</span>
        </div>
      )}
      {!fullscreen && src && (
        <button
          type="button"
          onClick={openFullscreen}
          className="absolute bottom-3 right-3 z-30 h-9 w-9 rounded-lg inline-flex items-center justify-center bg-black/65 text-white border border-white/20 shadow-lg backdrop-blur-sm hover:bg-black/80 cursor-pointer"
          title="Fullscreen"
          aria-label="View fullscreen"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      )}
      {hasPrevious && (
        <button
          type="button"
          onClick={onPrevious}
          className="absolute left-3 top-1/2 z-30 inline-flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-black/60 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-black/80"
          title="Previous"
          aria-label="Previous"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {hasNext && (
        <button
          type="button"
          onClick={onNext}
          className="absolute right-3 top-1/2 z-30 inline-flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-black/60 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-black/80"
          title="Next"
          aria-label="Next"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      {fullscreen ? (
        <div
          className="fixed inset-0 z-[230] bg-black flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={closeFullscreen}
            className="absolute top-4 right-4 z-40 h-10 w-10 rounded-lg inline-flex items-center justify-center bg-red-600 text-white border border-red-400 shadow-lg backdrop-blur-sm hover:bg-red-700 cursor-pointer"
            title="Close fullscreen"
            aria-label="Close fullscreen"
          >
            <X className="w-5 h-5" />
          </button>
          {zoomControls}
          {image}
        </div>
      ) : null}
      <div
        className="relative bg-[var(--bg1solid)] rounded-2xl border border-[var(--bd)] shadow-2xl p-4 w-[min(88vw,900px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-20 bg-[var(--bg1solid)] rounded-full p-1 cursor-pointer shadow-lg hover:bg-[var(--bg2)] border border-[var(--bd)]"
          title="Close"
        >
          <X className="w-5 h-5 text-[var(--tx)]" />
        </button>

        <div className="flex items-center justify-between gap-[10px] mb-[12px]">
          <div className="flex items-center gap-[6px]">
            {TABS.map((t) => {
              const disabled = t.key === 'qr' ? !qrImage : !measurementImage;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => setTab(t.key)}
                  className={`px-[12px] h-[30px] rounded-[8px] text-[11.5px] font-semibold border transition-colors ${
                    disabled
                      ? 'opacity-40 cursor-not-allowed border-[var(--bd)] text-[var(--tx3)]'
                      : active
                        ? 'bg-[var(--blue)] border-[var(--blue)] text-white cursor-pointer'
                        : 'bg-[var(--bg2)] border-[var(--bd)] text-[var(--tx2)] hover:text-[var(--tx)] cursor-pointer'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {src && zoomControls}
        </div>

        {image}
      </div>
    </div>
  );
};

export default SnapshotPreviewModal;
