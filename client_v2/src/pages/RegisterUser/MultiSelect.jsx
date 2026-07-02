import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Check, X, Search } from 'lucide-react';

/**
 * Multi-select dropdown with Select All / Clear All and a search box.
 * Themed via CSS vars so it works in both light and dark mode.
 *
 * Props:
 * - options: [{ id, label }]
 * - value:   array of selected ids
 * - onChange(nextIds)
 * - placeholder
 */
const MultiSelect = ({ options = [], value = [], onChange, placeholder = 'Select...', className = '' }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label?.toLowerCase().includes(q));
  }, [options, query]);

  const toggle = (id) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  const selectAll = () => {
    // Select all currently-visible (filtered) options, merged with existing selection.
    const ids = filtered.map((o) => o.id);
    onChange(Array.from(new Set([...value, ...ids])));
  };

  const clearAll = () => onChange([]);

  const selectedLabels = options.filter((o) => value.includes(o.id)).map((o) => o.label);

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between gap-2 w-full h-8 2xl:h-10 px-3 rounded-[8px] border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx)] text-xs 2xl:text-sm cursor-pointer hover:border-[var(--blue)] transition-colors"
      >
        <span className={`truncate ${selectedLabels.length ? 'text-[var(--tx)]' : 'text-[var(--tx3)]'}`}>
          {selectedLabels.length === 0
            ? placeholder
            : selectedLabels.length <= 2
              ? selectedLabels.join(', ')
              : `${selectedLabels.length} selected`}
        </span>
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

      {open && (
        <div className="absolute z-[90] mt-1 w-full min-w-[220px] rounded-[10px] border border-[var(--bd)] bg-[var(--bg1solid)] shadow-xl overflow-hidden">
          {/* Select All / Clear All */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--bd)]">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs font-semibold text-[var(--tx)] hover:text-[var(--blue)] cursor-pointer"
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

          {/* Search */}
          <div className="p-2 border-b border-[var(--bd)]">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--tx3)]" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                className="w-full h-8 pl-8 pr-2 rounded-[8px] border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx)] text-xs focus:outline-none focus:border-[var(--blue)]"
              />
            </div>
          </div>

          {/* Options */}
          <div className="max-h-[220px] overflow-y-auto vq-scroll py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-[var(--tx3)]">No options</div>
            ) : (
              filtered.map((opt) => {
                const active = value.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggle(opt.id)}
                    className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs 2xl:text-sm text-[var(--tx)] hover:bg-[var(--bg3)] transition-colors cursor-pointer"
                  >
                    <span
                      className={`flex items-center justify-center w-4 h-4 rounded border shrink-0 ${
                        active ? 'bg-[var(--blue)] border-[var(--blue)]' : 'border-[var(--bd2)]'
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
        </div>
      )}
    </div>
  );
};

export default MultiSelect;
