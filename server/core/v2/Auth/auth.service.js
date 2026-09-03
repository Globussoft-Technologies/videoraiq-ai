import { generateToken } from "../../../middlewares/decodeToken.js";
import { grantPlanDefaultCameras } from "../clientConfig/detectionLicense.service.js";
import { encrypt } from "../../../utils/cryptoUtils.js";
import logger from "../../../utils/logger.js";
import { resolveAdminEndpoints } from "../../../utils/adminEndpoints.js";
import { stopAllStreams, resumeAllStreams } from "../../../utils/stopStreams.js";
import config from "config";
import jwt from "jsonwebtoken";
import { createHmac, timingSafeEqual } from "node:crypto";
import axios from "axios";
import Admin from "../admin/admin.model.js";
import dashboardSidebarModel from "../dashboard/dashboardSidebar.model.js";
import { Incident } from "../incidents/incidents.model.js";
import adminModel from "../admin/admin.model.js";
import rolesModel from "../roles/roles.model.js";
import {
  adminConfig,
  completeConfig,
  readConfig,
  writeConfig,
} from "../permission/permissions.config.js";
import { reconcileDefaultRolesOnLogin } from "../roles/defaultRoles.sync.js";
import permissionModel from "../permission/permissions.model.js";
import locationModel from "../locations/location.model.js";
import authorizedUsersModel from "../authorizedUsers/authorizedUsers.model.js";
import NVRModel from "../NVR/nvr.model.js";
import sessionsService from "../sessions/sessions.service.js";
import usersModel from "../users/users.model.js";
import { autoSyncLocations, syncPermissionLocations, syncStevinrockLogPermissions, syncAlertsAnalyticsPermissions } from "../../../utils/helperFunctions.js";
const backendToken = config.get("Backend.token");
const detectionHost = config.get("PythonService.detectionUrl");
const APP_ENV = config.get("APP_ENV");
const DEFAULT_FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Every logs sub-permission the backfill maintains. Add new log types here and
// the migration picks them up for existing admins automatically.
// productivityLogs is intentionally absent — those logs are hidden from the UI.
const LOG_PERMISSION_KEYS = [
  "global",
  "accessLogs",
  "attendanceLogs",
  "taggedUsersLogs",
  "detectedUsersLogs",
  "personCountLogs",
  "trackLogs",
  "visibilityLogs",
  "deskLogs",
  "guardLogs",
  "ANPRLogs",
];

class AUTHService {
  constructor() {
    // Initialize configuration values
    this.baseUrl = config.get("aMember.baseUrl");
    this.apiKey = config.get("aMember.apiKey");
    this.secretKey = config.get("jwt.secretKey");
    this.tokenExpiryTime = config.get("jwt.tokenExpiryTime");
    this.customPlanID = config.get("aMember.customPlanID");
    this.topUpPlanID = config.get("aMember.topUpPlanID");
    // config.get() throws on an undefined key, and this constructor runs at
    // module load (export default new AUTHService()). Probing with has() keeps
    // an unconfigured secret a per-route 503 via the guards below instead of a
    // boot failure that takes the whole API down.
    this.impersonationSecret = config.has("aMember.impersonationSecret")
      ? config.get("aMember.impersonationSecret")
      : null;
    this.usedImpersonationNonces = new Map();
  }

  _verifyImpersonationToken(token) {
    if (!this.impersonationSecret) throw new Error("Impersonation SSO is not configured");
    const parts = String(token || "").split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error("Invalid impersonation token");

    const expected = createHmac("sha256", this.impersonationSecret).update(parts[0]).digest();
    const supplied = Buffer.from(parts[1], "base64url");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new Error("Invalid impersonation token signature");
    }

