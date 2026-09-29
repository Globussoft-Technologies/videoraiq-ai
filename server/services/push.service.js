import fs from "fs";
import config from "config";
import { initializeApp, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import logger from "../utils/logger.js";
import PushToken from "../core/v2/pushTokens/pushTokens.model.js";

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
    logger.warn("[PUSH] Firebase not configured (Firebase.serviceAccountPath) — incident push notifications disabled");
    messaging = null;
    return messaging;
  }

  try {
    const serviceAccount = JSON.parse(fs.readFileSync(path, "utf8"));
    messaging = getMessaging(initializeApp({ credential: cert(serviceAccount) }, "push"));
    logger.info(`[PUSH] Firebase messaging ready (project ${serviceAccount.project_id})`);
  } catch (error) {
    logger.error(`[PUSH] Firebase init failed, push disabled: ${error.message}`);
    messaging = null;
  }
  return messaging;
}

// "loiteringDetection" -> "Loitering Detection" (same idea as the web toast's
// prettifySlug, so all channels read alike).
const prettify = (slug) =>
  String(slug || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

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
 */
export function buildIncidentMessage(incident, timezone = "Asia/Kolkata") {
  const title =
    incident?.detectionSetting?.name ||
    prettify(incident?.incidentType || incident?.incidentName) ||
    "Detection";
  const at = new Date(incident?.timeOfIncident || Date.now());
  const time = at.toLocaleTimeString("en-IN", { timeZone: timezone, hour: "2-digit", minute: "2-digit" });
  const body = `${incident?.channelName || "Camera"} · ${time}`;

  return {
    data: {
      type: "incident",
      incidentId: String(incident?._id ?? ""),
      incidentType: String(incident?.incidentType ?? ""),
      channelId: String(incident?.channelId ?? ""),
      nvrId: String(incident?.nvrId ?? ""),
      timeOfIncident: at.toISOString(),
      title,
      body,
    },
    android: {
      priority: "high",
      notification: { title, body, channelId: ANDROID_CHANNEL_ID, sound: "default" },
    },
    apns: {
      headers: { "apns-priority": "10" },
      payload: { aps: { alert: { title, body }, sound: "default" } },
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
  try {
    if (!adminId || admin.pushAlertsEnabled === false) return;
    const fcm = getMessagingOrNull();
    if (!fcm) return;

    const rows = await PushToken.find({ adminId: String(adminId) }).select("token").lean();
    if (!rows.length) return;

    const message = buildIncidentMessage(incident, admin.timezone || undefined);
    const stale = [];
    let delivered = 0;

    for (let i = 0; i < rows.length; i += MULTICAST_LIMIT) {
      const tokens = rows.slice(i, i + MULTICAST_LIMIT).map((r) => r.token);
      const result = await fcm.sendEachForMulticast({ ...message, tokens });
      delivered += result.successCount;
      result.responses.forEach((r, idx) => {
        if (r.success) return;
        if (STALE_TOKEN_ERRORS.has(r.error?.code)) stale.push(tokens[idx]);
        else logger.warn(`[PUSH] send failed (${r.error?.code}): ${r.error?.message}`);
      });
    }

    if (stale.length) await PushToken.deleteMany({ token: { $in: stale } });
    logger.info(`[PUSH] incident ${message.data.incidentId} -> ${delivered}/${rows.length} devices, ${stale.length} stale removed`);
  } catch (error) {
    logger.error(`[PUSH] incident push failed for admin ${adminId}: ${error.message}`);
  }
}
