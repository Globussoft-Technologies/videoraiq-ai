import React from 'react';

/**
 * KPI card row shown above the log tables, ported from the VideoraIQ prototype
 * (4-up grid of stat tiles). Values are real, derived by each page from the
 * data it already has — no placeholder numbers.
 *
 * `stats` = [{ label, value, color }] where `color` is a CSS var/hex used for
 * the big number (defaults to the primary text colour when omitted).
 */
const StatCards = ({ stats = [] }) => {
  if (!stats.length) return null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-[14px]">
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
