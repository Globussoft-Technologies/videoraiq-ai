import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const ZOOM_STEP = 0.25;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampPosition(x, y, scale, rect) {
  if (!rect) return { x, y };
  const maxX = ((rect.width || 0) * (scale - 1)) / 2;
  const maxY = ((rect.height || 0) * (scale - 1)) / 2;
  return {
    x: clamp(x, -maxX, maxX),
    y: clamp(y, -maxY, maxY),
  };
}

export default function FullscreenZoomSurface({
  enabled = false,
  resetKey,
  toolbarStyle,
  children,
}) {
  const viewportRef = useRef(null);
  const dragRef = useRef(null);
  const [scale, setScale] = useState(MIN_SCALE);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const reset = useCallback(() => {
    setScale(MIN_SCALE);
    setPosition({ x: 0, y: 0 });
    dragRef.current = null;
    setDragging(false);
  }, []);

  useEffect(() => {
    if (!enabled) reset();
  }, [enabled, reset]);

  useEffect(() => {
    reset();
  }, [resetKey, reset]);

  const applyScale = useCallback((nextScale, clientX, clientY) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    setScale((currentScale) => {
      const safeCurrent = currentScale || MIN_SCALE;
      const boundedScale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      if (boundedScale === safeCurrent) return safeCurrent;

      setPosition((currentPosition) => {
        if (boundedScale === MIN_SCALE) return { x: 0, y: 0 };

        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const pointerX = clientX - rect.left;
        const pointerY = clientY - rect.top;
        const ratio = boundedScale / safeCurrent;
        const nextX = ratio * currentPosition.x + (1 - ratio) * (pointerX - centerX);
        const nextY = ratio * currentPosition.y + (1 - ratio) * (pointerY - centerY);
        return clampPosition(nextX, nextY, boundedScale, rect);
      });

      return boundedScale;
    });
  }, []);

  const zoomBy = useCallback((delta) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    applyScale(scale + delta, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }, [applyScale, scale]);

  const handleWheel = useCallback((event) => {
    if (!enabled) return;
    event.preventDefault();
    const delta = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
    applyScale(scale + delta, event.clientX, event.clientY);
  }, [applyScale, enabled, scale]);

  const handlePointerDown = useCallback((event) => {
    if (!enabled || scale <= MIN_SCALE) return;
    event.preventDefault();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
    viewportRef.current?.setPointerCapture?.(event.pointerId);
    setDragging(true);
  }, [enabled, position.x, position.y, scale]);

  const handlePointerMove = useCallback((event) => {
    if (!dragRef.current || !enabled || scale <= MIN_SCALE) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;
    setPosition(
      clampPosition(
        dragRef.current.originX + dx,
        dragRef.current.originY + dy,
        scale,
        rect
      )
    );
  }, [enabled, scale]);

  const endDrag = useCallback((pointerId) => {
    if (pointerId != null) viewportRef.current?.releasePointerCapture?.(pointerId);
    dragRef.current = null;
    setDragging(false);
  }, []);

  const handlePointerUp = useCallback((event) => {
    if (!dragRef.current) return;
    endDrag(event.pointerId);
  }, [endDrag]);

  const handlePointerCancel = useCallback((event) => {
    if (!dragRef.current) return;
    endDrag(event.pointerId);
  }, [endDrag]);

  const zoomPercent = useMemo(() => `${Math.round(scale * 100)}%`, [scale]);

  return (
    <div
      ref={viewportRef}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerCancel}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        touchAction: enabled ? 'none' : 'auto',
        // Only claim the cursor while actually panning (zoomed in); otherwise
        // stay transparent to it so the tile underneath (e.g. its "click to
        // expand" hand cursor) shows through instead of being overridden by
        // this overlay's own 'default'.
        cursor: enabled && scale > MIN_SCALE ? (dragging ? 'grabbing' : 'grab') : 'inherit',
      }}
    >
      {enabled && (
        <div
          onClick={(event) => {
            event.stopPropagation();
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 10px',
            borderRadius: 10,
            background: 'rgba(15,23,42,0.72)',
            border: '1px solid rgba(255,255,255,0.15)',
            backdropFilter: 'blur(8px)',
            color: '#fff',
            ...toolbarStyle,
          }}
        >
          {scale > MIN_SCALE && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                reset();
              }}
              title="Reset zoom"
              style={{
                ...toolbarButtonStyle,
                width: 'auto',
                minWidth: 58,
                padding: '0 12px',
                fontSize: 12,
                fontWeight: 700,
                fontFamily: 'var(--mono)',
                letterSpacing: '.3px',
              }}
            >
              Reset
            </button>
          )}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                zoomBy(-ZOOM_STEP);
            }}
            title="Zoom out"
            style={toolbarButtonStyle}
          >
            <Minus size={14} />
          </button>
          <span
            style={{
              minWidth: 52,
              textAlign: 'center',
              fontFamily: 'var(--mono)',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '.4px',
            }}
          >
            {zoomPercent}
          </span>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                zoomBy(ZOOM_STEP);
            }}
            title="Zoom in"
            style={toolbarButtonStyle}
          >
            <Plus size={14} />
          </button>
        </div>
      )}

      <div
        style={{
          width: '100%',
          height: '100%',
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          transformOrigin: 'center center',
          transition: dragging ? 'none' : 'transform 120ms ease-out',
          willChange: enabled ? 'transform' : 'auto',
          pointerEvents: 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
}

const toolbarButtonStyle = {
  width: 30,
  height: 30,
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.06)',
  color: '#fff',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
