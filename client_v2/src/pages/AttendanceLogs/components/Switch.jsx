import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Themed toggle switch mirroring the Radix `Switch` API used by the ported
 * components (`checked`, `onCheckedChange`, `disabled`). Colours come from CSS
 * vars so it works in dark and light mode.
 */
const Switch = ({ checked, onCheckedChange, disabled = false, className, id }) => {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange?.(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-[var(--brand)]' : 'bg-[var(--toggleoff)]',
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
        className
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5'
        )}
      />
    </button>
  );
};

export { Switch };
export default Switch;
