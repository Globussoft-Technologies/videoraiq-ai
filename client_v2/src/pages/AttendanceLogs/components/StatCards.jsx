import React from 'react';

/**
 * KPI card row shown above the log tables, ported from the VideoraIQ prototype.
 * Values are real, derived by each page from the data it already has — no
 * placeholder numbers.
 *
 * `stats` = [{ label, value, color }] where `color` is a CSS var/hex used for
 * the big number (defaults to the primary text colour when omitted).
 */

// Spelled out rather than built as `lg:grid-cols-${n}`: Tailwind scans source
// for literal class names, so an interpolated one is never generated.
const COLUMN_CLASS = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
};

const StatCards = ({ stats = [] }) => {
  if (!stats.length) return null;

  // Was fixed at 4, which left a fifth tile stranded on its own row.
  const columns = COLUMN_CLASS[Math.min(stats.length, 6)] || 'lg:grid-cols-4';

  return (
    <div className={`grid grid-cols-2 ${columns} gap-[14px]`}>
      {stats.map((s, i) => (
        <div
          key={s.label ?? i}
          className="bg-[var(--bg1)] border border-[var(--bd)] rounded-[13px] p-[15px]"
        >
          <div className="text-[11px] text-[var(--tx2)] truncate" title={s.label}>
            {s.label}
          </div>
          <div
            className="font-[700] text-[26px] mt-[5px] leading-none"
            style={{ fontFamily: 'var(--disp)', color: s.color || 'var(--tx)' }}
          >
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
};

export default StatCards;
