import React from 'react';

/**
 * KPI card row shown above the log tables, ported from the VideoraIQ prototype.
 * Values are real, derived by each page from the data it already has — no
 * placeholder numbers.
 *
 * `stats` = [{ label, value, color, onClick, active }] where `color` is a CSS
 * var/hex used for the big number (defaults to the primary text colour when
 * omitted). Cards with an `onClick` become a toggle button — `active`
 * highlights the currently-applied one.
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
  7: 'lg:grid-cols-7',
};

const StatCards = ({ stats = [], variant = stats[0]?.variant || 'default' }) => {
  if (!stats.length) return null;

  // Was fixed at 4, which left a fifth tile stranded on its own row.
  const columns = COLUMN_CLASS[Math.min(stats.length, 7)] || 'lg:grid-cols-4';

  return (
    <div className={`grid grid-cols-2 ${columns} gap-[14px]`}>
      {stats.map((s, i) => (
        <div
          key={s.label ?? i}
          title={s.title || s.label}
          onClick={s.onClick}
          role={s.onClick ? 'button' : undefined}
          tabIndex={s.onClick ? 0 : undefined}
          onKeyDown={
            s.onClick
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    s.onClick(e);
                  }
                }
              : undefined
          }
          className={`bg-[var(--bg1)] border rounded-[13px] p-[15px] ${
            s.onClick ? 'cursor-pointer hover:border-[var(--brand)]' : ''
          } ${s.active ? 'border-[var(--brand)] ring-1 ring-[var(--brand)]/30' : 'border-[var(--bd)]'}`}
          style={variant === 'modern' ? { position: 'relative', overflow: 'hidden', minHeight: 92, padding: '16px 18px', borderColor: s.active ? '#2563eb' : 'var(--bd)', background: `linear-gradient(135deg, var(--bg1) 0%, ${s.color || '#64748b'}12 100%)`, boxShadow: `0 8px 22px ${s.color || '#64748b'}14` } : undefined}
        >
          {variant === 'modern' && <span style={{ position: 'absolute', left: 0, top: 14, bottom: 14, width: 4, borderRadius: '0 4px 4px 0', background: s.color || 'var(--brand)' }} />}
          {variant === 'modern' && <span style={{ position: 'absolute', right: -24, top: -30, width: 96, height: 96, borderRadius: '50%', background: `radial-gradient(circle, ${s.color || '#64748b'}28, transparent 68%)` }} />}
          <div className="text-[11px] text-[var(--tx2)] truncate" title={s.label} style={variant === 'modern' ? { position: 'relative', paddingLeft: 4, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--tx3)' } : undefined}>
            {s.label}
          </div>
          <div
            className="font-[700] text-[26px] mt-[5px] leading-none"
            style={{ fontFamily: 'var(--disp)', color: s.color || 'var(--tx)', position: variant === 'modern' ? 'relative' : undefined, paddingLeft: variant === 'modern' ? 4 : undefined, fontSize: variant === 'modern' ? 29 : undefined, letterSpacing: variant === 'modern' ? '-.04em' : undefined }}
          >
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
};

export default StatCards;
