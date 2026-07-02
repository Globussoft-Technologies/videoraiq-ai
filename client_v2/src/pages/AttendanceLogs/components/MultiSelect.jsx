import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Check, X, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Multi-select dropdown with Select All / Clear All and a search box.
 * Themed via CSS vars so it works in both light and dark mode.
 *
 * Props:
 * - options: [{ id, label }]
 * - value:   array of selected ids
 * - onChange(nextIds)
 * - placeholder
 * - searchable (default true)
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
  maxHeight = 'max-h-[220px]',
  msg = 'No options',
}) => {
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
        className="flex items-center justify-between gap-2 w-full h-10 px-3 rounded-lg border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx)] text-sm cursor-pointer hover:border-[var(--brand)] transition-colors"
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
        <div className="absolute z-[95] mt-1 w-full min-w-[220px] rounded-[10px] border border-[var(--bd)] bg-[var(--bg1solid)] shadow-lg overflow-hidden">
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
                  placeholder="Search..."
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
        </div>
      )}
    </div>
  );
};

export default MultiSelect;
