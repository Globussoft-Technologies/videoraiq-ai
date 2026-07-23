import React, { useEffect, useRef } from 'react';
import TimelineBar, { guardColors as colors } from '@/pages/VisibilityLog/TimelineBar';

/** Draggable/zoomable 24h timeline row; scroll position is synced across all
 * rows sharing the `.timeline-sync-scroll` class so zooming one row zooms all. */
const TimelineCell = ({
  zoom,
  segments,
  axisLabels,
  onZoom,
  isDragging,
  setIsDragging,
  startX,
  setStartX,
  scrollLeftState,
  setScrollLeftState,
}) => {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      onZoom(zoomFactor, mouseX, container);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [onZoom]);

  const handleMouseDown = (e) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    setStartX(e.pageX - e.currentTarget.offsetLeft);
    setScrollLeftState(e.currentTarget.scrollLeft);
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.pageX - e.currentTarget.offsetLeft;
    const walk = (x - startX) * 1.5;
    const newScroll = scrollLeftState - walk;

    document.querySelectorAll('.timeline-sync-scroll').forEach((c) => {
      c.scrollLeft = newScroll;
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      className={`absolute inset-0 overflow-x-hidden py-3 hide-scrollbar timeline-sync-scroll ${
        zoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
    >
      <div style={{ width: `${100 * zoom}%` }} className="h-full">
        <TimelineBar segments={segments} colors={colors} />
        <div className="flex justify-between text-[10px] text-[var(--tx3)] mt-2 border-t border-[var(--bd)] pt-2">
          {axisLabels.map((label, idx) => (
            <div key={idx} className="flex flex-col items-center">
              <div className="w-[1px] h-2 bg-[var(--bd)]" />
              <span className="mt-1">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TimelineCell;
