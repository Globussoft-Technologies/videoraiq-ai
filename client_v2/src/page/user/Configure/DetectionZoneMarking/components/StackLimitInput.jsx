import { useId } from 'react';

export default function StackLimitInput({ value, onChange, error, disabled }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-[var(--tx3)]">Stack Limit *</label>
      <input
        id={id}
        type="number"
        min={0}
        step={1}
        value={value ?? ''}
        onChange={event => onChange(event.target.value)}
        disabled={disabled}
        required
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`h-9 w-full rounded-lg border bg-[var(--bg2)] px-2.5 text-xs text-[var(--tx)] ${error ? 'border-[var(--crit)]' : 'border-[var(--bd)]'}`}
      />
      {error && <div id={`${id}-error`} className="mt-1 text-[11px] text-[var(--crit)]">{error}</div>}
    </div>
  );
}
