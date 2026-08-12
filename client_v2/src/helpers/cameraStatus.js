import axios from 'axios';

const LOCAL_SETUP = import.meta.env.VITE_LOCAL_SETUP === 'true';

/**
 * Status API routing has two modes:
 * - Local setup: resolve per target/NVR so each recorder can answer for its own cameras.
 * - Cloud/staging: always use the fixed status host from VITE_STATUS_URL.
 */
function statusBase() {
  const host = import.meta.env.VITE_STATUS_URL || '';
  return host.replace(/\/+$/, '');
}

function stripTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function streamingBase(target) {
  const raw =
    target?.streamingUrl ||
    target?.StreamingUrl ||
    target?.config?.StreamingUrl ||
    target?.streamingPath ||
    '';

  if (!raw) return '';

  try {
    const url = new URL(String(raw), window.location.origin);
    if (!/^https?:$/i.test(url.protocol)) return '';
    return stripTrailingSlash(url.origin);
  } catch {
    return '';
  }
}

function nvrDomainBase(target) {
  return stripTrailingSlash(
    target?.nvrId?.domain ||
    target?.nvr?.domain ||
    target?.nvrData?.domain ||
    streamingBase(target) ||
    target?.domain ||
    target?.config?.domain ||
    ''
  );
}

function targetStatusBase(target) {
  if (LOCAL_SETUP) {
    const domainBase = nvrDomainBase(target);
    if (domainBase) return domainBase;
  }
  return statusBase();
}

function statusUrl(base, path) {
  return `${stripTrailingSlash(base)}${path.startsWith('/') ? path : `/${path}`}`;
}

function normalizeStatusTarget(target) {
  if (!target) return null;
  if (typeof target === 'string') {
    const id = target.trim();
    return id ? { id, baseUrl: statusBase() } : null;
  }

  const id =
    target?.id ||
    target?.cameraStatusId ||
    target?.localChannelId ||
    cameraStatusId(target);
  if (!id) return null;

  return {
    id,
    baseUrl: targetStatusBase(target),
  };
}

function targetGroups(targets) {
  const groups = new Map();

  (Array.isArray(targets) ? targets : [targets])
    .map(normalizeStatusTarget)
    .filter((target) => target?.id && target?.baseUrl)
    .forEach((target) => {
      const key = target.baseUrl;
      const existing = groups.get(key) || [];
      existing.push(target.id);
      groups.set(key, existing);
    });

  return [...groups.entries()].map(([baseUrl, ids]) => ({
    baseUrl,
    ids: [...new Set(ids)],
  }));
}

function mergeSummaries(summaries) {
  const cameraMap = new Map();
  let serverNetwork = null;

  summaries.forEach((summary) => {
    (summary?.cameras || []).forEach((camera) => {
      if (camera?.id) cameraMap.set(camera.id, camera);
    });
    if (!serverNetwork && summary?.server_network) serverNetwork = summary.server_network;
  });

  return {
    cameras: [...cameraMap.values()],
    server_network: serverNetwork,
  };
}

/**
 * Bulk camera status — rtsp_online/stream_status/viewers/playback_status per
 * camera, plus the global server_network reading. Omit `ids` to get every
 * configured camera. No auth token on this endpoint (see CAMERA_STATUS_API.md).
 *
 * POSTs the ids in the body rather than a `?ids=` query string — a GET here
 * used to cap callers at ~500 ids to stay under URL length limits; the body
 * has no such ceiling; this API is tested to work with 100s-1000s of ids.
 */
export const getCamerasStatus = async (targets) => {
  const groups = targetGroups(targets);
  if (!groups.length) return {};

  const responses = await Promise.all(
    groups.map(async ({ baseUrl, ids }) => {
      const res = await axios.post(statusUrl(baseUrl, '/api/cameras/status'), ids.length ? { ids } : {});
      return res?.data || {};
    })
  );

  return mergeSummaries(responses);
};

