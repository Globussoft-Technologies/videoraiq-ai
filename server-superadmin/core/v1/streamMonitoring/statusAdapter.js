import axios from "axios";
import { publicCamera } from "./inventory.js";

function timestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
  const calendar = new Date(value.slice(0, 10) + "T00:00:00Z");
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== value.slice(0, 10)
    || Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) return NaN;
  return Date.parse(value);
}

function classify(sample, settings) {
  const checkedAt = timestamp(sample?.last_checked), age = Date.now() - checkedAt;
  const state = String(sample?.stream_status || "").trim().toLowerCase();
  const availability = String(sample?.availability || "").trim().toLowerCase();
  if (!sample || sample.active === false || sample.observed === false || !Number.isFinite(age)
    || age > settings.sourceMaxAgeMs || age < -settings.sourceClockSkewMs
    || ["unknown", "unobserved", "not_found", "disabled"].includes(availability)
    || (sample.status_age_ms != null && (typeof sample.status_age_ms !== "number" || !Number.isFinite(sample.status_age_ms)
      || sample.status_age_ms < 0 || sample.status_age_ms > settings.sourceMaxAgeMs))) return "UNKNOWN";
  if (sample.rtsp_online === false && state === "stalled") return "DOWN";
  if (sample.rtsp_online === true && state === "running") return "ALIVE";
  return "UNKNOWN";
}

// Status snapshots only: no RTSP connections, media GETs or lifecycle calls.
export async function readStatuses(cameras, settings, signal) {
  const hosts = new Map(), samples = new Map();
  for (const camera of cameras) if (camera.host && camera.statusId && !camera.mappingError) {
    const group = hosts.get(camera.host) || []; group.push(camera); hosts.set(camera.host, group);
  }
  for (const [host, group] of hosts) {
    for (let offset = 0; offset < group.length && !signal?.aborted; offset += settings.batchSize) {
      const ids = new Set(group.slice(offset, offset + settings.batchSize).map(camera => camera.statusId));
      try {
        const { data } = await axios.post(host + "/api/cameras/status", { ids: [...ids] },
          { signal, timeout: settings.timeoutMs, maxRedirects: 0, maxContentLength: 5 * 1024 * 1024 });
        if (Array.isArray(data?.cameras)) for (const sample of data.cameras)
          if (ids.has(sample?.id)) samples.set(host + "\n" + sample.id, sample);
      } catch { /* Failed or missing observations remain UNKNOWN, never DOWN. */ }
    }
  }
  return cameras.map(camera => {
    const sample = samples.get(camera.host + "\n" + camera.statusId);
    const status = signal?.aborted || camera.mappingError ? "UNKNOWN" : classify(sample, settings);
    const checked = timestamp(sample?.last_checked);
    return { ...publicCamera(camera), status,
      checkedAt: Number.isFinite(checked) ? new Date(checked).toISOString() : null,
      receivedAt: new Date().toISOString(), rtspOnline: typeof sample?.rtsp_online === "boolean" ? sample.rtsp_online : null,
      streamStatus: typeof sample?.stream_status === "string" ? sample.stream_status.slice(0, 40) : null };
  });
}

export const summarize = rows => rows.reduce((counts, row) => {
  counts[row.status]++; return counts;
}, { ALIVE: 0, DOWN: 0, UNKNOWN: 0 });
