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
import useStationKioskFocus from './useStationKioskFocus';
import {
  isEditableShortcutTarget,
  logStationError,
  logStationSuccess,
  matchesEscapeShortcut,
  matchesStationShortcut,
  prepareStationAudio,
  readDecisionCounts,
  scanCameraForQr,
  toggleStationFullscreen,
} from './stationIntegration';

// A fresh frame is requested shortly after the previous decode finishes. This
// keeps the scanner responsive without overlapping camera/decode requests.
const AUTO_SCAN_INTERVAL_MS = 500;
const AUTO_DS_FALLBACK_INTERVAL_MS = 1000;

function qrIdentity(qrResponse) {
  if (qrResponse?.raw) return qrResponse.raw;
  const dimensions = qrResponse?.dimensions || {};
  return [dimensions.ref_no || dimensions.refNo, dimensions.sku].filter(Boolean).join(':');
}

export default function FloMattressStation() {
  const navigate = useNavigate();
  const location = useLocation();
  const kioskSurfaceRef = useStationKioskFocus();
  const { station, selectedCamera, configurationError, operationError, dismissOperationError, capturing, startCapture } = useStationIntegration();
  const redirectedError = location.state?.stationError || null;
  const visibleOperationError = operationError || redirectedError;
  const counts = readDecisionCounts();
  const [logOpen, setLogOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(15);
  const [liveScannerAvailable, setLiveScannerAvailable] = useState(false);
  const automaticScanRef = useRef({ blockedRaw: '', lastError: '', lastDsAttemptAt: 0 });
  const workflowBusyRef = useRef(false);
  const toggleLogs = useCallback(() => setLogOpen((current) => !current), []);

  useEffect(() => {
    const prepareAudio = () => prepareStationAudio();
    window.addEventListener('pointerdown', prepareAudio, { capture: true, once: true });
    window.addEventListener('keydown', prepareAudio, { capture: true, once: true });
    return () => {
      window.removeEventListener('pointerdown', prepareAudio, true);
      window.removeEventListener('keydown', prepareAudio, true);
    };
  }, []);

  const runCapture = useCallback(async (automaticCapture = null) => {
    if (workflowBusyRef.current || capturing || processing) return;
    workflowBusyRef.current = true;
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
      workflowBusyRef.current = false;
    }
  }, [capturing, navigate, processing, startCapture, station]);
  const start = useCallback(() => {
    prepareStationAudio();
    return runCapture();
  }, [runCapture]);
  const handleLiveQrDetected = useCallback((qrResponse) => runCapture({ qrResponse }), [runCapture]);

  useEffect(() => {
    if (capturing || processing || visibleOperationError || configurationError || !selectedCamera || !station) return undefined;
    let active = true;
    let timer;
    let requestController;

    const schedule = () => {
      // Once direct live-frame scanning works, snapshots become a low-rate
      // safety net instead of the primary scanner.
      const delay = liveScannerAvailable ? 1500 : AUTO_SCAN_INTERVAL_MS;
      if (active) timer = window.setTimeout(scan, delay);
    };
    const scan = async () => {
      requestController = new AbortController();
      try {
        const now = Date.now();
        // A readable live stream is scanned continuously without network
        // round-trips. Keep snapshot ZXing as a fallback, but avoid racing the
        // DS endpoint because a successful DS QR call also starts measurement.
        const useDsFallback = !liveScannerAvailable
          && now - automaticScanRef.current.lastDsAttemptAt >= AUTO_DS_FALLBACK_INTERVAL_MS;
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
  }, [capturing, configurationError, liveScannerAvailable, processing, runCapture, selectedCamera, station, visibleOperationError]);

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
    <main ref={kioskSurfaceRef} tabIndex={-1} className="vq-root flex h-screen min-h-0 flex-col overflow-hidden bg-[var(--appbg)] text-[var(--tx)] outline-none">
      <StationTopbar running={capturing || processing} onStartStop={start} onToggleLogs={toggleLogs} onToggleFullscreen={() => toggleStationFullscreen().catch(() => {})} stationId={station?.pi?.device?.mac} {...counts} />
      <section className="relative flex min-h-0 flex-1 overflow-auto bg-[#eef0f7] p-3 dark:bg-[var(--appbg)] lg:p-4">
        <div className="relative grid min-h-[560px] w-full flex-1 gap-3 lg:min-h-0 lg:grid-cols-2 lg:items-stretch">
          <StationIdleCard onStart={start} disabled={capturing || processing || Boolean(configurationError) || !selectedCamera} capturing={capturing || processing} />
          <LiveCameraFeed
            camera={selectedCamera}
            piApi={station?.pi?.api}
            scanEnabled={!capturing && !processing && !visibleOperationError && !configurationError}
            onQrDetected={handleLiveQrDetected}
            onScannerAvailabilityChange={setLiveScannerAvailable}
          />
        </div>
      </section>
      <StationBottomBar onStart={start} disabled={capturing || processing || Boolean(configurationError) || !selectedCamera} capturing={capturing || processing} />
      <MeasurementLogDrawer open={logOpen} onClose={() => setLogOpen(false)} station={station} escapeBehavior="close" />
      {processing && <ProcessingOverlay secondsRemaining={secondsRemaining} />}
      <StationErrorDialog error={visibleOperationError} onDismiss={dismissVisibleOperationError} />
    </main>
  );
}
