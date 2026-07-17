import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, X, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Multi-select dropdown with Select All / Clear All and a search box.
 * Themed via CSS vars so it works in both light and dark mode.
 *
 * The open panel is rendered via a portal with fixed positioning (computed
 * from the trigger button's bounding rect, flipping upward when there isn't
 * room below) so it isn't clipped by an ancestor's `overflow: hidden` — e.g.
 * table rows near the bottom of a scrollable card.
 *
 * Props:
 * - options: [{ id, label }]
 * - value:   array of selected ids
 * - onChange(nextIds)
 * - placeholder
 * - searchable (default true)
 * - searchPlaceholder
 * - maxHeight: tailwind class for the options list (e.g. 'max-h-40')
 * - msg: empty-state message
 */
const MultiSelect = ({
  options = [],
  value = [],
  onChange,
  placeholder = 'Select...',
  className = '',
  searchable = true,
  searchPlaceholder = 'Search...',
  maxHeight = 'max-h-[220px]',
  msg = 'No options',
  openUp = false,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState(null);
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  // While an element is fullscreen the browser paints only that element's
  // subtree, so a panel portalled to <body> would mount but never be visible.
  const [portalHost, setPortalHost] = useState(() => document.body);
  useEffect(() => {
    const sync = () => setPortalHost(document.fullscreenElement || document.body);
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  useEffect(() => {
    const onClick = (e) => {
      if (
        wrapperRef.current && !wrapperRef.current.contains(e.target) &&
        panelRef.current && !panelRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const panelHeight = panelRef.current?.offsetHeight || 320;
      // Flip up when `openUp` is set, or when the panel won't fit below and
      // there's more room above. When opening upward we anchor by the panel's
      // BOTTOM edge (`bottom`) rather than computing a `top` from an estimated
      // panelHeight — that estimate (320 before the panel is measured) left a
      // large gap above the trigger when the real panel was short. Anchoring by
      // bottom makes the panel hug the trigger regardless of its height.
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const fitsBelow = spaceBelow >= panelHeight;
      const openUpward = openUp || (!fitsBelow && spaceAbove > spaceBelow);
      setPos(openUpward
        ? {
            position: 'fixed',
            bottom: Math.max(8, window.innerHeight - rect.top + 4),
            left: rect.left,
            width: rect.width,
            minWidth: 220,
          }
        : {
            position: 'fixed',
            top: rect.bottom + 4,
            left: rect.left,
            width: rect.width,
            minWidth: 220,
          });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, openUp]);

  // An option with `isHeader` is a non-selectable section label (e.g. an NVR
  // name above its cameras). Searching matches real options only; a header is
  // then kept solely when it still has at least one option under it, so a
  // filtered list never shows an empty group.
  const isPickable = (o) => !o.isHeader && !o.disabled;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? options.filter((o) => o.isHeader || o.label?.toLowerCase().includes(q))
      : options;
    return matched.filter((o, i) => (o.isHeader ? isPickable(matched[i + 1] ?? {}) : true));
  }, [options, query]);

  const toggle = (id) => {
    const opt = options.find((o) => o.id === id);
    if (opt && !isPickable(opt)) return;
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  const selectAll = () => {
    const ids = filtered.filter(isPickable).map((o) => o.id);
    onChange(Array.from(new Set([...value, ...ids])));
  };

  const clearAll = () => onChange([]);

  const selectedLabels = options.filter((o) => isPickable(o) && value.includes(o.id)).map((o) => o.label);

  return (
    <div className={`relative ${className}`} ref={wrapperRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between gap-2 w-full h-10 px-3 rounded-lg border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx)] text-sm cursor-pointer hover:border-[var(--brand)] transition-colors"
      >
        {/* First selection reads in full; the rest collapse into a "+N more"
            badge, so the trigger still names something concrete instead of a
            bare count. Title carries the full list for the truncated case. */}
        {selectedLabels.length === 0 ? (
          <span className="truncate text-[var(--ph)] font-medium">{placeholder}</span>
        ) : (
          <span className="flex items-center gap-1.5 min-w-0" title={selectedLabels.join(', ')}>
            <span className="truncate text-[var(--tx)]">{selectedLabels[0]}</span>
            {selectedLabels.length > 1 && (
              <span className="shrink-0 rounded-full bg-[var(--brand)] px-2 py-0.5 text-[11px] font-semibold leading-normal text-white">
                +{selectedLabels.length - 1} more
              </span>
            )}
          </span>
        )}
        <div className="flex items-center gap-1 shrink-0">
          {value.length > 0 && (
            <X
              className="w-3.5 h-3.5 text-[var(--tx3)] hover:text-[var(--crit)]"
              onClick={(e) => {
                e.stopPropagation();
                clearAll();
              }}
            />
          )}
          <ChevronDown className={`w-4 h-4 text-[var(--tx3)] transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          data-vq-portal-panel
          style={pos}
          className="z-[10000] rounded-[10px] border border-[var(--bd)] bg-[var(--bg1solid)] shadow-lg overflow-hidden"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--bd)]">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs font-semibold text-[var(--brand)] hover:opacity-80 cursor-pointer"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="text-xs font-semibold text-[var(--crit)] hover:opacity-80 cursor-pointer"
            >
              Clear All
            </button>
          </div>

          {searchable && (
            <div className="p-2 border-b border-[var(--bd)]">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--tx3)]" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full h-8 pl-8 pr-2 rounded-lg border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx)] text-xs focus:outline-none focus:border-[var(--brand)]"
                />
              </div>
            </div>
          )}

          <div className={cn('overflow-y-auto customscrollbar py-1', maxHeight)}>
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-[var(--tx3)]">{msg}</div>
            ) : (
              filtered.map((opt) => {
                if (opt.isHeader) {
                  return (
                    <div
                      key={opt.id}
                      className="sticky top-0 px-3 py-1.5 bg-[var(--bg2)] text-[11px] font-semibold uppercase tracking-wide text-[var(--tx2)] select-none"
                    >
                      {opt.label}
                    </div>
                  );
                }
                const active = value.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggle(opt.id)}
                    className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-[var(--tx)] hover:bg-[var(--bg3)] transition-colors cursor-pointer"
                  >
                    <span
                      className={`flex items-center justify-center w-4 h-4 rounded border shrink-0 ${
                        active ? 'bg-[var(--brand)] border-[var(--brand)]' : 'border-[var(--bd2)]'
                      }`}
                    >
                      {active && <Check className="w-3 h-3 text-white" />}
                    </span>
                    <span className="truncate">{opt.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>,
        portalHost
      )}
    </div>
  );
};

export default MultiSelect;
