import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import { MonitoringCollector } from "./models.js";
import { monitoringSettings } from "./settings.js";

const listeners = new Set();

// A single platform setting shares the existing collector collection. Reading
// it never creates a record; configuration remains the default until changed.
export async function readMonitoringControl(settings) {
  const row = await MonitoringCollector.findById("control")
    .select("enabled controlRevision changedAt")
    .lean();
  return {
    enabled: typeof row?.enabled === "boolean" ? row.enabled : settings.enabled,
    revision: row?.controlRevision || 0,
    changedAt: row?.changedAt || null,
  };
}

export function observedSinceResume(state, control) {
  return !control.changedAt || new Date(state?.observedAt).getTime() >= new Date(control.changedAt).getTime();
}

export function subscribeMonitoringControl(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function getMonitoringControl(_req, res) {
  res.set("Cache-Control", "no-store");
  try {
    return res.send(Response.SuccessResp("Monitoring control fetched", await readMonitoringControl(monitoringSettings())));
  } catch {
    return res.status(503).send({ statusCode: 503, body: { status: "failed", message: "Unable to load monitoring control" } });
  }
}

export async function setMonitoringControl(req, res) {
  res.set("Cache-Control", "no-store");
  if (typeof req.body?.enabled !== "boolean")
    return res.status(400).send({ statusCode: 400, body: { status: "failed", message: "enabled must be a boolean" } });
  try {
    const row = await MonitoringCollector.findOneAndUpdate({ _id: "control" }, {
      $set: { enabled: req.body.enabled, changedAt: new Date(), changedBy: req.superAdmin._id },
      $inc: { controlRevision: 1 },
    }, { upsert: true, new: true, runValidators: true }).lean();
    const control = { enabled: row.enabled, revision: row.controlRevision, changedAt: row.changedAt };
    // Stop this instance immediately; other workers observe the same record.
    for (const listener of listeners) {
      try { listener(control); } catch { logger.error("[STREAM_MONITORING] control notification failed"); }
    }
    return res.send(Response.SuccessResp(control.enabled ? "Monitoring enabled" : "Monitoring paused", control));
  } catch {
    return res.status(503).send({ statusCode: 503, body: { status: "failed", message: "Unable to update monitoring control" } });
  }
}