    let payload;
    try { payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); }
    catch (_) { throw new Error("Invalid impersonation token payload"); }

    const now = Math.floor(Date.now() / 1000);
    if (payload?.purpose !== "videoraiq-admin-impersonation" ||
        !Number.isInteger(payload?.user_id) || !payload?.nonce ||
        !Number.isInteger(payload?.iat) || !Number.isInteger(payload?.exp) ||
        payload.iat > now + 5 || payload.exp < now || payload.exp - payload.iat > 60) {
      throw new Error("Expired or invalid impersonation token");
    }
    for (const [nonce, expiry] of this.usedImpersonationNonces) {
      if (expiry < now) this.usedImpersonationNonces.delete(nonce);
    }
    if (this.usedImpersonationNonces.has(payload.nonce)) throw new Error("Impersonation token has already been used");
    return payload;
  }

  _verifyUserSsoToken(token) {
    if (!this.impersonationSecret) throw new Error("aMember SSO is not configured");
    const parts = String(token || "").split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error("Invalid aMember SSO token");

    const expected = createHmac("sha256", this.impersonationSecret).update(parts[0]).digest();
    const supplied = Buffer.from(parts[1], "base64url");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new Error("Invalid aMember SSO token signature");
    }

    let payload;
    try { payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); }
    catch (_) { throw new Error("Invalid aMember SSO token payload"); }

    const now = Math.floor(Date.now() / 1000);
    if (payload?.purpose !== "videoraiq-user-sso" ||
        !Number.isInteger(payload?.user_id) || !String(payload?.login || "").trim() ||
        !payload?.nonce || !Number.isInteger(payload?.iat) || !Number.isInteger(payload?.exp) ||
        payload.iat > now + 5 || payload.exp < now || payload.exp - payload.iat > 60) {
      throw new Error("Expired or invalid aMember SSO token");
    }
    for (const [nonce, expiry] of this.usedImpersonationNonces) {
      if (expiry < now) this.usedImpersonationNonces.delete(nonce);
    }
    if (this.usedImpersonationNonces.has(payload.nonce)) {
      throw new Error("aMember SSO token has already been used");
    }
    return payload;
  }

  async _getAmemberUserForSso(payload) {
    const params = new URLSearchParams({
      _key: this.apiKey,
      "_filter[user_id]": String(payload.user_id),
      _count: "1",
    });
    const response = await fetchWithTimeout(`${this.baseUrl}/users?${params}`);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`aMember user API failed: ${text || response.status}`);
    }

    const users = await response.json();
    const user = Array.isArray(users) ? users[0] : users?.[0];
    if (!user || Number(user.user_id) !== payload.user_id || user.login !== payload.login) {
      throw new Error("aMember SSO identity does not match");
    }

    const access = await this.getAmemberAccessByUserId(payload.user_id);
    return {
      ok: true,
      user_id: Number(user.user_id),
      login: user.login,
      email: user.email,
      name_f: user.name_f || "",
      name_l: user.name_l || "",
      subscriptions: this.extractSubscriptions(access) || {},
    };
  }

  async verifyAmemberSso(req, res) {
    try {
      const payload = this._verifyUserSsoToken(req.body?.token);
      const userData = await this._getAmemberUserForSso(payload);
      this.usedImpersonationNonces.set(payload.nonce, payload.exp);

      req.body = {
        ...req.body,
        login: userData.login,
        pass: "__signed_amember_sso__",
      };
      req.amemberSsoUserData = userData;

      return this.verifyUser(req, res);
    } catch (error) {
      logger.warn("aMember user SSO rejected:", error.message);
      const configurationError = error.message === "aMember SSO is not configured";
      return res.status(configurationError ? 503 : 403).json({ ok: false, message: error.message });
    }
  }

  async verifyImpersonation(req, res) {
    try {
      const payload = this._verifyImpersonationToken(req.body?.token);
      const admin = await adminModel.findOne({ user_id: payload.user_id });
      if (!admin || admin.login !== payload.login) {
        return res.status(403).json({ ok: false, message: "Dashboard user not found" });
      }
      const access = await this.getAmemberAccessByUserId(payload.user_id);
      const subscriptions = this.extractSubscriptions(access);
      if (!this.isPlanActive({ subscriptions })) {
        return res.status(403).json({ ok: false, expired: true, message: "Subscription is not active" });
      }
      const tokenPayload = {
        status: true, user_id: Number(payload.user_id), login: admin.login,
        adminId: admin._id, orgId: admin.orgId,
        user_name: `${admin.name_f ?? ""} ${admin.name_l ?? ""}`.trim(),
        user_email: admin.email, name_f: admin.name_f ?? "", name_l: admin.name_l ?? "",
        userSubscriptionType: subscriptions, created_from: "EMP",
        impersonatedByAdminId: payload.admin_id,
        enablePhoneRecipients: config.get("enablePhoneRecipients"),
        streamHost: `${(admin.streamHost || config.get("RTSPStream.host")).replace(/\/+$/, "")}/`,
      };
      this.usedImpersonationNonces.set(payload.nonce, payload.exp);
      const dashboardToken = generateToken(tokenPayload, this.secretKey, this.tokenExpiryTime);
      return res.status(200).json({ ok: true, msg: "User impersonation verified", token: dashboardToken, user: tokenPayload });
    } catch (error) {
      logger.warn("Impersonation SSO rejected:", error.message);
      const configurationError = error.message === "Impersonation SSO is not configured";
      return res.status(configurationError ? 503 : 403).json({ ok: false, message: error.message });
    }
  }

  extractSubscriptions(accessResponse) {
    const subscriptions = {};

    for (const key in accessResponse) {
      if (key === "_total") continue;

      const record = accessResponse[key];
      const productId = record.product_id;
      const expireDate = record.expire_date;

      if (
        !subscriptions[productId] ||
        new Date(expireDate) > new Date(subscriptions[productId])
      ) {
        subscriptions[productId] = expireDate;
      }
    }

    return subscriptions;
  }

  async getAmemberAccessByUserId(userId) {
    const url =
      `${this.baseUrl}/access` +
      `?_key=${this.apiKey}` +
      `&_filter[user_id]=${userId}`;
    console.log(url);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`aMember access API failed: ${text}`);
    }

    return response.json();
  }

  // isPlanActive(user) {
  //   const subscription = user.userSubscriptionType || user.subscriptions;

  //   // Check if the subscription is empty or invalid
  //   if (!subscription || Object.keys(subscription).length === 0) {
  //     return false;
  //   }

  //   // Get the subscription date (assuming only one entry in the object)
  //   const subscriptionDate = new Date(Object.values(subscription)[0]);

  //   // Set expiry time to 23:59:59.999 UTC of the expiry date
  //   const expiryUTC = Date.UTC(
  //     subscriptionDate.getUTCFullYear(),
  //     subscriptionDate.getUTCMonth(),
  //     subscriptionDate.getUTCDate(),
  //     23, 59, 59, 999
  //   );

  //   const nowUTC = Date.now(); // current UTC time in ms

  //   return nowUTC <= expiryUTC;
  // }
  isPlanActive(user) {
    const subscriptions = user.userSubscriptionType || user.subscriptions;

    if (!subscriptions || typeof subscriptions !== "object") {
      return false;
    }

    const nowUTC = Date.now();

    return Object.values(subscriptions).some((expiryDate) => {
      if (!expiryDate) return false;

      const date = new Date(expiryDate);
      if (isNaN(date)) return false;

      const expiryUTC = Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        23,
        59,
        59,
        999
      );

      return nowUTC <= expiryUTC;
    });
  }

  // Picks the latest expiry date and its plan/product id from a subscriptions map
  _resolveLatestSubscription(subscriptions) {
    if (!subscriptions || typeof subscriptions !== "object") return null;

    let latest = null;
    for (const [plan, expiry] of Object.entries(subscriptions)) {
      if (!expiry) continue;
      const date = new Date(expiry);
      if (isNaN(date)) continue;

      // Normalize to UTC end-of-day ISO (matches isPlanActive semantics).
      const utcEndOfDay = new Date(
        Date.UTC(
          date.getUTCFullYear(),
          date.getUTCMonth(),
          date.getUTCDate(),
          23,
          59,
          59,
          999
        )
      ).toISOString();

      if (!latest || new Date(utcEndOfDay) > new Date(latest.expiry)) {
        latest = { plan, expiry: utcEndOfDay };
      }
    }
    return latest;
  }

  async getAmemberProductNameFromInvoices(userId, productId) {
    if (!userId) return null;

    const userParams = new URLSearchParams({
      _key: this.apiKey,
      "_filter[user_id]": String(userId),
      "_nested[]": "invoices",
      _count: "1",
    });
    const userResponse = await fetchWithTimeout(
      `${this.baseUrl}/users?${userParams}`
    );
    if (!userResponse.ok) {
      throw new Error(`aMember user invoices API returned ${userResponse.status}`);
    }

    const users = await userResponse.json();
    const invoices = [...(users?.[0]?.nested?.invoices || [])].sort(
      (left, right) => Number(right.invoice_id) - Number(left.invoice_id)
    );

    for (const invoice of invoices) {
      const invoiceParams = new URLSearchParams({ _key: this.apiKey });
      const invoiceResponse = await fetchWithTimeout(
        `${this.baseUrl}/invoices/${encodeURIComponent(invoice.invoice_id)}?${invoiceParams}`
      );
      if (!invoiceResponse.ok) continue;

      const invoiceResult = await invoiceResponse.json();
      const invoiceRecord = Array.isArray(invoiceResult)
        ? invoiceResult[0]
        : invoiceResult?.[0] || invoiceResult;
      const product = invoiceRecord?.nested?.["invoice-items"]?.find(
        (item) => String(item?.item_id) === String(productId)
      );
      if (product?.item_title) return product.item_title;
    }

    return null;
  }

  async getCurrentPlanDetails(
    subscriptions,
    userId,
    bypassUser = null
  ) {
    const currentSubscription = this._resolveLatestSubscription(subscriptions);
    if (!currentSubscription) return null;

    const rawProductId = String(currentSubscription.plan);
    const numericProductId = Number.parseInt(rawProductId, 10);
    const id = Number.isNaN(numericProductId) ? rawProductId : numericProductId;

    if (bypassUser) {
      return {
        id,
        name: bypassUser.planName || bypassUser.plan || "Bypass plan",
        expiresAt: currentSubscription.expiry,
      };
    }

    let productLookupError = null;
    try {
      const params = new URLSearchParams({ _key: this.apiKey });
      const response = await fetchWithTimeout(
        `${this.baseUrl}/products/${encodeURIComponent(rawProductId)}?${params}`
      );

      if (!response.ok) {
        throw new Error(`aMember product API returned ${response.status}`);
      }

      const result = await response.json();
      const product = Array.isArray(result) ? result[0] : result?.[0] || result;
      const name = product?.title || product?.name;
      if (name) {
        return { id, name, expiresAt: currentSubscription.expiry };
      }
    } catch (error) {
      productLookupError = error;
    }

    // Existing deployments may not grant products:get to the aMember API key.
    // Invoice items contain the same product title, so use the permissions the
    // login integration already has as a backward-compatible fallback.
    try {
      const name = await this.getAmemberProductNameFromInvoices(
        userId,
        rawProductId
      );
      if (name) {
        return { id, name, expiresAt: currentSubscription.expiry };
      }
    } catch (error) {
      logger.warn(
        `Unable to load aMember product ${rawProductId} from invoices: ${error.message}`
      );
    }

    // Product metadata must not make an otherwise valid login fail. The ID
    // and expiry still identify the current plan if aMember is unavailable.
    if (productLookupError) {
      logger.warn(
        `Unable to load aMember product ${rawProductId}: ${productLookupError.message}`
      );
    }
    return { id, name: null, expiresAt: currentSubscription.expiry };
  }

  // POST a license payload to a single endpoint. Best-effort: never throws.
  async _postAdminLicense(url, payload) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        logger.error(
          `registerAdminLicense failed for ${url} (${response.status}): ${text}`
        );
      }
    } catch (error) {
      // Swallow all errors — license registration is best-effort.
      logger.error(
        `registerAdminLicense error for ${url}:`,
        error?.message || error
      );
    }
  }

  // Upsert the admin's license on the detection service (two endpoints).
  // Fire-and-forget: this must never throw or block the auth flow.
  async registerAdminLicense(adminData, userData) {
    try {
      const adminId = adminData?._id?.toString?.() || adminData?._id;
      if (!adminId) return;

      const latest = this._resolveLatestSubscription(userData?.subscriptions);
      if (!latest) return;

      const payload = {
        admin_id: adminId,
        expiry: latest.expiry,
      };

      const { detectionUrl } = await resolveAdminEndpoints(adminId);
      const endpoints = [
        `${detectionUrl}/admins/register`,
        `${detectionUrl}/face-auth/api/v1/admins/register`,
      ];

      // Both run independently; one failing never affects the other.
      await Promise.allSettled(
        endpoints.map((url) => this._postAdminLicense(url, payload))
      );
    } catch (error) {
      logger.error("registerAdminLicense error:", error?.message || error);
    }
  }

  // Mint an admin JWT valid for `days` days (1-5) carrying the SAME payload
  // fields as the login token (verifyUser), then AES-encrypt it so the frontend
  // (sharing ENCRYPTION_KEY/IV) can decrypt. Subscriptions/plan come from
  // aMember by user_id (login uses the password-based check; here we resolve the
  // same data without a password). ponytail: any authenticated caller can mint
  // for any adminId — add a superadmin/role guard before treating this as an
  // impersonation endpoint.
  async generateAdminToken(req, res) {
    try {
      const days = parseInt(req.body?.days, 10);
      if (!Number.isInteger(days) || days < 1 || days > 5) {
        return res.status(400).json({ ok: false, msg: "days must be an integer between 1 and 5" });
      }

      // Default to the authenticated admin; allow an explicit adminId override.
      const adminId = req.body?.adminId || req?.verified?.userData?.adminId;
      if (!adminId || !/^[a-f\d]{24}$/i.test(String(adminId))) {
        return res.status(400).json({ ok: false, msg: "A valid adminId is required" });
      }

      const admin = await adminModel.findById(adminId).lean();
      if (!admin) {
        return res.status(404).json({ ok: false, msg: "Admin not found" });
      }

      // Subscriptions from aMember by user_id (no password needed).
      let subscriptions = {};
      try {
        const access = await this.getAmemberAccessByUserId(admin.user_id);
        subscriptions = this.extractSubscriptions(access) || {};
      } catch (e) {
        logger.error(`generateAdminToken subscriptions(${admin.user_id}): ${e.message}`);
      }

      // Identical field set to the login token (verifyUser).
      // Give a trial client their plan's default camera allowance the first
      // time they log in. Subscriptions are already fetched for the token, so
      // no extra aMember call, and it is one-time — a superadmin's later
      // change to the licence is never undone.
      const effectiveCameras = await grantPlanDefaultCameras(admin, subscriptions);

      const tokenPayload = {
        status: true,
        user_id: admin.user_id,
        login: admin.login,
        adminId: admin._id,
        orgId: admin.orgId,
        user_name: (admin.name_f ?? "") + " " + (admin.name_l ?? ""),
        user_email: admin.email,
        name_f: admin.name_f ?? "",
        name_l: admin.name_l ?? "",
        userSubscriptionType: subscriptions,
        created_from: "EMP",
        enablePhoneRecipients: config.get("enablePhoneRecipients"),
        // Superadmin-set camera limit, so the client has it immediately at
        // login instead of a stale 0 baked into this token.
        purchasedCameras: effectiveCameras,
        streamHost: `${(admin.streamHost || config.get("RTSPStream.host")).replace(/\/+$/, "")}/`,
      };

      // firstIncidentCreatedDate — mirrors login (earliest incident overall).
      const firstIncident = await Incident.aggregate([
        { $sort: { createdAt: 1 } },
        { $project: { timeOfIncident: 1 } },
      ]);
      tokenPayload.firstIncidentCreatedDate = firstIncident?.length
        ? firstIncident[0]?.timeOfIncident
        : "no Incidents found to provide firstIncidentCreatedDate";

      // Plan details — same conditional on the first subscription id as login.
      const firstSub = Object.keys(subscriptions)[0];
      try {
        if (firstSub == this.customPlanID) {
          tokenPayload.customPlan = await this.getCustomPlanDetails(admin.user_id);
          tokenPayload.applyCustomPlan = true;
        } else if (firstSub == this.topUpPlanID) {
          tokenPayload.topUpPlan = await this.getTopUpPlanDetails(admin.user_id);
          tokenPayload.applyTopUpPlan = true;
        }
      } catch (e) {
        logger.error(`generateAdminToken plan(${admin.user_id}): ${e.message}`);
      }

      const jwtToken = generateToken(tokenPayload, this.secretKey, `${days}d`);
      const token = encrypt(jwtToken); // frontend decrypts with the shared ENCRYPTION_KEY/IV
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

      return res.status(200).json({
        ok: true,
        msg: "Admin token generated",
        token,
        days,
        expiresAt,
        user: tokenPayload,
      });
    } catch (err) {
      logger.error(`generateAdminToken: ${err.message}`);
      return res.status(500).json({ ok: false, msg: "Failed to generate admin token" });
    }
  }

  async revokeDetectionService(secretKey) {
    try {
      if (!secretKey) {
        throw new Error("secretKey is required for revoke operation");
      }

      const payload = {
        secret_key: secretKey,
      };

      const response = await axios.post(`${detectionHost}/revoke`, payload, {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 5000, // optional: short timeout since service will die
      });

      return response.data;
    } catch (error) {
      logger.error(
        "Error revoking service:",
        error?.response?.data || error.message
      );
      throw error;
    }
  }

  async revokeAttendanceService(secretKey) {
    try {
      if (!secretKey) {
        throw new Error("secretKey is required for revoke operation");
      }

      const response = await axios.post(
        `${detectionHost}/system/revoke`,
        {}, // no body
        {
          headers: {
            "Content-Type": "application/json",
            "X-Revoke-Secret": secretKey,
          },
          timeout: 5000, // service will shut down quickly
        }
      );

      return response.data;
    } catch (error) {
      logger.error(
        "Error revoking service:",
        error?.response?.data || error.message
      );
      throw error;
    }
  }

  transformData(input) {
    const defaults = {
      planDetails: {
        name: "Basic Monitoring Plan",
        description:
          "Provides essential access to CCTV camera feeds with limited video storage, motion detection, and real-time alerts.",
        access: "Basic Monitoring",
        cameraFeeds: "Live view from connected cameras",
        motionDetection: "Enabled with basic sensitivity settings",
        price: " ",
        topPlan: false,
        more: "Includes access to basic video playback, email alerts, and limited cloud storage.",
      },
      "Connected Cameras": 4,
      "Video Storage (Days)": 7,
      "Storage Type": ["Local", "Cloud"],
      "Motion Detection": true,
      "Real-Time Alerts": true,
      "Remote Access": true,
      "Playback & History": true,
      "Activity Logs": true,
      "User Access Management": true,
      "Camera Health Monitoring": true,
      "Cloud Backup": false,
      "AI-Based Intrusion Detection": false,
      "Integration with Smart Devices": false,
      "Video Quality": "720p",
      "Mobile App Support": true,
      "Geofencing Alerts": false,
      "Night Vision Support": true,
      "Two-Way Audio": false,
      "Analytics Dashboard": false,
    };

    const result = { ...defaults };

    for (const key in input) {
      const item = input[key];

      if (key === "planDetails" && typeof item === "object") {
        result.planDetails = {
          ...defaults.planDetails,
          ...item,
        };
      } else if (key === "Storage Type" && Array.isArray(item)) {
        result["Storage Type"] =
          item.length > 0 ? item : defaults["Storage Type"];
      } else if (key === "Connected Cameras" || key === "Video Storage (Days") {
        const numValue = Number(item);
        if (!isNaN(numValue)) {
          result[key] = numValue;
        }
      } else if (key === "Video Quality") {
        result["Video Quality"] =
          typeof item === "string" && item.trim() !== ""
            ? item
            : defaults["Video Quality"];
      } else if (
        typeof defaults[key] === "boolean" &&
        (item === true || item === false)
      ) {
        result[key] = item;
      }
    }

    return result;
  }

  transformTopUpData(input) {
    const defaults = {
      planDetails: {
        name: "Basic Monitoring Plan",
        description:
          "Provides essential access to CCTV camera feeds with limited video storage, motion detection, and real-time alerts.",
        access: "Basic Monitoring",
        cameraFeeds: "Live view from connected cameras",
        motionDetection: "Enabled with basic sensitivity settings",
        price: " ",
        topPlan: false,
        more: "Includes access to basic video playback, email alerts, and limited cloud storage.",
      },
      "Connected Cameras": 4,
      "Video Storage (Days)": 7,
      "Storage Type": ["Local", "Cloud"],
      "Motion Detection": true,
      "Real-Time Alerts": true,
      "Remote Access": true,
      "Playback & History": true,
      "Activity Logs": true,
      "User Access Management": true,
      "Camera Health Monitoring": true,
      "Cloud Backup": false,
      "AI-Based Intrusion Detection": false,
      "Integration with Smart Devices": false,
      "Video Quality": "720p",
      "Mobile App Support": true,
      "Geofencing Alerts": false,
      "Night Vision Support": true,
      "Two-Way Audio": false,
      "Analytics Dashboard": false,
    };

    const result = { ...defaults };

    const totalUnitInDollars = Array.isArray(input)
      ? input.reduce((sum, val) => sum + Number(val || 0), 0)
      : 0;

    // Apply top-up based enhancements
    if (totalUnitInDollars >= 10) {
      result["Connected Cameras"] += 2;
    }

    if (totalUnitInDollars >= 20) {
      result["Video Storage (Days)"] += 3;
    }

    if (totalUnitInDollars >= 30) {
      result["Cloud Backup"] = true;
    }

    if (totalUnitInDollars >= 40) {
      result["AI-Based Intrusion Detection"] = true;
    }

    if (totalUnitInDollars >= 50) {
      result["Video Quality"] = "1080p";
    }

    // Optional: Update plan description or price
    result.planDetails.price = `$${totalUnitInDollars}`;
    result.planDetails.description += " | Upgraded via top-up.";

    return result;
  }

  async getTopUpPlanDetails(userId) {
    const testUrl = `${this.baseUrl}/users?_key=${this.apiKey}&_filter[user_id]=${userId}&_nested[]=invoices`;
    const response = await fetch(testUrl);
    const resultData = await response.json();
    let invoiceData = resultData[0]?.nested?.invoices || [];
    if (invoiceData.length > 0) {
      invoiceData = invoiceData.reverse();
    }
    const allCustomOptions = [];

    for (const value of invoiceData) {
      const invoiceId = value.invoice_id;

      const customPlanUrl = `${this.baseUrl}/invoices/${invoiceId}?_key=${this.apiKey}`;
      const resultInvoice = await fetch(customPlanUrl);
      const resultDataInvoice = await resultInvoice.json();

      const customOptions = JSON.parse(
        resultDataInvoice[0]?.nested?.["invoice-items"]?.[0]?.qty || "{}"
      );

      allCustomOptions.push(customOptions);
    }
    const topUpResponse = this.transformTopUpData(allCustomOptions);
    return topUpResponse;
  }

  async getCustomPlanDetails(userId) {
    const testUrl = `${this.baseUrl}/users?_key=${this.apiKey}&_filter[user_id]=${userId}&_nested[]=invoices`;
    const response = await fetch(testUrl);
    const resultData = await response.json();
    let invoiceData = resultData[0]?.nested?.invoices || [];
    if (invoiceData.length > 0) {
      invoiceData = invoiceData.reverse();
    }

    for (const value of invoiceData) {
      const invoiceId = value.invoice_id;
      const customPlanUrl = `${this.baseUrl}/invoices/${invoiceId}?_key=${this.apiKey}`;
      const resultInvoice = await fetch(customPlanUrl);
      const resultDataInvoice = await resultInvoice.json();
      const customOptions = JSON.parse(
        resultDataInvoice[0]?.nested?.["invoice-items"]?.[0]?.options || "{}"
      );

      const invoiceStatus = parseInt(value.status, 10);
      const response = this.transformData(customOptions);
      return response;
    }
  }

  async fetchUserDataByName(loginPass) {
    const url = `${this.baseUrl}/check-access/by-login-pass`;

    const authenticate = async (login) => {
      const params = new URLSearchParams({
        _key: this.apiKey,
        login,
        pass: loginPass.pass,
      });

      const response = await fetchWithTimeout(`${url}?${params}`);
      return response.json();
    };

    try {
      const suppliedLogin = String(loginPass.login).trim();
      const directResult = await authenticate(suppliedLogin);

      // Some aMember installations are configured to authenticate by email
      // only. In that mode, resolve an exact username match to its aMember
      // email and retry through the same password-validation endpoint.
      if (directResult?.ok || suppliedLogin.includes("@")) {
        return directResult;
      }

      try {
        const userParams = new URLSearchParams({
          _key: this.apiKey,
          "_filter[login]": suppliedLogin,
          _count: "1",
        });
        const userResponse = await fetchWithTimeout(
          `${this.baseUrl}/users?${userParams}`
        );
        const users = await userResponse.json();
        const matchedUser = users?.[0];
        const matchedEmail = matchedUser?.email?.trim();

        if (
          matchedUser?.login === suppliedLogin &&
          matchedEmail &&
          matchedEmail.toLowerCase() !== suppliedLogin.toLowerCase()
        ) {
          return await authenticate(matchedEmail);
        }
      } catch (lookupError) {
        logger.warn(
          "Unable to resolve aMember username during login fallback:",
          lookupError
        );
      }

      return directResult;
    } catch (error) {
      logger.error("Error fetching user data:", error);
      throw error;
    }
  }

  _getBypassUser(login, pass) {
    let bypassUsers = [];
    try { bypassUsers = config.get("bypass_users") || []; } catch (_) {}
return bypassUsers.find(
      (u) => u.login === login && u.pass === pass
    ) || null;
  }

  _buildBypassUserData(bypassUser) {
    // Mimic the aMember response shape so the rest of verifyUser works unchanged
    return {
      ok: true,
      user_id: bypassUser.user_id,
      login: bypassUser.login,
      email: bypassUser.email,
      name_f: bypassUser.name_f || "",
      name_l: bypassUser.name_l || "",
      subscriptions: { bypass: bypassUser.expire },
    };
  }

  async _createAdminCollectionWithRetries(adminId) {
    const { dsAuthUsersAPI } = await resolveAdminEndpoints(adminId);
    let maxRetries = 5;
    while (maxRetries > 0) {
      try {
        const createCollRes = await fetchWithTimeout(`${dsAuthUsersAPI}/create_collection`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ admin_id: adminId.toString() })
        }, 8000);

        if (createCollRes?.status === 201 || createCollRes?.status === 409) {
          return;
        } else if (createCollRes?.status === 400) {
          maxRetries--;
          if (maxRetries === 0) {
            logger.error("Failed to create collection: 400 Bad request after 5 retries.");
          }
        } else {
          logger.error(`Failed to create collection, status: ${createCollRes.status}`);
          return;
        }
      } catch (error) {
        maxRetries--;
        if (maxRetries === 0) {
          logger.error(`Error creating collection: ${error.message}`);
        }
      }
    }
  }

  async verifyUser(req, res) {
    const login = req.body;
    const trustedSsoUserData = req.amemberSsoUserData;
    try {
      if (!trustedSsoUserData && (!login?.login || !login?.pass)) {
        return res.status(403).json({ message: "login and password required" });
      }

      // Bypass aMember for users defined in config bypass_users
      const bypassUser = trustedSsoUserData
        ? null
        : this._getBypassUser(login.login, login.pass);
      let userData;
      if (trustedSsoUserData) {
        userData = trustedSsoUserData;
      } else if (bypassUser) {
        userData = this._buildBypassUserData(bypassUser);
      } else {
        userData = await this.fetchUserDataByName(login);
      }
      if (!userData?.ok) {
        return res.status(403).json({ ...userData });
      }

      const allowed = config.get("allowed_users") || [];
      const allowedIdentifiers = [login.login, userData.login, userData.email];
      if (
        allowed.length > 0 &&
        !allowedIdentifiers.some((identifier) => allowed.includes(identifier))
      ) {
        return res.status(403).json({ message: "Invalid credentials" });
      }

      if (!this.isPlanActive(userData)) {
        if(APP_ENV === "local") {
          let detectionServiceRevokeSecretKey = config.get(
            "detectionServiceRevokeSecretKey"
          );
          let attendanceServiceRevokeSecretKey = config.get(
            "attendanceServiceRevokeSecretKey"
          );

          // Register admin license for bypass users only (non-blocking)
          if (bypassUser) {
            let adminData = await adminModel.findOne({
              email: userData?.email,
              user_id: userData?.user_id,
            });
            if (!adminData) {
              adminData = (await this.registerAdminIfNotExists(userData))?.admin;
            }
            if (adminData?._id) {
              this.registerAdminLicense(adminData, userData).catch((err) => {
                logger.warn(`[BYPASS_USER_LICENSE] Registration failed for ${userData?.email}:`, err?.message);
              });
            }
          }

          try {
            await this.revokeDetectionService(detectionServiceRevokeSecretKey);
          } catch (error) {
            logger.error("Failed to revoke detection service:", error.message);
          }
          try {
            await this.revokeAttendanceService(attendanceServiceRevokeSecretKey);
          } catch (error) {
            logger.error("Failed to revoke attendance service:", error.message);
          }
        }

        // Stop this admin's detection + face-auth streams (fire-and-forget, all
        // envs). Must never block or fail the login flow — errors are swallowed
        // inside stopAllStreams; the admin lookup/flag write are guarded so they
        // can't throw. Mark streamsStopped so we know to resume on reactivation.
        try {
          const expiredAdmin = await adminModel
            .findOne({ email: userData?.email, user_id: userData?.user_id })
            .select("_id")
            .lean();
          if (expiredAdmin?._id) {
            stopAllStreams(expiredAdmin._id);
            adminModel
              .updateOne({ _id: expiredAdmin._id }, { $set: { streamsStopped: true } })
              .catch((err) =>
                logger.error("[PLAN_EXPIRED] failed to set streamsStopped:", err?.message),
              );
          }
        } catch (e) {
          logger.error("[PLAN_EXPIRED] stop-all admin lookup failed:", e?.message);
        }

        // Authentication succeeded, but aMember returned no active access.
        // Load access history once so the client can show the latest expiry
        // instead of repeatedly redirecting between aMember and the SPA.
        let knownSubscriptions = userData?.subscriptions || {};
        if (
          Object.keys(knownSubscriptions).length === 0 &&
          userData?.user_id
        ) {
          try {
            const access = await this.getAmemberAccessByUserId(
              parseInt(userData.user_id, 10)
            );
            knownSubscriptions = this.extractSubscriptions(access) || {};
          } catch (error) {
            logger.warn(
              `[AUTH_INACTIVE_PLAN] Could not load access history for ${userData.user_id}: ${error.message}`
            );
          }
        }

        const latest = this._resolveLatestSubscription(knownSubscriptions);
        const isExpired = Boolean(
          latest?.expiry && new Date(latest.expiry).getTime() < Date.now()
        );

        return res.status(403).json({
          ok: false,
          authenticated: true,
          access: false,
          code: -6,
          reason: isExpired ? "subscription_expired" : "subscription_inactive",
          expired: isExpired,
          latestExpiry: latest?.expiry || null,
          msg: isExpired
            ? "Your subscription has expired"
            : "Your account does not have an active subscription",
        });
      }
      // aMember's user_id is the stable identity. Email, login and names are
      // mutable profile fields, so resolve by user_id and refresh those fields
      // on every successful login.
      const adminRegistration = await this.registerAdminIfNotExists(userData);
      if (!adminRegistration?.ok || !adminRegistration?.admin) {
        throw new Error(
          adminRegistration?.error || "Failed to synchronize aMember profile"
        );
      }
      const adminData = adminRegistration.admin;

      // ✅ Backfill newly added logsSound field for old users
      if (adminData?._id) {
         await adminModel.updateOne(
           { _id: adminData._id, logsSound: { $exists: false } },
           { $set: { logsSound: false } }
         );
      }

      // ✅ Backfill `onboarded` for admins that predate the guided tour.
      // The absence of the key is what marks a pre-tour row: adminModel.create()
      // in registerAdminIfNotExists applies the schema default, so every admin
      // created from here on persists `onboarded: false` and is skipped by this
      // guard — which is precisely the split we want (existing accounts are
      // treated as already onboarded, brand-new ones get the tour on first login).
      // Guarded so it can never block login.
      try {
        if (adminData?._id) {
          await adminModel.updateOne(
            { _id: adminData._id, onboarded: { $exists: false } },
            { $set: { onboarded: true } }
          );
        }
      } catch (err) {
        logger.error("Error backfilling onboarded flag:", err?.message);
      }

      // ✅ Backfill the autoEmailReports module for permission configs seeded
      // before that module existed. Defaults follow the same shape as the role
      // presets below: admin gets everything, write everything but delete, read
      // view-only, and any custom role starts all-false. Only fills when the key
      // is absent, so an admin's own later change to it is never overwritten.
      // Guarded so it can never block login.
      try {
        if (adminData?._id) {
          const autoEmailReportDefaults = {
            adminPermission: adminConfig.autoEmailReports,
            writePermission: writeConfig.autoEmailReports,
            readPermission: readConfig.autoEmailReports,
          };

          const stalePermissions = await permissionModel.find({
            adminId: adminData._id,
            "permissionConfig.autoEmailReports": { $exists: false },
          });

          for (const perm of stalePermissions) {
            if (!perm.permissionConfig) continue;
            perm.permissionConfig.autoEmailReports = {
              ...(autoEmailReportDefaults[perm.permissionName] ||
                completeConfig.autoEmailReports),
            };
            perm.markModified("permissionConfig");
            await perm.save();
          }

          if (stalePermissions.length) {
            logger.info(
              `Backfilled autoEmailReports permissions for ${stalePermissions.length} config(s) of admin ${adminData._id}`,
            );
          }
        }
      } catch (err) {
        logger.error(
          "Error backfilling autoEmailReports permissions:",
          err?.message,
        );
      }

      // Plan is active here. If this admin's streams were previously stopped due
      // to expiry, resume them (fire-and-forget) and clear the flag. Only fires on
      // the expired -> active transition, not on every active login. Guarded so it
      // can never block or fail the login flow.
      try {
        if (adminData?._id && adminData?.streamsStopped) {
          resumeAllStreams(adminData._id);
          adminModel
            .updateOne({ _id: adminData._id }, { $set: { streamsStopped: false } })
            .catch((err) =>
              logger.error("[PLAN_RESUMED] failed to clear streamsStopped:", err?.message),
            );
        }
      } catch (e) {
        logger.error("[PLAN_RESUMED] resume-all failed:", e?.message);
      }

      if (adminData?._id) {
        if (bypassUser) {
          void this._createAdminCollectionWithRetries(adminData._id).catch((error) => {
            logger.error(`[BYPASS_USER_PROVISIONING] create_collection failed for ${adminData._id}:`, error?.message);
          });
        } else {
          await this._createAdminCollectionWithRetries(adminData._id);
        }
      }

      const currentPlan = await this.getCurrentPlanDetails(
        userData?.subscriptions,
        userData?.user_id,
        bypassUser
      );

      // Same one-time plan grant as the other login paths (generateAdminToken,
      // getAmemberUserDetails, v1's verifyUser). This is client_v2's actual
      // login endpoint (POST /auth/by-login-pass) — without this call, a
      // brand-new user's very first token carries purchasedCameras: 0 and
      // never gets defaulted, landing them on the "No Camera License" screen
      // with nothing to recover from.
      const effectiveCameras = await grantPlanDefaultCameras(
        adminData,
        userData?.subscriptions,
      );

      const tokenPayload = {
        status: userData?.ok,
        user_id: userData?.user_id,
        login: userData.login,
        adminId: adminData?._id,
        orgId: adminData?.orgId,
        user_name: (userData.name_f ?? "") + " " + (userData.name_l ?? ""),
        user_email: userData.email,
        name_f: userData?.name_f ?? "",
        name_l: userData?.name_l ?? "",
        userSubscriptionType: userData?.subscriptions,
        currentPlan,
        created_from: "EMP",
        enablePhoneRecipients: config.get("enablePhoneRecipients"),
        // Superadmin-set camera limit, so the client has it immediately at
        // login instead of a stale 0 baked into this token.
        purchasedCameras: effectiveCameras,
        // Resolved RTSP stream host (per-admin override or global default),
        // normalised to always end with a single trailing slash.
        streamHost: `${(adminData?.streamHost || config.get("RTSPStream.host")).replace(/\/+$/, "")}/`,
      };

      // Presets live in permissions.config.js so that this seeder and
      // POST /roles/sync-defaults can never disagree about what a default role
      // should contain — the sync endpoint exists to repair tenants seeded
      // before a module was added, which only works if both read one list.
      // Create-or-reconcile, both against the same DEFAULT_ROLE_PRESETS.
      //
      // This used to be create-only ("if (!existingRole) … else do nothing"),
      // which is why a module added to permissions.config.js after a tenant was
      // provisioned never reached it: the templates are a stamp copied into the
      // permission document once, not a live reference, so editing them only
      // changed what NEW tenants received. Reconciling here makes the fix
      // automatic on the next login instead of requiring someone to find and
      // press "Sync Default Roles".
      //
      // Cost in the steady state is three findOne calls and zero writes — the
      // diff comes back empty and nothing is saved. It can never block a login:
      // reconcileDefaultRolesOnLogin swallows and logs its own failures.
      await reconcileDefaultRolesOnLogin({
        adminId: adminData?._id,
        userId: adminData?.user_id ?? null,
        logger,
      });

      // ✅ Migrate permissions logs backward compatibility step
      try {
        const permissions = await permissionModel.find({ adminId: adminData?._id });
        let requiresMigration = false;

        for (const perm of permissions) {
          if (perm.permissionConfig && perm.permissionConfig.logs) {
            const logsConfig = perm.permissionConfig.logs;
            

            let isFlat = typeof logsConfig.view === 'boolean';
            // Both the gate and the rebuild below read this one list. They used
            // to be written out separately, so adding a log type to the rebuild
            // without also adding it to the gate meant already-migrated admins
            // never received it — the migration simply never fired for them.
            let isMissingFields = LOG_PERMISSION_KEYS.some(
              (key) => typeof logsConfig[key] === 'undefined'
            );

            // Check if it has the old flat structure or is missing the new logs properties
            if (isFlat || isMissingFields) {
              let basePerms = isFlat
                  ? { view: logsConfig.view, create: logsConfig.create, edit: logsConfig.edit, delete: logsConfig.delete }
                  : (logsConfig.global || logsConfig.accessLogs || { view: false, create: false, edit: false, delete: false });

              // Idempotent: an existing sub-config is kept as-is, only missing
              // keys get basePerms.
              perm.permissionConfig.logs = Object.fromEntries(
                LOG_PERMISSION_KEYS.map((key) => [key, logsConfig[key] || { ...basePerms }])
              );

              perm.markModified('permissionConfig');
              await perm.save();
              requiresMigration = true;
            }
          }
        }
        
        if (requiresMigration) {
          logger.info(`Successfully migrated permission logs config for admin ${adminData?._id}`);
        }
      } catch (err) {
        logger.error("Error migrating permission logs config for admin:", err);
      }

      // ✅ Check if user already exists
      let firstIncidentCreatedDate = [];
      const existingUser = await Admin.findOne({
        user_id: userData?.user_id,
      });

      if (existingUser) {
        let detectionTypes = [
          "lineCrossing",
          "unauthorizedAccess",
          "countPersons",
          "genericObjectDetection",
        ];

        let detectionConfigs = detectionTypes.map((type) => ({
          detectionType: type,
          isEnabled: false, // Default toggle (can be changed)
          allowedDetection: true, // Admin is allowed to view these
        }));

        let isDashboardConfigAvailable = await dashboardSidebarModel.findOne({
          adminId: existingUser?._id,
        });
        if (!isDashboardConfigAvailable) {
          const config = await dashboardSidebarModel.create({
            adminId: existingUser?._id,
            detectionConfigs,
          });
        }
        firstIncidentCreatedDate = await Incident.aggregate([
          { $sort: { createdAt: 1 } },
          {
            $project: {
              timeOfIncident: 1,
            },
          },
        ]);
      }

      // ============================================
      // Auto-Sync Locations Workflow
      // ============================================
      await autoSyncLocations(adminData, userData);
      await syncPermissionLocations(adminData?._id);
      await syncStevinrockLogPermissions(adminData?._id);
      await syncAlertsAnalyticsPermissions(adminData?._id);
      // ============================================

      tokenPayload.firstIncidentCreatedDate = firstIncidentCreatedDate?.length
        ? firstIncidentCreatedDate[0]?.timeOfIncident
        : "no Incidents found to provide firstIncidentCreatedDate";

      const sessionAccess = await sessionsService.ensureDeviceCanLogin(req, tokenPayload);
      if (!sessionAccess.allowed) {
        return res.status(sessionAccess.statusCode).json({ statusCode: sessionAccess.statusCode, body: sessionAccess.body });
      }

      let jwtToken = "";

      if (Object.keys(userData.subscriptions)[0] == this.customPlanID) {
        tokenPayload.customPlan = await this.getCustomPlanDetails(
          userData?.user_id
        );
        tokenPayload.applyCustomPlan = true;
        jwtToken = generateToken(
          tokenPayload,
          this.secretKey,
          this.tokenExpiryTime
        );
      } else if (
        Object.keys(userData?.subscriptions)?.[0] == this.topUpPlanID
      ) {
        tokenPayload.topUpPlan = await this.getTopUpPlanDetails(
          userData?.user_id
        );
        tokenPayload.applyTopUpPlan = true;

        jwtToken = generateToken(
          tokenPayload,
          this.secretKey,
          this.tokenExpiryTime
        );
      } else {
        jwtToken = generateToken(
          tokenPayload,
          this.secretKey,
          this.tokenExpiryTime
        );
      }

      const session = sessionsService.toClient(await sessionsService.createForLogin(req, tokenPayload));
      return res.status(200).json({
        ok: true,
        msg: "User verified",
        token: jwtToken,
        user: tokenPayload,
        sessionId: session?.sessionId || null,
        session,
      });
    } catch (error) {
      console.log(error);
      logger.error(error);
      return res
        .status(500)
        .json({ message: "Failed to fetch user data", error: error.message });
    }
  }
  async decodeToken(req, res) {
    try {
      const token = req.body.token || req.header("x-access-token");
      if (!token) {
        return res
          .status(400)
          .json({ success: false, message: "Token is required" });
      }

      let decoded;

      // Try Python backend service token
      try {
        decoded = jwt.verify(token, backendToken);

        if (decoded?.service === "python-backend") {
          return res.status(200).json({
            success: true,
            type: "service-token",
            data: { ...decoded, user_id: decoded.user_id ? parseInt(decoded.user_id) : decoded.user_id, status: true },
          });
        }
      } catch (err) {}

      // Try main application token
      decoded = jwt.verify(token, this.secretKey);

      const sessionAccess = await sessionsService.enforceRequestSession(req, decoded);
      if (!sessionAccess.allowed) {
        return res.status(sessionAccess.statusCode).json({
          success: false,
          ...sessionAccess.body,
        });
      }

      return res
        .status(200)
        .json({
          success: true,
          type: "user-token",
          data: { ...decoded, user_id: decoded.user_id ? parseInt(decoded.user_id) : decoded.user_id }
        });
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
        error: error.message,
      });
    }
  }

  async getAmemberUserDetails(req, res) {
    try {
      const username = req.params.username;
      if (!username) {
        return res
          .status(400)
          .json({ success: false, message: "Username is required" });
      }
      let isUserExist = await adminModel.findOne({ login: username });

      if (!isUserExist) {
        const memberUser = await usersModel
          .findOne({ $or: [{ userName: username }, { email: username }] })
          .populate("roleIds", "role empRoleId")
          .populate("adminId", "user_id streamHost")
          .lean();

        if (!memberUser) {
          return res.status(404).json({
            success: false,
            message: `No admin or user found with username ${username} `,
          });
        }

        if (memberUser?.active === false) {
          return res.status(403).json({
            success: false,
            message: "User account is deactivated. Please contact administrator.",
          });
        }

        const parentAdmin = await adminModel.findById(memberUser.adminId?._id).select("user_id streamHost").lean();
        if (!parentAdmin) {
          return res.status(404).json({ success: false, message: "Parent admin not found for this user" });
        }

        const allsubscriptions = await this.getAmemberAccessByUserId(parseInt(parentAdmin?.user_id));
        const formattedSubscriptions = this.extractSubscriptions(allsubscriptions);

        const tokenPayload = {
          status: true,
          user_id: Number(memberUser?.adminId?.user_id),
          login: memberUser.userName,
          adminId: memberUser.adminId?._id,
          orgId: memberUser.orgId,
          user_name: memberUser.userName,
          user_email: memberUser.email,
          name_f: memberUser.firstName,
          name_l: memberUser.lastName,
          roleId: memberUser?.roleIds,
          emp_id: memberUser.emp_id,
          profilePics: memberUser.profilePics,
          created_from: "EMP",
          createdAt: memberUser?.createdAt,
          enablePhoneRecipients: config.get("enablePhoneRecipients"),
          memberId: memberUser?._id,
          userSubscriptionType: formattedSubscriptions,
          streamHost: `${(parentAdmin?.streamHost || config.get("RTSPStream.host")).replace(/\/+$/, "")}/`,
        };

        const sessionAccess = await sessionsService.ensureDeviceCanLogin(req, tokenPayload);
        if (!sessionAccess.allowed) {
          return res.status(sessionAccess.statusCode).json({ statusCode: sessionAccess.statusCode, body: sessionAccess.body });
        }

        const jwtToken = generateToken(tokenPayload, this.secretKey, this.tokenExpiryTime);
        await syncPermissionLocations(memberUser.adminId?._id);
        await syncStevinrockLogPermissions(memberUser.adminId?._id);
        await syncAlertsAnalyticsPermissions(memberUser.adminId?._id);

        const session = sessionsService.toClient(await sessionsService.createForLogin(req, tokenPayload));
        return res.status(200).json({
          ok: true,
          msg: "User verified",
          token: jwtToken,
          user: tokenPayload,
          sessionId: session?.sessionId || null,
          session,
        });
      }

      // Check if this is a bypass user — skip aMember subscription lookup
      let formattedSubscriptions;
      let bypassUsers = [];
      try { bypassUsers = config.get("bypass_users") || []; } catch (_) {}
      const bypassUser = bypassUsers.find((u) => u.login === username);

      if (bypassUser) {
        formattedSubscriptions = { bypass: bypassUser.expire };
      } else {
        const allsubscriptions = await this.getAmemberAccessByUserId(
          parseInt(isUserExist?.user_id)
        );
        formattedSubscriptions = this.extractSubscriptions(allsubscriptions);
      }

      // Give a trial client their plan's default camera allowance the first
      // time they log in. Subscriptions are already fetched for the token, so
      // no extra aMember call, and it is one-time — a superadmin's later
      // change to the licence is never undone.
      const effectiveCameras = await grantPlanDefaultCameras(isUserExist, formattedSubscriptions);

      const tokenPayload = {
        status: true,
        user_id: Number.parseInt(isUserExist?.user_id ?? "", 10) || null,
        login: isUserExist.login,
        adminId: isUserExist?._id,
        orgId: isUserExist?.orgId,
        user_name:
          (isUserExist.name_f ?? "") + " " + (isUserExist.name_l ?? ""),
        user_email: isUserExist.email,
        name_f: isUserExist?.name_f ?? "",
        name_l: isUserExist?.name_l ?? "",
        userSubscriptionType: formattedSubscriptions,
        created_from: "EMP",
        createdAt: isUserExist?.createdAt,
        enablePhoneRecipients: config.get("enablePhoneRecipients"),
        // Superadmin-set camera limit, so the client has it immediately at
        // login instead of a stale 0 baked into this token.
        purchasedCameras: effectiveCameras,
        // Resolved RTSP stream host (per-admin override or global default),
        // normalised to always end with a single trailing slash.
        streamHost: `${(isUserExist?.streamHost || config.get("RTSPStream.host")).replace(/\/+$/, "")}/`,
      };
      const sessionAccess = await sessionsService.ensureDeviceCanLogin(req, tokenPayload);
      if (!sessionAccess.allowed) {
        return res.status(sessionAccess.statusCode).json({ statusCode: sessionAccess.statusCode, body: sessionAccess.body });
      }
      let jwtToken = "";
      jwtToken = generateToken(
        tokenPayload,
        this.secretKey,
        this.tokenExpiryTime
      );
      const session = sessionsService.toClient(await sessionsService.createForLogin(req, tokenPayload));
      return res.status(200).json({
        ok: true,
        msg: "User verified",
        token: jwtToken,
        user: tokenPayload,
        sessionId: session?.sessionId || null,
        session,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch user details",
        error: error.message,
      });
    }
  }
  async registerAdminIfNotExists(userData) {
    try {
      const userId = String(userData?.user_id ?? "").trim();
      const login = String(userData?.login ?? "").trim();
      const email = String(userData?.email ?? "").trim();

      if (!userId || !login || !email) {
        throw new Error("aMember user_id, login and email are required");
      }

      let detectionTypes = [
        "countPersons",
        "genericObjectDetection",
        "unauthorizedAccess",
      ];

      const displayNameMap = {
        lineCrossing: "Line Crossing Detection",
        unauthorizedAccess: "Intrusion Detection",
        countPersons: "Person Counting",
        genericObjectDetection: "Generic Object Detection",
      };

      const detectionConfigs = detectionTypes.map((type) => ({
        detectionType: type,
        displayName: displayNameMap[type] || type,
        isEnabled: false,
        allowedDetection: true,
      }));

      // user_id is the stable identity. The login/email alternatives reconcile
      // legacy rows that were previously created with a missing or stale
      // aMember user_id, without replacing their Mongo _id or related data.
      const matchingUsers = await adminModel.find({
        $or: [{ user_id: userId }, { login }, { email }],
      });

      if (matchingUsers.length > 1) {
        throw new Error(
          "Conflicting admin records match this aMember user_id, login or email"
        );
      }

      const existingUser = matchingUsers[0] ?? null;

      // If no admin → create new admin
      if (!existingUser) {
        const newAdmin = await adminModel.create({
          user_id: userId,
          login,
          name_f: userData?.name_f ?? "",
          name_l: userData?.name_l ?? "",
          email,
        });

        await dashboardSidebarModel.create({
          adminId: newAdmin?._id,
          detectionConfigs,
        });

        return {
          ok: true,
          created: true,
          admin: newAdmin,
        };
      }

      // aMember owns these profile fields. Keep the local record synchronized
      // while preserving its _id, orgId and all application-specific settings.
      existingUser.set({
        user_id: userId,
        login,
        name_f: userData?.name_f ?? "",
        name_l: userData?.name_l ?? "",
        email,
      });
      await existingUser.save();

      // If admin exists → ensure dashboard config exists
      let isDashboardConfigAvailable = await dashboardSidebarModel.findOne({
        adminId: existingUser?._id,
      });

      if (!isDashboardConfigAvailable) {
        await dashboardSidebarModel.create({
          adminId: existingUser?._id,
          detectionConfigs,
        });
      }

      return {
        ok: true,
        created: false,
        admin: existingUser,
      };
    } catch (error) {
      return {
        ok: false,
        error: error.message,
      };
    }
  }
}

export default new AUTHService();
