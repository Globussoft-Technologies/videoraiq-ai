import React, { useState } from 'react';

// Presence/absence colors follow the V2 semantic palette (--ok/--crit from
// theme/tokens.css) so they read correctly in both light and dark mode.
export const visibilityColors = { presence: 'var(--ok)', absence: 'var(--crit)' };
export const guardColors = { presence: 'var(--ok)', absence: 'var(--crit)' };

/**
 * 24h presence/absence bar. Each segment shows its time range on hover via a
 * small themed tooltip (no Radix dependency — v2 doesn't have one installed).
 */
const TimelineBar = ({ segments, colors }) => {
  const [hoverIdx, setHoverIdx] = useState(null);

  return (
    <div className="relative w-full h-5 rounded-md bg-[var(--bg2)]">
      {segments.map((seg, idx) => (
        <div
          key={idx}
          onMouseEnter={() => setHoverIdx(idx)}
          onMouseLeave={() => setHoverIdx((cur) => (cur === idx ? null : cur))}
          className="absolute h-full hover:opacity-80 cursor-pointer group"
          style={{ left: `${seg.left}%`, width: `${seg.width}%`, backgroundColor: colors[seg.type] }}
        >
          {hoverIdx === idx && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-20 whitespace-nowrap bg-[var(--bg3)] text-[var(--tx)] text-xs px-2 py-1 rounded shadow-lg border border-[var(--bd)]">
              {seg.label}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default TimelineBar;
