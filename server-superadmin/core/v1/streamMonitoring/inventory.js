import axios from "axios";
import { Router } from "express";
import { ObjectId } from "mongodb";
import { createHmac, timingSafeEqual } from "node:crypto";
import { statusIdentity } from "./identity.js";
import { monitoringSettings } from "./settings.js";

const validId = value => /^[a-f0-9]{24}$/i.test(String(value));
export const publicAdmin = admin => ({ adminId: String(admin._id),
  name: ((admin.name_f || "") + " " + (admin.name_l || "")).trim() || admin.login, email: admin.email });
export const publicCamera = camera => Object.fromEntries([
  "cameraId", "adminId", "nvrId", "sourceKey", "name", "channelId", "nvrName", "adminName", "email",
].map(key => [key, camera[key]]));
const signature = (settings, route, time) => createHmac("sha256", String(settings.apiKey))
  .update("videoraiq-stream-monitor\nGET\n" + route + "\n" + time).digest("hex");

// Only these internal GET handlers access MongoDB: native find operations,
// without models, hooks, index creation, credentials or stream registration.
async function legacyControl(db, settings) {
  const row = await db.collection("streammonitoringcollectors").findOne({ _id: "control" },
    { projection: { enabled: 1, controlRevision: 1, changedAt: 1 } });
  return { enabled: typeof row?.enabled === "boolean" ? row.enabled : settings.enabled,
    revision: row?.controlRevision || 0, changedAt: row?.changedAt || null };
}

async function inventorySnapshot(db, settings, adminId) {
  if (adminId && !validId(adminId)) throw new Error("Invalid admin ID");
  const scope = adminId ? [adminId] : [...settings.adminIds];
  if (scope.some(id => !validId(id))) throw new Error("Invalid admin scope");
  const admins = await db.collection("admins").find(scope.length ? { _id: { $in: scope.map(id => new ObjectId(id)) } } : {},
    { projection: { user_id: 1, name_f: 1, name_l: 1, login: 1, email: 1, streamHost: 1, appEnv: 1 } }).toArray();
  const byUser = new Map(admins.map(admin => [String(admin.user_id), admin]));
  const nvrs = admins.length ? await db.collection("nvrs").find({ userId: { $in: [...byUser.keys()] } },
    { projection: { userId: 1, nvrName: 1, domain: 1 } }).toArray() : [];
  const byNvr = new Map(nvrs.map(nvr => [String(nvr._id), nvr]));
  const channels = nvrs.length ? await db.collection("channels").find({ nvrId: { $in: nvrs.map(nvr => nvr._id) }, isAdded: true },
    { projection: { userId: 1, nvrId: 1, name: 1, customName: 1, channelId: 1, localChannelId: 1, streamingPath: 1 } }).toArray() : [];
  const cameras = channels.flatMap(channel => {
    const nvr = byNvr.get(String(channel.nvrId)), admin = byUser.get(String(channel.userId));
    if (!admin || !nvr || String(nvr.userId) !== String(admin.user_id)) return [];
    return [{ cameraId: String(channel._id), adminId: String(admin._id), nvrId: String(nvr._id),
      name: channel.customName || channel.name || "Camera", channelId: channel.channelId || channel.localChannelId || null,
      nvrName: nvr.nvrName, adminName: publicAdmin(admin).name, email: admin.email,
      ...statusIdentity(admin, nvr, channel, settings) }];
  });
  const identities = new Map();
  for (const camera of cameras) if (camera.sourceKey) identities.set(camera.sourceKey, (identities.get(camera.sourceKey) || 0) + 1);
  for (const camera of cameras) if (identities.get(camera.sourceKey) > 1) camera.mappingError = "Ambiguous status ID";
  const owners = await db.collection("superadmins").find({}, { projection: { _id: 1 } }).toArray();
  const recipients = owners.length ? await db.collection("superadmintelegramrecipients").find({ _id: { $in: owners.map(owner => owner._id) } },
    { projection: { selectedChatId: 1, telegramChannels: 1, telegramChatId: 1, telegramChatTitle: 1,
      telegramChatUsername: 1, telegramChatType: 1, telegramLinkCode: 1 } }).toArray() : [];
  const muted = cameras.length ? await db.collection("streammonitoringstates").find({ _id: { $in: cameras.map(camera => camera.cameraId) }, alertsMuted: true },
    { projection: { _id: 1 } }).toArray() : [];
  return { admins: admins.map(publicAdmin), nvrs: nvrs.map(nvr => ({ _id: String(nvr._id), nvrName: nvr.nvrName })),
    cameras, recipients, mutedCameraIds: muted.map(row => String(row._id)) };
}

export function monitoringInventoryRoutes(database) {
  const router = Router();
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    try {
      const settings = monitoringSettings(), time = req.get("x-monitor-time") || "", supplied = req.get("x-monitor-signature") || "";
      if (!settings.apiKey || req.method !== "GET" || !/^\d+$/.test(time) || Math.abs(Date.now() - Number(time)) > 30000
        || !/^[a-f0-9]{64}$/.test(supplied)
        || !timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(signature(settings, req.originalUrl, time), "hex")))
        return res.status(401).json({ error: "Monitoring service authentication required" });
      next();
    } catch { res.status(503).json({ error: "Monitoring inventory unavailable" }); }
  });
  router.get("/control", async (_req, res) => {
    try { res.json(await legacyControl(database(), monitoringSettings())); }
    catch { res.status(503).json({ error: "Monitoring control unavailable" }); }
  });
  router.get("/inventory", async (req, res) => {
    try { res.json(await inventorySnapshot(database(), monitoringSettings(), req.query.adminId)); }
    catch { res.status(503).json({ error: "Monitoring inventory unavailable" }); }
  });
  return router;
}

export async function readMonitoringApi(settings, resource, params = {}, signal) {
  if (!settings.apiKey) throw new Error("Monitoring API key missing");
  const url = new URL(settings.apiBaseUrl.replace(/\/+$/, "") + "/" + resource);
  if (url.username || url.password || (url.protocol !== "https:"
    && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error("Monitoring API requires HTTPS or loopback");
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, String(value));
  const time = String(Date.now());
  try {
    return (await axios.get(url.href, { signal, timeout: settings.timeoutMs, maxRedirects: 0, maxContentLength: 10 * 1024 * 1024,
      headers: { "x-monitor-time": time, "x-monitor-signature": signature(settings, url.pathname + url.search, time) } })).data;
  } catch { throw new Error("Read-only monitoring API unavailable"); }
}

export async function readInventory(settings, adminId = null, signal) {
  const snapshot = await readMonitoringApi(settings, "inventory", { adminId }, signal);
  if (!["admins", "nvrs", "cameras", "recipients", "mutedCameraIds"].every(key => Array.isArray(snapshot?.[key])))
    throw new Error("Invalid monitoring inventory");
  return snapshot;
}
