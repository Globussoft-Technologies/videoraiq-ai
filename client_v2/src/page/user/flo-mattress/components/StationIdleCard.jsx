import { Sparkles } from 'lucide-react';
import KeyboardHint from './KeyboardHint';

const SHORTCUTS = [
  { value: 'A', label: 'Accept' },
  { value: 'R', label: 'Reject' },
  { value: 'ESC', label: 'Reset / rescan' },
  { value: 'Space', label: 'Dismiss error' },
  { value: 'L', label: 'Open / close log' },
];

export default function StationIdleCard({ disabled = false, capturing = false }) {
  const statusTitle = capturing
    ? 'Measurement in progress'
    : disabled
      ? 'Auto-detect is temporarily unavailable'
      : 'Auto-detect on · waiting for QR';

  const statusDescription = capturing
    ? 'Keep the measurement area clear while the unit is being processed'
    : disabled
      ? 'Please wait while the station becomes ready'
      : 'The unit opens by itself once a QR is seen';

  return (
    <section className="flex h-full min-h-[500px] w-full flex-col rounded-2xl border border-[#dfe3ec] bg-[#fbfcff] px-6 py-6 text-left dark:border-[var(--bd)] dark:bg-[var(--bg1)] sm:px-7">
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-300 bg-violet-50 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-300">
          <Sparkles className="h-3 w-3" />
          AI-powered
        </span>

        <h1 className="mt-4 text-[34px] font-bold leading-[1.12] tracking-[-0.02em] text-[var(--tx)]">Smart Mattress Measurement</h1>
        <p className="mt-3 max-w-[620px] text-base leading-7 text-[var(--tx2)]">
          Show the QR label to the camera. Vision AI reads the order, measures length, width and height, and checks them against the SKU — you just confirm.
        </p>

        <div className="mt-4 flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50/80 px-4 py-3 dark:border-indigo-400/30 dark:bg-indigo-500/10">
          <span className={`h-3 w-3 shrink-0 rounded-full ${capturing ? 'animate-pulse bg-emerald-400' : disabled ? 'bg-amber-400' : 'bg-indigo-300'}`} />
          <div>
            <div className="text-base font-bold text-[var(--tx)]">{statusTitle}</div>
            <div className="mt-0.5 text-sm text-[var(--tx2)]">{statusDescription}</div>
          </div>
          <span className="ml-auto hidden font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--tx3)] sm:block">L2-QC-01</span>
        </div>

        <ol className="mt-4 space-y-2.5 text-[15px] text-[var(--tx2)]">
          <li className="flex items-center gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-indigo-200 bg-indigo-50 font-mono text-xs font-bold text-indigo-500 dark:border-indigo-400/30 dark:bg-indigo-500/10 dark:text-indigo-300">1</span>
            Hold the QR label under the camera
          </li>
          <li className="flex items-center gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-indigo-200 bg-indigo-50 font-mono text-xs font-bold text-indigo-500 dark:border-indigo-400/30 dark:bg-indigo-500/10 dark:text-indigo-300">2</span>
            QR is detected and the mattress is measured
          </li>
          <li className="flex items-center gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-indigo-200 bg-indigo-50 font-mono text-xs font-bold text-indigo-500 dark:border-indigo-400/30 dark:bg-indigo-500/10 dark:text-indigo-300">3</span>
            Check the values — Accept (A) or Reject (R)
          </li>
        </ol>
      </div>

      <div className="mt-auto border-t border-[var(--bd)] pt-4">
        <div className="mb-2 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--tx3)]">Keyboard shortcuts</div>
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {SHORTCUTS.map(({ value, label }) => (
            <KeyboardHint key={value} value={value}>{label}</KeyboardHint>
          ))}
        </div>
      </div>
    </section>
  );
}
