const short = value => String(value ?? "Unknown").replace(/[\r\n]+/g, " ").slice(0, 120);
const escapeHtml = value => String(value).replace(/[&<>"]/g,
  character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
const field = (icon, label, value) => icon + " <b>" + label + ":</b> " + escapeHtml(value);
const ist = value => value ? new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", hour12: false }) + " IST" : "Unknown";

// Down is the only notification type. Callers supply one admin/NVR group.
export function formatDownReport(cameras, now = Date.now()) {
  if (!cameras.length) return "";
  const first = cameras[0];
  return [
    "🚨 <b>VideoraIQ — Streaming down</b>",
    field("👤", "Admin", short(first.adminName)),
    field("📧", "Email", short(first.email)),
    field("🏢", "NVR", short(first.nvrName)),
    "",
    cameras.map(camera => [
      field("📹", "Camera", short(camera.name)) + " | <b>Channel:</b> " + escapeHtml(short(camera.channelId)),
      field("🕒", "First detected down", ist(camera.downSince || camera.checkedAt)),
      field("📋", "Reported at", ist(now)),
    ].join("\n")).join("\n\n"),
  ].join("\n");
}
