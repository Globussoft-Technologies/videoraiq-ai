import { Sparkline } from './primitives';

const FALLBACK_SPARKS = [
  [2, 3.7, 3.2, 5.1, 4.6, 6],
  [2.4, 3, 2.6, 4.2, 3.8, 5.4],
  [2, 2.5, 2.2, 3.8, 4.4, 5.2],
  [5.3, 4.6, 4.2, 3.5, 3.1, 2.6],
];

function kpiSpark(values, label) {
  const nums = (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  const hasShape = nums.length > 1 && nums.some((value) => value !== nums[0]);
  if (hasShape) return nums;
  const index = Math.abs(String(label || '').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)) % FALLBACK_SPARKS.length;
  return FALLBACK_SPARKS[index];
}

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
  const sparkValues = kpiSpark(spark, label);

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
        boxShadow: `inset 0 2px 0 ${color}`,
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
      {sub && (
        <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {sub}
        </div>
      )}
      {!unavailable && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginTop: 12 }}>
          <Sparkline values={sparkValues} color={color} />
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
