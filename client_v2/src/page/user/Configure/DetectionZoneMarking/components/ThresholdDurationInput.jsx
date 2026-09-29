import { useEffect, useRef, useState } from 'react';

const UNITS = [
  { key: 'hours', label: 'Hours', multiplier: 3600, max: 12 },
  { key: 'minutes', label: 'Minutes', multiplier: 60, max: 59 },
  { key: 'seconds', label: 'Seconds', multiplier: 1, max: 59 },
];

const optionsThrough = max => Array.from({ length: max + 1 }, (_, value) => value);

function DurationDropdown({ label, value, options, max, height, fontSize, error, openUpward = false, onChange }) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(value === '' ? '' : String(value).padStart(2, '0'));
  const rootRef = useRef(null);

  useEffect(() => {
    if (!focused) setDraft(value === '' ? '' : String(value).padStart(2, '0'));
  }, [value, focused]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [open]);

  const handleTypedValue = event => {
    const nextDraft = event.target.value.replace(/\D/g, '').slice(0, 2);
    if (nextDraft !== '' && Number(nextDraft) > max) return;
    setDraft(nextDraft);
    if (nextDraft !== '') onChange(Number(nextDraft));
  };

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <div
        style={{
          width: '100%', height, borderRadius: 10, boxSizing: 'border-box', overflow: 'hidden',
          background: 'var(--bg1solid, #fff)', border: `1px solid ${error ? '#ef4444' : 'var(--bd)'}`,
          boxShadow: open ? '0 0 0 2px rgba(59, 130, 246, .14)' : '0 1px 2px rgba(15, 23, 42, .05)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 5,
        }}
      >
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          placeholder="--"
          aria-label={`Threshold ${label.toLowerCase()}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          onFocus={event => {
            setFocused(true);
            setOpen(true);
            event.currentTarget.select();
          }}
          onBlur={() => {
            setFocused(false);
            if (draft === '') setDraft(value === '' ? '' : String(value).padStart(2, '0'));
          }}
          onChange={handleTypedValue}
          style={{
            width: '100%', minWidth: 0, height: '100%', padding: '0 4px 0 9px', border: 0,
            background: 'transparent', color: 'var(--tx)', fontSize, outline: 'none', boxSizing: 'border-box',
          }}
        />
        <button
          type="button"
          aria-label={`Open ${label.toLowerCase()} options`}
          onMouseDown={event => event.preventDefault()}
          onClick={() => setOpen(current => !current)}
          style={{
            width: 27, alignSelf: 'stretch', flex: '0 0 auto', border: 0, background: 'transparent',
            color: 'var(--tx3)', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0,
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 10, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' }}>
            ▼
          </span>
        </button>
      </div>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          style={{
            position: 'absolute',
            ...(openUpward ? { bottom: 'calc(100% + 5px)' } : { top: 'calc(100% + 5px)' }),
            left: 0, right: 0, zIndex: 30,
            maxHeight: 160, overflowY: 'auto', padding: 4,
            background: 'var(--bg1solid, #fff)', border: '1px solid var(--bd)', borderRadius: 10,
            boxShadow: '0 10px 28px rgba(15, 23, 42, .18)',
          }}
        >
          {options.map(option => {
            const selected = Number(value) === option;
            return (
              <button
                type="button"
                role="option"
                aria-selected={selected}
                key={option}
                onMouseDown={event => event.preventDefault()}
                onClick={() => {
                  onChange(option);
                  setDraft(String(option).padStart(2, '0'));
                  setOpen(false);
                }}
                onMouseEnter={event => { if (!selected) event.currentTarget.style.background = 'var(--bg2)'; }}
                onMouseLeave={event => { if (!selected) event.currentTarget.style.background = 'transparent'; }}
                style={{
                  display: 'block', width: '100%', height: 30, padding: '0 8px', border: 0,
                  borderRadius: 7, background: selected ? 'rgba(59, 130, 246, .14)' : 'transparent',
                  color: selected ? 'var(--blue)' : 'var(--tx)', fontSize, fontWeight: selected ? 700 : 500,
                  textAlign: 'center', cursor: 'pointer',
                }}
              >
                {String(option).padStart(2, '0')}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function durationParts(value) {
  if (value === '' || value === null || value === undefined) {
    return { hours: '', minutes: '', seconds: '' };
  }

  const totalSeconds = Math.max(0, Math.trunc(Number(value) || 0));
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

export default function ThresholdDurationInput({ value, onChange, error, compact = false }) {
  const parts = durationParts(value);
  const height = compact ? 34 : 36;
  const fontSize = compact ? 12 : 12.5;

  const updatePart = (unit, rawValue) => {
    const nextParts = {
      hours: Number(parts.hours) || 0,
      minutes: Number(parts.minutes) || 0,
      seconds: Number(parts.seconds) || 0,
      [unit.key]: rawValue === '' ? 0 : Math.max(0, Math.trunc(Number(rawValue) || 0)),
    };
    const totalSeconds = UNITS.reduce(
      (total, item) => total + nextParts[item.key] * item.multiplier,
      0,
    );
    onChange(String(totalSeconds));
  };

  return (
    <div>
      <label style={{ display: 'block', fontSize: compact ? 10 : 10.5, fontWeight: 600, color: 'var(--tx3)', marginBottom: 5 }}>
        Threshold duration *
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
        {UNITS.map(unit => (
          <div key={unit.key}>
            <DurationDropdown
              label={unit.label}
              value={parts[unit.key]}
              options={optionsThrough(unit.max)}
              max={unit.max}
              height={height}
              fontSize={fontSize}
              error={error}
              openUpward={compact}
              onChange={nextValue => updatePart(unit, nextValue)}
            />
            <div style={{ marginTop: 3, fontSize: 9.5, color: 'var(--tx3)', textAlign: 'center' }}>{unit.label}</div>
          </div>
        ))}
      </div>
      {error && (
        <div style={{ marginTop: 5, fontSize: 10.5, color: '#ef4444' }}>
          {typeof error === 'string' ? error : 'Threshold duration is required.'}
        </div>
      )}
    </div>
  );
}
