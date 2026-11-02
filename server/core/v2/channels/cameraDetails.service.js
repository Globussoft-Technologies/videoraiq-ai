import mongoose from "mongoose";
import config from "config";
import Channel from "./channels.model.js";
import NVR from "../NVR/nvr.model.js";
import Admin from "../admin/admin.model.js";

export function snapshotUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = config.has("ImageView") ? String(config.get("ImageView") || "").replace(/\/+$/, "") : "";
  return base ? `${base}/${String(path).replace(/^\/+/, "")}` : null;
}

const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function cameraData(camera, nvr) {
  const stored = camera.latestSnapshot;
  const url = snapshotUrl(stored?.path);
  return {
    camera: {
      id: camera._id, name: camera.customName || camera.name || null,
      originalName: camera.name || null, status: camera.control === 1 ? "running" : "stopped",
      control: camera.control, isAdded: camera.isAdded, location: nvr?.location || null,
      channelId: camera.channelId || null, localChannelId: camera.localChannelId || null,
      model: camera.model || null, ipAddress: camera.ipAddress || null,
      firmwareVersion: camera.firmwareVersion || null, department: camera.department || [],
      profile: camera.profile || null, detectionStatus: camera.detectionStatus,
      createdAt: camera.createdAt, updatedAt: camera.updatedAt,
    },
    snapshot: url ? {
      status: "available", imageUrl: url, capturedAt: stored.capturedAt || null,
      source: stored.source || null, recordedAt: stored.recordedAt || null,
      recordingTimeEstimated: stored.recordingTimeEstimated ?? null,
    } : { status: "unavailable", imageUrl: null, capturedAt: null },
  };
}

function nvrData(nvr) {
  return {
    id: nvr._id, name: nvr.nvrName, status: null, brand: nvr.brand,
    connectionMode: nvr.connectionMode || null, domain: nvr.domain || null,
    location: nvr.location || null, deviceName: nvr.deviceName || null,
    model: nvr.model || null, port: nvr.port || null, rtspPort: nvr.rtspPort || null,
  };
}

async function accountId(principal) {
  if (!principal?.adminId) return null;
  const admin = await Admin.findById(principal.adminId).select("user_id").lean();
  return admin?.user_id ? String(admin.user_id) : null;
}

export async function listCameraDetails(principal, authorizedChannels = [], filters = {}) {
  const userId = await accountId(principal);
  if (!userId) return { code: 403, message: "Account access denied" };
  const nvrName = String(filters.nvrName || '').trim();
  const nvrId = String(filters.nvrId || '').trim();
  const cameraName = String(filters.cameraName || '').trim();
  const cameraId = String(filters.cameraId || '').trim();
  if (nvrName.length > 100 || cameraName.length > 100) return { code: 400, message: "Filter is too long" };
  if (nvrId && !mongoose.isValidObjectId(nvrId)) return { code: 400, message: "Invalid NVR ID" };
  if (cameraId && !mongoose.isValidObjectId(cameraId)) return { code: 400, message: "Invalid camera ID" };
  const nvrQuery = { userId, ...(nvrId ? { _id: nvrId } : {}), ...(nvrName ? { nvrName: { $regex: escapeRegex(nvrName), $options: 'i' } } : {}) };
  const nvrs = await NVR.find(nvrQuery).select('nvrName brand connectionMode domain location deviceName model port rtspPort').lean();
  if (!nvrs.length) return { code: 200, data: { nvrs: [], totalNvrs: 0, totalCameras: 0 } };
  const cameraScope = principal.memberId
    ? { $in: cameraId ? authorizedChannels.filter(id => String(id) === cameraId) : authorizedChannels }
    : (cameraId || undefined);
  const cameraQuery = { userId, nvrId: { $in: nvrs.map(nvr => nvr._id) },
    ...(cameraScope ? { _id: cameraScope } : {}),
    ...(cameraName ? { $or: [
      { name: { $regex: escapeRegex(cameraName), $options: 'i' } },
      { customName: { $regex: escapeRegex(cameraName), $options: 'i' } },
    ] } : {}),
  };
  const cameras = await Channel.find(cameraQuery).select('_id nvrId name customName control isAdded channelId localChannelId model ipAddress firmwareVersion department profile detectionStatus createdAt updatedAt latestSnapshot').lean();
  const grouped = nvrs.map(nvr => ({ ...nvrData(nvr), cameras: cameras
    .filter(camera => String(camera.nvrId) === String(nvr._id))
    .map(camera => cameraData(camera, nvr)) }))
    .filter(nvr => !principal.memberId || nvr.cameras.length > 0)
    .filter(nvr => !cameraName || nvr.cameras.length > 0);
  return { code: 200, data: { nvrs: grouped, totalNvrs: grouped.length,
    totalCameras: grouped.reduce((count, nvr) => count + nvr.cameras.length, 0) } };
}

export async function getCameraDetails(cameraId, principal, authorizedChannels = []) {
  if (!mongoose.isValidObjectId(cameraId)) return { code: 400, message: "Invalid camera ID" };
  const userId = await accountId(principal);
  if (!userId) return { code: 403, message: "Account access denied" };
  if (principal.memberId && !authorizedChannels.some(id => String(id) === String(cameraId))) {
    return { code: 404, message: "Camera not found" };
  }
  const camera = await Channel.findOne({ _id: cameraId, userId }).lean();
  if (!camera) return { code: 404, message: "Camera not found" };
  const nvr = camera.nvrId && await NVR.findOne({ _id: camera.nvrId, userId }).lean();
  return { code: 200, data: {
    ...cameraData(camera, nvr), nvr: nvr ? nvrData(nvr) : null,
  } };
}
