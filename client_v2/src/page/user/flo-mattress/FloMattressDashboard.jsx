import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardBanner from './components/DashboardBanner';
import DashboardBottomBar from './components/DashboardBottomBar';
import MeasurementPanel from './components/MeasurementPanel';
import QrExtractedPanel from './components/QrExtractedPanel';
import StationTopbar from './components/StationTopbar';

export default function FloMattressDashboard() {
  const navigate = useNavigate();
  const stop = useCallback(() => navigate('/start-measure'), [navigate]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key.toLowerCase() === 's') stop();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stop]);

  return (
    <main className="vq-root flex min-h-screen flex-col overflow-hidden bg-[var(--appbg)] text-[var(--tx)]">
      <StationTopbar running onStartStop={stop} showSignOut={false} />
      <DashboardBanner />
      <section className="relative flex-1 overflow-hidden px-4 py-4 md:px-5">
        <div className="absolute inset-0 opacity-[0.38] [background-image:linear-gradient(var(--grid)_1px,transparent_1px),linear-gradient(90deg,var(--grid)_1px,transparent_1px)] [background-size:44px_44px]" />
        <div className="relative z-10 grid gap-4 xl:grid-cols-[1.08fr_1fr]">
          <QrExtractedPanel />
          <MeasurementPanel />
        </div>
      </section>
      <DashboardBottomBar onStop={stop} />
    </main>
  );
}
