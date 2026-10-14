import axios from "axios";
import {
  timestampMillis,
  validateObservation,
} from "./statusObservation.js";
import { checkKind } from "./schedule.js";

const result = (verdict, reason, availability) => ({
  verdict,
  reason,
  availability,
  observedAt: new Date(),
});
const waiting = new Set([
  "starting",
  "queued",
  "loading",
  "connecting",
  "initializing",
  "buffering",
]);
const idle = new Set(["idle", "stopped", "standby", "inactive"]);
const failed = new Set(["failed", "error", "unavailable", "offline"]);
const statusFailures = new Set(["RTSP_OFFLINE", "STREAM_SERVICE_FAILED"]);
const streamStatus = (camera) =>
  String(camera?.stream_status || "")
    .trim()
    .toLowerCase();

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
  return (
    !!camera &&
    (camera.rtsp_online === false ||
      (isCameraRtspOnline(camera) && failed.has(streamStatus(camera))))
  );
}

// Only classify the status service's report. Never request a playlist or start a stream.
function classifyStatus(sample, previous, settings) {
  // Optional metadata supplements the required source timestamp check in readSample.
  if (sample.active === false)
    return result("INCONCLUSIVE", "SOURCE_CAMERA_DISABLED");
  if (sample.observed === false)
    return result("INCONCLUSIVE", "STATUS_NOT_OBSERVED");
  if (sample.status_age_ms !== undefined && sample.status_age_ms !== null) {
    if (
      typeof sample.status_age_ms !== "number" ||
      !Number.isFinite(sample.status_age_ms) ||
      sample.status_age_ms < 0
    )
      return result("INCONCLUSIVE", "INVALID_STATUS_FRESHNESS");
    if (sample.status_age_ms > settings.staleAfterMs)
      return result("INCONCLUSIVE", "SOURCE_STATUS_STALE");
  }
  const availability = String(sample.availability || "")
    .trim()
    .toLowerCase();
  if (["unknown", "unobserved", "not_found", "disabled"].includes(availability))
    return result(
      "INCONCLUSIVE",
      availability === "not_found"
        ? "CAMERA_STATUS_MISSING"
        : "SOURCE_STATUS_UNKNOWN",
    );
  if (isStreamDownCandidate(sample))
    return result(
      "FAILED",
      sample.rtsp_online === false ? "RTSP_OFFLINE" : "STREAM_SERVICE_FAILED",
      "OFFLINE",
    );
  if (!isCameraRtspOnline(sample))
    return result("INCONCLUSIVE", "SOURCE_STATUS_UNKNOWN");
  const status = streamStatus(sample);
  const rawViewers = sample.viewers ?? sample.viewer_count;
  const viewers = Array.isArray(rawViewers)
    ? rawViewers.length
    : typeof rawViewers === "number" && Number.isFinite(rawViewers)
      ? rawViewers
      : null;
  if (waiting.has(status) || (idle.has(status) && viewers > 0))
    return result("DEFERRED", "PLAYER_STARTING", "STARTING");
  if (idle.has(status)) {
    // RTSP online is enough to resolve an RTSP-only outage, even if playback remains idle.
    if (
      previous?.activeOutage?.reason === "RTSP_OFFLINE" ||
      (previous?.state === "SUSPECTED_DOWN" &&
        previous.latestResult?.reason === "RTSP_OFFLINE")
    )
      return result("HEALTHY", "SOURCE_RECOVERED_IDLE", "IDLE");
    return result("DEFERRED", "ON_DEMAND_IDLE", "IDLE");
  }
  if (isCameraLive(sample)) {
    // A negative output report cannot prove recovery; its exact failure semantics are provider-specific.
    if (sample.output_fresh === false)
      return result("INCONCLUSIVE", "STREAM_OUTPUT_UNCONFIRMED");
    // A status report cannot establish recovery from a historical media-check outage.
    if (
      previous?.activeOutage &&
      !statusFailures.has(previous.activeOutage.reason)
    )
      return result("DEFERRED", "STATUS_REPORTED_RUNNING", "REPORTED_RUNNING");
    return result("HEALTHY", "STATUS_REPORTED_RUNNING", "REPORTED_RUNNING");
  }
  return result("INCONCLUSIVE", "STREAM_STATUS_UNKNOWN");
}

export async function mapLimit(items, concurrency, operation) {
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (index < items.length) await operation(items[index++]);
    }),
  );
}

async function requestStatuses(host, ids, settings, signal) {
  try {
    // Status only: no stream:true, playlists, probes, registration or lifecycle requests.
    const response = await axios.post(
      `${host}/api/cameras/status`,
      { ids: [...new Set(ids)] },
      {
        timeout: settings.timeoutMs,
        signal,
        maxRedirects: 0,
        maxContentLength: 5 * 1024 * 1024,
      },
    );
    if (!Array.isArray(response.data?.cameras))
      return { error: "INVALID_STATUS_RESPONSE" };
    return {
      samples: new Map(
        response.data.cameras
          .filter((sample) => typeof sample?.id === "string")
          .map((sample) => [sample.id, sample]),
      ),
    };
  } catch {
    return { error: "STATUS_SERVICE_UNAVAILABLE" };
  }
}

