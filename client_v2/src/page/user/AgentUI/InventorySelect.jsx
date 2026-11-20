import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export default function InventorySelect({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return undefined;
    root.current?.querySelector('[aria-pressed="true"]')?.focus();
    const outside = (event) => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const close = () => { setOpen(false); trigger.current?.focus(); };
  return <div ref={root} className="agent-inventory-select" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={(event) => {
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        setOpen(true);
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      const buttons = [...root.current.querySelectorAll('[aria-pressed]')];
      const index = buttons.indexOf(document.activeElement);
      buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }
  }}>
    <button ref={trigger} type="button" className="agent-inventory-select-trigger" aria-label={label + ': ' + (selected?.label || '')}
      aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <span>{selected?.label}</span><ChevronDown size={15} aria-hidden="true" />
    </button>
    {open && <div className="agent-inventory-select-options" role="group" aria-label={label}>
      {options.map((option) => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => {
        onChange(option.value);
        close();
      }}>
        <span>{option.label}</span>{value === option.value && <Check size={14} aria-hidden="true" />}
      </button>)}
    </div>}
  </div>;
}
