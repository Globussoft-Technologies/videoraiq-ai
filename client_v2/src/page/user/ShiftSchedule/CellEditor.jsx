import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, RotateCcw, MoonStar, Ban } from 'lucide-react';

/**
 * The shift picker for one cell.
 *
 * Portalled to <body> with fixed positioning taken from the clicked cell's
 * rect: the grid scrolls in both directions inside an `overflow: auto` box, so
 * a panel rendered inline would be clipped the moment the cell is near an edge.
 * (Unlike the assign modals, this never opens inside a Radix dialog, so the
 * pointer-events lockout that forces MultiSelect to render in place doesn't
 * apply here.)
 */
const CellEditor = ({ anchor, cell, shifts, onPick, onClear, onClose }) => {
  const panelRef = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = 236;
    const height = panelRef.current?.offsetHeight || 320;

    // Flip on both axes so a cell in the last column or bottom row still shows
    // the whole panel rather than half of it off-screen.
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    const openUp = rect.bottom + height + 8 > window.innerHeight && rect.top > height;
    setPos({
      position: 'fixed',
      left,
      width,
      ...(openUp ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
    });
  }, [anchor]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target) && !anchor?.contains(e.target)) {
        onClose();
      }
    };
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchor, onClose]);

  if (!anchor || !pos) return null;

  const currentId = cell?.shift?._id ? String(cell.shift._id) : null;
  const isOff = cell?.type === 'off';

  return createPortal(
    <div
      ref={panelRef}
      style={pos}
      className="z-[10040] rounded-[12px] border border-[var(--bd)] bg-[var(--bg1solid)] shadow-xl overflow-hidden"
    >
      <div className="px-3 py-2 border-b border-[var(--bd)]">
        <div className="text-xs font-semibold text-[var(--tx)]">Assign shift</div>
        <div className="text-[10px] text-[var(--tx3)]">
          {cell?.source === 'override'
            ? 'Set for this day'
            : cell?.source === 'standing'
              ? 'Inherited from the standing shift'
              : 'No shift'}
        </div>
      </div>

      <div className="max-h-[220px] overflow-y-auto customscrollbar py-1">
        {shifts.map((shift) => {
          const active = currentId === String(shift._id) && !isOff;
          return (
            <button
              key={shift._id}
              type="button"
              onClick={() => onPick({ shiftId: shift._id, isOff: false })}
              className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-[var(--bg3)] transition-colors cursor-pointer"
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: shift.color || 'var(--blue)' }}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-[var(--tx)] truncate">
                  {shift.name}
                  {shift.isNightShift && (
                    <MoonStar className="inline w-3 h-3 ml-1 text-[var(--violet)]" />
                  )}
                </span>
                <span className="block text-[10px] text-[var(--tx3)]">
                  {shift.startTime} - {shift.endTime}
                </span>
              </span>
              {active && <Check className="w-3.5 h-3.5 text-[var(--ok)] shrink-0" />}
            </button>
          );
        })}
        {shifts.length === 0 && (
          <div className="px-3 py-3 text-[11px] text-[var(--tx3)]">
            No shifts yet — create one in Shift Management.
          </div>
        )}
      </div>

      <div className="border-t border-[var(--bd)] p-1.5 flex flex-col gap-0.5">
        <button
          type="button"
          onClick={() => onPick({ shiftId: null, isOff: true })}
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-left text-xs text-[var(--tx2)] hover:bg-[var(--bg3)] transition-colors cursor-pointer"
        >
          <Ban className="w-3.5 h-3.5" />
          Mark as day off
          {isOff && <Check className="w-3.5 h-3.5 text-[var(--ok)] ml-auto" />}
        </button>
        {/* Only offered for a real override — "resetting" an inherited cell
            would be a no-op and just confuse. */}
        {cell?.source === 'override' && (
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-left text-xs text-[var(--tx2)] hover:bg-[var(--bg3)] transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset to standing shift
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default CellEditor;
