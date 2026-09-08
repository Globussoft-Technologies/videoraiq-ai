import { Ruler } from 'lucide-react';

const rows = [
  ['Length', '78"', '...', '-', 'WAIT'],
  ['Width', '78"', '...', '-', 'WAIT'],
  ['Height', '6"', '...', '-', 'WAIT'],
];

export default function MeasurementPanel() {
  return (
    <section className="rounded-2xl border border-[var(--bd)] bg-[var(--glass)] shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--bd)] px-4 py-3">
        <div className="flex items-center gap-3">
          <Ruler className="h-5 w-5 text-cyan-500" />
          <h2 className="text-base font-bold text-[var(--tx)]">Printed Size vs Measured Size</h2>
        </div>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--tx3)]">
          Tolerance L/W +/-0.5" - H +/-0.25"
        </span>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-[84px_1fr_1fr_80px_90px] border-b border-[var(--bd)] pb-3 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--tx3)]">
          <span>Axis</span>
          <span>Printed (QR)</span>
          <span>Measured</span>
          <span>Diff</span>
          <span>Result</span>
        </div>
        <div className="divide-y divide-[var(--bd)]">
          {rows.map(([axis, printed, measured, diff, result]) => (
            <div key={axis} className="grid grid-cols-[84px_1fr_1fr_80px_90px] items-center py-3 text-sm">
              <span className="font-bold text-[var(--tx)]">{axis}</span>
              <span className="text-2xl text-[var(--tx2)]">{printed}</span>
              <span className="font-mono text-2xl tracking-[0.5em] text-[var(--tx3)]">{measured}</span>
              <span className="font-mono text-lg text-[var(--tx3)]">{diff}</span>
              <span className="w-fit rounded-md border border-[var(--bd)] bg-[var(--bg1solid)] px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--tx3)]">
                {result}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {['Scan 13:48:57', 'Decode 100%', 'Depth lock -', 'Plane RMS -', 'Station L2-QC-01'].map((chip) => (
            <span key={chip} className="rounded-md border border-[var(--bd)] bg-[var(--bg1solid)] px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--tx)]">
              {chip}
            </span>
          ))}
        </div>

        <div className="mt-9 flex min-h-[88px] items-center gap-4 rounded-xl border border-[var(--bd)] bg-[var(--bg2)] px-5">
          <span className="h-12 w-12 rotate-[-35deg] rounded-xl bg-[var(--bg3)]" />
          <div>
            <div className="text-2xl font-bold text-[var(--tx)]">Measuring...</div>
            <div className="mt-1 text-sm text-[var(--tx2)]">Values appear as soon as the measurement lands</div>
          </div>
        </div>
      </div>
    </section>
  );
}
