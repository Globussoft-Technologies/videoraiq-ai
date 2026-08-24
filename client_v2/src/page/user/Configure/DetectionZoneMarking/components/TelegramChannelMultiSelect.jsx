import { createPortal } from 'react-dom';
import { ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

/* Same source as the Telegram settings tab (TelegramAlerts.jsx), so the handle
   quoted in the hint can never drift from the one users are told to add. */
const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT || '@VideoraIQDEVAlertsbot';

export default function TelegramChannelMultiSelect({
  value = [],
  options = [],
  onChange,
  disabled = false,
  onDisabledClick,
  placeholder = 'Select Telegram channels',
  noOptionsLabel = 'No Telegram channel connected',
  error = false,
}) {
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [coords, setCoords] = useState(null);

  const normalizedValue = Array.isArray(value)
    ? [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]
    : [];

  const selectedOptions = useMemo(
    () => options.filter((option) => normalizedValue.includes(String(option.value))),
    [normalizedValue, options],
  );

  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) =>
      String(option.label || '').toLowerCase().includes(query),
    );
  }, [options, search]);

  const placeMenu = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.max(rect.width, 260);
    setCoords({
      top: rect.bottom + 6,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      width,
    });
  };

  useLayoutEffect(() => {
    if (open) placeMenu();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const handleOutside = (event) => {
      if (
        triggerRef.current?.contains(event.target) ||
        menuRef.current?.contains(event.target)
      ) {
        return;
      }
      setOpen(false);
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    const handleViewport = () => placeMenu();

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', handleViewport);
    window.addEventListener('scroll', handleViewport, true);

    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', handleViewport);
      window.removeEventListener('scroll', handleViewport, true);
    };
  }, [open]);

  const updateValues = (nextValues) => {
    onChange([...new Set(nextValues.map((item) => String(item || '').trim()).filter(Boolean))]);
  };

  const toggleValue = (nextValue) => {
    const normalized = String(nextValue || '').trim();
    if (!normalized) return;
    if (normalizedValue.includes(normalized)) {
      updateValues(normalizedValue.filter((item) => item !== normalized));
      return;
    }
    updateValues([...normalizedValue, normalized]);
  };

  const selectAll = () => updateValues(options.map((option) => option.value));
  const clearAll = () => updateValues([]);

  /* A natively `disabled` button swallows clicks outright, so the control could
     never explain why it is unavailable. Keep it enabled, mark it aria-disabled
     for assistive tech, and answer the click with the steps to connect a channel.
     The toast carries a fixed id so repeated clicks replace rather than stack. */
  const handleTriggerClick = () => {
    if (!disabled) {
      setOpen((current) => !current);
      return;
    }
    if (onDisabledClick) {
      onDisabledClick();
      return;
    }
    toast.info('No Telegram channel connected', {
      id: 'telegram-no-channel',
      duration: 9000,
      description:
        'Open Alert Recipients and switch to the Telegram tab and connect your Telegram channel'
    });
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <button
        ref={triggerRef}
        type="button"
        aria-disabled={disabled || undefined}
        onClick={handleTriggerClick}
        style={{
          width: '100%',
          minHeight: 36,
          padding: '5px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'wrap',
          borderRadius: 8,
          boxSizing: 'border-box',
          background: 'var(--bg2)',
          border: `1px solid ${error ? 'var(--danger, #ef4444)' : 'var(--bd)'}`,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.7 : 1,
        }}
      >
        {selectedOptions.length === 0 ? (
          <span style={{ fontSize: 12, color: 'var(--tx3)' }}>
            {options.length ? placeholder : noOptionsLabel}
          </span>
        ) : (
          selectedOptions.slice(0, 3).map((option) => (
            <span
              key={option.value}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 10.5,
                fontWeight: 600,
                color: 'var(--blue)',
                background: 'rgba(59,130,246,.12)',
                borderRadius: 5,
                padding: '2px 4px 2px 7px',
              }}
            >
              {option.label}
              {!disabled && (
                <span
                  role="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleValue(option.value);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 14,
                    height: 14,
                    cursor: 'pointer',
                  }}
                >
                  <X size={11} />
                </span>
              )}
            </span>
          ))
        )}
        {selectedOptions.length > 3 && (
          <span style={{ fontSize: 10.5, color: 'var(--tx3)' }}>
            +{selectedOptions.length - 3}
          </span>
        )}
        <span
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            flexShrink: 0,
          }}
        >
          {!disabled && normalizedValue.length > 0 && (
            <span
              role="button"
              title="Clear all"
              onClick={(event) => {
                event.stopPropagation();
                clearAll();
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 16,
                height: 16,
                cursor: 'pointer',
                color: 'var(--tx3)',
              }}
            >
              <X size={13} />
            </span>
          )}
          <ChevronDown size={13} style={{ color: 'var(--tx3)' }} />
        </span>
      </button>

      {open && coords && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            width: coords.width,
            zIndex: 1000,
            background: 'var(--bg1solid)',
            border: '1px solid var(--bd)',
            borderRadius: 10,
            boxShadow: '0 10px 32px rgba(0,0,0,.3)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '10px 12px 6px',
              borderBottom: '1px solid var(--bd)',
            }}
          >
            <button
              type="button"
              onClick={selectAll}
              style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Select All
            </button>
            <button
              type="button"
              onClick={clearAll}
              style={{ fontSize: 12, color: 'var(--crit)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Clear All
            </button>
          </div>

          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--bd)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--bg2)', borderRadius: 7, padding: '6px 10px', border: '1px solid var(--bd)' }}>
              <Search size={13} style={{ color: 'var(--tx3)', flexShrink: 0 }} />
              <input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search channel..."
                style={{ border: 0, outline: 'none', background: 'transparent', fontSize: 12, color: 'var(--tx)', width: '100%' }}
              />
            </div>
          </div>

          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filteredOptions.length === 0 ? (
              <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--tx3)', textAlign: 'center' }}>
                No results
              </div>
            ) : (
              filteredOptions.map((option) => {
                const checked = normalizedValue.includes(String(option.value));
                return (
                  <div
                    key={option.value}
                    onClick={() => toggleValue(option.value)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 14px',
                      cursor: 'pointer',
                      background: checked ? 'rgba(59,130,246,.08)' : 'transparent',
                    }}
                  >
                    <div
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 4,
                        flexShrink: 0,
                        border: `1.5px solid ${checked ? 'var(--blue)' : 'var(--bd2)'}`,
                        background: checked ? 'var(--blue)' : 'var(--bg1solid)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {checked && (
                        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                          <path d="M1 3L3 5L7 1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--tx2)' }}>{option.label}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
