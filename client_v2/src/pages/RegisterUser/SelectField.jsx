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
 * Inline panels position within the form's scroll boundary. Other panels are
 * portaled to <body> and positioned within the viewport.
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
  inline = false,
  onOpen,
  onLoadMore,
  loading = false,
  loadingLabel = 'Loading shifts…',
  searchPlaceholder,
  unavailableLabel,
  emptyLabel = 'No matches found',
  error = '',
  onRetry,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const optionsRef = useRef(null);
  const searchRef = useRef(null);

  const selected = options.find((o) => o.value === value);
  const selectedLabel = selected?.label || (value ? unavailableLabel : undefined);
  const search = query.trim().toLowerCase();
  const shown = search ? options.filter((option) => option.label.toLowerCase().includes(search)) : options;

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const boundary = inline && trigger.closest('[data-select-scroll-boundary]')?.getBoundingClientRect();
    const top = Math.max(0, boundary?.top ?? 0);
    const bottom = Math.min(window.innerHeight, boundary?.bottom ?? window.innerHeight);
    const below = bottom - rect.bottom - GAP;
    const above = rect.top - top - GAP;
    // `preferUp` opens upward unless the space above is too tight; otherwise the
    // panel drops down and only flips up when below can't fit it.
    const dropUp = preferUp
      ? above >= PANEL_MAX_H || above > below
      : below < PANEL_MAX_H && above > below;
    if (inline) {
      const maxHeight = Math.min(PANEL_MAX_H, Math.max(0, dropUp ? above : below));
      setPos({ maxHeight, left: 0, right: 0, [dropUp ? 'bottom' : 'top']: `calc(100% + ${GAP}px)` });
      return;
    }
    setPos({
      left: rect.left,
      width: rect.width,
      maxHeight: Math.min(PANEL_MAX_H, Math.max(dropUp ? above : below, 120)),
      ...(dropUp
        ? { bottom: window.innerHeight - rect.top + GAP }
        : { top: rect.bottom + GAP }),
    });
  }, [inline, preferUp]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  const panelVisible = open && Boolean(pos);
  useLayoutEffect(() => {
    if (panelVisible) searchRef.current?.focus({ preventScroll: true });
  }, [panelVisible]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!triggerRef.current?.contains(e.target) && !panelRef.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    const onScroll = (e) => {
      if (e.target !== optionsRef.current) place();
    };
    // `true` — catch scrolls on the modal body too, not just the window.
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  /* Radix's dialog locks scrolling via react-remove-scroll, which preventDefaults
     wheel events on anything outside the dialog's DOM — and this panel is
     portaled to <body>. Drive the scroll ourselves so the list still moves.
     Done for every case (not just in a dialog) so the speed stays consistent. */
  useEffect(() => {
    const el = optionsRef.current;
    if (!panelVisible || !el || inline) return;
    const onWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      // deltaMode 1 = lines, 2 = pages; normalise both to pixels.
      const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      el.scrollTop += e.deltaY * scale;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [panelVisible, inline]);

  const pick = (val) => {
    onChange(val);
    setOpen(false);
    if (searchPlaceholder) triggerRef.current?.focus({ preventScroll: true });
  };

  const rowClass = 'block w-full text-left px-2.5 py-2 rounded-md text-sm cursor-pointer truncate';

  return (
    <div className={inline ? 'relative' : undefined}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!open) {
            setPos(null);
            setQuery('');
            onOpen?.();
          }
          setOpen((v) => !v);
        }}
        aria-label={searchPlaceholder ? `${placeholder}: ${selectedLabel || 'None'}` : undefined}
        aria-expanded={open}
        className={`${triggerClass} ${open ? 'border-[var(--blue)]' : 'border-[var(--bd)]'} ${
          disabled ? 'opacity-60 cursor-not-allowed' : ''
        }`}
      >
        <span className={`truncate ${selectedLabel ? '' : 'text-[var(--tx3)]'}`}>{selectedLabel || placeholder}</span>
        <ChevronDown
          className={`w-4 h-4 text-[var(--tx3)] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {panelVisible && (() => {
        const panel = (
          <div
            ref={panelRef}
            /* Radix puts `pointer-events: none` on <body> while a dialog is open
               and re-enables it only on the dialog content — this panel is a
               body child, so it has to opt back in or it ignores every event. */
            style={inline ? { position: 'absolute', zIndex: 20, ...pos } : { position: 'fixed', zIndex: 200, pointerEvents: 'auto', ...pos }}
            /* The panel lives outside the dialog's DOM, so Radix would treat a
               click on it as "outside" and close the whole modal. */
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="flex flex-col overflow-hidden rounded-[10px] border border-[var(--bd2)] bg-[var(--bg1solid)] shadow-lg"
          >
            {searchPlaceholder && (
              <input
                ref={searchRef}
                type="search"
                value={query}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                onChange={(event) => {
                  setQuery(event.target.value);
                  if (optionsRef.current) optionsRef.current.scrollTop = 0;
                }}
                onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }}
                className="m-1.5 min-w-0 shrink-0 rounded-md border border-[var(--bd)] bg-[var(--bg2)] px-2.5 py-2 text-sm text-[var(--tx)] outline-none focus:border-[var(--blue)]"
              />
            )}
            <div
              ref={optionsRef}
              onScroll={(event) => {
                const el = event.currentTarget;
                if (el.scrollHeight - el.scrollTop - el.clientHeight < 32) onLoadMore?.();
              }}
              className="min-h-0 overflow-y-auto overscroll-contain p-1.5 vq-scroll"
            >
              <button
                type="button"
                onClick={() => pick('')}
                className={`${rowClass} hover:bg-[var(--bg2)] ${value ? 'text-[var(--tx)]' : 'text-[var(--tx3)]'}`}
              >
                {searchPlaceholder ? 'None' : placeholder}
              </button>
              {shown.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => pick(opt.value)}
                  className={`${rowClass} ${
                    value === opt.value ? 'bg-[var(--blue)] text-white' : 'text-[var(--tx)] hover:bg-[var(--bg2)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              {searchPlaceholder && !loading && !error && !shown.length && (
                <div className="px-2.5 py-2 text-xs text-[var(--tx3)]">{emptyLabel}</div>
              )}
              {loading && <div role="status" className="px-2.5 py-2 text-xs text-[var(--tx3)]">{loadingLabel}</div>}
              {error && <button type="button" onClick={onRetry} className="px-2.5 py-2 text-xs text-[var(--crit)] cursor-pointer">{error} Retry</button>}
            </div>
          </div>
        );
        return inline ? panel : createPortal(panel, document.body);
      })()}
    </div>
  );
}
