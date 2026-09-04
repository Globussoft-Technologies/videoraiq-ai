import { randomUUID } from "crypto";
import mongoose from "mongoose";
import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import sessionModel from "./sessions.model.js";
import blockedDeviceModel from "./blockedDevice.model.js";
import { getOnlineSessionIds } from "./sessionPresence.js";
import usersModel from "../users/users.model.js";
import adminModel from "../admin/admin.model.js";

function requestIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  return req.ip || req.socket?.remoteAddress || "";
}

function parseBrowser(userAgent = "") {
  const ua = String(userAgent);
  // iOS wraps every browser in WebKit/Safari, so brand-specific tokens (CriOS, FxiOS,
  // EdgiOS, OPiOS) must be checked before the generic Chrome/Firefox/Edg checks below,
  // which don't match on iOS — and before the Safari fallback, which would otherwise
  // misidentify them since they all carry a "Safari/" token too.
  if (/EdgiOS\//.test(ua)) return "Microsoft Edge";
  if (/OPiOS\//.test(ua)) return "Opera";
  if (/CriOS\//.test(ua)) return "Chrome";
  if (/FxiOS\//.test(ua)) return "Firefox";
  if (/Edg\//.test(ua)) return "Microsoft Edge";
  if (/OPR\//.test(ua) || /Opera\//.test(ua)) return "Opera";
  if (/Chrome\//.test(ua) && !/Chromium\//.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return "Safari";
  return "";
}

function parseOperatingSystem(userAgent = "") {
  const ua = String(userAgent);
  if (/Windows NT 10/.test(ua)) return "Windows 10/11";
  if (/Android/.test(ua)) return "Android";
  if (/(iPhone|iPad|iPod)/.test(ua)) return "iOS";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "";
}

function userScopeFromPayload(userData = {}) {
  return {
    adminId: userData.adminId || null,
    memberId: userData.memberId || null,
    orgId: userData.orgId ? String(userData.orgId) : "",
    userType: userData.memberId ? "user" : "admin",
  };
}

function sessionDeviceDetails(req, body = {}) {
  const userAgent = body.userAgent || req.headers["user-agent"] || "";
  const browser = body.browser || req.headers["x-browser"] || parseBrowser(userAgent);
  const operatingSystem = body.operatingSystem || body.os || req.headers["x-operating-system"] || parseOperatingSystem(userAgent);
  const deviceName = body.deviceName || req.headers["x-device-name"] || [browser, operatingSystem].filter(Boolean).join(" on ");
  return { userAgent, browser, operatingSystem, deviceName };
}

function sessionMetadata(req, userData = {}) {
  const sessionId = randomUUID();
  const body = req.body || {};
  const deviceId = String(body.deviceId || req.headers["x-device-id"] || sessionId).trim();
  const now = new Date();
  const device = sessionDeviceDetails(req, body);

  return {
    ...userScopeFromPayload(userData),
    sessionId,
    deviceId,
    deviceName: device.deviceName,
    operatingSystem: device.operatingSystem,
    browser: device.browser,
    ipAddress: body.ipAddress || requestIp(req),
    userAgent: device.userAgent,
    loginTime: now,
    lastActiveAt: now,
    status: "active",
    events: [{ type: "login", at: now }],
  };
}

function currentUserFilter(userData = {}) {
  const scope = userScopeFromPayload(userData);
  return {
    adminId: scope.adminId,
    memberId: scope.memberId || null,
    userType: scope.userType,
  };
}

function pagination(req) {
  const skip = Math.max(0, Number(req.query?.skip ?? req.body?.skip) || 0);
  const limit = Math.min(100, Math.max(1, Number(req.query?.limit ?? req.body?.limit) || 20));
  return { skip, limit };
}

function statusFilter(req) {
  const status = req.query?.status ?? req.body?.status;
  return status ? { status } : {};
}

function sessionQueryFilters(req) {
  const filter = {};
  const userType = String(req.query?.userType || "").trim();
  const deviceId = String(req.query?.deviceId || "").trim();

  if (["admin", "user"].includes(userType)) {
    filter.userType = userType;
    if (userType === "admin") filter.memberId = null;
    if (userType === "user") filter.memberId = { $ne: null };
  }

  if (deviceId) filter.deviceId = deviceId;

  return filter;
}

function responseEnvelope(statusCode, body) {
  return { statusCode, body };
}

// Adds `online: true/false` to each session row from live Redis presence
// (written by socket.js when a client tab connects/disconnects). Only "active"
// sessions can be online — a logged_out / blocked / expired row is always
// offline regardless of any stale presence key.
async function withOnlineFlag(sessions = []) {
  const activeIds = sessions
    .filter((session) => session.status === "active")
    .map((session) => session.sessionId);
  const onlineIds = await getOnlineSessionIds(activeIds);
  return sessions.map((session) => ({
    ...session,
    online: session.status === "active" && onlineIds.has(session.sessionId),
  }));
}

class SessionsService {
  requestDeviceId(req) {
    const body = req.body || {};
    return String(body.deviceId || req.headers["x-device-id"] || "").trim();
  }

  toClient(session) {
    if (!session) return null;
    return {
      _id: session._id,
      sessionId: session.sessionId,
      deviceId: session.deviceId,
      deviceName: session.deviceName,
      operatingSystem: session.operatingSystem,
      browser: session.browser,
      ipAddress: session.ipAddress,
      loginTime: session.loginTime,
      lastActiveAt: session.lastActiveAt,
      status: session.status,
      userType: session.userType,
    };
  }

  async createForUser(req, userData = {}) {
    const metadata = sessionMetadata(req, userData);

    // The browser can lose its access-token/session cookies (mobile Safari/WebView
    // cookie eviction, backgrounding, storage pressure) without ever calling logout,
    // leaving the old row stuck at status "active" forever — there's no session TTL/
    // expiry job. A fresh login from the same device would then pile up as a second
    // "active" row for that device instead of replacing the stale one. Close out any
    // prior active session(s) for this exact device before creating the new row, so
    // only the newest login is ever shown as active per device.
    if (metadata.deviceId) {
      const now = new Date();
      await sessionModel.updateMany(
        {
          adminId: metadata.adminId,
          memberId: metadata.memberId || null,
          userType: metadata.userType,
          deviceId: metadata.deviceId,
          status: "active",
        },
        {
          $set: { status: "logged_out", logoutTime: now, lastActiveAt: now },
          $push: { events: { type: "logout", at: now, reason: "Superseded by new login on this device" } },
        }
      );
    }

    return sessionModel.create(metadata);
  }

  async createForLogin(req, userData = {}) {
    try {
      return await this.createForUser(req, userData);
    } catch (error) {
      logger.error("[SESSION_LOGIN_CREATE] failed to create login session:", error?.message || error);
      return null;
    }
  }

  async ensureDeviceCanLogin(req, userData = {}) {
    const deviceId = this.requestDeviceId(req);
    if (!deviceId) return { allowed: true };

    const userFilter = currentUserFilter(userData);
    const blockScopes = [{ ...userFilter, deviceId }];

    // Deliberately deviceId-only: the same credentials must work across any number of
    // browsers/desktops without cross-affecting each other, so blocking must never key
    // off anything shared between browsers on the same machine/network (IP, subnet).
    // An IP-based fallback was tried to catch incognito bypassing a block, but it also
    // blocked *every other browser* on that network — worse than the bypass it aimed to
    // fix, since it broke ordinary multi-browser/multi-desktop logins. Removed. Incognito
    // being able to dodge a block is an accepted limitation of client-side fingerprinting,
    // not something closable without a signal that also isolates unrelated browsers.

    const [blockedDevice, blockedSession] = await Promise.all([
      blockedDeviceModel.findOne({ status: "blocked", $or: blockScopes }).lean(),
      // blockSession()/updateSessionStatus() only ever writes status: "blocked" onto the
      // UserSession row itself — it never touches blockedDeviceModel. Without this check,
      // a session the UI shows as "Blocked" (and which does correctly force-logout the
      // browser currently holding it) had zero effect on a *new* login attempt from that
      // same device, since ensureDeviceCanLogin only ever consulted blockedDeviceModel.
      sessionModel.findOne({ ...userFilter, deviceId, status: "blocked" }).lean(),
    ]);

    if (!blockedDevice && !blockedSession) return { allowed: true };

    return {
      allowed: false,
      statusCode: 403,
      body: {
        status: "failed",
        message: "This sessions are blocked. Please contact administrator.",
        code: "DEVICE_BLOCKED",
        deviceId,
      },
    };
  }

  async enforceRequestDevice(req, userData = {}) {
    const deviceAccess = await this.ensureDeviceCanLogin(req, userData);
    if (deviceAccess.allowed) return deviceAccess;

    const sessionId = req.headers["x-session-id"];
    if (sessionId) {
      const now = new Date();
      await sessionModel.updateOne(
        { ...currentUserFilter(userData), sessionId },
        {
          $set: {
            status: "blocked",
            blockedAt: now,
            blockReason: "Device is blocked",
          },
          $push: { events: { type: "blocked", at: now, reason: "Device is blocked" } },
        }
      );
    }

    return deviceAccess;
  }

  async enforceRequestSession(req, userData = {}) {
    const deviceAccess = await this.enforceRequestDevice(req, userData);
    if (!deviceAccess.allowed) return deviceAccess;

    const sessionId = req.headers["x-session-id"];
    if (!sessionId) return { allowed: true };

    const session = await sessionModel.findOne({ sessionId }).select("status adminId memberId deviceId").lean();
    if (!session) {
      return { allowed: false, statusCode: 401, body: { status: "failed", message: "Invalid session", code: "SESSION_INVALID" } };
    }

    if (String(session.adminId) !== String(userData.adminId)) {
      return { allowed: false, statusCode: 401, body: { status: "failed", message: "Invalid session", code: "SESSION_INVALID" } };
    }

    if (userData.memberId && String(session.memberId) !== String(userData.memberId)) {
      return { allowed: false, statusCode: 401, body: { status: "failed", message: "Invalid session", code: "SESSION_INVALID" } };
    }

    if (session.status === "blocked") {
      return { allowed: false, statusCode: 401, body: { status: "failed", message: "This session is blocked", code: "SESSION_BLOCKED" } };
    }

    if (session.status === "logged_out") {
      return { allowed: false, statusCode: 401, body: { status: "failed", message: "This session has been logged out", code: "SESSION_LOGGED_OUT" } };
    }

    const currentDeviceId = this.requestDeviceId(req);
    const updateFields = { lastActiveAt: new Date() };
    if (session.status === "active" && currentDeviceId && currentDeviceId !== session.deviceId) {
      updateFields.deviceId = currentDeviceId;
    }

    await sessionModel.updateOne({ sessionId }, { $set: updateFields });

    return { allowed: true };
  }

  async getUserSessions(req, res) {
    try {
      const userData = req.verified?.userData || {};
      const { skip, limit } = pagination(req);
      const filter = { ...currentUserFilter(userData), ...statusFilter(req) };
      const [sessions, totalCount] = await Promise.all([
        sessionModel.find(filter).sort({ lastActiveAt: -1 }).skip(skip).limit(limit).lean(),
        sessionModel.countDocuments(filter),
      ]);
      const data = await withOnlineFlag(sessions);
      return res.status(200).send(Response.userSuccessResp("Sessions fetched successfully.", { totalCount, skip, limit, data }));
    } catch (error) {
      logger.error(error);
      return res.status(500).send(Response.errorResp("Failed to fetch sessions", error.message));
    }
  }

  async getAdminSessions(req, res) {
    try {
      const userData = req.verified?.userData || {};
      const { userId } = req.query || {};
      const { skip, limit } = pagination(req);
      // "online" is a live Redis-presence flag, not a stored status. It implies
      // status: "active" for the DB query; the actual online/offline split is
      // applied after withOnlineFlag() below.
      const onlineOnly = (req.query?.status ?? req.body?.status) === "online";
      const filter = {
        adminId: userData.adminId,
        ...(onlineOnly ? { status: "active" } : statusFilter(req)),
        ...sessionQueryFilters(req),
      };

      if (userId) {
        if (!mongoose.Types.ObjectId.isValid(String(userId))) {
          return res.status(400).send(Response.validationFailResp("Invalid userId"));
        }
        if (String(userId) === String(userData.adminId)) {
          filter.memberId = null;
          filter.userType = "admin";
        } else {
          const managedUser = await usersModel.findOne({ _id: userId, adminId: userData.adminId }).select("_id").lean();
          if (!managedUser) return res.status(404).send(Response.notFoundResp("User not found under this admin"));
          filter.memberId = managedUser._id;
          filter.userType = "user";
        }
      }

      if (onlineOnly) {
        // Online rows can't be paginated at the DB level (presence lives in
        // Redis), so fetch all active rows for this filter, flag them, then
        // keep only the online ones and page in memory.
        const activeSessions = await sessionModel.find(filter).sort({ lastActiveAt: -1 }).lean();
        const flagged = await withOnlineFlag(activeSessions);
        const onlineSessions = flagged.filter((session) => session.online);
        const totalCount = onlineSessions.length;
        const data = onlineSessions.slice(skip, skip + limit);
        return res.status(200).send(Response.userSuccessResp("Admin sessions fetched successfully.", { totalCount, skip, limit, data }));
      }

      const [sessions, totalCount] = await Promise.all([
        sessionModel.find(filter).sort({ lastActiveAt: -1 }).skip(skip).limit(limit).lean(),
        sessionModel.countDocuments(filter),
      ]);
      const data = await withOnlineFlag(sessions);
      return res.status(200).send(Response.userSuccessResp("Admin sessions fetched successfully.", { totalCount, skip, limit, data }));
    } catch (error) {
      logger.error(error);
      return res.status(500).send(Response.errorResp("Failed to fetch admin sessions", error.message));
    }
  }

  async getSessionSummary(req, res) {
    try {
      const userData = req.verified?.userData || {};
      const filter = { adminId: userData.adminId, ...statusFilter(req), ...sessionQueryFilters(req) };
      const requestedStatus = req.query?.status ?? req.body?.status;

      const rows = await sessionModel.aggregate([
        { $match: filter },
        {
          $group: {
            _id: {
              userType: "$userType",
              adminId: "$adminId",
              memberId: "$memberId",
              deviceId: "$deviceId",
            },
            deviceName: { $first: "$deviceName" },
            browser: { $first: "$browser" },
            operatingSystem: { $first: "$operatingSystem" },
            ipAddress: { $first: "$ipAddress" },
            sessionCount: { $sum: 1 },
            activeCount: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
            blockedCount: { $sum: { $cond: [{ $eq: ["$status", "blocked"] }, 1, 0] } },
            loggedOutCount: { $sum: { $cond: [{ $eq: ["$status", "logged_out"] }, 1, 0] } },
            lastActiveAt: { $max: "$lastActiveAt" },
          },
        },
        {
          $group: {
            _id: {
              userType: "$_id.userType",
              adminId: "$_id.adminId",
              memberId: "$_id.memberId",
            },
            sessionCount: { $sum: "$sessionCount" },
            activeCount: { $sum: "$activeCount" },
            blockedCount: { $sum: "$blockedCount" },
            loggedOutCount: { $sum: "$loggedOutCount" },
            lastActiveAt: { $max: "$lastActiveAt" },
            devices: {
              $push: {
                deviceId: "$_id.deviceId",
                deviceName: "$deviceName",
                browser: "$browser",
                operatingSystem: "$operatingSystem",
                ipAddress: "$ipAddress",
                sessionCount: "$sessionCount",
                activeCount: "$activeCount",
                blockedCount: "$blockedCount",
                loggedOutCount: "$loggedOutCount",
                lastActiveAt: "$lastActiveAt",
              },
            },
          },
        },
        { $sort: { lastActiveAt: -1 } },
      ]);

      // blockDevice() upserts blockedDeviceModel independent of session rows (it only
      // flips *active* sessions to "blocked"), so a device blocked after its session
      // logged out/expired/was deleted has no "blocked" session row to be picked up by
      // the aggregation above. Merge those orphaned blocked-device records back in so
      // the summary's blockedCount/devices stay consistent with /blocked-devices.
      const includeBlockedDevices = !requestedStatus || requestedStatus === "blocked";
      const blockedDeviceFilter = { adminId: userData.adminId, status: "blocked" };
      const queryFilters = sessionQueryFilters(req);
      if (queryFilters.userType) blockedDeviceFilter.userType = queryFilters.userType;
      if (queryFilters.deviceId) blockedDeviceFilter.deviceId = queryFilters.deviceId;

      const blockedDevices = includeBlockedDevices
        ? await blockedDeviceModel.find(blockedDeviceFilter).lean()
        : [];

      const rowByOwnerKey = new Map(
        rows.map((row) => [`${row._id.userType}:${row._id.adminId || ""}:${row._id.memberId || ""}`, row])
      );

      blockedDevices.forEach((device) => {
        const ownerKey = `${device.userType}:${device.adminId || ""}:${device.memberId || ""}`;
        let row = rowByOwnerKey.get(ownerKey);
        if (!row) {
          row = {
            _id: { userType: device.userType, adminId: device.adminId, memberId: device.memberId },
            sessionCount: 0,
            activeCount: 0,
            blockedCount: 0,
            loggedOutCount: 0,
            lastActiveAt: null,
            devices: [],
          };
          rowByOwnerKey.set(ownerKey, row);
          rows.push(row);
        }

        const hasDevice = row.devices.some((d) => d.deviceId === device.deviceId);
        if (hasDevice) return;

        row.blockedCount += 1;
        row.devices.push({
          deviceId: device.deviceId,
          deviceName: [device.browser, device.operatingSystem].filter(Boolean).join(" on ") || "Unknown Device",
          browser: device.browser || "",
          operatingSystem: device.operatingSystem || "",
          ipAddress: device.ipAddress || "",
          sessionCount: 0,
          activeCount: 0,
          blockedCount: 1,
          loggedOutCount: 0,
          lastActiveAt: device.blockedAt || device.createdAt || null,
        });
      });

      const adminIds = rows.map((row) => row._id.adminId).filter(Boolean);
      const memberIds = rows.map((row) => row._id.memberId).filter(Boolean);

      const [admins, users] = await Promise.all([
        adminModel.find({ _id: { $in: adminIds } }).select("name_f name_l email login").lean(),
        usersModel.find({ _id: { $in: memberIds } }).select("firstName lastName userName email").lean(),
      ]);

      const adminMap = new Map(admins.map((admin) => [String(admin._id), admin]));
      const userMap = new Map(users.map((user) => [String(user._id), user]));

      // Live online count per owner from Redis presence (see sessionPresence.js).
      const activeSessions = await sessionModel
        .find({ ...filter, status: "active" })
        .select("sessionId adminId memberId userType")
        .lean();
      const onlineIds = await getOnlineSessionIds(activeSessions.map((s) => s.sessionId));
      const onlineCountByOwner = new Map();
      activeSessions.forEach((s) => {
        if (!onlineIds.has(s.sessionId)) return;
        const ownerId = s.userType === "user" ? s.memberId : s.adminId;
        const key = `${s.userType}:${String(ownerId || "")}`;
        onlineCountByOwner.set(key, (onlineCountByOwner.get(key) || 0) + 1);
      });

      const data = rows.map((row) => {
        const ownerId = row._id.userType === "user" ? row._id.memberId : row._id.adminId;
        const owner = row._id.userType === "user" ? userMap.get(String(ownerId)) : adminMap.get(String(ownerId));
        const ownerName =
          row._id.userType === "user"
            ? [owner?.firstName, owner?.lastName].filter(Boolean).join(" ") || owner?.userName || owner?.email || "User"
            : [owner?.name_f, owner?.name_l].filter(Boolean).join(" ") || owner?.login || owner?.email || "Admin";

        return {
          userType: row._id.userType,
          ownerId,
          ownerName,
          ownerEmail: owner?.email || "",
          sessionCount: row.sessionCount,
          activeCount: row.activeCount,
          onlineCount: onlineCountByOwner.get(`${row._id.userType}:${String(ownerId || "")}`) || 0,
          blockedCount: row.blockedCount,
          loggedOutCount: row.loggedOutCount,
          lastActiveAt: row.lastActiveAt,
          devices: row.devices.sort((a, b) => new Date(b.lastActiveAt || 0) - new Date(a.lastActiveAt || 0)),
        };
      });

      return res.status(200).send(Response.userSuccessResp("Session summary fetched successfully.", data));
    } catch (error) {
      logger.error(error);
      return res.status(500).send(Response.errorResp("Failed to fetch session summary", error.message));
    }
  }

  async getSessionDetails(req, res) {
    try {
      const userData = req.verified?.userData || {};
      const filter = userData.memberId ? currentUserFilter(userData) : { adminId: userData.adminId };
      const session = await sessionModel.findOne({ ...filter, sessionId: req.params.sessionId }).lean();
      if (!session) return res.status(404).send(Response.notFoundResp("Session not found"));
      const [withOnline] = await withOnlineFlag([session]);
      return res.status(200).send(Response.userSuccessResp("Session fetched successfully.", withOnline));
    } catch (error) {
      logger.error(error);
      return res.status(500).send(Response.errorResp("Failed to fetch session", error.message));
    }
  }

  async logoutSession(req, res) {
    return this.updateSessionStatus(req, res, "logged_out", "logout", "Session logged out successfully.");
  }

  async deleteSession(req, res) {
    try {
      const userData = req.verified?.userData || {};
      const filter = userData.memberId ? currentUserFilter(userData) : { adminId: userData.adminId };
      const session = await sessionModel.findOneAndDelete({ ...filter, sessionId: req.params.sessionId }).lean();
      if (!session) return res.status(404).send(Response.notFoundResp("Session not found"));
      await this.clearBlockedDevicesForSessions([session]);
      return res.status(200).send(Response.userSuccessResp("Session deleted successfully.", session));
    } catch (error) {
      logger.error(error);
      return res.status(500).send(Response.errorResp("Failed to delete session", error.message));
    }
  }

  async bulkDeleteSessions(req, res) {
    try {
      const userData = req.verified?.userData || {};
      const sessionIds = Array.from(new Set((req.body?.sessionIds || []).map((id) => String(id || "").trim()).filter(Boolean)));
      if (!sessionIds.length) {
        return res.status(400).send(Response.userFailResp("sessionIds must be a non-empty array", "Validation Failed!"));
      }

      const filter = userData.memberId ? currentUserFilter(userData) : { adminId: userData.adminId };
      const sessionsToDelete = await sessionModel.find({ ...filter, sessionId: { $in: sessionIds } }).lean();
      const result = await sessionModel.deleteMany({ ...filter, sessionId: { $in: sessionIds } });
      await this.clearBlockedDevicesForSessions(sessionsToDelete);

      return res.status(200).send(Response.userSuccessResp("Sessions deleted successfully.", {
        requestedCount: sessionIds.length,
        deletedCount: result.deletedCount || 0,
      }));
    } catch (error) {
      logger.error(error);
      return res.status(500).send(Response.errorResp("Failed to delete sessions", error.message));
    }
  }

  // Deleting a session for a device that's on the block list would otherwise leave an
  // orphaned blockedDeviceModel row with no session to represent it (invisible in the
  // profile's device list, only reachable via the standalone blocked-devices tab). This
  // isn't limited to sessions whose own status is "blocked" — blockDevice() only flips
  // *active* sessions to "blocked", so a device can be blocked while its session rows
  // are still "logged_out"/"expired". So: for every device touched by this delete, check
  // blockedDeviceModel directly and clear it once no session rows remain for that device
  // (one device can have several session rows from repeat logins — deleting just one of
  // them shouldn't lift a block that other remaining sessions are still subject to).
  async clearBlockedDevicesForSessions(sessions = []) {
    const scopes = new Map();
    sessions.forEach((session) => {
      if (!session?.deviceId) return;
      const key = `${session.userType}:${session.adminId || ""}:${session.memberId || ""}:${session.deviceId}`;
      if (!scopes.has(key)) {
        scopes.set(key, {
          adminId: session.adminId || null,
          memberId: session.memberId || null,
          userType: session.userType,
          deviceId: session.deviceId,
        });
      }
    });
    if (!scopes.size) return;

    await Promise.all(
      Array.from(scopes.values()).map(async (scope) => {
        const remaining = await sessionModel.exists(scope);
        if (remaining) return;
        await blockedDeviceModel.deleteMany(scope);
      })
    );
  }

  async blockSession(req, res) {
    return this.updateSessionStatus(req, res, "blocked", "blocked", "Session blocked successfully.");
  }

  async unblockSession(req, res) {
    try {
      const userData = req.verified?.userData || {};
      const now = new Date();
      const filter = userData.memberId ? currentUserFilter(userData) : { adminId: userData.adminId };
      const session = await sessionModel.findOneAndUpdate(
        { ...filter, sessionId: req.params.sessionId },
        {
          $set: {
            status: "logged_out",
            logoutTime: now,
            lastActiveAt: now,
            blockedAt: null,
            blockedBy: null,
            blockReason: "",
          },
          $push: { events: { type: "unblocked", at: now, reason: req.body?.reason || "Browser session unblocked" } },
        },
        { new: true }
      ).lean();
      if (!session) return res.status(404).send(Response.notFoundResp("Session not found"));

      return res.status(200).send(Response.userSuccessResp("Browser session unblocked successfully.", {
        sessionId: session.sessionId,
        deviceId: session.deviceId,
        modifiedCount: 1,
      }));
    } catch (error) {
      logger.error(error);
      return res.status(500).send(Response.errorResp("Failed to unblock browser session", error.message));
    }
  }

  async updateSessionStatus(req, res, status, eventType, message) {
    try {
      const userData = req.verified?.userData || {};
      const now = new Date();
      const filter = userData.memberId ? currentUserFilter(userData) : { adminId: userData.adminId };
      const set = { status, lastActiveAt: now };
      if (status === "logged_out") set.logoutTime = now;
      if (status === "blocked") {
        set.blockedAt = now;
        set.blockedBy = userData.adminId;
        set.blockReason = req.body?.reason || "";
      }
      const session = await sessionModel.findOneAndUpdate(
        { ...filter, sessionId: req.params.sessionId },
        { $set: set, $push: { events: { type: eventType, at: now, reason: req.body?.reason || "" } } },
        { new: true }
      );
      if (!session) return res.status(404).send(Response.notFoundResp("Session not found"));

      return res.status(200).send(Response.userSuccessResp(message, session));
    } catch (error) {
      logger.error(error);
      return res.status(500).send(Response.errorResp("Failed to update session", error.message));
    }
  }

  async blockDevice(req, res) {
    try {
      const userData = req.verified?.userData || {};
      const session = await sessionModel.findOne({ adminId: userData.adminId, sessionId: req.params.sessionId }).lean();
      if (!session) return res.status(404).send(Response.notFoundResp("Session not found"));

      const now = new Date();
      const reason = req.body?.reason || "";
      const device = await blockedDeviceModel.findOneAndUpdate(
        { adminId: session.adminId, memberId: session.memberId || null, userType: session.userType, deviceId: session.deviceId },
        {
          $set: {
            status: "blocked",
            reason,
            blockedBy: userData.adminId,
            blockedAt: now,
            unblockedAt: null,
            unblockedBy: null,
          },
        },
        { new: true, upsert: true }
      );

      await sessionModel.updateMany(
        { adminId: session.adminId, memberId: session.memberId || null, userType: session.userType, deviceId: session.deviceId, status: "active" },
        { $set: { status: "blocked", blockedAt: now, blockedBy: userData.adminId, blockReason: reason }, $push: { events: { type: "blocked", at: now, reason } } }
      );

      return res.status(200).send(Response.userSuccessResp("Device blocked successfully.", device));
    } catch (error) {
      logger.error(error);
      return res.status(500).send(Response.errorResp("Failed to block device", error.message));
    }
  }

  async unblockDevice(req, res) {
    try {
      const userData = req.verified?.userData || {};
      const { deviceId } = req.params;
      const now = new Date();
      const blockedDeviceId = req.body?.blockedDeviceId || req.query?.blockedDeviceId;
      const identityFilter = blockedDeviceId && mongoose.Types.ObjectId.isValid(String(blockedDeviceId))
        ? { _id: blockedDeviceId }
        : { deviceId };
      const device = await blockedDeviceModel.findOneAndUpdate(
        { adminId: userData.adminId, ...identityFilter, status: "blocked" },
        { $set: { status: "unblocked", unblockedAt: now, unblockedBy: userData.adminId } },
        { new: true }
      );
      if (!device) return res.status(404).send(Response.notFoundResp("Blocked device not found"));
      await sessionModel.updateMany(
        {
          adminId: device.adminId,
          memberId: device.memberId || null,
          userType: device.userType,
          deviceId: device.deviceId,
          status: "blocked",
        },
        {
          $set: {
            status: "logged_out",
            logoutTime: now,
            lastActiveAt: now,
            blockedAt: null,
            blockedBy: null,
            blockReason: "",
          },
          $push: { events: { type: "unblocked", at: now, reason: "Device unblocked" } },
        }
      );
      return res.status(200).send(Response.userSuccessResp("Device unblocked successfully.", device));
    } catch (error) {
      logger.error(error);
      return res.status(500).send(Response.errorResp("Failed to unblock device", error.message));
    }
  }

  async getBlockedDevices(req, res) {
    try {
      const userData = req.verified?.userData || {};
      const devices = await blockedDeviceModel.find({ adminId: userData.adminId, status: "blocked" }).sort({ blockedAt: -1 }).lean();
      const adminIds = devices.map((device) => device.adminId).filter(Boolean);
      const memberIds = devices.map((device) => device.memberId).filter(Boolean);
      const [admins, users] = await Promise.all([
        adminModel.find({ _id: { $in: adminIds } }).select("name_f name_l email login").lean(),
        usersModel.find({ _id: { $in: memberIds } }).select("firstName lastName userName email").lean(),
      ]);
      const adminMap = new Map(admins.map((admin) => [String(admin._id), admin]));
      const userMap = new Map(users.map((user) => [String(user._id), user]));
      const enrichedDevices = devices.map((device) => {
        const ownerId = device.userType === "user" ? device.memberId : device.adminId;
        const owner = device.userType === "user" ? userMap.get(String(ownerId)) : adminMap.get(String(ownerId));
        const ownerName =
          device.userType === "user"
            ? [owner?.firstName, owner?.lastName].filter(Boolean).join(" ") || owner?.userName || owner?.email || "User"
            : [owner?.name_f, owner?.name_l].filter(Boolean).join(" ") || owner?.login || owner?.email || "Admin";

        return {
          ...device,
          ownerId,
          ownerName,
          ownerEmail: owner?.email || "",
        };
      });
      return res.status(200).send(Response.userSuccessResp("Blocked devices fetched successfully.", enrichedDevices));
    } catch (error) {
      logger.error(error);
      return res.status(500).send(Response.errorResp("Failed to fetch blocked devices", error.message));
    }
  }

  reject(res, access) {
    return res.status(access.statusCode).send(responseEnvelope(access.statusCode, access.body));
  }
}

export default new SessionsService();
