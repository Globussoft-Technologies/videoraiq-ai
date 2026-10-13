import axios from "axios";

const result = (verdict, reason, availability) => ({ verdict, reason, availability, observedAt: new Date() });
const waiting = new Set(["starting", "queued", "loading", "connecting", "initializing", "buffering"]);
const idle = new Set(["idle", "stopped", "standby", "inactive"]);
const failed = new Set(["failed", "error", "unavailable", "offline"]);
const statusFailures = new Set(["RTSP_OFFLINE", "STREAM_SERVICE_FAILED"]);

// Only classify the status service's report. Never request a playlist or start a stream.
function classifyStatus(sample, previous) {
  if (sample.rtsp_online === false) return result("FAILED", "RTSP_OFFLINE", "OFFLINE");
  if (sample.rtsp_online !== true) return result("INCONCLUSIVE", "SOURCE_STATUS_UNKNOWN");
  const status = String(sample.stream_status || "").trim().toLowerCase();
  const rawViewers = sample.viewers ?? sample.viewer_count;
  const viewers = Array.isArray(rawViewers) ? rawViewers.length
    : typeof rawViewers === "number" && Number.isFinite(rawViewers) ? rawViewers : null;
  if (waiting.has(status) || (idle.has(status) && viewers > 0))
    return result("DEFERRED", "PLAYER_STARTING", "STARTING");
  if (idle.has(status) || (status === "running" && viewers === 0)) {
    // RTSP online is enough to resolve an RTSP-only outage, even if playback remains idle.
    if (previous?.activeOutage?.reason === "RTSP_OFFLINE"
      || (previous?.state === "SUSPECTED_DOWN" && previous.latestResult?.reason === "RTSP_OFFLINE"))
      return result("HEALTHY", "SOURCE_RECOVERED_IDLE", "IDLE");
    return result("DEFERRED", "ON_DEMAND_IDLE", "IDLE");
  }
  if (status === "running") {
    // A status report cannot establish recovery from a historical media-check outage.
    if (previous?.activeOutage && !statusFailures.has(previous.activeOutage.reason))
      return result("DEFERRED", "STATUS_REPORTED_RUNNING", "REPORTED_RUNNING");
    return result("HEALTHY", "STATUS_REPORTED_RUNNING", "REPORTED_RUNNING");
  }
  if (failed.has(status)) return result("FAILED", "STREAM_SERVICE_FAILED", "OFFLINE");
  return result("INCONCLUSIVE", "STREAM_STATUS_UNKNOWN");
}

export async function mapLimit(items, concurrency, operation) {
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) await operation(items[index++]);
  }));
}

// Fetch batched JSON status snapshots; playback and its on-demand lifecycle remain separate.
export async function readStatuses(cameras, settings, consume, isActive, states = new Map()) {
  const groups = new Map();
  for (const camera of cameras) {
    if (camera.mappingError) {
      if (isActive()) await consume(camera, { observedAt: new Date(), verdict: "INCONCLUSIVE", reason: "CAMERA_MAPPING_INVALID" });
    } else {
      const group = groups.get(camera.host) || [];
      group.push(camera); groups.set(camera.host, group);
    }
  }
  // One host at a time: its media concurrency is bounded, so the global cap is never exceeded.
  for (const [host, group] of groups) {
    for (let offset = 0; offset < group.length && isActive(); offset += settings.batchSize) {
      const batch = group.slice(offset, offset + settings.batchSize);
      let samples = new Map();
      let statusError = null;
      try {
        const response = await axios.post(`${host}/api/cameras/status`, {
          ids: [...new Set(batch.map(camera => camera.statusId))],
        }, { timeout: settings.timeoutMs, maxRedirects: 0, maxContentLength: 5 * 1024 * 1024 });
        if (Array.isArray(response.data?.cameras))
          samples = new Map(response.data.cameras.filter(sample => typeof sample?.id === "string").map(sample => [sample.id, sample]));
        else statusError = "INVALID_STATUS_RESPONSE";
      } catch { statusError = "STATUS_SERVICE_UNAVAILABLE"; }
      await mapLimit(batch, Math.min(settings.concurrency, settings.hostConcurrency), async camera => {
        if (!isActive()) return;
        const sample = samples.get(camera.statusId);
        const reading = statusError || !sample
          ? { observedAt: new Date(), verdict: "INCONCLUSIVE", reason: statusError || "CAMERA_STATUS_MISSING" }
          : classifyStatus(sample, states.get(String(camera.cameraId)));
        if (isActive()) await consume(camera, reading);
      });
    }
  }
}
