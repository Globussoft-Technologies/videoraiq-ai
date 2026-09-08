export default function FieldTile({ label, value, highlight = false }) {
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 ${
        highlight
          ? 'border-blue-400/45 bg-blue-500/10'
          : 'border-[var(--bd)] bg-[var(--bg2)]'
      }`}
    >
      <div className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--tx3)]">{label}</div>
      <div className="mt-1 text-sm font-bold text-[var(--tx)]">{value}</div>
    </div>
  );
}
