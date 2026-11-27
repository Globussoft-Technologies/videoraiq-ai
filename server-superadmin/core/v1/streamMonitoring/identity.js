import { createHash } from "node:crypto";

export const hash = (value) => createHash("sha256").update(value).digest("hex");

// This module only derives identifiers. Never call buildStreamingUrl here:
// its cloud branch can register cameras and activate streams.
export function httpBase(value) {
  try {
    const url = new URL(String(value));
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch { return null; }
}

export function statusIdentity(admin, nvr, camera, settings, fleet = false) {
  const appEnv = admin.appEnv || settings.defaultAppEnv;
  const local = appEnv === "local" || appEnv === "onprem";
  const path = String(camera.streamingPath || "");
  const parsedId = path.match(/(?:^|\/)(?:sub-)?stream\/([^/?]+)\/playlist\.m3u8/i)?.[1];
  let pathHost = null;
  try { pathHost = new URL(path).origin; } catch { /* Relative path. */ }
  const installer = fleet && (nvr.managementSource === "installer" || nvr.localNvrId);
  const fixed = settings.statusMode === "fixed" || (settings.statusMode === "auto" && !local && !installer);
  const host = httpBase(fixed
    ? settings.statusUrl || admin.streamHost || settings.defaultHost
    : nvr.domain || pathHost || admin.streamHost || settings.statusUrl || settings.defaultHost);
  const statusId = local || installer || (fleet && (camera.localChannelId || parsedId))
    ? String(camera.localChannelId || parsedId || "")
    : `${nvr._id}-${camera._id}`;
  // Preserve the existing mapping key so removing probes does not reset camera history.
  const streamOrigin = httpBase(local ? nvr.domain || pathHost || admin.streamHost || settings.defaultHost
    : admin.streamHost || settings.defaultHost);
  const streamPath = local ? path : `stream/${nvr._id}-${camera._id}/playlist.m3u8`;
  return {
    host,
    statusId: statusId || null,
    sourceKey: host && statusId ? hash(JSON.stringify([host, statusId, streamOrigin, streamPath, "stream"])) : null,
    mappingError: !host ? "Status host is not configured" : !statusId ? "Camera status ID is missing" : null,
  };
}
