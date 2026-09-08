import { Circle } from 'lucide-react';

export default function DashboardBanner() {
  return (
    <div className="flex min-h-[54px] flex-wrap items-center justify-between gap-3 border-b border-[var(--bd)] bg-cyan-400/10 px-4 py-3 md:px-5">
      <div className="flex items-center gap-3 text-[var(--tx)]">
        <span className="h-3 w-3 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.65)]" />
        <span className="text-sm font-semibold sm:text-base">QR decoded - measuring the mattress...</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[
          ['QR read', true],
          ['Measured', true],
          ['Confirm', false],
        ].map(([step, active]) => (
          <span
            key={step}
            className={`inline-flex h-7 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-bold uppercase tracking-[0.12em] ${
              active
                ? 'border-blue-400/45 bg-blue-500/10 text-[var(--tx)]'
                : 'border-[var(--bd)] bg-[var(--bg1)] text-[var(--tx3)]'
            }`}
          >
            <Circle className={`h-2 w-2 ${active ? 'fill-emerald-400 text-emerald-400' : 'fill-current'}`} />
            {step}
          </span>
        ))}
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--tx3)]">Unit #1 / 10</span>
      </div>
    </div>
  );
}
