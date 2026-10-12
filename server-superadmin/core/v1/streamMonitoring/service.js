import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import { monitoringSettings } from "./settings.js";
import { publicAdmin, readInventory } from "./inventory.js";
import { MonitoringState } from "./models.js";
import { freshState } from "./stateMachine.js";

const invalid = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const id = value => /^[a-f\d]{24}$/i.test(String(value));
const pageNumber = (value, fallback, max) => {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(String(value))) invalid("Invalid pagination");
  return Math.min(max, Number(value));
};

// One read-only endpoint supplies the NVR selector, counts, statuses and down times.
export async function listCameras(req, res) {
  res.set("Cache-Control", "no-store");
  try {
    if (!id(req.params.adminId)) invalid("Invalid adminId");
    const nvrId = String(req.query.nvrId || "");
    const status = String(req.query.status || "");
    if (nvrId && !id(nvrId)) invalid("Invalid nvrId");
    if (status && !["alive", "down"].includes(status)) invalid("Invalid stream status");
    const skip = pageNumber(req.query.skip, 0, 1_000_000);
    const limit = Math.max(1, pageNumber(req.query.limit, 20, 100));
    const settings = monitoringSettings();
    const inventory = await readInventory(settings, req.params.adminId);
    if (!inventory.admins.length) invalid("Client not found", 404);
    if (nvrId && !inventory.nvrs.some(nvr => String(nvr._id) === nvrId)) invalid("NVR does not belong to this client", 404);
    const cameras = inventory.cameras.filter(camera => !nvrId || String(camera.nvrId) === nvrId);
    const states = cameras.length ? await MonitoringState.find({
      adminId: inventory.admins[0]._id, cameraId: { $in: cameras.map(camera => camera.cameraId) },
    }).select("adminId nvrId sourceKey alive observedAt downSince").lean() : [];
    const byId = new Map(states.map(state => [String(state._id), state]));
    const counts = { alive: 0, down: 0 };
    let statusUnavailable = false;
    const now = Date.now();
    const rows = cameras.map(camera => {
      const state = byId.get(String(camera.cameraId));
      const alive = freshState(state, camera, now, settings) && typeof state.alive === "boolean" ? state.alive : null;
      if (alive === null) statusUnavailable = true;
      else counts[alive ? "alive" : "down"]++;
      return { cameraId: String(camera.cameraId), name: camera.name, channelId: camera.channelId,
        nvrName: camera.nvrName, alive, downSince: alive === false ? state.downSince || null : null };
    });
    const filtered = rows.filter(row => !status || row.alive === (status === "alive"));
    filtered.sort((a, b) => Number(a.alive !== false) - Number(b.alive !== false)
      || (new Date(a.downSince || 0).getTime() - new Date(b.downSince || 0).getTime())
      || a.name.localeCompare(b.name) || a.cameraId.localeCompare(b.cameraId));
    return res.send(Response.SuccessResp("Stream status fetched", {
      admin: publicAdmin(inventory.admins[0]),
      nvrs: inventory.nvrs.map(nvr => ({ nvrId: String(nvr._id), name: nvr.nvrName })),
      counts, cameras: filtered.slice(skip, skip + limit), totalCount: filtered.length,
      skip, limit, enabled: settings.enabled, statusUnavailable,
    }));
  } catch (error) {
    if (!error.status) logger.error(`[STREAM_MONITORING] read failed: ${error.message}`);
    const status = error.status || 500;
    return res.status(status).send({ statusCode: status, body: { status: "failed",
      message: status === 500 ? "Unable to load stream status" : error.message } });
  }
}
