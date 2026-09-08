import { ClipboardList, Expand, LogOut, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import FloBrand from './FloBrand';
import FloButton from './FloButton';
import FloThemeToggle from './FloThemeToggle';

export default function StationTopbar({ accepted = 2, rejected = 0, running, onStartStop }) {
  const navigate = useNavigate();

  return (
    <header className="flex min-h-[72px] flex-wrap items-center justify-between gap-3 border-b border-[var(--bd)] bg-[var(--headerglass)] px-4 py-3 backdrop-blur md:px-5">
      <FloBrand compact />

      <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
        <div className="hidden items-center gap-6 sm:flex">
          <div className="text-center">
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--tx3)]">Accepted</div>
            <div className="text-xl font-bold text-emerald-500">{accepted}</div>
          </div>
          <div className="h-8 w-px bg-[var(--bd)]" />
          <div className="text-center">
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--tx3)]">Rejected</div>
            <div className="text-xl font-bold text-red-500">{rejected}</div>
          </div>
        </div>

        <FloButton icon={Play} shortcut="S" onClick={onStartStop} className="min-h-10 px-4">
          {running ? 'Stop' : 'Start'}
        </FloButton>
        <FloButton icon={ClipboardList} variant="soft" shortcut="L" className="min-h-10">
          Logs
        </FloButton>
        <FloButton icon={Expand} variant="soft" shortcut="F" className="min-h-10">
          Full screen
        </FloButton>

        <div className="hidden font-mono text-base tracking-[0.12em] text-[var(--tx)] lg:block">11:48:43</div>
        <FloThemeToggle />

        <div className="inline-flex h-12 items-center gap-2 rounded-full border border-[var(--bd)] bg-[var(--bg2)] px-3">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-violet-500 text-sm font-bold text-white">O</span>
          <span className="hidden leading-tight sm:block">
            <span className="block text-sm font-bold text-[var(--tx)]">Operator</span>
            <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tx3)]">ID 1235</span>
          </span>
        </div>
        <FloButton icon={LogOut} variant="ghost" onClick={() => navigate('/flo-mattress/login')} className="min-h-10">
          Sign out
        </FloButton>
      </div>
    </header>
  );
}
