import { useEffect, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';

export default function DraggableZoomControls({ children, className, style, resetKey, handleClassName, handleStyle, onWheel }) {
  const barRef = useRef(null);
  const dragRef = useRef(null);
  const [position, setPosition] = useState(null);

  useEffect(() => {
    dragRef.current = null;
    setPosition(null);
  }, [resetKey]);

  const bounded = (left, top) => {
    const bar = barRef.current;
    const container = bar?.parentElement;
    if (!bar || !container) return { left, top };
    return {
      left: Math.min(Math.max(8, left), Math.max(8, container.clientWidth - bar.offsetWidth - 8)),
      top: Math.min(Math.max(8, top), Math.max(8, container.clientHeight - bar.offsetHeight - 8)),
    };
  };

  const currentPosition = () => {
    const bar = barRef.current.getBoundingClientRect();
    const container = barRef.current.parentElement.getBoundingClientRect();
    return { left: bar.left - container.left, top: bar.top - container.top };
  };

  const startDrag = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const start = currentPosition();
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, ...start };
    setPosition(start);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPosition(bounded(drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y));
  };

  const stopDrag = (event) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const moveWithKeys = (event) => {
    const step = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] }[event.key];
    if (!step && event.key !== 'Home') return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Home') { setPosition(null); return; }
    const current = currentPosition();
    setPosition(bounded(current.left + step[0], current.top + step[1]));
  };

  return (
    <div
      ref={barRef}
      className={className}
      style={{ ...style, ...(position && { position: 'absolute', left: position.left, top: position.top, right: 'auto', bottom: 'auto', transform: 'none' }) }}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={onWheel}
    >
      <button
        type="button"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        onKeyDown={moveWithKeys}
        className={handleClassName}
        style={{ width: 24, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: 0, background: 'transparent', color: 'inherit', cursor: 'grab', touchAction: 'none', ...handleStyle }}
        title="Drag zoom controls (arrow keys also move; Home resets position)"
        aria-label="Move zoom controls"
      >
        <GripVertical size={15} />
      </button>
      {children}
    </div>
  );
}
