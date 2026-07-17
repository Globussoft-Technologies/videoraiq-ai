import { generateToken } from "../../../middlewares/decodeToken.js";
import { encrypt } from "../../../utils/cryptoUtils.js";
import logger from "../../../utils/logger.js";
import { resolveAdminEndpoints } from "../../../utils/adminEndpoints.js";
import { stopAllStreams, resumeAllStreams } from "../../../utils/stopStreams.js";
import config from "config";
import jwt from "jsonwebtoken";
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
import permissionModel from "../permission/permissions.model.js";
import locationModel from "../locations/location.model.js";
import authorizedUsersModel from "../authorizedUsers/authorizedUsers.model.js";
import NVRModel from "../NVR/nvr.model.js";
import { autoSyncLocations, syncPermissionLocations, syncStevinrockLogPermissions } from "../../../utils/helperFunctions.js";
const backendToken = config.get("Backend.token");
const detectionHost = config.get("PythonService.detectionUrl");
const APP_ENV = config.get("APP_ENV");
class AUTHService {
  constructor() {
    // Initialize configuration values
    this.baseUrl = config.get("aMember.baseUrl");
    this.apiKey = config.get("aMember.apiKey");
    this.secretKey = config.get("jwt.secretKey");
    this.tokenExpiryTime = config.get("jwt.tokenExpiryTime");
    this.customPlanID = config.get("aMember.customPlanID");
    this.topUpPlanID = config.get("aMember.topUpPlanID");
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
    const params = new URLSearchParams({
      _key: this.apiKey,
      login: loginPass.login,
      pass: loginPass.pass,
    });
    try {
      const response = await fetch(`${url}?${params}`);
      const data = await response.json();
      return data;
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

  async verifyUser(req, res) {
    const login = req.body;
    try {
      if (!login?.login || !login?.pass) {
        return res.status(403).json({ message: "login and password required" });
      }

      const allowed = config.get("allowed_users") || [];
      if (allowed.length > 0 && !allowed.includes(login.login)) {
        return res.status(403).json({ message: "Invalid credentials" });
      }

      // Bypass aMember for users defined in config bypass_users
      const bypassUser = this._getBypassUser(login.login, login.pass);
      let userData;
      if (bypassUser) {
        userData = this._buildBypassUserData(bypassUser);
      } else {
        userData = await this.fetchUserDataByName(login);
      }
      if (!userData?.ok) {
        return res.status(403).json({ ...userData });
      } else if (!this.isPlanActive(userData)) {
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

        return res.status(403).json({
          ok: true,
          code: -6,
          expired: true,
          msg: "Your Plan expired",
        });
      }
      // Fetch or create adminData (for non-bypass users or if not already created)
      let adminData = await adminModel.findOne({
        email: userData?.email,
        user_id: userData?.user_id,
      });
      if (!adminData) {
        adminData = (await this.registerAdminIfNotExists(userData))?.admin;
      }

      // ✅ Backfill newly added logsSound field for old users
      if (adminData?._id) {
         await adminModel.updateOne(
           { _id: adminData._id, logsSound: { $exists: false } },
           { $set: { logsSound: false } }
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
        const { dsAuthUsersAPI } = await resolveAdminEndpoints(adminData._id);
        let maxRetries = 5;
        while (maxRetries > 0) {
          try {
            const createCollRes = await fetch(`${dsAuthUsersAPI}/create_collection`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ admin_id: adminData._id.toString() })
            });

            if (createCollRes?.status === 201 || createCollRes?.status === 409) {
              break;
            } else if (createCollRes?.status === 400) {
              maxRetries--;
              if (maxRetries === 0) {
                logger.error("Failed to create collection: 400 Bad request after 5 retries.");
              }
            } else {
              logger.error(`Failed to create collection, status: ${createCollRes.status}`);
              break;
            }
          } catch (error) {
            maxRetries--;
            if (maxRetries === 0) {
              logger.error(`Error creating collection: ${error.message}`);
            }
          }
        }
      }

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
        created_from: "EMP",
        enablePhoneRecipients: config.get("enablePhoneRecipients"),
        // Resolved RTSP stream host (per-admin override or global default),
        // normalised to always end with a single trailing slash.
        streamHost: `${(adminData?.streamHost || config.get("RTSPStream.host")).replace(/\/+$/, "")}/`,
      };

      // Preset configs for each role
      const rolePresets = [
        {
          roleName: "admin",
          config: adminConfig,
          view: true,
          create: true,
          edit: true,
          delete: true,
          isEmpRole: false,
        },
        {
          roleName: "read",
          config: readConfig,
          view: true,
          create: false,
          edit: false,
          delete: false,
          isEmpRole: false,
        },
        {
          roleName: "write",
          config: writeConfig,
          view: false,
          create: true,
          edit: true,
          delete: false,
          isEmpRole: false,
        },
      ];

      for (const preset of rolePresets) {
        // check if role already exists for this admin
        let existingRole = await rolesModel.findOne({
          adminId: adminData?._id,
          roleName: preset.roleName,
        });

        if (!existingRole) {
          // create permission
          let permission = await permissionModel.create({
            adminId: adminData?._id,
            permissionConfig: preset.config,
            permissionName: `${preset.roleName}Permission`,
            is_default: true,
          });

          // create role
          await rolesModel.create({
            adminId: adminData?._id,
            roleName: preset.roleName,
            isEmpRole: preset.isEmpRole,
            view: preset.view,
            create: preset.create,
            edit: preset.edit,
            delete: preset.delete,
            is_default: true,
            permissionId: permission?._id,
          });

          console.log(`✅ Created role: ${preset.roleName}`);
        } else {
          // console.log(`ℹ️ Role already exists: ${preset.roleName}`);
        }
      }

      // ✅ Migrate permissions logs backward compatibility step
      try {
        const permissions = await permissionModel.find({ adminId: adminData?._id });
        let requiresMigration = false;

        for (const perm of permissions) {
          if (perm.permissionConfig && perm.permissionConfig.logs) {
            const logsConfig = perm.permissionConfig.logs;
            console.log(logsConfig,'logsConfig');
            

            let isFlat = typeof logsConfig.view === 'boolean';
            let isMissingFields = typeof logsConfig.trackLogs === 'undefined' || typeof logsConfig.deskLogs === 'undefined' || typeof logsConfig.guardLogs === 'undefined' || typeof logsConfig.global === 'undefined' || typeof logsConfig.ANPRLogs === 'undefined';

            // Check if it has the old flat structure or is missing the new logs properties
            if (isFlat || isMissingFields) {
              let basePerms = isFlat 
                  ? { view: logsConfig.view, create: logsConfig.create, edit: logsConfig.edit, delete: logsConfig.delete }
                  : (logsConfig.global || logsConfig.accessLogs || { view: false, create: false, edit: false, delete: false });

              perm.permissionConfig.logs = {
                global: logsConfig.global || { ...basePerms },
                accessLogs: logsConfig.accessLogs || { ...basePerms },
                attendanceLogs: logsConfig.attendanceLogs || { ...basePerms },
                trackLogs: logsConfig.trackLogs || { ...basePerms },
                deskLogs: logsConfig.deskLogs || { ...basePerms },
                guardLogs: logsConfig.guardLogs || { ...basePerms },
                ANPRLogs: logsConfig.ANPRLogs || { ...basePerms },
              };

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
        email: userData?.email,
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
      // ============================================

      tokenPayload.firstIncidentCreatedDate = firstIncidentCreatedDate?.length
        ? firstIncidentCreatedDate[0]?.timeOfIncident
        : "no Incidents found to provide firstIncidentCreatedDate";

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
        return res.status(200).json({
          ok: true,
          msg: "User verified",
          token: jwtToken,
          user: tokenPayload,
        });
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
        return res.status(200).json({
          ok: true,
          msg: "User verified",
          token: jwtToken,
          user: tokenPayload,
        });
      } else {
        jwtToken = generateToken(
          tokenPayload,
          this.secretKey,
          this.tokenExpiryTime
        );
        return res.status(200).json({
          ok: true,
          msg: "User verified",
          token: jwtToken,
          user: tokenPayload,
        });
      }
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
        return res.status(404).json({
          success: false,
          message: `No Admin found with username ${username} `,
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
        // Resolved RTSP stream host (per-admin override or global default),
        // normalised to always end with a single trailing slash.
        streamHost: `${(isUserExist?.streamHost || config.get("RTSPStream.host")).replace(/\/+$/, "")}/`,
      };
      let jwtToken = "";
      jwtToken = generateToken(
        tokenPayload,
        this.secretKey,
        this.tokenExpiryTime
      );
      return res.status(200).json({
        ok: true,
        msg: "User verified",
        token: jwtToken,
        user: tokenPayload,
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

      // Check if admin already exists
      let existingUser = await adminModel.findOne({
        user_id: userData?.user_id,
      });

      // If no admin → create new admin
      if (!existingUser) {
        const newAdmin = await adminModel.create({
          user_id: userData?.user_id,
          login: userData?.login,
          name_f: userData?.name_f ?? "",
          name_l: userData?.name_l ?? "",
          email: userData?.email,
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
