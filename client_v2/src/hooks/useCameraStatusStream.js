import { useEffect, useMemo, useState } from 'react';
import { subscribeCamerasStatus } from '../helpers/cameraStatus';

// The raw stream has no built-in retry — a network blip or the backend
// recycling the connection just ends it. Reconnecting on a short fixed delay
// keeps the tally live without hammering the endpoint.
const RECONNECT_DELAY_MS = 3000;

/**
 * Streaming counterpart to `useApi(() => getCamerasStatus(ids), ..., { pollMs })`.
 * Opens one persistent connection (POST .../cameras/status with stream:true)
 * that the backend pushes a fresh summary down every ~3s, instead of this
 * hook re-polling on a timer. Same `{ data, loading, error }` shape as useApi
 * so call sites swap in with no downstream changes.
 */
export function useCameraStatusStream(targets, { enabled = true } = {}) {
  const normalizedTargets = useMemo(
    () => (Array.isArray(targets) ? targets.filter(Boolean) : [targets].filter(Boolean)),
    [targets]
  );
  const targetsKey = normalizedTargets.map((target) => {
    if (typeof target === 'string') return target;
    const id = target?.id || target?.localChannelId || target?._id || target?.channelId || '';
    const domain =
      target?.nvrId?.domain ||
      target?.nvr?.domain ||
      target?.nvrData?.domain ||
      target?.domain ||
      '';
    return `${id}@${domain}`;
  }).join(',');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled && normalizedTargets.length > 0);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled || !normalizedTargets.length) {
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    let stopped = false;
    let reconnectTimer = null;
    let unsubscribe = null;

    const scheduleReconnect = () => {
      if (stopped) return;
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
    };

    function connect() {
      if (stopped) return;
      unsubscribe = subscribeCamerasStatus(normalizedTargets, {
        onData: (summary) => {
          setData(summary);
          setLoading(false);
          setError(null);
        },
        onError: (err) => {
          setError(err);
          unsubscribe?.();
          unsubscribe = null;
          scheduleReconnect();
        },
        onClose: scheduleReconnect,
      });
    }
    connect();

    return () => {
      stopped = true;
      clearTimeout(reconnectTimer);
      unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetsKey, enabled]);

  return { data, loading, error };
}
