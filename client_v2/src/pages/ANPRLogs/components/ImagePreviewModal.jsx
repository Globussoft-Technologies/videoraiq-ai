import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Minus, Plus, RotateCcw, X } from 'lucide-react';
import ImageWithLoader from '@/pages/AttendanceLogs/components/ImageWithLoader';

/**
 * Incident-image preview overlay. Opens as a large card that sits within the
 * content area (between the sidebar and below the header), not a tiny thumbnail
 * and not an edge-to-edge takeover. Spinner only shows while genuinely loading.
 */
const ImagePreviewModal = ({ previewImage, onClose }) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, panX: 0, panY: 0 });

  useEffect(() => {
    if (!previewImage) return undefined;
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      if (fullscreen) {
        setFullscreen(false);
        return;
      }
      onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previewImage, fullscreen, onClose]);

  useEffect(() => {
    if (previewImage) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setDragging(false);
      setFullscreen(false);
    }
  }, [previewImage]);

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

  if (!previewImage) return null;

  const zoomControls = (
    <div
      className={
        fullscreen
          ? 'absolute top-4 left-4 z-40 flex items-center gap-1 rounded-lg border border-white/20 bg-white/95 p-1 shadow-lg'
          : 'absolute top-5 left-5 z-20 flex items-center gap-1 rounded-lg border border-[var(--bd)] bg-[var(--bg1solid)]/95 p-1 shadow-lg'
      }
    >
      <button
        type="button"
        onClick={() => updateZoom((current) => current - 0.2)}
        className="h-8 w-8 rounded-md inline-flex items-center justify-center text-[var(--tx)] hover:bg-[var(--bg2)] cursor-pointer"
        title="Zoom out"
      >
        <Minus className="w-4 h-4" />
      </button>
      <span className="min-w-[48px] text-center text-xs font-semibold text-[var(--tx2)]">
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        onClick={() => updateZoom((current) => current + 0.2)}
        className="h-8 w-8 rounded-md inline-flex items-center justify-center text-[var(--tx)] hover:bg-[var(--bg2)] cursor-pointer"
        title="Zoom in"
      >
        <Plus className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={resetView}
        className="h-8 w-8 rounded-md inline-flex items-center justify-center text-[var(--tx)] hover:bg-[var(--bg2)] cursor-pointer"
        title="Reset zoom"
      >
        <RotateCcw className="w-4 h-4" />
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
      <ImageWithLoader
        src={previewImage}
        alt="incident preview"
        className={
          fullscreen
            ? 'w-full h-full flex items-center justify-center bg-black'
            : 'w-full rounded-xl flex items-center justify-center min-h-[240px] max-h-[78vh]'
        }
        imgClassName={
          fullscreen
            ? 'w-full h-full object-contain origin-center'
            : 'w-full max-h-[78vh] object-contain origin-center'
        }
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transition: dragging ? 'none' : 'transform 120ms ease-out',
          cursor: zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in',
        }}
      />
      {!fullscreen && (
        <button
          type="button"
          onClick={openFullscreen}
          className="absolute bottom-4 right-4 z-30 h-9 w-9 rounded-lg inline-flex items-center justify-center bg-black/65 text-white border border-white/20 shadow-lg backdrop-blur-sm hover:bg-black/80 cursor-pointer"
          title="Fullscreen"
          aria-label="View fullscreen"
        >
          <Maximize2 className="w-4 h-4" />
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
        className="relative bg-[var(--bg1solid)] rounded-2xl border border-[var(--bd)] shadow-2xl p-3 w-[min(88vw,1120px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-20 bg-[var(--bg1solid)] rounded-full p-1 cursor-pointer shadow-lg hover:bg-[var(--bg2)] border border-[var(--bd)]"
          title="Close"
        >
          <X className="w-5 h-5 text-[var(--tx)]" />
        </button>
        {zoomControls}
        {image}
      </div>
    </div>
  );
};

export default ImagePreviewModal;
