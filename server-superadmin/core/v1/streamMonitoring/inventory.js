import Admin from "../admin/admin.model.js";
import NVR from "../NVR/nvr.model.js";
import Channel from "../channels/channels.model.js";
import { statusIdentity } from "./identity.js";

const adminFields = "user_id name_f name_l login email streamHost appEnv";

export function publicAdmin(admin) {
  return { adminId: String(admin._id), name: `${admin.name_f || ""} ${admin.name_l || ""}`.trim() || admin.login,
    email: admin.email };
}

// Explicit projections keep recorder credentials and RTSP URLs out of monitoring.
// Restrict channels to existing NVRs: deleted recorders can leave orphan channels.
export async function readInventory(settings, adminId = null) {
  const filter = adminId ? { _id: adminId } : settings.adminIds.size ? { _id: { $in: [...settings.adminIds] } } : {};
  const admins = await Admin.find(filter).select(adminFields).lean();
  const byUser = new Map(admins.map(admin => [String(admin.user_id), admin]));
  const nvrs = admins.length ? await NVR.find({ userId: { $in: [...byUser.keys()] } })
    .select("_id userId nvrName domain").lean() : [];
  const byNvr = new Map(nvrs.map(nvr => [String(nvr._id), nvr]));
  const channels = nvrs.length ? await Channel.find({ userId: { $in: [...byUser.keys()] },
    nvrId: { $in: nvrs.map(nvr => nvr._id) }, isAdded: true })
    .select("_id userId nvrId name customName channelId localChannelId streamingPath").lean() : [];
  const cameras = channels.flatMap(channel => {
    const nvr = byNvr.get(String(channel.nvrId));
    const admin = byUser.get(String(channel.userId));
    if (!nvr || !admin || String(nvr.userId) !== String(admin.user_id)) return [];
    return [{ adminId: admin._id, userId: String(admin.user_id), cameraId: channel._id,
      nvrId: nvr._id, nvrName: nvr.nvrName,
      name: channel.customName || channel.name || "Camera", channelId: channel.channelId || channel.localChannelId || null,
      ...statusIdentity(admin, nvr, channel, settings) }];
  });
  const sourceCounts = new Map();
  for (const camera of cameras) if (camera.sourceKey) sourceCounts.set(camera.sourceKey, (sourceCounts.get(camera.sourceKey) || 0) + 1);
  for (const camera of cameras) if (sourceCounts.get(camera.sourceKey) > 1) camera.mappingError = "Status ID is shared by multiple assigned cameras";
  return { admins, nvrs, cameras };
}
