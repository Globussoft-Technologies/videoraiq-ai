import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LiveCameraFeed from './components/LiveCameraFeed';
import StationBanner from './components/StationBanner';
import StationBottomBar from './components/StationBottomBar';
import StationIdleCard from './components/StationIdleCard';
import StationTopbar from './components/StationTopbar';

export default function FloMattressStation() {
  const navigate = useNavigate();
  const [running, setRunning] = useState(false);
  const start = useCallback(() => navigate('/mattress/dashboard'), [navigate]);
  const toggleRunning = useCallback(() => {
    if (!running) {
      navigate('/mattress/dashboard');
      return;
    }
    setRunning(false);
  }, [navigate, running]);

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
      <section className="relative flex-1 overflow-hidden px-4 py-6 lg:px-6 lg:py-8">
        <div className="absolute inset-0 opacity-[0.52] [background-image:linear-gradient(var(--grid)_1px,transparent_1px),linear-gradient(90deg,var(--grid)_1px,transparent_1px)] [background-size:44px_44px]" />
        <div className="absolute inset-x-0 top-0 h-48 bg-cyan-400/10 blur-3xl" />
        <div className="relative z-10 grid h-full min-h-[520px] w-full gap-5 lg:grid-cols-[minmax(520px,1.15fr)_minmax(420px,0.85fr)] lg:items-stretch">
          <LiveCameraFeed />
          <StationIdleCard onStart={start} />
        </div>
      </section>
      <StationBottomBar onStart={start} />
    </main>
  );
}
