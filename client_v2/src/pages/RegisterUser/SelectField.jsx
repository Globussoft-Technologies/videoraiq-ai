import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

/* ~5 visible rows before the panel scrolls. */
const PANEL_MAX_H = 220;
const GAP = 4;

const triggerClass =
  'w-full h-11 px-3.5 rounded-[10px] bg-[var(--bg3)] border text-sm text-[var(--tx)] outline-none transition-colors cursor-pointer flex items-center justify-between gap-2 text-left';

/**
 * Themed single-select. Native <select> option lists are drawn by the browser/OS,
 * so they ignore the app theme and can't be height-limited or scrolled via CSS —
 * this renders its own panel instead.
 *
 * The panel is portaled to <body> with fixed positioning: inside a modal (or any
 * `overflow: auto` ancestor) an absolutely-positioned panel gets clipped by the
 * scroll container. It opens downward, flipping above the trigger when the
 * viewport has no room below — or, with `preferUp`, opens upward by default and
 * only drops down when there isn't room above.
 *
 * `options` is [{ value, label }]; passing '' as the value clears the selection.
 */
export default function  SelectField({
  value,
  options = [],
  onChange,
  placeholder = 'Select',
  disabled = false,
  preferUp = false,
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const selected = options.find((o) => o.value === value);

  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom - GAP;
    const above = rect.top - GAP;
    // `preferUp` opens upward unless the space above is too tight; otherwise the
    // panel drops down and only flips up when below can't fit it.
    const dropUp = preferUp
      ? above >= PANEL_MAX_H || above > below
      : below < PANEL_MAX_H && above > below;
    setPos({
      left: rect.left,
      width: rect.width,
      maxHeight: Math.min(PANEL_MAX_H, Math.max(dropUp ? above : below, 120)),
      ...(dropUp
        ? { bottom: window.innerHeight - rect.top + GAP }
        : { top: rect.bottom + GAP }),
    });
  }, [preferUp]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!triggerRef.current?.contains(e.target) && !panelRef.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    // `true` — catch scrolls on the modal body too, not just the window.
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  /* Radix's dialog locks scrolling via react-remove-scroll, which preventDefaults
     wheel events on anything outside the dialog's DOM — and this panel is
     portaled to <body>. Drive the scroll ourselves so the list still moves.
     Done for every case (not just in a dialog) so the speed stays consistent. */
  useEffect(() => {
    const el = panelRef.current;
    if (!open || !el) return;
    const onWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      // deltaMode 1 = lines, 2 = pages; normalise both to pixels.
      const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      el.scrollTop += e.deltaY * scale;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [open, pos]);

  const pick = (val) => {
    onChange(val);
    setOpen(false);
  };

  const rowClass = 'px-2.5 py-2 rounded-md text-sm cursor-pointer truncate';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`${triggerClass} ${open ? 'border-[var(--blue)]' : 'border-[var(--bd)]'} ${
          disabled ? 'opacity-60 cursor-not-allowed' : ''
        }`}
      >
        <span className={`truncate ${selected ? '' : 'text-[var(--tx3)]'}`}>{selected?.label || placeholder}</span>
        <ChevronDown
          className={`w-4 h-4 text-[var(--tx3)] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && pos &&
        createPortal(
          <div
            ref={panelRef}
            /* Radix puts `pointer-events: none` on <body> while a dialog is open
               and re-enables it only on the dialog content — this panel is a
               body child, so it has to opt back in or it ignores every event. */
            style={{ position: 'fixed', zIndex: 200, pointerEvents: 'auto', ...pos }}
            /* The panel lives outside the dialog's DOM, so Radix would treat a
               click on it as "outside" and close the whole modal. */
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-1.5 rounded-[10px] border border-[var(--bd2)] bg-[var(--bg1solid)] shadow-lg overflow-y-auto vq-scroll"
          >
            <div
              onClick={() => pick('')}
              className={`${rowClass} hover:bg-[var(--bg2)] ${value ? 'text-[var(--tx)]' : 'text-[var(--tx3)]'}`}
            >
              {placeholder}
            </div>
            {options.map((opt) => (
              <div
                key={opt.value}
                onClick={() => pick(opt.value)}
                className={`${rowClass} ${
                  value === opt.value ? 'bg-[var(--blue)] text-white' : 'text-[var(--tx)] hover:bg-[var(--bg2)]'
                }`}
              >
                {opt.label}
              </div>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
