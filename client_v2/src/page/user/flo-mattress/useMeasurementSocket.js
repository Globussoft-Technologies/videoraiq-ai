import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { backendOrigin, fetchMeasurementIncident, fetchMeasurementIncidentBySku, hasMeasuredData, logStationSuccess } from './stationIntegration';

const RECOVERY_POLL_MS = 2500;

function incidentSku(value) {
  return String(value?.qrSku || value?.qrMetadata?.sku || '').trim().toUpperCase();
}

function incidentId(value) {
  return String(value?._id || '').trim();
}

export default function useMeasurementSocket(station, initialIncident = null) {
  const [incident, setIncident] = useState(initialIncident);
  const [connected, setConnected] = useState(false);
  const incidentRef = useRef(initialIncident);
  const loggedMeasurementRef = useRef('');

  const applyIncident = useCallback((latest, source) => {
    if (!latest) return false;
    const current = incidentRef.current;
    const currentId = incidentId(current);
    const latestId = incidentId(latest);

    // This dashboard belongs to one captured unit. Never replace it with a
    // different incident merely because another capture used the same SKU.
    if (currentId && latestId && currentId !== latestId) return false;

    // Socket events and recovery requests can finish out of order. Once the
    // measurement is complete, a stale pending snapshot must not clear it.
    if (hasMeasuredData(current) && !hasMeasuredData(latest)) return false;

    // Backend reads normally return the complete document, but preserving
    // already-rendered fields also makes partial same-incident socket updates
    // safe. In particular, an omitted image must not blank a visible result.
    const next = current ? {
      ...current,
      ...latest,
      qrMetadata: latest.qrMetadata || current.qrMetadata,
      qrImagePath: latest.qrImagePath || current.qrImagePath,
      qrImage: latest.qrImage || current.qrImage,
      measuredData: hasMeasuredData(latest) ? latest.measuredData : current.measuredData,
      measurementImage: latest.measurementImage || current.measurementImage,
      dsProcessedAt: latest.dsProcessedAt || current.dsProcessedAt,
      status: current.status !== 'pending' && latest.status === 'pending'
        ? current.status
        : (latest.status ?? current.status),
    } : latest;

    incidentRef.current = next;
    setIncident(next);
    if (hasMeasuredData(next)) {
      const key = `${next._id || ''}:${next.dsProcessedAt || ''}`;
      if (key !== loggedMeasurementRef.current) {
        loggedMeasurementRef.current = key;
        logStationSuccess('ds-measurement-received', {
          incidentId: next._id,
          sku: next.qrSku || next.qrMetadata?.sku,
          stationId: next.stationId,
          source,
          message: 'DS measured data received and loaded in the dashboard',
        });
      }
    }
    return true;
  }, []);

  useEffect(() => {
    incidentRef.current = incident;
  }, [incident]);

  useEffect(() => {
    if (!initialIncident?._id) return;
    incidentRef.current = initialIncident;
    setIncident(initialIncident);
  }, [initialIncident?._id]);

  const refreshIncident = useCallback(async (signal) => {
    const current = incidentRef.current || initialIncident;
    if (current?._id) return fetchMeasurementIncident(station, current._id, signal);
    const sku = incidentSku(current);
    if (sku) return fetchMeasurementIncidentBySku(station, sku, signal);
    return null;
  }, [initialIncident, station]);

  // Keep checking this capture's incident while depth data is pending, so a
  // missed socket event or reconnect cannot leave the dashboard stuck on WAIT.
  useEffect(() => {
    if (!initialIncident?._id || !station?.backend?.token || !station?.backend?.ip) return undefined;
    const controller = new AbortController();
    let timer;
    const poll = async () => {
      try {
        const latest = await refreshIncident(controller.signal);
        if (latest) {
          applyIncident(latest, 'incident-get');
        }
        if (!controller.signal.aborted && !hasMeasuredData(incidentRef.current)) {
          timer = window.setTimeout(poll, RECOVERY_POLL_MS);
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          window.dispatchEvent(new CustomEvent('videoraiq:measurement-fetch-error', { detail: error }));
          timer = window.setTimeout(poll, RECOVERY_POLL_MS);
        }
      }
    };
    poll();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [applyIncident, initialIncident?._id, refreshIncident, station?.backend?.ip, station?.backend?.token]);

  useEffect(() => {
    const token = station?.backend?.token;
    const ip = station?.backend?.ip;
    if (!token || !ip) return undefined;

    const socket = io(backendOrigin(ip), {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
    });
    socket.on('connect', () => {
      setConnected(true);
      refreshIncident().then((latest) => applyIncident(latest, 'socket-reconnect-get')).catch(() => {});
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('measurement', (latest) => {
      const current = incidentRef.current;
      const sameId = current?._id && latest?._id && String(current._id) === String(latest._id);
      const sameSku = incidentSku(current) && incidentSku(current) === incidentSku(latest);
      if (!current || sameId || (!incidentId(current) && sameSku)) {
        applyIncident(latest, 'measurement-socket');
      }
    });
    return () => socket.disconnect();
  }, [applyIncident, refreshIncident, station?.backend?.ip, station?.backend?.token]);

  return { incident, setIncident, connected };
}
