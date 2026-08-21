import React from 'react';
import { TAG_STATUS_OPTIONS } from '@/helpers/vehicleTagging';

/**
 * All / Tagged / Not Tagged segmented control.
 *
 * Shared by ANPR Logs and the Incident Center's Vehicle Detection view so the
 * two read identically; `value` is the `tagStatus` the API expects ('' = all).
 */
export default function TagStatusFilter({ value = '', onChange, className = '' }) {
  return (
    <div
      className={`inline-flex items-center rounded-[8px] border border-[var(--bd)] bg-[var(--bg2)] overflow-hidden h-9 ${className}`}
      role="group"
      aria-label="Filter by tagged state"
    >
      {TAG_STATUS_OPTIONS.map((opt) => {
        const active = value === opt.key;
        return (
          <button
            key={opt.key || 'all'}
            type="button"
            onClick={() => onChange?.(opt.key)}
            aria-pressed={active}
            className={`px-3 h-full text-[12px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
              active
                ? 'bg-[var(--blue)] text-white'
                : 'text-[var(--tx2)] hover:text-[var(--tx)] hover:bg-[var(--bg3)]'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
