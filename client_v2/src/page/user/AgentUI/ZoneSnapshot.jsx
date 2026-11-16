import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Expand, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { zonePreviewBlob } from './zonePreview';

const clampZoom = (value) => Math.min(4, Math.max(1, Math.round(value * 10) / 10));

export default function ZoneSnapshot({ actionId, src, label = 'Configured zone snapshot' }) {
  const [image, setImage] = useState('');
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef(null);
  const closeButton = useRef(null);
  const openButton = useRef(null);
  const controls = useRef(null);

  useEffect(() => {
    if (!actionId || src) return undefined;
    let active = true;
    let objectUrl;
    setImage('');
    zonePreviewBlob(actionId).then((blob) => {
      if (!active || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setImage(objectUrl);
    }).catch(() => { /* The backend may expire a preview after approval. */ });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [actionId, src]);

  useEffect(() => {
    if (!open) return undefined;
    setZoom(1);
    setPan({ x: 0, y: 0 });
    closeButton.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
      if (event.key === 'Tab') {
        const buttons = controls.current?.querySelectorAll('button:not(:disabled)');
        if (buttons?.length && ((event.shiftKey && document.activeElement === buttons[0]) || (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]))) {
          event.preventDefault();
          (event.shiftKey ? buttons[buttons.length - 1] : buttons[0]).focus();
        }
      }
      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        if (event.key === '+' || event.key === '=') setZoom((current) => clampZoom(current + .2));
        if (event.key === '-') setZoom((current) => clampZoom(current - .2));
        if (event.key === '0') { setZoom(1); setPan({ x: 0, y: 0 }); }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => { window.removeEventListener('keydown', onKeyDown); openButton.current?.focus(); };
  }, [open]);

  if (!src && !image) return null;
  const source = src || image;
  const updateZoom = (change) => setZoom((current) => {
    const next = clampZoom(current + change);
    if (next === 1) setPan({ x: 0, y: 0 });
    return next;
  });
  const resetZoom = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  const onPointerDown = (event) => {
    if (zoom === 1) return;
    dragStart.current = { x: event.clientX - pan.x, y: event.clientY - pan.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const onPointerMove = (event) => {
    if (dragStart.current) setPan({ x: event.clientX - dragStart.current.x, y: event.clientY - dragStart.current.y });
  };
  const onPointerUp = () => { dragStart.current = null; setDragging(false); };
  const onWheel = (event) => {
    event.preventDefault();
    updateZoom(event.deltaY < 0 ? .2 : -.2);
  };

  return <>
    <figure className="agent-zone-snapshot"><button ref={openButton} type="button" className="agent-zone-open" onClick={() => setOpen(true)} aria-label={`Open ${label} full screen`}><img src={source} alt={label} /><span><Expand size={15} />View full screen</span></button><figcaption>{label}</figcaption></figure>
    {open && createPortal(<div className="agent-zone-lightbox" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><div className="agent-zone-lightbox-content" role="dialog" aria-modal="true" aria-label={label}>
      <div className="agent-zone-lightbox-frame">
        <div className="agent-zone-lightbox-stage" onWheel={onWheel}><img src={source} alt={label} draggable={false} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onDoubleClick={() => zoom === 1 ? updateZoom(1) : resetZoom()} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, cursor: zoom === 1 ? 'zoom-in' : dragging ? 'grabbing' : 'grab', transition: dragging ? 'none' : 'transform 120ms ease-out' }} /></div>
        <div ref={controls} className="agent-zone-lightbox-controls"><button type="button" onClick={() => updateZoom(-.2)} disabled={zoom <= 1} aria-label="Zoom out"><Minus size={17} /></button><span aria-live="polite">{Math.round(zoom * 100)}%</span><button type="button" onClick={() => updateZoom(.2)} disabled={zoom >= 4} aria-label="Zoom in"><Plus size={17} /></button><button type="button" onClick={resetZoom} disabled={zoom === 1} aria-label="Reset zoom"><RotateCcw size={16} /></button><button ref={closeButton} className="agent-zone-lightbox-close" type="button" onClick={() => setOpen(false)} aria-label="Close image viewer"><X size={20} /></button></div>
        <div className="agent-zone-lightbox-caption">{label}</div>
      </div>
    </div></div>, document.body)}
  </>;
}
