import { Play } from 'lucide-react';
import FloButton from './FloButton';

export default function StationBottomBar({ onStart, disabled = false, capturing = false }) {
  return (
    <footer className="grid gap-3 border-t border-[var(--bd)] bg-[var(--headerglass)] px-4 py-2 backdrop-blur lg:grid-cols-[175px_216px_1fr] lg:items-center">
      <div className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--tx3)]">
        <div>System idle</div>
        <div className="mt-1 normal-case tracking-normal">The station is stopped</div>
        <div className="mt-1 truncate">Keys S start/stop - L logs - F full screen</div>
      </div>

      <FloButton icon={Play} shortcut="S" onClick={onStart} disabled={disabled} className="h-[68px] w-full justify-center text-lg disabled:cursor-not-allowed disabled:opacity-50">
        <span className="flex flex-col items-start leading-tight">
          <span>{capturing ? 'Capturing...' : 'Start'}</span>
          <span className="text-xs font-semibold opacity-85">{capturing ? 'Uploading JPEG' : 'Begin measuring'}</span>
        </span>
      </FloButton>

      <div className="flex min-h-[68px] items-center gap-3 rounded-xl border border-[var(--bd)] bg-[var(--bg2)] px-4">
        <span className="h-3 w-3 rounded-full bg-amber-400 shadow-[0_0_16px_rgba(245,166,35,0.55)]" />
        <div>
          <div className="font-bold text-[var(--tx)]">Line is stopped</div>
          <div className="text-sm text-[var(--tx2)]">Press Start (S) to begin. Nothing is measured while stopped.</div>
        </div>
      </div>
    </footer>
  );
}
