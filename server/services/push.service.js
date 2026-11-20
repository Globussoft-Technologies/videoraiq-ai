import { customDetectionName } from "../utils/detectionDisplayNames.js";
import fs from "fs";
import config from "config";
import { initializeApp, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import logger from "../utils/logger.js";
import PushToken from "../core/v2/pushTokens/pushTokens.model.js";
import User from "../core/v2/authorizedUsers/authorizedUsers.model.js";
import Role from "../core/v2/roles/roles.model.js";
import Permission from "../core/v2/permission/permissions.model.js";
import AuthorizedChannels from "../core/v2/cameraRestrictions/authorizedChannels.model.js";
import NVR from "../core/v2/NVR/nvr.model.js";
import { buildIncidentImageUrl } from "../messagingService/message.helper.js";

// Android notification channel incident pushes are posted to. The Android app
// must create a channel with this id (IMPORTANCE_HIGH for sound + heads-up);
// if it doesn't exist, Android falls back to FCM's default channel.
export const ANDROID_CHANNEL_ID = "incident_alerts";

// FCM's per-request token cap for sendEachForMulticast.
const MULTICAST_LIMIT = 500;

// Errors that mean the token itself is dead (app uninstalled, token rotated,
// browser unsubscribed) — those rows are deleted. Anything else (quota,
// transient server errors) keeps the token.
const STALE_TOKEN_ERRORS = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

let messaging; // undefined = not initialised yet, null = push disabled

/**
 * Firebase is optional: without a service account every push call is a no-op,
 * so the incident flow never depends on it. Configure either
 * `Firebase.serviceAccountPath` in config or FIREBASE_SERVICE_ACCOUNT_PATH.
 */
function getMessagingOrNull() {
  if (messaging !== undefined) return messaging;

  const path =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    (config.has("Firebase.serviceAccountPath") ? config.get("Firebase.serviceAccountPath") : "");

  if (!path) {
    logger.warn("[PUSH] Firebase not configured (FIREBASE_SERVICE_ACCOUNT_PATH or Firebase.serviceAccountPath) — incident push notifications disabled");
    messaging = null;
    return messaging;
  }

  try {
    const serviceAccount = JSON.parse(fs.readFileSync(path, "utf8"));
    messaging = getMessaging(initializeApp({ credential: cert(serviceAccount) }, "push"));
    logger.info(`[PUSH] Firebase messaging ready (project ${serviceAccount.project_id})`);
  } catch (error) {
    logger.error("[PUSH] Firebase init failed, push disabled; check the service-account path and JSON", { code: error.code || "FIREBASE_INIT_FAILED", name: error.name });
    messaging = null;
  }
  return messaging;
}

export function initializePushMessaging() {
  return getMessagingOrNull() !== null;
}

// "loiteringDetection" -> "Loitering Detection" (same idea as the web toast's
// prettifySlug, so all channels read alike).
const prettify = (slug) =>
  String(slug || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

const SEVERITY_LABEL = { low: "Low", moderate: "Medium", high: "High" };

// The one type-specific fact that makes the alert actionable without opening
// it. Generic over field names, since 30+ detection types share a few of them.
function incidentDetail(incident) {
  if (incident?.vehicleNumber) {
    const direction = typeof incident.checkin === "boolean" ? (incident.checkin ? " · IN" : " · OUT") : "";
    return `Vehicle ${incident.vehicleNumber}${direction}`;
  }
  if (incident?.croudCount > 0) return `${incident.croudCount} ${incident.croudCount === 1 ? "person" : "people"}`;
  if (incident?.totalEntry || incident?.totalExit) return `In ${incident.totalEntry || 0} · Out ${incident.totalExit || 0}`;
  if (incident?.count > 0) return `Count ${incident.count}`;
  return "";
}

/**
 * One message for every platform (the same multicast goes to all of an
 * admin's devices, FCM applies the matching block per token):
 *  - Android / iOS: a visible notification with the default sound, so it
 *    alerts even when the app is closed or killed.
 *  - Web: deliberately data-only — there's no top-level `notification`, so
 *    the service worker (client_v2/public/firebase-messaging-sw.js) builds
 *    the notification itself and can de-duplicate it against the
 *    socket-driven desktop notification of an open tab.
 * `data` reaches every platform (FCM requires string values) — mobile apps
 * use it for foreground display and tap navigation (incidentId etc.).
 *
 * Body, up to three lines: severity · detail · zone / camera · NVR, site /
 * date and time. The snapshot rides along as an image URL (shown on web and
 * Android; iOS needs a notification service extension in the app).
 */
export function buildIncidentMessage(incident, timezone = "Asia/Kolkata", nvr = {}, displayName) {
  const title =
    displayName ||
    incident?.detectionSetting?.name ||
    prettify(incident?.incidentType || incident?.incidentName) ||
    "Detection";
  const at = new Date(incident?.timeOfIncident || Date.now());
  const when = at.toLocaleString("en-IN", {
    timeZone: timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const summary = [SEVERITY_LABEL[incident?.severity], incidentDetail(incident), incident?.zone && `Zone ${incident.zone}`]
    .filter(Boolean).join(" · ");
  const where = [incident?.channelName || "Camera", [nvr?.nvrName, nvr?.location].filter(Boolean).join(", ")]
    .filter(Boolean).join(" · ");
  const body = [summary, where, when].filter(Boolean).join("\n");
  const image = buildIncidentImageUrl(incident);

  return {
    data: {
      type: "incident",
      incidentId: String(incident?._id ?? ""),
      incidentType: String(incident?.incidentType ?? ""),
      channelId: String(incident?.channelId ?? ""),
      nvrId: String(incident?.nvrId ?? ""),
      severity: String(incident?.severity ?? ""),
      timeOfIncident: at.toISOString(),
      title,
      body,
      ...(image ? { image } : {}),
    },
    android: {
      priority: "high",
      notification: { title, body, channelId: ANDROID_CHANNEL_ID, sound: "default", ...(image ? { imageUrl: image } : {}) },
    },
    apns: {
      headers: { "apns-priority": "10" },
      payload: { aps: { alert: { title, body }, sound: "default", ...(image ? { "mutable-content": 1 } : {}) } },
      ...(image ? { fcmOptions: { imageUrl: image } } : {}),
    },
    webpush: { headers: { Urgency: "high" } },
  };
}

/**
 * Push an incident to every registered device of `admin` (the incident's
 * tenant). Never throws — a push failure must not affect incident creation.
 * Respects the admin's Settings ▸ Alert Channels ▸ Push Notifications switch.
 */
export async function sendIncidentPush({ admin, incident }) {
  const adminId = admin?._id;
  const context = { incidentId: String(incident?._id ?? ""), adminId: adminId ? String(adminId) : null };
  try {
    if (!adminId) {
      logger.warn("[PUSH] incident skipped", { ...context, reason: "missing_admin" });
      return;
    }
    if (admin.pushAlertsEnabled === false) {
      logger.info("[PUSH] incident skipped", { ...context, reason: "admin_push_disabled" });
      return;
    }
    const fcm = getMessagingOrNull();
    if (!fcm) {
      logger.warn("[PUSH] incident skipped", { ...context, reason: "firebase_unavailable" });
      return;
    }

    const registered = await PushToken.find({ adminId: String(adminId) }).select("token platform userId").lean();
    if (!registered.length) {
      logger.info("[PUSH] incident skipped", { ...context, reason: "no_registered_tokens" });
      return;
    }
    const memberIds = registered.map((row) => row.userId).filter((id) => /^[a-f\d]{24}$/i.test(id || ""));
    const members = memberIds.length ? await User.find({ _id: { $in: memberIds }, adminId }).select("roleIds").lean() : [];
    const roles = members.length ? await Role.find({ _id: { $in: members.map((member) => member.roleIds) }, adminId }).select("permissionId").lean() : [];
    const permissions = roles.length ? await Permission.find({ _id: { $in: roles.map((role) => role.permissionId) }, adminId }).select("permissionConfig.alerts.view").lean() : [];
    const access = memberIds.length ? await AuthorizedChannels.find({ userId: { $in: memberIds }, adminId }).select("userId channels").lean() : [];
    const roleById = new Map(roles.map((role) => [String(role._id), role]));
    const permissionById = new Map(permissions.map((permission) => [String(permission._id), permission]));
    const accessByMember = new Map(access.map((entry) => [String(entry.userId), entry]));
    const allowedMembers = new Set(members.filter((member) => {
      const role = roleById.get(String(member.roleIds));
      const permission = permissionById.get(String(role?.permissionId));
      const channels = accessByMember.get(String(member._id))?.channels || [];
      return permission?.permissionConfig?.alerts?.view === true
        && channels.some((channel) => String(channel) === String(incident?.channelId));
    }).map((member) => String(member._id)));
    const rows = registered.filter((row) =>
      String(row.userId) === String(admin.user_id) || allowedMembers.has(String(row.userId))
    );
    if (!rows.length) {
      logger.info("[PUSH] incident skipped", { ...context, reason: "no_authorized_tokens" });
      return;
    }

    // NVR name + site for the body; a failed lookup just leaves them out.
    const nvr = incident?.nvrId
      ? await NVR.findById(incident.nvrId).select("nvrName location").lean().catch(() => null)
      : null;
    const message = buildIncidentMessage(incident, admin.timezone || undefined, nvr || {}, customDetectionName(admin.detectionDisplayNames, incident?.incidentType));
    const stale = [];
    let delivered = 0;

    for (let i = 0; i < rows.length; i += MULTICAST_LIMIT) {
      const tokens = rows.slice(i, i + MULTICAST_LIMIT).map((r) => r.token);
      const result = await fcm.sendEachForMulticast({ ...message, tokens });
      delivered += result.successCount;
      result.responses.forEach((r, idx) => {
        if (r.success) return;
        if (STALE_TOKEN_ERRORS.has(r.error?.code)) stale.push(tokens[idx]);
        logger.warn(`[PUSH] send failed (${r.error?.code || "unknown"})`, { ...context, platform: rows[i + idx]?.platform || "unknown", stale: STALE_TOKEN_ERRORS.has(r.error?.code) });
      });
    }

    if (stale.length) await PushToken.deleteMany({ token: { $in: stale } });
    logger.info(`[PUSH] incident ${message.data.incidentId} -> ${delivered}/${rows.length} devices, ${stale.length} stale removed`);
  } catch (error) {
    logger.error("[PUSH] incident push failed", { ...context, code: error.code || "PUSH_FAILED", name: error.name });
  }
}
