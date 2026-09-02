import mongoose from "mongoose";
import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import sessionModel from "./sessions.model.js";
import blockedDeviceModel from "./blockedDevice.model.js";
import usersModel from "../users/users.model.js";
import adminModel from "../admin/admin.model.js";

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

function authUser(req) {
  return req.verified?.userData || {};
}

function isSuperAdmin(req) {
  return Boolean(req.superAdmin);
}

function currentUserFilter(req) {
  if (isSuperAdmin(req)) return {};

  const user = authUser(req);
  return {
    adminId: user.adminId,
    memberId: user.memberId || null,
    userType: user.memberId ? "user" : "admin",
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

function adminDisplayName(admin) {
  return [admin?.name_f, admin?.name_l].filter(Boolean).join(" ") || admin?.login || admin?.email || "Admin";
}

function userDisplayName(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.userName || user?.email || "User";
}

async function scopedAdminFilter(req) {
  if (isSuperAdmin(req)) return {};
  return { adminId: authUser(req).adminId };
}

async function filterForUserId(req, userId) {
  if (!isObjectId(userId)) return { error: Response.validationFailResp("Invalid userId") };

  if (isSuperAdmin(req)) {
    const [admin, user] = await Promise.all([
      adminModel.findById(userId).select("_id login email name_f name_l").lean(),
      usersModel.findById(userId).select("_id adminId userName email firstName lastName").lean(),
    ]);

    if (admin) return { filter: { adminId: admin._id, memberId: null, userType: "admin" } };
    if (user) return { filter: { adminId: user.adminId, memberId: user._id, userType: "user" } };
    return { error: Response.notFoundResp("User not found") };
  }

  const adminId = authUser(req).adminId;
  if (String(userId) === String(adminId)) {
    return { filter: { adminId, memberId: null, userType: "admin" } };
  }

  const managedUser = await usersModel.findOne({ _id: userId, adminId }).select("_id").lean();
  if (!managedUser) return { error: Response.notFoundResp("User not found under this admin") };
  return { filter: { adminId, memberId: managedUser._id, userType: "user" } };
}

class SessionsService {
  async getUserSessions(req, res) {
    try {
      const { skip, limit } = pagination(req);
      const filter = { ...currentUserFilter(req), ...statusFilter(req) };
      const [sessions, totalCount] = await Promise.all([
        sessionModel.find(filter).sort({ lastActiveAt: -1 }).skip(skip).limit(limit).lean(),
        sessionModel.countDocuments(filter),
      ]);
      return res.status(200).send(Response.userSuccessResp("Sessions fetched successfully.", { totalCount, skip, limit, data: sessions }));
    } catch (error) {
      logger.error(error);
      return res.status(500).send(Response.errorResp("Failed to fetch sessions", error.message));
    }
  }

  async getAdminSessions(req, res) {
    try {
      const { userId } = req.query || {};
      const { skip, limit } = pagination(req);
      let filter = { ...(await scopedAdminFilter(req)), ...statusFilter(req), ...sessionQueryFilters(req) };

      if (userId) {
        const resolved = await filterForUserId(req, userId);
        if (resolved.error) return res.status(resolved.error.statusCode).send(resolved.error);
        filter = { ...resolved.filter, ...statusFilter(req), ...sessionQueryFilters(req) };
      }

      const [sessions, totalCount] = await Promise.all([
        sessionModel.find(filter).sort({ lastActiveAt: -1 }).skip(skip).limit(limit).lean(),
        sessionModel.countDocuments(filter),
      ]);
      return res.status(200).send(Response.userSuccessResp("Admin sessions fetched successfully.", { totalCount, skip, limit, data: sessions }));
    } catch (error) {
      logger.error(error);
      return res.status(500).send(Response.errorResp("Failed to fetch admin sessions", error.message));
    }
  }

  async getSessionSummary(req, res) {
    try {
      const filter = { ...(await scopedAdminFilter(req)), ...statusFilter(req), ...sessionQueryFilters(req) };

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

      const adminIds = rows.map((row) => row._id.adminId).filter(Boolean);
      const memberIds = rows.map((row) => row._id.memberId).filter(Boolean);

      const [admins, users] = await Promise.all([
        adminModel.find({ _id: { $in: adminIds } }).select("name_f name_l email login").lean(),
        usersModel.find({ _id: { $in: memberIds } }).select("firstName lastName userName email").lean(),
      ]);

      const adminMap = new Map(admins.map((admin) => [String(admin._id), admin]));
      const userMap = new Map(users.map((user) => [String(user._id), user]));

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
      const filter = isSuperAdmin(req) ? {} : currentUserFilter(req);
      if (!isSuperAdmin(req) && !authUser(req).memberId) delete filter.memberId;
      const session = await sessionModel.findOne({ ...filter, sessionId: req.params.sessionId }).lean();
      if (!session) return res.status(404).send(Response.notFoundResp("Session not found"));
      return res.status(200).send(Response.userSuccessResp("Session fetched successfully.", session));
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
      const filter = isSuperAdmin(req) ? {} : currentUserFilter(req);
      if (!isSuperAdmin(req) && !authUser(req).memberId) delete filter.memberId;
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
      const sessionIds = Array.from(new Set((req.body?.sessionIds || []).map((id) => String(id || "").trim()).filter(Boolean)));
      if (!sessionIds.length) {
        return res.status(400).send(Response.userFailResp("sessionIds must be a non-empty array", "Validation Failed!"));
      }

      const filter = isSuperAdmin(req) ? {} : currentUserFilter(req);
      if (!isSuperAdmin(req) && !authUser(req).memberId) delete filter.memberId;
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
  // orphaned blockedDeviceModel row with no session to represent it. blockDevice() only
  // flips *active* sessions to "blocked", so a device can be blocked while its session
  // rows are still "logged_out"/"expired" — so this isn't limited to sessions whose own
  // status is "blocked". For every device touched by this delete, check blockedDeviceModel
  // directly and clear it once no session rows remain for that device (one device can have
  // several session rows from repeat logins — deleting just one of them shouldn't lift a
  // block that other remaining sessions are still subject to).
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
        await blockedDeviceModel.deleteMany({
          deviceId: scope.deviceId,
          $or: [
            { adminId: scope.adminId, memberId: scope.memberId, userType: scope.userType },
            { userType: "system", adminId: null, memberId: null },
          ],
        });
      })
    );
  }

  async blockSession(req, res) {
    return this.updateSessionStatus(req, res, "blocked", "blocked", "Session blocked successfully.");
  }

  async unblockSession(req, res) {
    try {
      const now = new Date();
      const filter = isSuperAdmin(req) ? {} : { adminId: authUser(req).adminId };
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
      const now = new Date();
      const filter = isSuperAdmin(req) ? {} : { adminId: authUser(req).adminId };
      const set = { status, lastActiveAt: now };
      if (status === "logged_out") set.logoutTime = now;
      if (status === "blocked") {
        set.blockedAt = now;
        set.blockedBy = authUser(req).adminId || null;
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
      const sessionFilter = isSuperAdmin(req) ? {} : { adminId: authUser(req).adminId };
      const session = await sessionModel.findOne({ ...sessionFilter, sessionId: req.params.sessionId }).lean();
      if (!session) return res.status(404).send(Response.notFoundResp("Session not found"));

      const now = new Date();
      const reason = req.body?.reason || "";
      const blockedBy = authUser(req).adminId || null;
      const deviceFilter = { adminId: session.adminId, memberId: session.memberId || null, userType: session.userType, deviceId: session.deviceId };
      const sessionBlockFilter = { ...deviceFilter, status: "active" };
      const device = await blockedDeviceModel.findOneAndUpdate(
        deviceFilter,
        {
          $set: {
            status: "blocked",
            reason,
            ipAddress: session.ipAddress || "",
            operatingSystem: session.operatingSystem || "",
            browser: session.browser || "",
            userAgent: session.userAgent || "",
            blockedBy,
            blockedAt: now,
            unblockedAt: null,
            unblockedBy: null,
          },
        },
        { new: true, upsert: true }
      );

      await sessionModel.updateMany(
        sessionBlockFilter,
        { $set: { status: "blocked", blockedAt: now, blockedBy, blockReason: reason }, $push: { events: { type: "blocked", at: now, reason } } }
      );

      return res.status(200).send(Response.userSuccessResp("Device blocked successfully.", device));
    } catch (error) {
      logger.error(error);
      return res.status(500).send(Response.errorResp("Failed to block device", error.message));
    }
  }

  async getBlockedDevices(req, res) {
    try {
      const filter = isSuperAdmin(req) ? {} : { adminId: authUser(req).adminId };
      const devices = await blockedDeviceModel.find({ ...filter, status: "blocked" }).sort({ blockedAt: -1 }).lean();
      const systemDeviceIds = devices
        .filter((device) => device.userType === "system" && !device.adminId && !device.memberId && device.deviceId)
        .map((device) => device.deviceId);
      const relatedSessions = systemDeviceIds.length
        ? await sessionModel
            .find({ deviceId: { $in: systemDeviceIds } })
            .select("deviceId adminId memberId userType lastActiveAt")
            .sort({ lastActiveAt: -1 })
            .lean()
        : [];
      const sessionByDeviceId = new Map();
      relatedSessions.forEach((session) => {
        if (!sessionByDeviceId.has(session.deviceId)) sessionByDeviceId.set(session.deviceId, session);
      });
      const ownerRefs = devices.map((device) => {
        const relatedSession = device.userType === "system" ? sessionByDeviceId.get(device.deviceId) : null;
        return {
          adminId: device.adminId || relatedSession?.adminId,
          memberId: device.memberId || relatedSession?.memberId,
          userType: relatedSession?.userType || device.userType,
        };
      });
      const adminIds = ownerRefs.map((ownerRef) => ownerRef.adminId).filter(Boolean);
      const memberIds = ownerRefs.map((ownerRef) => ownerRef.memberId).filter(Boolean);
      const [admins, users] = await Promise.all([
        adminModel.find({ _id: { $in: adminIds } }).select("name_f name_l email login").lean(),
        usersModel.find({ _id: { $in: memberIds } }).select("firstName lastName userName email").lean(),
      ]);
      const adminMap = new Map(admins.map((admin) => [String(admin._id), admin]));
      const userMap = new Map(users.map((user) => [String(user._id), user]));
      const enrichedDevices = devices.map((device, index) => {
        const ownerRef = ownerRefs[index];
        const ownerId = ownerRef.userType === "user" ? ownerRef.memberId : ownerRef.adminId;
        const owner = ownerRef.userType === "user" ? userMap.get(String(ownerId)) : adminMap.get(String(ownerId));
        const ownerName = ownerRef.userType === "user" ? userDisplayName(owner) : adminDisplayName(owner);

        return {
          ...device,
          blockedUserType: device.userType,
          userType: ownerRef.userType,
          adminId: ownerRef.adminId || device.adminId,
          memberId: ownerRef.memberId || device.memberId,
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

  async unblockDevice(req, res) {
    try {
      const now = new Date();
      const blockedDeviceId = req.body?.blockedDeviceId || req.query?.blockedDeviceId;
      const filter = isSuperAdmin(req) ? {} : { adminId: authUser(req).adminId };
      const identityFilter = blockedDeviceId && isObjectId(blockedDeviceId)
        ? { _id: blockedDeviceId }
        : { deviceId: req.params.deviceId };
      const device = await blockedDeviceModel.findOneAndUpdate(
        { ...filter, ...identityFilter, status: "blocked" },
        { $set: { status: "unblocked", unblockedAt: now, unblockedBy: authUser(req).adminId || null } },
        { new: true }
      );
      if (!device) return res.status(404).send(Response.notFoundResp("Blocked device not found"));
      const sessionFilter = device.userType === "system"
        ? { deviceId: device.deviceId, status: "blocked" }
        : {
            adminId: device.adminId,
            memberId: device.memberId || null,
            userType: device.userType,
            deviceId: device.deviceId,
            status: "blocked",
          };
      await sessionModel.updateMany(
        sessionFilter,
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
}

export default new SessionsService();
