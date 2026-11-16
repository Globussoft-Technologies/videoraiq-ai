import Admin from "../core/v1/admin/admin.model.js";
import logger from "../utils/logger.js";

export async function resolveDeletionAccount(userId) {
  const account = { userId: String(userId || "unknown"), name: "Unknown account" };
  if (!userId) return account;
  account.name = account.userId;
  try {
    const admin = await Admin.findOne({ user_id: String(userId) })
      .select("name_f name_l login").lean();
    account.name = [admin?.name_f, admin?.name_l].filter(Boolean).join(" ").trim()
      || admin?.login || account.userId;
  } catch (error) {
    // The device may already be gone. A display-name lookup must not turn a
    // successful deletion into an API failure; the owner ID is still logged.
    logger.warn(`[DEVICE-DELETE] Could not resolve account name for userId ${account.userId}: ${error.message}`);
  }
  return account;
}

export async function logDeviceDeletion(type, device, account = null) {
  const owner = account || await resolveDeletionAccount(device?.userId);
  const deviceId = String(device?._id || "unknown");
  const name = type === "NVR" ? device?.nvrName : device?.customName || device?.name;
  // Quoting names also keeps newlines in a device/account name on one log line.
  logger.info(`[DEVICE-DELETE] ${type} ${JSON.stringify(String(name || deviceId))} (id: ${deviceId}) deleted from account ${JSON.stringify(owner.name)} (userId: ${owner.userId}). Historical logs and incidents retained.`);
}
