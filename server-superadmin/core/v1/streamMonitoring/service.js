import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import { monitoringSettings } from "./settings.js";
import { publicAdmin, readInventory } from "./inventory.js";
import { MonitoringState, MonitoringOutage } from "./models.js";
import { TelegramOutbox } from "./telegramModels.js";
import { closeForLifecycle } from "./outageService.js";
import { cancelOutage } from "./notificationOutbox.js";
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
    }).select("adminId nvrId sourceKey alive observedAt downSince state availability latestResult lastSuccessfulCheckAt lastConclusiveAt remindersPaused activeOutage alertsMuted lifecycleReason").lean() : [];
    const byId = new Map(states.map(state => [String(state._id), state]));
    const counts = { alive: 0, down: 0 };
    let statusUnavailable = false;
    const now = Date.now();
    const rows = cameras.map(camera => {
      const state = byId.get(String(camera.cameraId));
      const usable = freshState(state, camera, now, settings) && !state.alertsMuted && !state.lifecycleReason
        && state.latestResult?.verdict !== "INCONCLUSIVE" && !(state.activeOutage && state.latestResult?.verdict === "DEFERRED");
      const alive = usable && typeof state.alive === "boolean" ? state.alive : null;
      if (alive === null) statusUnavailable = true;
      else counts[alive ? "alive" : "down"]++;
      return { cameraId: String(camera.cameraId), name: camera.name, channelId: camera.channelId,
        nvrName: camera.nvrName, alive, downSince: state?.activeOutage?.startedAt || null,
        state: state?.state || "UNKNOWN", availability: state?.availability || null,
        reason: state?.latestResult?.reason || null, checkedAt: state?.observedAt || null,
        lastSuccessfulCheckAt: state?.lastSuccessfulCheckAt || null, remindersPaused: state?.remindersPaused || false,
        alertsMuted: state?.alertsMuted || false, statusUnavailable: !usable };
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

async function ownedCamera(req) {
  if (!id(req.params.adminId) || !id(req.params.cameraId)) invalid('Invalid camera or admin ID');
  const state = await MonitoringState.findOne({ _id: req.params.cameraId, adminId: req.params.adminId }).lean();
  if (!state) invalid('Monitoring record not found', 404);
  return state;
}
const fail = (res, error) => res.status(error.status || 500).send({ statusCode: error.status || 500,
  body: { status: 'failed', message: error.status ? error.message : 'Unable to load monitoring details' } });
export async function cameraDetails(req, res) {
  res.set('Cache-Control', 'no-store');
  try {
    const state = await ownedCamera(req);
    const skip = pageNumber(req.query.skip, 0, 1000000), limit = Math.max(1, pageNumber(req.query.limit, 20, 100));
    const filter = { cameraId: state.cameraId, adminId: state.adminId };
    const outages = await MonitoringOutage.find(filter).sort({ startedAt: -1 }).skip(skip).limit(limit).lean();
    const ids = outages.map(row => row._id);
    const notificationSkip = pageNumber(req.query.notificationSkip, 0, 1000000);
    const notificationFilter = { outageId: { $in: ids } };
    const notifications = await TelegramOutbox.find(notificationFilter)
      .select('type outageId status createdAt sentAt nextAttemptAt errorCode sequence')
      .sort({ createdAt: -1 }).skip(notificationSkip).limit(20).lean();
    const lastDelivery = state.activeOutage ? await TelegramOutbox.findOne({ outageId: state.activeOutage.id,
      type: { $in: ['DOWN', 'REMINDER'] }, status: 'SENT' }).sort({ sentAt: -1 }).select('sentAt').lean() : null;
    return res.send(Response.SuccessResp('Stream details fetched', {
      state: state.state || 'UNKNOWN', latestResult: { verdict: state.latestResult?.verdict || null,
        reason: state.latestResult?.reason || null, httpStatus: state.latestResult?.httpStatus || null },
      lastSuccessfulCheckAt: state.lastSuccessfulCheckAt || null, lastConclusiveAt: state.lastConclusiveAt || null,
      remindersPaused: !!state.remindersPaused,
      alertsMuted: !!state.alertsMuted, outages, notifications,
      notificationTotal: await TelegramOutbox.countDocuments(notificationFilter),
      lastNotificationAt: lastDelivery?.sentAt || null,
      nextReminderAt: lastDelivery?.sentAt && !state.remindersPaused && state.state === 'DOWN'
        ? new Date(new Date(lastDelivery.sentAt).getTime() + monitoringSettings().reminderMs) : null,
      totalCount: await MonitoringOutage.countDocuments(filter), skip, limit,
    }));
  } catch (error) { return fail(res, error); }
}
export async function setCameraPolicy(req, res) {
  try {
    if (typeof req.body?.muted !== 'boolean') invalid('muted must be a boolean');
    const state = await ownedCamera(req);
    await MonitoringState.updateOne({ _id: state._id }, { $set: { alertsMuted: req.body.muted, nextCheckAt: new Date(),
      ...(req.body.muted ? {} : { lifecycleReason: null, state: 'UNKNOWN', alive: null, failureStreak: 0,
        healthyStreak: 0, inconclusiveStreak: 0, firstFailureAt: null, availability: null,
        latestResult: null, observedAt: null }) }, $inc: { revision: 1 } });
    if (req.body.muted) {
      const latest = await MonitoringState.findById(state._id).lean();
      await closeForLifecycle(latest, 'CAMERA_MUTED');
      if (state.activeOutage) await cancelOutage(state.activeOutage.id);
    }
    return res.send(Response.SuccessResp('Monitoring policy updated', { muted: req.body.muted }));
  } catch (error) { return fail(res, error); }
}