function readSample(sample, previous, settings, error = null) {
  if (error || !sample)
    return result("INCONCLUSIVE", error || "CAMERA_STATUS_MISSING");
  const reading = classifyStatus(sample, previous, settings);
  const checkedAt = timestampMillis(sample.last_checked);
  const suppliedAge =
    typeof sample.status_age_ms === "number" &&
    Number.isFinite(sample.status_age_ms) &&
    sample.status_age_ms >= 0
      ? sample.status_age_ms
      : null;
  const sourceAge = Number.isFinite(checkedAt)
    ? Math.max(0, reading.observedAt.getTime() - checkedAt)
    : null;
  const observation = {
    ...reading,
    sourceCheckedAt: Number.isFinite(checkedAt) ? new Date(checkedAt) : null,
    sourceStatusAgeMs:
      sourceAge === null ? suppliedAge : Math.max(sourceAge, suppliedAge || 0),
    sourceObserved:
      typeof sample.observed === "boolean" ? sample.observed : null,
    outputFresh:
      typeof sample.output_fresh === "boolean" ? sample.output_fresh : null,
  };
  if (reading.verdict !== "INCONCLUSIVE" && !Number.isFinite(checkedAt))
    return {
      ...observation,
      verdict: "INCONCLUSIVE",
      availability: null,
      reason:
        sample.last_checked == null
          ? "SOURCE_TIMESTAMP_MISSING"
          : "SOURCE_TIMESTAMP_INVALID",
    };
  return validateObservation(observation, previous, settings);
}

// Fetch batched JSON status snapshots; playback and its on-demand lifecycle remain separate.
export async function readStatuses(
  cameras,
  settings,
  consume,
  isActive,
  states = new Map(),
  signal,
) {
  const groups = new Map();
  for (const camera of cameras) {
    if (camera.mappingError) {
      if (isActive())
        await consume(camera, {
          observedAt: new Date(),
          verdict: "INCONCLUSIVE",
          reason: "CAMERA_MAPPING_INVALID",
        });
    } else {
      const state = states.get(String(camera.cameraId));
      const previous = state?.sourceKey === camera.sourceKey && !state.lifecycleReason
        && String(state.adminId) === String(camera.adminId) && String(state.nvrId) === String(camera.nvrId)
        ? state : null;
      const resumed = settings.monitoringStartedAt
        && new Date(previous?.observedAt).getTime() < new Date(settings.monitoringStartedAt).getTime();
      const kind = checkKind(resumed ? null : previous, Date.now(), settings);
      const key = JSON.stringify([camera.host, kind]);
      const group = groups.get(key) || { host: camera.host, kind, entries: [] };
      group.entries.push({ camera, previous });
      groups.set(key, group);
    }
  }
  async function consumeSample(entry, response, kind) {
    if (!isActive()) return;
    const { camera, previous } = entry;
    const sample = response.samples?.get(camera.statusId);
    let reading = { ...readSample(sample, previous, settings, response.error), checkKind: kind };
    // This exact combination confirms Down only on an individual status request.
    // Batch candidates and all other combinations keep their existing verification.
    const individualDownConfirmed = kind === "individual" && reading.verdict === "FAILED"
      && sample?.rtsp_online === false && streamStatus(sample) === "stalled" && sample.viewers === 1;
    if (kind === "individual" && (individualDownConfirmed || ["READY", "FINAL"].includes(previous?.verification?.phase))
      && reading.verdict === "FAILED" && reading.sourceStatusAgeMs > settings.finalValidationMaxAgeMs)
      reading = { ...reading, verdict: "INCONCLUSIVE", reason: "SOURCE_STATUS_STALE", availability: null };
    if (individualDownConfirmed && reading.verdict === "FAILED")
      reading = { ...reading, individualDownConfirmed: true };
    if (isActive()) await consume(camera, reading);
  }
  // At most one request per due camera per pass. A later pass cannot overlap
  // this one, and per-camera due times enforce the individual retry interval.
  for (const { host, kind, entries } of groups.values()) {
    if (kind === "individual") {
      await mapLimit(entries, Math.min(settings.individualConcurrency, settings.hostConcurrency, settings.concurrency), async entry => {
        if (!isActive()) return;
        const response = await requestStatuses(host, [entry.camera.statusId], settings, signal);
        await consumeSample(entry, response, kind);
      });
      continue;
    }
    for (
      let offset = 0;
      offset < entries.length && isActive();
      offset += settings.batchSize
    ) {
      const batch = entries.slice(offset, offset + settings.batchSize);
      const response = await requestStatuses(
        host,
        batch.map(({ camera }) => camera.statusId),
        settings,
        signal,
      );
      await mapLimit(
        batch,
        Math.min(settings.concurrency, settings.hostConcurrency),
        entry => consumeSample(entry, response, kind),
      );
    }
  }
}
