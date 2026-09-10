import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { backendOrigin, fetchMeasurementIncident, fetchMeasurementIncidentBySku, hasMeasuredData, logStationSuccess } from './stationIntegration';

const RECOVERY_POLL_MS = 2500;

function incidentSku(value) {
  return String(value?.qrSku || value?.qrMetadata?.sku || '').trim().toUpperCase();
}

export default function useMeasurementSocket(station, initialIncident = null) {
  const [incident, setIncident] = useState(initialIncident);
  const [connected, setConnected] = useState(false);
  const incidentRef = useRef(initialIncident);
  const loggedMeasurementRef = useRef('');

  const applyIncident = useCallback((latest, source) => {
    if (!latest) return;
    incidentRef.current = latest;
    setIncident(latest);
    if (hasMeasuredData(latest)) {
      const key = `${latest._id || ''}:${latest.dsProcessedAt || ''}`;
      if (key !== loggedMeasurementRef.current) {
        loggedMeasurementRef.current = key;
        logStationSuccess('ds-measurement-received', {
          incidentId: latest._id,
          sku: latest.qrSku || latest.qrMetadata?.sku,
          stationId: latest.stationId,
          source,
          message: 'DS measured data received and loaded in the dashboard',
        });
      }
    }
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
    const sku = incidentSku(current);
    if (sku) return fetchMeasurementIncidentBySku(station, sku, signal);
    if (current?._id) return fetchMeasurementIncident(station, current._id, signal);
    return null;
  }, [initialIncident, station]);

  // Read the newest incident by its QR SKU and keep checking while depth data
  // is pending, so a missed socket event or reconnect cannot leave the
  // dashboard stuck on WAIT.
  useEffect(() => {
    if (!initialIncident?._id || !station?.backend?.token || !station?.backend?.ip) return undefined;
    const controller = new AbortController();
    let timer;
    const poll = async () => {
      try {
        const latest = await refreshIncident(controller.signal);
        if (latest) {
          applyIncident(latest, 'sku-get');
        }
        if (!controller.signal.aborted && !hasMeasuredData(latest)) {
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
      if (!current || sameId || sameSku) applyIncident(latest, 'measurement-socket');
    });
    return () => socket.disconnect();
  }, [applyIncident, refreshIncident, station?.backend?.ip, station?.backend?.token]);

  return { incident, setIncident, connected };
}
