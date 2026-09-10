import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import DashboardBanner from './components/DashboardBanner';
import DashboardBottomBar from './components/DashboardBottomBar';
import MeasurementPanel from './components/MeasurementPanel';
import QrExtractedPanel from './components/QrExtractedPanel';
import StationTopbar from './components/StationTopbar';
import MeasurementLogDrawer from './components/MeasurementLogDrawer';
import { estimatedMeasurementSeconds, hasMeasuredData, isEditableShortcutTarget, matchesEscapeShortcut, matchesStationShortcut, playStationSound, prepareStationAudio, readDecisionCounts, readStationFromLocation, recordMeasurementDecision, toggleStationFullscreen, transitionDecisionCounts, updateMeasurementIncident } from './stationIntegration';
import useMeasurementSocket from './useMeasurementSocket';

export default function FloMattressDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const station = location.state?.station || readStationFromLocation();
  const { incident, setIncident, connected } = useMeasurementSocket(station, location.state?.incident || location.state?.capture?.incident);
  const [actionError, setActionError] = useState('');
  const [updating, setUpdating] = useState(false);
  const [counts, setCounts] = useState(readDecisionCounts);
  const [logOpen, setLogOpen] = useState(false);
  const resetInFlightRef = useRef(false);
  const intentionalFullscreenExitRef = useRef(false);
  const wasFullscreenRef = useRef(Boolean(document.fullscreenElement));
  const measurementReady = hasMeasuredData(incident);
  const navigationQrResponse = location.state?.capture?.qrResponse || {};
  const incidentQrResponse = incident?.requestPayload?.qrResponse || {};
  const displayedQrResponse = { ...navigationQrResponse, ...incidentQrResponse };
  const estimate = estimatedMeasurementSeconds({
    ...displayedQrResponse,
    estimated_measurement_seconds: incidentQrResponse.estimated_measurement_seconds
      ?? navigationQrResponse.estimated_measurement_seconds,
  });
  const [measurementSeconds, setMeasurementSeconds] = useState(estimate);
  const toggleLogs = useCallback(() => setLogOpen((current) => !current), []);
  const signOut = useCallback(() => navigate('/logout'), [navigate]);
  const stop = useCallback(() => navigate('/start-measure'), [navigate]);
  const decide = useCallback(async (status) => {
    prepareStationAudio();
    setUpdating(true);
    setActionError('');
    try {
      const updated = await updateMeasurementIncident(station, incident?._id, 'PATCH', { status });
      setCounts(transitionDecisionCounts(incident?.status, status));
      setIncident(updated);
      recordMeasurementDecision(updated);
      playStationSound(status === 'accepted' ? 'accept' : 'reject');
      stop();
    } catch (error) {
      setActionError(error.message);
    } finally {
      setUpdating(false);
    }
  }, [incident?._id, incident?.status, setIncident, station, stop]);

  useEffect(() => {
    if (measurementReady) {
      setMeasurementSeconds(0);
      return undefined;
    }
    setMeasurementSeconds(estimate);
    if (!estimate) return undefined;
    const timer = window.setInterval(() => {
      setMeasurementSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [estimate, incident?._id, measurementReady]);
  const reset = useCallback(async () => {
    if (resetInFlightRef.current) return;
    resetInFlightRef.current = true;
    prepareStationAudio();
    setUpdating(true);
    setActionError('');
    try {
      if (incident?._id) await updateMeasurementIncident(station, incident._id, 'DELETE');
      playStationSound('reset');
      stop();
    } catch (error) {
      setActionError(error.message);
      setUpdating(false);
      resetInFlightRef.current = false;
    }
  }, [incident?._id, station, stop]);
  const toggleFullscreen = useCallback(async () => {
    const leavingFullscreen = Boolean(document.fullscreenElement);
    if (leavingFullscreen) intentionalFullscreenExitRef.current = true;
    try {
      await toggleStationFullscreen();
    } finally {
      if (leavingFullscreen) {
        window.setTimeout(() => { intentionalFullscreenExitRef.current = false; }, 250);
      }
    }
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      const fullscreen = Boolean(document.fullscreenElement);
      const browserExitedFullscreen = wasFullscreenRef.current && !fullscreen;
      wasFullscreenRef.current = fullscreen;
      if (browserExitedFullscreen && !intentionalFullscreenExitRef.current && !updating) reset();
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [reset, updating]);

  useEffect(() => {
    const onKeyDown = (event) => {
      // Reset always takes precedence on the review screen. The reset guard
      // prevents duplicate deletion when Escape also exits fullscreen.
      if (matchesEscapeShortcut(event)) {
        if (!updating && !event.repeat) {
          event.preventDefault();
          event.stopImmediatePropagation();
          reset();
        }
        return;
      }
      if (isEditableShortcutTarget(event.target) || event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
      if (logOpen) {
        if (matchesStationShortcut(event, 'l')) {
          event.preventDefault();
          setLogOpen(false);
        }
        return;
      }
      if (matchesStationShortcut(event, 's')) { event.preventDefault(); stop(); }
      if (matchesStationShortcut(event, 'l')) { event.preventDefault(); toggleLogs(); }
      if (matchesStationShortcut(event, 'f')) { event.preventDefault(); toggleFullscreen().catch(() => {}); }
      if (matchesStationShortcut(event, 'q')) { event.preventDefault(); signOut(); }
      if (matchesStationShortcut(event, 'a') && measurementReady && !updating) { event.preventDefault(); decide('accepted'); }
      if (matchesStationShortcut(event, 'r') && measurementReady && !updating) { event.preventDefault(); decide('rejected'); }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [decide, incident, logOpen, measurementReady, reset, signOut, stop, toggleFullscreen, toggleLogs, updating]);

  return (
    <main className="vq-root flex h-screen min-h-0 flex-col overflow-hidden bg-[var(--appbg)] text-[var(--tx)]">
      <StationTopbar running onStartStop={stop} onToggleLogs={toggleLogs} onToggleFullscreen={() => toggleFullscreen().catch(() => {})} onSignOut={signOut} showSignOut stationId={station?.pi?.device?.mac} {...counts} />
      <DashboardBanner incident={incident} connected={connected} />
      {actionError && <div role="alert" className="border-b border-red-300 bg-red-50 px-5 py-2 text-sm font-semibold text-red-700">{actionError}</div>}
      <section className="relative min-h-0 flex-1 overflow-hidden px-4 py-3 md:px-5">
        <div className="absolute inset-0 opacity-[0.38] [background-image:linear-gradient(var(--grid)_1px,transparent_1px),linear-gradient(90deg,var(--grid)_1px,transparent_1px)] [background-size:44px_44px]" />
        <div className="relative z-10 grid h-full min-h-0 gap-3 xl:grid-cols-[1.08fr_1fr]">
          <QrExtractedPanel metadata={incident?.qrMetadata} response={displayedQrResponse} readAt={incident?.createdAt} image={incident?.qrImage || incident?.qrImagePath} backendIp={station?.backend?.ip} />
          <MeasurementPanel data={incident?.measuredData} image={incident?.measurementImage} backendIp={station?.backend?.ip} qrMetadata={incident?.qrMetadata} status={incident?.status} secondsRemaining={measurementSeconds} />
        </div>
      </section>
      <DashboardBottomBar onAccept={() => decide('accepted')} onReject={() => decide('rejected')} onReset={reset} disabled={!measurementReady || updating} resetDisabled={updating} status={incident?.status} />
      <MeasurementLogDrawer open={logOpen} onClose={() => setLogOpen(false)} station={station} escapeBehavior="reset" />
    </main>
  );
}
