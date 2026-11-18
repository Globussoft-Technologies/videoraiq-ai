import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export default function PostureSelect({ value = 'both', onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = event => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return <div ref={rootRef} style={{ position: 'relative' }}>
    <button type="button" aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => setOpen(current => !current)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: 38, padding: '0 12px', borderRadius: 9, border: '1px solid var(--bd)', background: 'var(--bg1solid)', color: 'var(--tx)', fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'left' }}>
      {value === 'sitting' ? 'Sitting' : value === 'standing' ? 'Standing' : 'Both'} <ChevronDown size={15} />
    </button>
    {open && <div role="listbox" aria-label="Detect person posture" style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 30, padding: 4, background: 'var(--bg1solid)', border: '1px solid var(--bd2)', borderRadius: 9, boxShadow: '0 12px 28px rgba(0,0,0,.3)' }}>
      {['sitting', 'standing', 'both'].map(option => <button key={option} type="button" role="option" aria-selected={value === option} onClick={() => { onChange(option); setOpen(false); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '9px 10px', border: 0, borderRadius: 6, background: value === option ? 'var(--bg2)' : 'transparent', color: 'var(--tx)', cursor: 'pointer', textAlign: 'left', fontSize: 12 }}>
        {option[0].toUpperCase() + option.slice(1)}{value === option && <Check size={14} />}
      </button>)}
    </div>}
  </div>;
}
