import Response from "../../../utils/response.js";
import { monitoringSettings } from "./settings.js";
import { readInventory } from "./inventory.js";
import { monitoringStore, cameraMuted } from "./localStore.js";
import { readMonitoringControl } from "./control.js";

const invalid = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const id = value => /^[a-f0-9]{24}$/i.test(String(value));
const page = (value, fallback, max) => value == null ? fallback : /^\d+$/.test(String(value)) ? Math.min(max, Number(value)) : invalid("Invalid pagination");
const fail = (res, error) => res.status(error.status || 503).json({ statusCode: error.status || 503,
  body: { message: error.status ? error.message : "Monitoring information unavailable" } });
async function context(req) {
  if (!id(req.params.adminId)) invalid("Invalid admin ID");
  const settings = monitoringSettings(), snapshot = await readInventory(settings, req.params.adminId);
  if (!snapshot.admins.length) invalid("Client not found", 404);
  return { settings, snapshot, store: monitoringStore(settings), control: await readMonitoringControl(settings) };
}
function currentReading(camera, saved, control, settings) {
  const received = Date.parse(saved?.receivedAt), checked = Date.parse(saved?.checkedAt), now = Date.now();
  return control.enabled && saved?.sourceKey === camera.sourceKey && Number.isFinite(received)
    && now - received >= 0 && now - received <= settings.intervalMs + settings.timeoutMs
    && (!control.changedAt || received >= Date.parse(control.changedAt))
    && (saved.status === "UNKNOWN" || (Number.isFinite(checked) && now - checked >= -settings.sourceClockSkewMs
      && now - checked <= settings.sourceMaxAgeMs));
}
export async function listCameras(req, res) {
  res.set("Cache-Control", "no-store");
  try {
    const { settings, snapshot, store, control } = await context(req), state = await store.read();
    const nvrId = String(req.query.nvrId || ""), filter = String(req.query.status || "");
    if (nvrId && !snapshot.nvrs.some(nvr => nvr._id === nvrId)) invalid("NVR does not belong to client", 404);
    if (filter && !["alive", "down"].includes(filter)) invalid("Invalid status filter");
    const skip = page(req.query.skip, 0, 1000000), limit = Math.max(1, page(req.query.limit, 20, 100));
    const counts = { alive: 0, down: 0, unknown: 0 };
    const rows = snapshot.cameras.filter(camera => !nvrId || camera.nvrId === nvrId).map(camera => {
      const saved = state.cameras[camera.cameraId], muted = cameraMuted(state, snapshot, camera.cameraId);
      const usable = !muted && currentReading(camera, saved, control, settings);
      const status = usable ? saved.status : "UNKNOWN";
      const alive = status === "ALIVE" ? true : status === "DOWN" ? false : null;
      counts[alive === null ? "unknown" : alive ? "alive" : "down"]++;
      return { cameraId: camera.cameraId, name: camera.name, channelId: camera.channelId,
        nvrName: camera.nvrName, alive, state: status, checkedAt: saved?.checkedAt || null,
        downSince: usable ? saved.downSince : null, statusUnavailable: alive === null,
        nextCheckAt: control.enabled && !muted ? state.scan?.nextAt || null : null,
        monitoringPaused: !control.enabled, alertsMuted: muted, remindersPaused: !control.enabled || muted };
    });
    const filtered = rows.filter(row => !filter || row.alive === (filter === "alive"));
    filtered.sort((a, b) => Number(a.alive !== false) - Number(b.alive !== false) || a.name.localeCompare(b.name));
    res.send(Response.SuccessResp("Stream status fetched", { admin: snapshot.admins[0],
      nvrs: snapshot.nvrs.map(nvr => ({ nvrId: nvr._id, name: nvr.nvrName })), counts,
      cameras: filtered.slice(skip, skip + limit), totalCount: filtered.length, skip, limit,
      enabled: control.enabled, statusUnavailable: rows.some(row => row.statusUnavailable) }));
  } catch (error) { fail(res, error); }
}
export async function cameraDetails(req, res) {
  res.set("Cache-Control", "no-store");
  try {
    const { settings, snapshot, store, control } = await context(req);
    const camera = snapshot.cameras.find(row => row.cameraId === req.params.cameraId);
    if (!camera) invalid("Camera not found for client", 404);
    const state = await store.read(), saved = state.cameras[camera.cameraId];
    const muted = cameraMuted(state, snapshot, camera.cameraId);
    const usable = !muted && currentReading(camera, saved, control, settings);
    const notifications = state.deliveries.filter(row => row.cameraIds.includes(camera.cameraId)).reverse();
    const skip = page(req.query.notificationSkip, 0, 1000000);
    res.send(Response.SuccessResp("Stream details fetched", { state: usable ? saved.status : "UNKNOWN",
      latestResult: { rtspOnline: saved?.rtspOnline ?? null, streamStatus: saved?.streamStatus ?? null },
      statusReceivedAt: saved?.receivedAt || null, checkedAt: saved?.checkedAt || null,
      lastSuccessfulCheckAt: saved?.lastSuccessfulCheckAt || null, downSince: usable ? saved.downSince : null,
      nextCheckAt: control.enabled && !muted ? state.scan?.nextAt || null : null,
      checkIntervalMs: settings.intervalMs, reportIntervalMs: settings.reportIntervalMs,
      enabled: control.enabled, alertsMuted: muted, remindersPaused: !control.enabled || muted,
      notifications: notifications.slice(skip, skip + 20), notificationTotal: notifications.length,
      lastNotificationAt: notifications.find(row => row.status === "SENT")?.sentAt || null }));
  } catch (error) { fail(res, error); }
}
export async function setCameraPolicy(req, res) {
  try {
    if (typeof req.body?.muted !== "boolean") invalid("muted must be a boolean");
    const { snapshot, store } = await context(req);
    if (!snapshot.cameras.some(camera => camera.cameraId === req.params.cameraId)) invalid("Camera not found", 404);
    await store.update(state => { state.mutes[req.params.cameraId] = req.body.muted; delete state.cameras[req.params.cameraId]; });
    res.send(Response.SuccessResp("Monitoring policy updated", { muted: req.body.muted, alertsMuted: req.body.muted }));
  } catch (error) { fail(res, error); }
}
