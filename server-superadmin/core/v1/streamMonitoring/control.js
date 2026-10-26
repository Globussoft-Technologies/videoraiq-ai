import Response from "../../../utils/response.js";
import { monitoringSettings } from "./settings.js";
import { monitoringStore } from "./localStore.js";
import { readMonitoringApi } from "./inventory.js";

const listeners = new Set();
export async function readMonitoringControl(settings) {
  return (await monitoringStore(settings).read()).control || await readMonitoringApi(settings, "control");
}
export function subscribeMonitoringControl(listener) {
  listeners.add(listener); return () => listeners.delete(listener);
}
export async function getMonitoringControl(_req, res) {
  res.set("Cache-Control", "no-store");
  try { res.send(Response.SuccessResp("Monitoring control fetched", await readMonitoringControl(monitoringSettings()))); }
  catch { res.status(503).json({ statusCode: 503, body: { message: "Monitoring control unavailable" } }); }
}
export async function setMonitoringControl(req, res) {
  res.set("Cache-Control", "no-store");
  if (typeof req.body?.enabled !== "boolean") return res.status(400).json({ statusCode: 400, body: { message: "enabled must be a boolean" } });
  try {
    const settings = monitoringSettings(), previous = await readMonitoringControl(settings);
    const state = await monitoringStore(settings).update(value => {
      value.control ||= previous;
      if (value.control.enabled === req.body.enabled) return;
      value.control = { enabled: req.body.enabled, revision: value.control.revision + 1, changedAt: new Date().toISOString() };
      value.anchor = req.body.enabled ? Date.now() : null;
      value.scan = null; value.report = null; value.cameras = {};
    });
    for (const listener of listeners) { try { listener(state.control); } catch { /* Control already committed. */ } }
    res.send(Response.SuccessResp(state.control.enabled ? "Monitoring enabled" : "Monitoring paused", state.control));
  } catch { res.status(503).json({ statusCode: 503, body: { message: "Unable to update monitoring control" } }); }
}
