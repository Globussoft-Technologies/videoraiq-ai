import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import LiveCameraFeed from './components/LiveCameraFeed';
import MeasurementLogDrawer from './components/MeasurementLogDrawer';
import ProcessingOverlay from './components/ProcessingOverlay';
import StationErrorDialog from './components/StationErrorDialog';
import StationBottomBar from './components/StationBottomBar';
import StationIdleCard from './components/StationIdleCard';
import StationTopbar from './components/StationTopbar';
import useStationIntegration from './useStationIntegration';
import {
  isEditableShortcutTarget,
  logStationError,
  logStationSuccess,
  matchesEscapeShortcut,
  matchesStationShortcut,
  readDecisionCounts,
  scanCameraForQr,
  toggleStationFullscreen,
} from './stationIntegration';

const AUTO_SCAN_INTERVAL_MS = 1500;
const AUTO_DS_FALLBACK_INTERVAL_MS = 3000;

function qrIdentity(qrResponse) {
  if (qrResponse?.raw) return qrResponse.raw;
  const dimensions = qrResponse?.dimensions || {};
  return [dimensions.ref_no || dimensions.refNo, dimensions.sku].filter(Boolean).join(':');
}

export default function FloMattressStation() {
  const navigate = useNavigate();
  const location = useLocation();
  const { station, selectedCamera, configurationError, operationError, dismissOperationError, capturing, startCapture } = useStationIntegration();
  const redirectedError = location.state?.stationError || null;
  const visibleOperationError = operationError || redirectedError;
  const counts = readDecisionCounts();
  const [logOpen, setLogOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(15);
  const automaticScanRef = useRef({ blockedRaw: '', lastError: '', lastDsAttemptAt: 0 });
  const toggleLogs = useCallback(() => setLogOpen((current) => !current), []);
  const runCapture = useCallback(async (automaticCapture = null) => {
    if (capturing || processing) return;
    const startedAt = Date.now();
    let countdown;
    setProcessing(true);
    setSecondsRemaining(15);
    countdown = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setSecondsRemaining(Math.max(0, 15 - elapsed));
    }, 250);
    try {
      if (automaticCapture?.qrResponse) {
        logStationSuccess('automatic-qr-detected', {
          sku: automaticCapture.qrResponse.dimensions?.sku,
          stationId: station?.pi?.device?.mac,
          source: 'station-auto-scanner',
          message: 'Automatic QR capture started the measurement workflow',
        });
      }
      const capture = await startCapture({
        timeoutMs: 15_000,
        jpegBlob: automaticCapture?.jpegBlob,
        qrResponse: automaticCapture?.qrResponse,
        captureMode: automaticCapture ? 'automatic' : 'manual',
      });
      navigate('/mattress/dashboard', { state: { capture, incident: capture.incident, station } });
    } catch {
      // The hook reports the failure while leaving the kiosk usable.
      const identity = qrIdentity(automaticCapture?.qrResponse);
      if (identity) automaticScanRef.current.blockedRaw = identity;
    } finally {
      window.clearInterval(countdown);
      setProcessing(false);
    }
  }, [capturing, navigate, processing, startCapture, station]);
  const start = useCallback(() => runCapture(), [runCapture]);

  useEffect(() => {
    if (capturing || processing || visibleOperationError || configurationError || !selectedCamera || !station) return undefined;
    let active = true;
    let timer;
    let requestController;

    const schedule = () => {
      if (active) timer = window.setTimeout(scan, AUTO_SCAN_INTERVAL_MS);
    };
    const scan = async () => {
      requestController = new AbortController();
      try {
        const now = Date.now();
        const useDsFallback = now - automaticScanRef.current.lastDsAttemptAt >= AUTO_DS_FALLBACK_INTERVAL_MS;
        if (useDsFallback) automaticScanRef.current.lastDsAttemptAt = now;
        const detected = await scanCameraForQr(
          station,
          selectedCamera,
          requestController.signal,
          { useDsFallback },
        );
        if (!active) return;
        if (!detected) {
          automaticScanRef.current.blockedRaw = '';
          automaticScanRef.current.lastError = '';
          schedule();
          return;
        }
        const identity = qrIdentity(detected.qrResponse);
        if (identity && identity === automaticScanRef.current.blockedRaw) {
          schedule();
          return;
        }
        await runCapture(detected);
      } catch (error) {
        if (active && error.name !== 'AbortError') {
          // Keep the scanner alive even if diagnostics cannot be persisted
          // (for example, localStorage is unavailable or full).
          schedule();
          const errorKey = `${error.stage || error.name}:${error.message}:${error.qrRaw || ''}`;
          if (errorKey !== automaticScanRef.current.lastError) {
            automaticScanRef.current.lastError = errorKey;
            logStationError(error, {
              cameraId: selectedCamera?.id,
              piApi: station?.pi?.api,
              stage: 'automatic-qr-scan',
            });
          }
        }
      }
    };

    schedule();
    return () => {
      active = false;
      window.clearTimeout(timer);
      requestController?.abort();
    };
  }, [capturing, configurationError, processing, runCapture, selectedCamera, station, visibleOperationError]);

  useEffect(() => {
    const onKeyDown = (event) => {
      // The error dialog owns Escape while it is visible.
      if (visibleOperationError) return;
      if (isEditableShortcutTarget(event.target) || event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
      if (logOpen) {
        if (matchesStationShortcut(event, 'l') || matchesEscapeShortcut(event)) {
          event.preventDefault();
          if (matchesEscapeShortcut(event)) event.stopImmediatePropagation();
          setLogOpen(false);
        }
        return;
      }
      if (matchesStationShortcut(event, 's')) { event.preventDefault(); start(); }
      if (matchesStationShortcut(event, 'l')) { event.preventDefault(); toggleLogs(); }
      if (matchesStationShortcut(event, 'f')) { event.preventDefault(); toggleStationFullscreen().catch(() => {}); }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [logOpen, start, toggleLogs, visibleOperationError]);

  const dismissVisibleOperationError = useCallback(() => {
    dismissOperationError();
    if (redirectedError) {
      navigate(location.pathname, {
        replace: true,
        state: { ...(location.state || {}), stationError: null },
      });
    }
  }, [dismissOperationError, location.pathname, location.state, navigate, redirectedError]);

  return (
    <main className="vq-root flex h-screen min-h-0 flex-col overflow-hidden bg-[var(--appbg)] text-[var(--tx)]">
      <StationTopbar running={capturing || processing} onStartStop={start} onToggleLogs={toggleLogs} onToggleFullscreen={() => toggleStationFullscreen().catch(() => {})} stationId={station?.pi?.device?.mac} {...counts} />
      <section className="relative flex min-h-0 flex-1 overflow-auto bg-[#eef0f7] p-3 dark:bg-[var(--appbg)] lg:p-4">
        <div className="relative grid min-h-[560px] w-full flex-1 gap-3 lg:min-h-0 lg:grid-cols-2 lg:items-stretch">
          <StationIdleCard onStart={start} disabled={capturing || processing || Boolean(configurationError) || !selectedCamera} capturing={capturing || processing} />
          <LiveCameraFeed camera={selectedCamera} piApi={station?.pi?.api} />
        </div>
      </section>
      <StationBottomBar onStart={start} disabled={capturing || processing || Boolean(configurationError) || !selectedCamera} capturing={capturing || processing} />
      <MeasurementLogDrawer open={logOpen} onClose={() => setLogOpen(false)} station={station} escapeBehavior="close" />
      {processing && <ProcessingOverlay secondsRemaining={secondsRemaining} />}
      <StationErrorDialog error={visibleOperationError} onDismiss={dismissVisibleOperationError} />
    </main>
  );
}
