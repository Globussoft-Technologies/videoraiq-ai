import { Pause } from 'lucide-react';
import FloButton from './FloButton';

export default function DashboardBottomBar({ onStop }) {
  return (
    <footer className="grid gap-3 border-t border-[var(--bd)] bg-[var(--headerglass)] px-4 py-3 backdrop-blur lg:grid-cols-[210px_216px_1fr] lg:items-center">
      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--tx3)]">
        <div>System running</div>
        <div className="mt-2 normal-case tracking-normal">Hold on - the station is reading this unit</div>
        <div className="mt-2">Keys S start/stop - F full screen</div>
      </div>

      <FloButton icon={Pause} shortcut="S" onClick={onStop} className="h-[70px] w-full justify-center !bg-amber-500 text-xl hover:!bg-amber-600">
        <span className="flex flex-col items-start leading-tight">
          <span>Stop</span>
          <span className="text-xs font-semibold opacity-85">Halt the line</span>
        </span>
      </FloButton>

      <div className="flex min-h-[70px] items-center gap-3 rounded-lg border border-[var(--bd)] bg-[var(--bg2)] px-4">
        <span className="h-3 w-3 rounded-full bg-blue-500 shadow-[0_0_16px_rgba(59,130,246,0.55)]" />
        <div>
          <div className="font-bold text-[var(--tx)]">Measuring the mattress...</div>
          <div className="text-sm text-[var(--tx2)]">Accept and Reject appear as soon as the values are in</div>
        </div>
      </div>
    </footer>
  );
}
