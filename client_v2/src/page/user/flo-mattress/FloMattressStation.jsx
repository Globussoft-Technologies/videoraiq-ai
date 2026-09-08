import { useCallback, useEffect, useState } from 'react';
import StationBanner from './components/StationBanner';
import StationBottomBar from './components/StationBottomBar';
import StationIdleCard from './components/StationIdleCard';
import StationTopbar from './components/StationTopbar';

export default function FloMattressStation() {
  const [running, setRunning] = useState(false);
  const toggleRunning = useCallback(() => setRunning((value) => !value), []);
  const start = useCallback(() => setRunning(true), []);

  useEffect(() => {
    const onKeyDown = (event) => {
      const key = event.key.toLowerCase();
      if (key === 's') toggleRunning();
      if (event.key === 'Escape') setRunning(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleRunning]);

  return (
    <main className="vq-root flex min-h-screen flex-col overflow-hidden bg-[var(--appbg)] text-[var(--tx)]">
      <StationTopbar running={running} onStartStop={toggleRunning} />
      <StationBanner />
      <section className="relative grid flex-1 place-items-center overflow-hidden px-4 py-10">
        <div className="absolute inset-0 opacity-[0.52] [background-image:linear-gradient(var(--grid)_1px,transparent_1px),linear-gradient(90deg,var(--grid)_1px,transparent_1px)] [background-size:44px_44px]" />
        <div className="absolute inset-x-0 top-0 h-48 bg-cyan-400/10 blur-3xl" />
        <div className="relative z-10 w-full">
          <StationIdleCard onStart={start} />
        </div>
      </section>
      <StationBottomBar onStart={start} />
    </main>
  );
}