/**
 * Streaming variant of getCamerasStatus: opens one connection and the backend
 * pushes a fresh summary down it every ~3s (SSE-framed: `data: {...}\n\n`)
 * until it's unsubscribed, instead of the caller re-polling on a timer. Uses
 * `fetch` directly (not axios) since it needs the raw response body reader.
 *
 * Returns an unsubscribe function. `onClose` fires when the stream ends
 * without an error (the backend or network closed it) — a plain drop, not a
 * failure, so callers may want to reconnect on it too (see
 * hooks/useCameraStatusStream.js, which does).
 */
export function subscribeCamerasStatus(targets, { onData, onError, onClose } = {}) {
  const controllers = [];
  const groups = targetGroups(targets);
  const latestByBase = new Map();
  let activeStreams = groups.length;
  let closed = false;

  if (!groups.length) {
    queueMicrotask(() => onClose?.());
    return () => {};
  }

  groups.forEach(({ baseUrl, ids }) => {
    const controller = new AbortController();
    controllers.push(controller);

    (async () => {
      try {
        const res = await fetch(statusUrl(baseUrl, '/api/cameras/status'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids, stream: true }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`Camera status stream failed (${res.status})`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';

        while (true) {
          // eslint-disable-next-line no-await-in-loop
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          let frameEnd;
          while ((frameEnd = buf.indexOf('\n\n')) !== -1) {
            const frame = buf.slice(0, frameEnd);
            buf = buf.slice(frameEnd + 2);
            if (!frame.startsWith('data: ')) continue;
            try {
              latestByBase.set(baseUrl, JSON.parse(frame.slice(6)));
              onData?.(mergeSummaries([...latestByBase.values()]));
            } catch {
              // malformed frame — skip it, the connection is still good
            }
          }
        }

        activeStreams -= 1;
        if (!closed && activeStreams === 0) onClose?.();
      } catch (err) {
        if (err?.name !== 'AbortError') onError?.(err);
      }
    })();
  });

  return () => {
    closed = true;
    controllers.forEach((controller) => controller.abort());
  };
}

/** Same fields as one entry of getCamerasStatus()'s `cameras` array, single camera. */
export const getCameraStatus = async (camId) => {
  const res = await axios.get(`${statusBase()}/api/camera/${camId}/status`);
  return res?.data || {};
};

/** Frontend player reports its real playback state every 5s while mounted. */
export const postStreamHeartbeat = async ({ cameraId, sessionId, state }) => {
  const res = await axios.post(`${statusBase()}/api/stream-heartbeat`, {
    camera_id: cameraId,
    session_id: sessionId,
    state,
  });
  return res?.data || {};
};

/** The deciding factors for "this camera is live": RTSP reachable AND this
 * server is actually producing fresh HLS segments for it right now. */
export function isCameraLive(cam) {
  return !!cam && cam.rtsp_online === true && cam.stream_status === 'running';
}

/** Aggregate "online count" uses RTSP reachability only. This intentionally
 * differs from the stricter per-camera live badge, which also requires the
 * stream to be actively running. */
export function isCameraRtspOnline(cam) {
  return !!cam && cam.rtsp_online === true;
}

/**
 * The Camera Status API keys every camera by the same id embedded in its
 * stream path (e.g. `id: "nvr_123-ch6"` <-> `stream_url:
 * "stream/nvr_123-ch6/playlist.m3u8"`) — NOT the channel's Mongo `_id` or
 * `channelId`. `localChannelId` already IS that id verbatim (a required
 * field on every channel — see channels.model.js), so prefer it directly;
 * fall back to parsing it out of `streamingUrl` (the field lib/stream.js
 * reads to build the actual HLS URL) for channels/deployments that only
 * carry that field.
 */
export function cameraStatusId(channel) {
  if (channel?.localChannelId) return channel.localChannelId;
  const raw = channel?.streamingUrl || channel?.StreamingUrl || channel?.config?.StreamingUrl || channel?.streamingPath || '';
  const match = String(raw).match(/stream\/([^/?]+)\/playlist\.m3u8/i);
  return match ? match[1] : null;
}
