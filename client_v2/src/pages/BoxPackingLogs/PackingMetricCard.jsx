export default function PackingMetricCard({ label, value, detail, icon: Icon, color }) {
  return <div className="relative flex min-h-[112px] min-w-0 flex-col overflow-hidden rounded-2xl border border-[var(--bd)] p-3.5 shadow-[0_5px_18px_rgba(15,23,42,.04)]" style={{ background: `linear-gradient(125deg, var(--bg1) 52%, color-mix(in srgb, ${color} 11%, var(--bg1)))` }}>
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0 text-[10px] font-bold tracking-[.1em] text-[var(--tx3)] uppercase">{label}</div>
      <span className="grid size-9 shrink-0 place-items-center rounded-[10px]" style={{ color, background: `color-mix(in srgb, ${color} 13%, transparent)` }}><Icon size={18} strokeWidth={2} /></span>
    </div>
    <div className="mt-auto font-[var(--disp)] text-[30px] leading-none font-bold tracking-[-.03em] text-[var(--tx)]">{value}</div>
    <div className="mt-1.5 max-h-[2.7em] overflow-hidden text-[11px] leading-snug text-[var(--tx3)]">{detail}</div>
  </div>;
}
