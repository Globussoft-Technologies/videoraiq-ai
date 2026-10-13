import axios from "axios";

const result = (verdict, reason, availability) => ({ verdict, reason, availability, observedAt: new Date() });
const waiting = new Set(["starting", "queued", "loading", "connecting", "initializing", "buffering"]);
const idle = new Set(["idle", "stopped", "standby", "inactive"]);
const failed = new Set(["failed", "error", "unavailable", "offline"]);
const statusFailures = new Set(["RTSP_OFFLINE", "STREAM_SERVICE_FAILED"]);
const streamStatus = camera => String(camera?.stream_status || "").trim().toLowerCase();

export function isCameraRtspOnline(camera) {
  return !!camera && camera.rtsp_online === true;
}

export function isCameraLive(camera) {
  return isCameraRtspOnline(camera) && streamStatus(camera) === "running";
}

// A non-live stream alone is not a Down candidate: idle/loading are expected.
// The caller must reject unobserved/stale/invalid reports before using this filter.
// Candidates still require the state machine's failure confirmation before alerting.
export function isStreamDownCandidate(camera) {
  return !!camera && (camera.rtsp_online === false
    || (isCameraRtspOnline(camera) && failed.has(streamStatus(camera))));
}

// Only classify the status service's report. Never request a playlist or start a stream.
function classifyStatus(sample, previous, settings) {
  // Optional metadata can rule a report out; absent metadata retains the legacy status contract.
  if (sample.observed === false) return result("INCONCLUSIVE", "STATUS_NOT_OBSERVED");
  if (sample.status_age_ms !== undefined && sample.status_age_ms !== null) {
    if (typeof sample.status_age_ms !== "number" || !Number.isFinite(sample.status_age_ms) || sample.status_age_ms < 0)
      return result("INCONCLUSIVE", "INVALID_STATUS_FRESHNESS");
    if (sample.status_age_ms > settings.staleAfterMs) return result("INCONCLUSIVE", "SOURCE_STATUS_STALE");
  }
  const availability = String(sample.availability || "").trim().toLowerCase();
  if (["unknown", "unobserved", "not_found", "disabled"].includes(availability))
    return result("INCONCLUSIVE", availability === "not_found" ? "CAMERA_STATUS_MISSING" : "SOURCE_STATUS_UNKNOWN");
  if (isStreamDownCandidate(sample))
    return result("FAILED", sample.rtsp_online === false ? "RTSP_OFFLINE" : "STREAM_SERVICE_FAILED", "OFFLINE");
  if (!isCameraRtspOnline(sample)) return result("INCONCLUSIVE", "SOURCE_STATUS_UNKNOWN");
  const status = streamStatus(sample);
  const rawViewers = sample.viewers ?? sample.viewer_count;
  const viewers = Array.isArray(rawViewers) ? rawViewers.length
    : typeof rawViewers === "number" && Number.isFinite(rawViewers) ? rawViewers : null;
  if (waiting.has(status) || (idle.has(status) && viewers > 0))
    return result("DEFERRED", "PLAYER_STARTING", "STARTING");
  if (idle.has(status)) {
    // RTSP online is enough to resolve an RTSP-only outage, even if playback remains idle.
    if (previous?.activeOutage?.reason === "RTSP_OFFLINE"
      || (previous?.state === "SUSPECTED_DOWN" && previous.latestResult?.reason === "RTSP_OFFLINE"))
      return result("HEALTHY", "SOURCE_RECOVERED_IDLE", "IDLE");
    return result("DEFERRED", "ON_DEMAND_IDLE", "IDLE");
  }
  if (isCameraLive(sample)) {
    // A negative output report cannot prove recovery; its exact failure semantics are provider-specific.
    if (sample.output_fresh === false) return result("INCONCLUSIVE", "STREAM_OUTPUT_UNCONFIRMED");
    // A status report cannot establish recovery from a historical media-check outage.
    if (previous?.activeOutage && !statusFailures.has(previous.activeOutage.reason))
      return result("DEFERRED", "STATUS_REPORTED_RUNNING", "REPORTED_RUNNING");
    return result("HEALTHY", "STATUS_REPORTED_RUNNING", "REPORTED_RUNNING");
  }
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
          : { ...classifyStatus(sample, states.get(String(camera.cameraId)), settings),
            sourceStatusAgeMs: typeof sample.status_age_ms === "number" && Number.isFinite(sample.status_age_ms)
              && sample.status_age_ms >= 0 ? sample.status_age_ms : null,
            sourceObserved: typeof sample.observed === "boolean" ? sample.observed : null,
            outputFresh: typeof sample.output_fresh === "boolean" ? sample.output_fresh : null };
        if (isActive()) await consume(camera, reading);
      });
    }
  }
}
