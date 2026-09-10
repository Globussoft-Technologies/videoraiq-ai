import { useEffect, useState } from 'react';
import { ClipboardList, Expand, LogOut, Pause, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import FloBrand from './FloBrand';
import FloButton from './FloButton';
import FloThemeToggle from './FloThemeToggle';

export default function StationTopbar({ accepted = 0, rejected = 0, running, onStartStop, onToggleLogs, onToggleFullscreen, onSignOut, showSignOut = false, stationId }) {
  const navigate = useNavigate();
  const ActionIcon = running ? Pause : Play;
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString([], { hour12: false }));

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date().toLocaleTimeString([], { hour12: false })), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <header className="flex min-h-[60px] flex-wrap items-center justify-between gap-2 border-b border-[var(--bd)] bg-[var(--headerglass)] px-4 py-2 backdrop-blur">
      <FloBrand compact />

      <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
        <div className="hidden items-center gap-4 sm:flex">
          <div className="text-center">
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--tx3)]">Accepted</div>
            <div className="text-base font-bold leading-5 text-emerald-500">{accepted}</div>
          </div>
          <div className="h-9 w-px bg-[var(--bd)]" />
          <div className="text-center">
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--tx3)]">Rejected</div>
            <div className="text-base font-bold leading-5 text-red-500">{rejected}</div>
          </div>
        </div>

        <FloButton
          icon={ActionIcon}
          shortcut="S"
          onClick={onStartStop}
          className={`!min-h-9 px-4 ${running ? '!bg-amber-500 hover:!bg-amber-600' : ''}`}
        >
          {running ? 'Stop' : 'Start'}
        </FloButton>
        <FloButton icon={ClipboardList} variant="soft" shortcut="L" className="!min-h-9" onClick={onToggleLogs}>
          Logs
        </FloButton>
        <FloButton icon={Expand} variant="soft" shortcut="F" className="!min-h-9" onClick={onToggleFullscreen}>
          Full screen
        </FloButton>

        <div className="mx-1 hidden border-l border-[var(--bd)] pl-3 font-mono text-sm tracking-[0.1em] text-[var(--tx)] lg:block">{clock}</div>
        <FloThemeToggle />

        <div className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--bd)] bg-[var(--bg2)] px-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-violet-500 text-xs font-bold text-white">O</span>
          <span className="hidden leading-tight sm:block">
            <span className="block text-xs font-bold text-[var(--tx)]">Operator</span>
            <span className="block max-w-28 truncate font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--tx3)]">{stationId || 'Connecting'}</span>
          </span>
        </div>
        {showSignOut && (
          <FloButton icon={LogOut} variant="ghost" shortcut="Q" onClick={onSignOut || (() => navigate('/logout'))} className="min-h-10">
            Sign out
          </FloButton>
        )}
      </div>
    </header>
  );
}
