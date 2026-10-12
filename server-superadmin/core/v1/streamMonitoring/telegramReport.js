import { createHash } from "node:crypto";
import { freshState } from "./stateMachine.js";

export const REMINDER_MS = 60_000;
const short = value => String(value ?? "—").replace(/[\r\n]+/g, " ").slice(0, 120);
const episodeKey = (camera, since) => createHash("sha256").update(JSON.stringify([
  String(camera.adminId), String(camera.nvrId), String(camera.cameraId), camera.sourceKey, new Date(since).toISOString(),
])).digest("hex");

export function buildStreamReport(inventory, states, settings, now) {
  const byState = new Map(states.map(state => [String(state._id), state]));
  const byAdmin = new Map(inventory.admins.map(admin => [String(admin._id), admin]));
  const items = [];
  const ongoingEpisodes = new Set();
  for (const camera of inventory.cameras) {
    const state = byState.get(String(camera.cameraId));
    const since = state?.telegramDownSince || state?.downSince;
    if (!state || !since || state.sourceKey !== camera.sourceKey || camera.mappingError
      || String(state.adminId) !== String(camera.adminId) || String(state.nvrId) !== String(camera.nvrId)) continue;
    const episode = episodeKey(camera, since);
    if (state.alive !== true) ongoingEpisodes.add(episode);
    if (state.alive !== false || !freshState(state, camera, now, settings)) continue;
    const admin = byAdmin.get(String(camera.adminId));
    if (admin) items.push({ camera, admin, since, episode });
  }
  items.sort((a, b) => String(a.camera.adminId).localeCompare(String(b.camera.adminId))
    || String(a.camera.nvrId).localeCompare(String(b.camera.nvrId)) || String(a.camera.cameraId).localeCompare(String(b.camera.cameraId)));
  const header = `VideoraIQ — Streaming down\nDown streams: ${items.length}\nChecked at (UTC): ${new Date(now).toISOString()}`;
  const bodies = [];
  let body = "";
  for (const { camera, admin, since } of items) {
    const seconds = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
    const name = `${admin.name_f || ""} ${admin.name_l || ""}`.trim() || admin.login;
    const block = `\n\nAdmin: ${short(name)}\nEmail: ${short(admin.email)}\nNVR: ${short(camera.nvrName)}\nCamera: ${short(camera.name)}\nCamera ID: ${camera.cameraId}\nChannel: ${short(camera.channelId)}\nDown since (UTC): ${new Date(since).toISOString()}\nDown for: ${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    if (body && body.length + block.length > 3500) { bodies.push(body); body = ""; }
    body += block;
  }
  if (body) bodies.push(body);
  return { items, ongoingEpisodes, messages: bodies.map((part, index) =>
    `${header}${bodies.length > 1 ? `\nPart ${index + 1}/${bodies.length}` : ""}${part}`) };
}

export function notificationDue(delivery, report, now) {
  if (!report.items.length || new Date(delivery?.nextAttemptAt || 0).getTime() > now) return false;
  return !delivery?.lastSentAt || now - new Date(delivery.lastSentAt).getTime() >= REMINDER_MS
    || report.items.some(item => !(delivery.reportedEpisodes || []).includes(item.episode));
}
