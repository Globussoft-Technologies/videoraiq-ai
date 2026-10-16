import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Plus } from 'lucide-react';

const PANEL_MAX_H = 176; // ~5 visible rows

/**
 * Single-choice dropdown. options: [{ id, label }].
 * Passing onCreate adds a search box that can also add the typed text as a new
 * option (onCreate receives the text).
 *
 * The list is portalled to <body> and positioned from the trigger (like
 * MultiSelect), so a modal's `overflow` can't clip it. It flips above the
 * field when there isn't room below.
 */
export default function SingleSelect({ options, loading, loadingText = 'Loading…', placeholder, value, onChange, invalid = false, onCreate }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  // An empty value shows the placeholder even when a "none" option ('') exists.
  const activeLabel = (value && options.find(o => o.id === value)?.label) || placeholder;

  const q = query.trim();
  const shown = q ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  const exact = q && options.find(o => o.label.toLowerCase() === q.toLowerCase());
  const canAdd = onCreate && q && !exact;
  const pick = (id) => { onChange(id); setOpen(false); };
  const create = () => { onCreate(q); setOpen(false); };

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!triggerRef.current?.contains(e.target) && !panelRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const update = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const height = panelRef.current?.offsetHeight || PANEL_MAX_H + 50;
      const below = window.innerHeight - r.bottom;
      setPos(below >= height || below >= r.top
        ? { top: r.bottom + 4, left: r.left, width: r.width }
        : { bottom: window.innerHeight - r.top + 4, left: r.left, width: r.width });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { setOpen(v => !v); setQuery(''); }}
        style={{
          width: '100%', boxSizing: 'border-box', height: 38, padding: '0 34px 0 12px', borderRadius: 9,
          background: value ? 'rgba(99,102,241,.08)' : 'var(--bg2)',
          border: `1px solid ${invalid ? 'var(--crit)' : (value ? 'rgba(99,102,241,.4)' : 'var(--bd)')}`,
          fontSize: 13, color: value ? 'var(--tx)' : 'var(--tx3)',
          outline: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left',
        }}
      >
        {activeLabel}
        <ChevronDown size={14} style={{ color: 'var(--tx3)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && pos && createPortal(
        <div ref={panelRef} style={{
          position: 'fixed', ...pos, zIndex: 10030, boxSizing: 'border-box',
          maxHeight: PANEL_MAX_H + (onCreate ? 40 : 0), overflowY: 'auto', background: 'var(--bg1solid)', border: '1px solid var(--bd2)',
          borderRadius: 10, boxShadow: '0 18px 50px rgba(0,0,0,.35)', padding: 5,
        }}>
          {onCreate && !loading && (
            <input
              autoFocus
              value={query}
              maxLength={100}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                if (exact) pick(exact.id);
                else if (canAdd) create();
              }}
              placeholder="Search or type a new one…"
              style={{
                width: '100%', boxSizing: 'border-box', height: 32, padding: '0 10px', marginBottom: 4, borderRadius: 7,
                background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12.5, color: 'var(--tx)', outline: 'none',
              }}
            />
          )}
          {canAdd && (
            <div
              onClick={create}
              style={{ padding: '8px 10px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer', color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={13} /> Add &quot;{q}&quot;
            </div>
          )}
          {loading ? (
            <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--tx3)' }}>{loadingText}</div>
          ) : shown.map(o => (
            <div
              key={o.id || 'none'}
              onClick={() => pick(o.id)}
              style={{
                padding: '8px 10px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer',
                background: value === o.id ? 'var(--blue)' : 'transparent',
                color: value === o.id ? '#fff' : 'var(--tx)',
              }}
            >
              {o.label}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
