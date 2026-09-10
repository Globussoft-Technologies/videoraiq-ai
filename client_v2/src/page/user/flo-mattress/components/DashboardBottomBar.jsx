import { Check, X } from 'lucide-react';

function ResetIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
      <path d="M4 4h16v6a8 8 0 0 1-16 0z" />
      <path d="M9 20h6" />
    </svg>
  );
}

function DecisionButton({ icon: Icon, title, subtitle, shortcut, tone, disabled, onClick }) {
  const colors = tone === 'accept'
    ? 'border-emerald-500/60 bg-gradient-to-br from-emerald-600 to-emerald-500 text-white shadow-[0_12px_28px_rgba(22,163,74,.25)]'
    : tone === 'reject'
      ? 'border-red-500/60 bg-gradient-to-br from-red-600 to-red-500 text-white shadow-[0_12px_28px_rgba(220,38,38,.22)]'
      : 'border-[var(--bd2)] bg-[var(--bg1solid)] text-[var(--tx)]';
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`flex h-[62px] min-w-0 items-center gap-[11px] rounded-xl border px-[14px] text-left transition-[transform,filter,opacity] duration-150 hover:-translate-y-px hover:brightness-[1.03] disabled:cursor-not-allowed disabled:border-[var(--bd)] disabled:bg-[var(--bg3)] disabled:text-[var(--tx3)] disabled:opacity-50 disabled:shadow-none disabled:hover:translate-y-0 disabled:hover:brightness-100 ${colors}`}>
      <Icon className="h-[22px] w-[22px] shrink-0" strokeWidth={2.6} />
      <span className="min-w-0">
        <span className="block font-['Space_Grotesk',sans-serif] text-[17px] font-bold leading-[1.1]">{title}</span>
        <span className="mt-0.5 block text-[11px] opacity-[.78]">{subtitle}</span>
      </span>
      <span className={`ml-auto rounded-md border px-2 py-1 font-mono text-[10px] font-bold ${tone ? 'border-white/30 bg-white/15' : 'border-[var(--bd2)] bg-[var(--bg2)] text-[var(--tx3)]'}`}>{shortcut}</span>
    </button>
  );
}

export default function DashboardBottomBar({ onAccept, onReject, onReset, disabled, status = 'pending' }) {
  return (
    <footer className="grid shrink-0 gap-[11px] border-t border-[var(--bd2)] bg-[var(--headerglass)] px-[18px] py-[10px] shadow-[0_-12px_34px_rgba(15,23,42,.08)] backdrop-blur lg:grid-cols-[172px_1.3fr_1.3fr_1fr] lg:items-center">
      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--tx3)]">
        <div>Your decision</div>
        <div className="mt-1 normal-case font-normal tracking-normal">Compare the printed and measured values above, then confirm.</div>
        <div className="mt-1 text-[9px]">KEYS A · R · ESC</div>
      </div>
      <DecisionButton icon={Check} title={status === 'accepted' ? 'Accepted' : 'Accept'} subtitle="Pass to packing" shortcut="A" tone="accept" disabled={disabled} onClick={onAccept} />
      <DecisionButton icon={X} title={status === 'rejected' ? 'Rejected' : 'Reject'} subtitle="Send to rework" shortcut="R" tone="reject" disabled={disabled} onClick={onReject} />
      <DecisionButton icon={ResetIcon} title="Reset" subtitle="Clear unit" shortcut="esc" onClick={onReset} />
    </footer>
  );
}
