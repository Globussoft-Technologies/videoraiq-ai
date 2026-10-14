const short = (value) =>
  String(value ?? "Unknown")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 120);
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
      })[character],
  );
const field = (icon, label, value) =>
  `${icon} <b>${label}:</b> ${escapeHtml(value)}`;
const titles = {
  DOWN: ["🚨", "Streaming down"],
  REMINDER: ["🔴", "Stream still down"],
  RECOVERED: ["✅", "Stream recovered"],
  COMBINED_RECOVERY: ["✅", "Stream was down, now recovered"],
};

function describeReason(reason, recovered = false) {
  if (reason === "RTSP_OFFLINE")
    return recovered
      ? "The streaming service previously reported this camera's RTSP source as offline. Source availability has now been confirmed by the status service."
      : "The streaming service reports this camera's RTSP source as offline. Check camera/NVR connectivity and RTSP access settings.";
  if (reason === "STREAM_SERVICE_FAILED")
    return recovered
      ? "The streaming service previously reported this stream as failed or unavailable. Healthy status reports have now confirmed recovery."
      : "The streaming service reports this stream as failed or unavailable while its RTSP source is online. Check the streaming process and service logs.";
  const descriptions = {
    STATUS_SERVICE_UNAVAILABLE:
      "The camera-status request failed or timed out. Monitoring cannot currently verify camera availability.",
    INVALID_STATUS_RESPONSE:
      "The status service returned an unexpected response format. Monitoring cannot interpret the camera results.",
    CAMERA_STATUS_MISSING:
      "The status service returned no record for this camera. Verify its streaming ID and status-server mapping.",
    CAMERA_MAPPING_INVALID:
      "The camera has a missing or ambiguous status mapping. Verify its streaming ID and configured status server.",
    SOURCE_STATUS_UNKNOWN:
      "The status service did not provide a conclusive RTSP availability result for this camera.",
    STREAM_STATUS_UNKNOWN:
      "The status service returned a missing or unrecognized stream status. Availability could not be confirmed.",
    STATUS_NOT_OBSERVED:
      "The status service has not observed this camera yet. Its current availability cannot be confirmed.",
    SOURCE_STATUS_STALE:
      "The status service returned an outdated camera observation. Alerts are paused until a current status is available.",
    INVALID_STATUS_FRESHNESS:
      "The status service returned invalid observation-age metadata. Monitoring cannot establish whether the report is current.",
    STREAM_OUTPUT_UNCONFIRMED:
      "The status service reports running but does not report fresh stream output. Monitoring cannot confirm healthy playback from this report.",
  };
  return (
    descriptions[reason] ||
    `Monitoring reported ${short(reason)}. The underlying cause has not been confirmed.`
  );
}

export function formatDuration(start, end = Date.now()) {
  const seconds = Math.max(
    0,
    Math.floor((Number(end) - new Date(start).getTime()) / 1000),
  );
  if (!Number.isFinite(seconds)) return "Unknown";
  const days = Math.floor(seconds / 86400),
    hours = Math.floor((seconds % 86400) / 3600),
    minutes = Math.floor((seconds % 3600) / 60);
  return [
    days && days + "d",
    hours && hours + "h",
    minutes && minutes + "m",
    (seconds % 60) + "s",
  ]
    .filter(Boolean)
    .join(" ");
}
const ist = (value) =>
  value
    ? new Date(value).toLocaleString("en-GB", {
        timeZone: "Asia/Kolkata",
        hour12: false,
      }) + " IST"
    : "Unknown";

function notificationParts(event, now) {
  const payload = event.payload || {};
  if (event.type === "OPS_WARNING")
    return {
      header: "⚠️ <b>VideoraIQ — Monitoring unavailable</b>",
      body: [
        field("🌐", "Host", short(payload.host)),
        field("⚠️", "Issue", describeReason(payload.reason)),
        field("🕒", "Last conclusive check", ist(payload.lastConclusiveAt)),
        field("📋", "Reported at", ist(now)),
        "Reminders paused. Camera states retained.",
      ].join("\n"),
    };
  const [icon, title] = titles[event.type] || ["ℹ️", "Stream status update"];
  const snapshot = payload.snapshot || {};
  return {
    header: [
      `${icon} <b>VideoraIQ — ${title}</b>`,
      field("👤", "Admin", short(snapshot.adminName)),
      field("📧", "Email", short(snapshot.email)),
      field("🏢", "NVR", short(snapshot.nvrName)),
    ].join("\n"),
    body: [
      field("📹", "Camera", short(snapshot.name)) +
        ` | <b>Channel:</b> ${escapeHtml(short(snapshot.channelId))}`,
      field("🕒", "First detected down", ist(payload.startedAt)),
      ...(payload.closedAt
        ? [field("✅", "Recovery confirmed", ist(payload.closedAt))]
        : []),
      field("📋", "Reported at", ist(now)),
    ].join("\n"),
  };
}

export function formatNotification(event, now) {
  const { header, body } = notificationParts(event, now);
  return header + "\n\n" + body;
}

export function formatNotifications(events, now) {
  if (events.some((event) => event.type === "OPS_WARNING"))
    return events.map((event) => formatNotification(event, now)).join("\n\n");
  let text = "",
    previousGroup = null;
  for (const event of events) {
    const snapshot = event.payload?.snapshot || {};
    const group = JSON.stringify([
      event.type,
      String(event.payload?.adminId || snapshot.adminName || ""),
      String(event.payload?.nvrId || snapshot.nvrName || ""),
    ]);
    const { header, body } = notificationParts(event, now);
    if (group === previousGroup) text += "\n\n" + body;
    else {
      text += (text ? "\n\n" : "") + header + "\n\n" + body;
      previousGroup = group;
    }
  }
  return text;
}
