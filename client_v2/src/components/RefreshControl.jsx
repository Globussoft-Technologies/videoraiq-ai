import { useState, useEffect, useRef } from 'react';
import { RefreshCw, ChevronDown, Plus, Minus } from 'lucide-react';
import { Toggle } from './primitives';

/**
 * Interval presets — add entries here to extend the quick-select list.
 * `value` is in seconds.
 */
const PRESETS = [
  { label: '10 sec', value: 10 },
  { label: '30 sec', value: 30 },
  { label: '1 min',  value: 60 },
  { label: '2 min',  value: 120 },
];

const MIN_INTERVAL = 10;
const DEFAULT_INTERVAL = 30;

function formatInterval(secs) {
  if (secs < 60) return `${secs} sec`;
  const m = secs / 60;
  return `${m} min`;
}

/**
 * Manual + Auto Refresh control — mirrors the V1 AutoRefreshComponent pattern.
 *
 * Props:
 *   onManualRefresh — called on button click AND on each auto-refresh tick.
 *   storageKey      — optional string; when provided, isActive and interval are
 *                     persisted to localStorage using `{storageKey}_refresh_enabled`
 *                     and `{storageKey}_refresh_interval` (same as V1's pattern).
 */
export default function RefreshControl({ onManualRefresh, storageKey }) {
  const enabledKey  = storageKey ? `${storageKey}_refresh_enabled`  : null;
  const intervalKey = storageKey ? `${storageKey}_refresh_interval` : null;

  const [open, setOpen] = useState(false);

  const [isActive, setIsActive] = useState(() => {
    if (!enabledKey) return false;
    const saved = localStorage.getItem(enabledKey);
    return saved !== null ? saved === 'true' : false;
  });

  const [intervalSecs, setIntervalSecs] = useState(() => {
    if (!intervalKey) return DEFAULT_INTERVAL;
    const saved = parseInt(localStorage.getItem(intervalKey), 10);
    return Number.isFinite(saved) && saved >= MIN_INTERVAL ? saved : DEFAULT_INTERVAL;
  });

  const [spinning, setSpinning] = useState(false);
  const timerRef  = useRef(null);
  const spinTimer = useRef(null);
  const fnRef     = useRef(onManualRefresh);
  fnRef.current = onManualRefresh;

  // ── Persist to localStorage (V1 pattern) ─────────────────────────────────
  useEffect(() => {
    if (enabledKey) localStorage.setItem(enabledKey, isActive);
  }, [isActive, enabledKey]);

  useEffect(() => {
    if (intervalKey) localStorage.setItem(intervalKey, intervalSecs);
  }, [intervalSecs, intervalKey]);

  // ── Auto-refresh timer (V1 pattern: cancel + restart on change) ───────────
  useEffect(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (isActive && intervalSecs > 0) {
      timerRef.current = setInterval(() => { fnRef.current?.(); }, intervalSecs * 1000);
    }
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [isActive, intervalSecs]);

  // Cleanup spin timer on unmount
  useEffect(() => () => { if (spinTimer.current) clearTimeout(spinTimer.current); }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handleManualRefresh() {
    if (spinning || !fnRef.current) return;
    setSpinning(true);
    fnRef.current();
    spinTimer.current = setTimeout(() => setSpinning(false), 800);
  }

  function handleIncrement() {
    setIntervalSecs((v) => v < 60 ? v + 10 : v + 60);
  }

  function handleDecrement() {
    setIntervalSecs((v) => {
      const next = v <= 60 ? v - 10 : v - 60;
      return Math.max(MIN_INTERVAL, next);
    });
  }

  function handlePreset(val) {
    setIntervalSecs(val);
    setIsActive(true);
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const presetStyle = (val) => {
    const active = intervalSecs === val && isActive;
    return {
      textAlign: 'center', padding: '5px 4px', borderRadius: 6, cursor: 'pointer',
      border: `1px solid ${active ? 'var(--blue)' : 'var(--bd)'}`,
      background: active ? 'var(--blue)' : 'transparent',
      color: active ? '#fff' : 'var(--tx3)',
      fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600,
      transition: 'background .15s, color .15s, border-color .15s',
    };
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', flex: '0 0 auto' }}>
      {/* Trigger button group */}
      <div style={{
        display: 'flex', alignItems: 'stretch', height: 36,
        border: '1px solid var(--bd2)', borderRadius: 9,
        background: 'var(--bg1solid)', overflow: 'hidden',
      }}>
        {/* Manual refresh */}
        <div
          onClick={handleManualRefresh}
          title="Refresh now"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 11px', cursor: onManualRefresh ? 'pointer' : 'default',
            borderRight: '1px solid var(--bd)',
          }}
        >
          <RefreshCw
            size={15}
            strokeWidth={1.8}
            className={spinning ? 'vq-spin' : ''}
            style={{ color: isActive ? 'var(--blue)' : 'var(--tx2)', transition: 'color .2s' }}
          />
        </div>

        {/* Dropdown trigger */}
        <div
          onClick={() => setOpen((o) => !o)}
          title="Auto refresh settings"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 8px', cursor: 'pointer',
          }}
        >
          <ChevronDown size={14} strokeWidth={1.7} style={{ color: 'var(--tx3)' }} />
        </div>
      </div>

      {/* Settings popup */}
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 55 }} />
          <div
            className="vq-fadeup"
            style={{
              position: 'absolute', top: 44, right: 0, width: 192,
              background: 'var(--bg1solid)', border: '1px solid var(--bd2)',
              borderRadius: 13, boxShadow: '0 18px 50px rgba(0,0,0,.25)',
              zIndex: 60, padding: 12,
            }}
          >
            {/* Auto-refresh toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: 'var(--tx)' }}>On</span>
              <Toggle on={isActive} onChange={() => setIsActive((v) => !v)} />
            </div>

            {/* Interval stepper */}
            <div style={{ borderTop: '1px solid var(--bd)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{
                display: 'flex', alignItems: 'center',
                border: '1px solid var(--bd)', borderRadius: 8, overflow: 'hidden', height: 34,
              }}>
                <div
                  onClick={handleDecrement}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRight: '1px solid var(--bd)' }}
                >
                  <Minus size={13} strokeWidth={2} style={{ color: 'var(--tx3)' }} />
                </div>
                <div style={{ padding: '0 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 72 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: 'var(--blue)' }}>
                    {formatInterval(intervalSecs)}
                  </span>
                </div>
                <div
                  onClick={handleIncrement}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderLeft: '1px solid var(--bd)' }}
                >
                  <Plus size={13} strokeWidth={2} style={{ color: 'var(--tx3)' }} />
                </div>
              </div>

              {/* Preset quick-select buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 5 }}>
                {PRESETS.map((p) => (
                  <div key={p.value} onClick={() => handlePreset(p.value)} style={presetStyle(p.value)}>
                    {p.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
