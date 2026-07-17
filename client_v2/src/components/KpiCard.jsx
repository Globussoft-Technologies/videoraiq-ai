import { Sparkline } from './primitives';

/**
 * KPI stat tile from the prototype: label, large value, sub-text, sparkline
 * and a delta. `unavailable` renders a muted "—" when no backend metric
 * exists yet (see gap analysis) instead of fabricating a number.
 */
export default function KpiCard({
  label,
  value,
  sub,
  color = 'var(--blue)',
  spark = [],
  delta,
  deltaColor,
  unavailable = false,
  loading = false,
  title,
  onClick,
}) {
  return (
    <div
      title={title}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); } } : undefined}
      style={{
        background: 'var(--bg1)',
        border: '1px solid var(--bd)',
        borderRadius: 13,
        padding: 15,
        position: 'relative',
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--tx2)', letterSpacing: '.02em' }}>{label}</div>
      <div
        style={{
          fontFamily: 'var(--disp)',
          fontWeight: 700,
          fontSize: 25,
          margin: '5px 0 0',
          letterSpacing: '-.02em',
          color: unavailable ? 'var(--tx3)' : color,
        }}
      >
        {loading ? '…' : unavailable ? '—' : value}
      </div>
      {!unavailable && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginTop: 10 }}>
          <Sparkline values={spark} color={color} />
          {delta != null && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, color: deltaColor || 'var(--tx2)' }}>
              {delta}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
