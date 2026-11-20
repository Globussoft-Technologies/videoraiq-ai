import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Cctv, ChevronLeft, ChevronRight, Expand, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { useTheme } from '@/theme/ThemeContext';
import { zonePreviewBlob } from './zonePreview';
import InventorySelect from './InventorySelect';

const clampZoom = (value) => Math.min(4, Math.max(1, Math.round(value * 10) / 10));
const stateLabel = (state) => state === 'on' ? 'On' : state === 'off' ? 'Off' : 'Unknown';

export default function ZoneSnapshot({ actionId, src, label = 'Configured zone snapshot', thumbnail, onImageError, initialVariantId = '', inventoryPreview, inventoryGallery = [] }) {
  const { theme } = useTheme();
  const [image, setImage] = useState('');
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [variantId, setVariantId] = useState(initialVariantId);
  const [variantImage, setVariantImage] = useState('');
  const [variantError, setVariantError] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(null);
  const dragStart = useRef(null);
  const closeButton = useRef(null);
  const openButton = useRef(null);
  const controls = useRef(null);
  const viewerDialog = useRef(null);
  const gallery = inventoryPreview && !inventoryGallery.includes(inventoryPreview) ? [inventoryPreview, ...inventoryGallery] : inventoryGallery;
  const originIndex = gallery.indexOf(inventoryPreview);
  const index = galleryIndex ?? originIndex;
  const currentPreview = gallery[index] || inventoryPreview;
  const variants = currentPreview?.variants;
  const variant = variants?.find((item) => item.id === variantId);
  const useThumbnail = currentPreview === inventoryPreview && variantId === initialVariantId;

  useEffect(() => {
    if (!open || useThumbnail || !variant?.load) return undefined;
    const controller = new AbortController();
    let url;
    variant.load(controller.signal).then((blob) => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob);
      setVariantImage(url);
    }).catch(() => { if (!controller.signal.aborted) setVariantError(true); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [open, variant, useThumbnail]);

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
    const dialog = viewerDialog.current;
    dialog?.showModal();
    closeButton.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (dialog) event.preventDefault();
        setOpen(false);
      }
      if (event.key === 'Tab' && !dialog) {
        const buttons = controls.current?.querySelectorAll('button:not(:disabled), select');
        if (buttons?.length && ((event.shiftKey && document.activeElement === buttons[0]) || (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]))) {
          event.preventDefault();
          (event.shiftKey ? buttons[buttons.length - 1] : buttons[0]).focus();
        }
      }
      if (event.target?.tagName !== 'SELECT' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (event.key === '+' || event.key === '=') setZoom((current) => clampZoom(current + .2));
        if (event.key === '-') setZoom((current) => clampZoom(current - .2));
        if (event.key === '0') { setZoom(1); setPan({ x: 0, y: 0 }); }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      dialog?.close();
      openButton.current?.focus();
    };
  }, [open]);

  if (!src && !image) return null;
  const source = src || image;
  const previewSource = useThumbnail ? source : variantImage;
  const previewLabel = currentPreview ? currentPreview.camera + ' zones' : label;
  const detections = variants?.filter((item) => item.id !== '') || [];
  const previewStatus = variantError ? 'This zone image could not be loaded.'
    : !useThumbnail && !variant?.load ? 'No saved zone image for this selection.'
      : 'Loading zone image…';
  const updateZoom = (change) => setZoom((current) => {
    const next = clampZoom(current + change);
    if (next === 1) setPan({ x: 0, y: 0 });
    return next;
  });
  const resetZoom = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  const selectVariant = (id) => {
    if (id === variantId) return;
    setVariantImage('');
    setVariantError(false);
    setVariantId(id);
    resetZoom();
  };
  const browse = (direction) => {
    const next = index + direction;
    if (next < 0 || next >= gallery.length) return;
    setGalleryIndex(next);
    setVariantId('');
    setVariantImage('');
    setVariantError(false);
    resetZoom();
  };
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

  const lightbox = open && <div className="agent-zone-lightbox" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><div className="agent-zone-lightbox-content" role={thumbnail ? undefined : 'dialog'} aria-modal={thumbnail ? undefined : true} aria-label={thumbnail ? undefined : label}>
      <div className="agent-zone-lightbox-frame" data-inventory={inventoryPreview ? 'true' : undefined} onKeyDown={(event) => {
        if (gallery.length <= 1 || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') || event.target.closest('.agent-inventory-select')) return;
        event.preventDefault();
        browse(event.key === 'ArrowLeft' ? -1 : 1);
      }}>
        {currentPreview && <header className="agent-zone-preview-header">
          <div className="agent-zone-preview-identity"><Cctv size={16} aria-hidden="true" /><strong>{currentPreview.camera}</strong>{currentPreview.nvr && <span> · {currentPreview.nvr}</span>}</div>
          {gallery.length > 1 && <span className="agent-zone-preview-counter" aria-live="polite">{index + 1} / {gallery.length}</span>}
          {detections.length > 0 && <InventorySelect label="Show zones of" value={variantId} onChange={selectVariant}
            options={[{ value: '', label: 'All detections (' + detections.length + ')' }, ...detections.map((item) => ({ value: item.id, label: item.label + ' · ' + stateLabel(item.state) }))]} />}
          <button ref={closeButton} type="button" onClick={() => setOpen(false)} aria-label="Close image viewer"><X size={18} /></button>
        </header>}
        <div className="agent-zone-lightbox-stage" onWheel={onWheel}>{previewSource && !variantError ? <img src={previewSource} alt={variant?.label ? previewLabel + ' · ' + variant.label : previewLabel} draggable={false} onError={() => setVariantError(true)} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onClick={inventoryPreview && zoom === 1 ? () => updateZoom(1) : undefined} onDoubleClick={() => zoom === 1 ? updateZoom(1) : resetZoom()} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, cursor: zoom === 1 ? (inventoryPreview ? 'pointer' : 'zoom-in') : dragging ? 'grabbing' : 'grab', transition: dragging ? 'none' : 'transform 120ms ease-out' }} /> : <div className="agent-zone-preview-status" role="status">{previewStatus}</div>}</div>
        <div ref={controls} className="agent-zone-lightbox-controls">
          <button type="button" onClick={() => updateZoom(-.2)} disabled={zoom <= 1} aria-label="Zoom out"><Minus size={17} /></button>
          <span aria-live="polite">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => updateZoom(.2)} disabled={zoom >= 4} aria-label="Zoom in"><Plus size={17} /></button>
          <button type="button" onClick={resetZoom} disabled={zoom === 1} aria-label="Reset zoom"><RotateCcw size={16} /></button>
          {!inventoryPreview && <button ref={closeButton} className="agent-zone-lightbox-close" type="button" onClick={() => setOpen(false)} aria-label="Close image viewer"><X size={20} /></button>}
        </div>
        {gallery.length > 1 && <div className="agent-zone-preview-navigation" role="group" aria-label="Camera images">
          <button type="button" onClick={() => browse(-1)} disabled={index <= 0} aria-label="Previous camera image" title="Previous camera image"><ChevronLeft size={22} /></button>
          <button type="button" onClick={() => browse(1)} disabled={index >= gallery.length - 1} aria-label="Next camera image" title="Next camera image"><ChevronRight size={22} /></button>
        </div>}
        {inventoryPreview ? detections.length > 0 && <footer className="agent-zone-preview-details">
          <div className="agent-zone-preview-detections" role="group" aria-label="Detection overlays">
            {detections.map((item) => <button key={item.id} type="button" aria-pressed={variantId === item.id} onClick={() => selectVariant(item.id)}
              style={{ '--detection-accent': /^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(item.color || '') ? item.color : '#9472ef' }}>
              <span className="agent-zone-preview-detection-name">
                <span className="agent-inventory-dot" aria-hidden="true" />{item.label}
                <small data-state={item.state}>{stateLabel(item.state)}</small>
              </span>
              <span className="agent-zone-preview-fields">
                <span><small>Zones</small><span>{item.zones?.join(', ') || 'No zone drawn'}</span></span>
                {item.severity && <span><small>Severity</small><span className="agent-zone-preview-severity">{item.severity}</span></span>}
                {item.settingName && <span className="agent-zone-preview-setting"><small>Setting</small><span>{item.settingName}</span></span>}
              </span>
            </button>)}
          </div>
        </footer> : <div className="agent-zone-lightbox-caption">{label}</div>}
      </div>
    </div></div>;

  return <>
    {thumbnail ? <button ref={openButton} type="button" className="agent-inventory-thumb" onClick={() => {
      setVariantId(initialVariantId);
      setGalleryIndex(null);
      setVariantImage('');
      setVariantError(false);
      setOpen(true);
    }} aria-label={`Open ${label} full screen`}>
      <img src={source} alt={label} onError={onImageError} />
    </button> : <figure className="agent-zone-snapshot"><button ref={openButton} type="button" className="agent-zone-open" onClick={() => setOpen(true)} aria-label={`Open ${label} full screen`}><img src={source} alt={label} /><span><Expand size={15} />View full screen</span></button><figcaption>{label}</figcaption></figure>}
    {open && createPortal(thumbnail ? <dialog ref={viewerDialog} className="agent-zone-native-dialog" data-theme={theme} aria-label={previewLabel}
      onCancel={(event) => { event.preventDefault(); event.stopPropagation(); setOpen(false); }}>{lightbox}</dialog> : lightbox, document.body)}
  </>;
}
