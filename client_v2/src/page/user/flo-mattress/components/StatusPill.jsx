export default function StatusPill({ tone = 'idle', children, className = '' }) {
  const tones = {
    idle: 'bg-amber-500',
    online: 'bg-emerald-400',
    muted: 'bg-[var(--tx3)]',
    danger: 'bg-red-500',
    cyan: 'bg-cyan-400',
  };

  return (
    <span
      className={`inline-flex min-h-7 items-center gap-2 rounded-full border border-[var(--bd)] bg-[var(--bg2)] px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--tx3)] ${className}`}
    >
      <span className={`h-2 w-2 rounded-full ${tones[tone] || tones.idle}`} />
      {children}
    </span>
  );
}
