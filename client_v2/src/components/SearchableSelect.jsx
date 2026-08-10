import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, Search } from 'lucide-react';

export default function SearchableSelect({
  value,
  options,
  onChange,
  disabled,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyLabel = 'No options found',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
        setQuery('');
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
      setQuery('');
    }
  }, [disabled]);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;
    return options.filter((option) => option.toLowerCase().includes(normalizedQuery));
  }, [options, query]);

  const selectOption = (option) => {
    setOpen(false);
    setQuery('');
    onChange(option);
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative', zIndex: open ? 20 : 1 }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((current) => !current)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          width: '100%',
          height: 38,
          padding: '0 34px 0 12px',
          boxSizing: 'border-box',
          borderRadius: 9,
          background: 'var(--bg2)',
          border: `1px solid ${open ? 'var(--brand)' : 'var(--bd)'}`,
          fontSize: 12.5,
          color: 'var(--tx)',
          outline: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.7 : 1,
          textAlign: 'left',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value || placeholder}
      </button>
      <ChevronDown
        size={14}
        style={{
          position: 'absolute',
          right: 12,
          top: 19,
          transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`,
          transition: 'transform .18s ease',
          pointerEvents: 'none',
          color: 'var(--tx3)',
        }}
      />
      {open && (
        <div
          role="listbox"
          aria-label={placeholder}
          style={{
            position: 'absolute',
            top: 'calc(100% + 5px)',
            left: 0,
            right: 0,
            borderRadius: 10,
            background: 'var(--bg1solid, var(--bg1))',
            border: '1px solid var(--bd)',
            boxShadow: '0 12px 30px rgba(15,23,42,.16)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: 8, borderBottom: '1px solid var(--bd)' }}>
            <div style={{ position: 'relative' }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--tx3)',
                  pointerEvents: 'none',
                }}
              />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setOpen(false);
                    setQuery('');
                  }
                }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                style={{
                  width: '100%',
                  height: 34,
                  boxSizing: 'border-box',
                  padding: '0 10px 0 32px',
                  borderRadius: 8,
                  background: 'var(--bg2)',
                  border: '1px solid var(--bd)',
                  color: 'var(--tx)',
                  fontSize: 12,
                  outline: 'none',
                }}
              />
            </div>
          </div>
          <div className="customscrollbar" style={{ maxHeight: 240, overflowY: 'auto', padding: '5px 0' }}>
            {filteredOptions.length === 0 ? (
              <div style={{ padding: '12px', color: 'var(--tx3)', fontSize: 12, textAlign: 'center' }}>
                {emptyLabel}
              </div>
            ) : (
              filteredOptions.map((option) => {
                const selected = option === value;
                return (
                  <button
                    key={option}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => selectOption(option)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      width: '100%',
                      padding: '8px 12px',
                      border: 0,
                      background: selected ? 'rgba(79,105,255,.12)' : 'transparent',
                      color: selected ? 'var(--brand)' : 'var(--tx)',
                      fontSize: 12.5,
                      fontWeight: selected ? 600 : 400,
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{option}</span>
                    {selected && <CheckCircle2 size={14} style={{ flexShrink: 0 }} />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
