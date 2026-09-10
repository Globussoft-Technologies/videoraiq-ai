import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  backendCaptureUrl,
  cameraId,
  cameraList,
  captureAndUpload,
  isCameraOnline,
  logStationError,
  measurementStartUrl,
  mergeBootstrap,
  qrExtractionUrl,
  readStationFromLocation,
  resolvePiUrl,
  saveStation,
  selectMeasurementCamera,
  stationConfigurationError,
} from './stationIntegration';

const POLL_INTERVAL_MS = 4000;

function cameraSnapshot(cameras) {
  // Pi heartbeat fields can change on every poll. Only treat camera details
  // used by this screen as a real change, otherwise the automatic QR effect
  // is repeatedly torn down while it is decoding a difficult frame.
  return JSON.stringify(cameraList(cameras).map((camera) => ({
    id: cameraId(camera),
    online: isCameraOnline(camera),
    kind: camera?.kind || '',
    transport: camera?.transport || '',
    captureUrl: camera?.capture_url || '',
    streamUrl: camera?.stream_url || '',
  })));
}

export default function useStationIntegration() {
  const [station, setStation] = useState(() => readStationFromLocation());
  const [cameras, setCameras] = useState(() => cameraList(station?.pi?.cameras));
  const [warning, setWarning] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [operationError, setOperationError] = useState(null);
  const abortRef = useRef(null);
  const cameraSnapshotRef = useRef(cameraSnapshot(cameraList(station?.pi?.cameras)));

  const configurationError = stationConfigurationError(station);
  const selectedCamera = useMemo(
    () => selectMeasurementCamera(cameras),
    [cameras],
  );

  useEffect(() => {
    const onBootstrap = (event) => {
      if (event.data?.type !== 'videoraiq:bootstrap') return;
      if (window.parent !== window && event.source !== window.parent) return;
      setStation((current) => {
        const next = mergeBootstrap(current, event.data);
        const nextCameras = cameraList(next.pi?.cameras);
        saveStation(next);
        cameraSnapshotRef.current = cameraSnapshot(nextCameras);
        setCameras(nextCameras);
        return next;
      });
    };

    window.addEventListener('message', onBootstrap);
    window.parent.postMessage({ type: 'videoraiq:ready' }, '*');
    return () => window.removeEventListener('message', onBootstrap);
  }, []);

  useEffect(() => {
    if (!station) return;
    saveStation(station);
  }, [station]);

  useEffect(() => {
    const piApi = station?.pi?.api;
    if (!piApi) return undefined;
    let active = true;
    let timer;
    let requestController;

    const schedule = () => {
      if (!active) return;
      timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    };

    const poll = async () => {
      requestController = new AbortController();
      try {
        const response = await fetch(resolvePiUrl(piApi, '', '/api/cameras'), {
          cache: 'no-store',
          signal: requestController.signal,
        });
        if (!response.ok) throw new Error(`Camera API returned ${response.status}`);
        const next = cameraList(await response.json());
        if (!active) return;
        const nextSnapshot = cameraSnapshot(next);
        if (nextSnapshot !== cameraSnapshotRef.current) {
          cameraSnapshotRef.current = nextSnapshot;
          setCameras(next);
          window.dispatchEvent(new CustomEvent('videoraiq:cameras', { detail: next }));
        }
        setWarning((current) => (current ? '' : current));
      } catch (error) {
        if (active && error.name !== 'AbortError') {
          const message = `Camera connection unavailable: ${error.message}`;
          setWarning((current) => (current === message ? current : message));
        }
      } finally {
        schedule();
      }
    };

    poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
      requestController?.abort();
    };
  }, [station?.pi?.api]);

  useEffect(() => {
    window.videoraiqCamera = selectedCamera;
  }, [selectedCamera]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const startCapture = useCallback(async ({ timeoutMs = 15_000, jpegBlob, qrResponse, captureMode = 'manual' } = {}) => {
    if (configurationError) throw new Error(configurationError);
    if (!selectedCamera) throw new Error('No camera was found');
    if (!isCameraOnline(selectedCamera)) throw new Error('No online camera is available');

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const progress = {};
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      abortRef.current?.abort();
    }, timeoutMs);
    setCapturing(true);
    setWarning('');
    setOperationError(null);
    try {
      return await captureAndUpload({
        station,
        camera: selectedCamera,
        signal: abortRef.current.signal,
        progress,
        jpegBlob,
        qrResponse,
        captureMode,
      });
    } catch (error) {
      let reportedError = error;
      if (timedOut) {
        if (progress.qrCompleted && !progress.uploadCompleted) {
          reportedError = new Error('The QR was decoded, but its image upload did not finish within 15 seconds. Please check the backend upload API and storage provider.');
          reportedError.stage = 'capture-upload-timeout';
          reportedError.endpoint = backendCaptureUrl(station?.backend?.ip);
        } else if (progress.incidentCompleted && !progress.measurementStarted) {
          reportedError = new Error('The QR incident was saved, but the depth measurement service did not accept the SKU within 15 seconds.');
          reportedError.stage = 'measurement-start-timeout';
          reportedError.endpoint = measurementStartUrl(station?.pi?.api, station?.pi?.device?.ip);
        } else if (progress.captureCompleted && !progress.qrCompleted) {
          reportedError = new Error('The image was captured, but the manual DS QR fallback did not return a readable QR within 15 seconds.');
          reportedError.stage = 'ds-qr-extraction-timeout';
          reportedError.endpoint = qrExtractionUrl(station?.pi?.api, station?.pi?.device?.ip);
        } else {
          reportedError = new Error('The capture flow did not finish within 15 seconds. Check the camera, upload API, and measurement service logs.');
          reportedError.stage = progress.captureCompleted ? 'start-request-timeout' : 'camera-capture-timeout';
          reportedError.endpoint = progress.captureCompleted
            ? `${backendCaptureUrl(station?.backend?.ip)} | ${measurementStartUrl(station?.pi?.api, station?.pi?.device?.ip)}`
            : station?.pi?.api;
        }
      }
      if (reportedError.name !== 'AbortError') {
        const diagnostic = logStationError(reportedError, {
          cameraId: cameraId(selectedCamera),
          piApi: station?.pi?.api,
        });
        setOperationError(diagnostic);
        window.dispatchEvent(new CustomEvent('videoraiq:measurement-capture-error', { detail: diagnostic }));
      }
      throw reportedError;
    } finally {
      window.clearTimeout(timeout);
      setCapturing(false);
    }
  }, [configurationError, selectedCamera, station]);

  return {
    station,
    cameras,
    selectedCamera,
    configurationError,
    warning,
    operationError,
    dismissOperationError: () => setOperationError(null),
    capturing,
    startCapture,
  };
}
