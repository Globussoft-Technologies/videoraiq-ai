import { Circle } from 'lucide-react';

export default function DashboardBanner({ incident, connected = false }) {
  const qrReady = Boolean(incident?.qrMetadata && Object.keys(incident.qrMetadata).length);
  const measured = Boolean(incident?.measuredData && Object.keys(incident.measuredData).length);
  const confirmed = measured && incident?.status !== 'pending';
  const unit = incident?.qrMetadata?.order_id || incident?.qrMetadata?.orderId || incident?.qrMetadata?.ref_no || incident?.qrMetadata?.sku || '';
  const phases = [
    ['QR read', qrReady ? 'done' : 'waiting'],
    ['Measured', measured ? 'done' : 'waiting'],
    ['Confirm', confirmed ? 'done' : measured ? 'active' : 'waiting'],
  ];
  return (
    <div className="flex min-h-[44px] flex-wrap items-center justify-between gap-3 border-b border-[var(--bd)] bg-cyan-400/10 px-4 py-2 md:px-5">
      <div className="flex items-center gap-3 text-[var(--tx)]">
        <span className="h-3 w-3 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.65)]" />
        <span className="text-sm font-semibold sm:text-base">
          {measured ? `Unit ${unit} ready — check the values and confirm` : qrReady ? 'QR decoded — waiting for depth measurement data...' : 'Capture uploaded — waiting for QR data...'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {phases.map(([step, phase]) => (
          <span
            key={step}
            className={`inline-flex h-7 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-bold uppercase tracking-[0.12em] ${
              phase === 'active'
                ? 'border-blue-400/45 bg-blue-500/10 text-[var(--tx)]'
                : phase === 'done'
                  ? 'border-[var(--bd)] bg-[var(--bg1)] text-[var(--tx2)]'
                : 'border-[var(--bd)] bg-[var(--bg1)] text-[var(--tx3)]'
            }`}
          >
            <Circle className={`h-2 w-2 ${phase === 'active' ? 'fill-blue-400 text-blue-400' : phase === 'done' ? 'fill-emerald-400 text-emerald-400' : 'fill-current'}`} />
            {step}
          </span>
        ))}
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--tx3)]">{connected ? 'Live' : 'Reconnecting'}</span>
      </div>
    </div>
  );
}
