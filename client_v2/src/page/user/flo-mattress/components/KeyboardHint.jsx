export default function KeyboardHint({ value, children }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--bd)] bg-[var(--bg2)] px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--tx3)]">
      <span className="text-[var(--tx2)]">{value}</span>
      <span className="normal-case tracking-normal">{children}</span>
    </span>
  );
}
