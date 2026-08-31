import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import config from "config";
import { redis } from "./utils/database.js"
import logger from "./utils/logger.js";
import { checkActivePlanSocket } from "./middlewares/checkActivePlan.js";
import adminModel from "./core/v1/admin/admin.model.js";
import Channel from "./core/v1/channels/channels.model.js";
import {
  getLicenseState,
  isLicensingEnforced,
} from "./core/v2/clientConfig/detectionLicense.service.js";
import { DETECTION_TYPES } from "./constants/detectionTypes.js";

// Compute an admin's camera-limit snapshot
// { purchasedCameras, added, remaining, licensed }.
// Accepts adminId and/or userId — resolves the missing one from the admin doc.
//
// `remaining` keeps its original meaning: null when purchasedCameras <= 0, so
// the existing over-limit maths is untouched.
//
// `licensed` is the separate question "has the superadmin licensed this client
// at all?". A client on zero cameras has bought nothing, so the apps freeze with
// a contact-support message rather than running unrestricted — the policy lives
// here so v1 and v2 cannot drift on it.
const getCameraLimitSnapshot = async ({ adminId, userId }) => {
  const admin = adminId
    ? await adminModel.findById(adminId).select("purchasedCameras user_id").lean()
    : await adminModel.findOne({ user_id: userId }).select("purchasedCameras user_id _id").lean();
  const purchasedCameras = Number(admin?.purchasedCameras) || 0;
  const uid = userId || admin?.user_id;
  const aId = adminId || admin?._id;
  const added = uid ? await Channel.countDocuments({ userId: uid, isAdded: true }) : 0;
  return {
    adminId: aId,
    userId: uid,
    purchasedCameras,
    added,
    remaining: purchasedCameras > 0 ? Math.max(purchasedCameras - added, 0) : null,
    // On-prem there is no licence, so the app must never be frozen: report
    // licensed regardless of purchasedCameras, which nobody sets there.
    licensed: !isLicensingEnforced() || purchasedCameras > 0,
  };
};

// Build an admin's detection-licence snapshot: which detections they may use,
// each one's camera allocation, and how many cameras are running it now. Same
// shape the /client-config/license endpoint returns, so the frontend can treat
// a pushed update and a fetched one identically.
const getDetectionLicenseSnapshot = async ({ adminId, userId }) => {
  const state = await getLicenseState({ adminId, userId });
  if (!state.resolved) return null;
  return {
    adminId: state.adminId,
    userId: state.userId,
    purchasedCameras: state.purchasedCameras,
    camerasInUse: state.licenseCameras.length,
    remaining: Math.max(state.purchasedCameras - state.licenseCameras.length, 0),
    allowedDetections: [...state.allocations.keys()],
    detections: [...state.allocations.entries()].map(([settingType, cameraAllocation]) => {
      const cameras = state.byType.get(settingType) || [];
      return {
        settingType,
        name: DETECTION_TYPES[settingType] || settingType,
        cameraAllocation,
        camerasInUse: cameras.length,
        remaining: Math.max(cameraAllocation - cameras.length, 0),
        cameras,
      };
    }),
  };
};

let io;

// Emit the current camera-limit snapshot to an admin's clients. Call this after
// any change to the added-camera count (add/remove cameras) so the frontend's
// remaining count stays live. Fire-and-forget — never throws to the caller.
export const emitCameraLimit = async ({ adminId, userId }) => {
  try {
    if (!io || (!adminId && !userId)) return;
    const snapshot = await getCameraLimitSnapshot({ adminId, userId });
    if (!snapshot.adminId) return; // couldn't resolve the admin
    io.emit(`purchasedCameras_${snapshot.adminId}`, snapshot);
  } catch (e) {
    logger.error(`emitCameraLimit failed: ${e?.message || e}`);
  }
};

// Push an admin's detection licence to their clients. Call after anything that
// changes what they may run. Fire-and-forget — never throws to the caller.
export const emitDetectionLicense = async ({ adminId, userId }) => {
  try {
    if (!io || (!adminId && !userId)) return;
    const snapshot = await getDetectionLicenseSnapshot({ adminId, userId });
    if (!snapshot?.adminId) return;
    io.emit(`detectionLicense_${snapshot.adminId}`, snapshot);
  } catch (e) {
    logger.error(`emitDetectionLicense failed: ${e?.message || e}`);
  }
};

export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*", // Replace with your allowed origin(s)
      methods: ["GET", "POST"],
    },
  });

  // JWT-based authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error("Authentication token missing"));
    }

    try {
      const secret = config.get("jwt.secretKey"); // or process.env.JWT_SECRET
      const decoded = jwt.verify(token, secret);
      socket.user = decoded; // Attach decoded payload (e.g., user ID/email)
      // next();
      checkActivePlanSocket(socket, next)
    } catch (err) {
      return next(new Error("Invalid or expired token"));
    }
  });

  

  // Bridge superadmin -> client for live purchasedCameras changes. The
  // superadmin service updates the limit in its own process and publishes on
  // Redis; we re-emit it over the socket so connected clients update the
  // remaining-camera count without a refresh. A separate (duplicated)
  // connection is required because a subscribed ioredis client can't run
  // other commands.
  try {
    const sub = redis.duplicate();
    sub.subscribe(
      "purchasedCameras:update",
      "detectionAllocation:update",
      "detectionCatalog:sync",
      (err) => {
        if (err) logger.error(`Failed to subscribe superadmin channels: ${err.message}`);
      },
    );
    sub.on("message", async (channel, message) => {
      try {
        // The superadmin pressed Sync detections. Re-publish the catalog from
        // this backend's constants and re-check it against DS's own detector
        // list — this backend owns both, so the button has to reach it here
        // rather than the superadmin re-reading a stale collection.
        if (channel === "detectionCatalog:sync") {
          const { syncDetectionCatalog } = await import(
            "./core/v2/detectionCatalog/detectionCatalog.service.js"
          );
          const result = await syncDetectionCatalog();
          logger.info(
            `[DETECTION_CATALOG] resync requested by superadmin — ${result.total} types`,
          );
          return;
        }

        const { adminId, userId } = JSON.parse(message);
        if (!adminId) return;

        if (channel === "purchasedCameras:update") {
          // Recompute the full snapshot so `remaining` reflects current state, and
          // emit the SAME shape as the on-connect snapshot (one frontend listener
          // handles both). Channel keyed by adminId so clients filter to their own.
          const snapshot = await getCameraLimitSnapshot({ adminId, userId });
          io.emit(`purchasedCameras_${adminId}`, snapshot);
          // The camera licence also decides whether the app is usable at all, so
          // a change here can change which detections are enableable.
          await emitDetectionLicense({ adminId, userId });
          return;
        }

        if (channel === "detectionAllocation:update") {
          const { settingType, enabled } = JSON.parse(message);

          // A revoke has to actually stop the engine. The allocation alone only
          // hides the detection from the UI; the CV backend reads channels as a
          // `system` caller and is deliberately unfiltered, so without this the
          // detector kept running and producing incidents with no control left
          // anywhere to switch it off.
          if (enabled === false && settingType) {
            const { revokeDetectionEverywhere } = await import(
              "./core/v2/clientConfig/detectionLicense.service.js"
            );
            const admin = userId
              ? { user_id: userId }
              : await adminModel.findById(adminId).select("user_id").lean();
            await revokeDetectionEverywhere({
              adminId,
              userId: admin?.user_id || userId,
              settingType,
            });
          }

          // The superadmin granted or revoked a detection. Push the new licence
          // so open clients update without a reload...
          await emitDetectionLicense({ adminId, userId });
          // The revoke above may have freed camera-licence slots, so the camera
          // snapshot the lock reads has to be refreshed too.
          await emitCameraLimit({ adminId, userId });
          // ...and re-broadcast the log configuration, since an unlicensed
          // detection's log page has to disappear with it. Imported lazily:
          // logsConfiguration.service imports sendPayloadToUser from this file,
          // so a static import would be a cycle.
          const { refreshLogsConfiguration } = await import(
            "./core/v2/logsConfiguration/logsConfiguration.service.js"
          );
          await refreshLogsConfiguration(adminId);
        }
      } catch (e) {
        logger.error(`superadmin pub/sub handling error (${channel}): ${e.message}`);
      }
    });
  } catch (e) {
    logger.error(`purchasedCameras subscriber init failed: ${e.message}`);
  }

  // Handle socket connection
  io.on("connection", async (socket) => {
    // logger.info(`✅ Socket connected: ${socket.id}, user:`, socket.user);

    const userId = socket?.user?.user_id || "";
    const adminId = socket?.user?.adminId;

    if (userId) {
      // Store in Redis
      let ack = await redis.set(`socket:${userId}`, socket.id);
    }

    // Emit the current camera-limit snapshot immediately on (re)connect so the
    // frontend has the initial value without a separate fetch. Same channel the
    // superadmin-update bridge uses, so one listener handles both.
    if (adminId) {
      try {
        const snapshot = await getCameraLimitSnapshot({ adminId, userId });
        socket.emit(`purchasedCameras_${adminId}`, snapshot);
      } catch (e) {
        logger.error(`purchasedCameras connect snapshot failed: ${e.message}`);
      }

      // Same for the detection licence, so a client that was offline while the
      // superadmin changed it is correct the moment it reconnects.
      try {
        const licence = await getDetectionLicenseSnapshot({ adminId, userId });
        if (licence) socket.emit(`detectionLicense_${adminId}`, licence);
      } catch (e) {
        logger.error(`detectionLicense connect snapshot failed: ${e.message}`);
      }
    }

    socket.on("ping", () => {
      socket.emit("pong");
    });

    socket.on("disconnect", async (reason) => {
      // logger.info(`❌ Socket disconnected: ${socket.id}, reason: ${reason}`);
      if (userId) {
        // Delete from Redis
        await redis.del(`socket:${userId}`);
      }
    });
  });
};

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized");
  }
  return io;
};

/**
 * Emit to exactly the connected socket(s) belonging to `userId`, not a global
 * broadcast. Falls back to a broadcast only when there's no Redis record for
 * the user (e.g. Redis unavailable) so an event is never silently dropped —
 * every listener still filters by the channel name (e.g.
 * `detectionSchedule_${adminId}`), so a fallback broadcast is only ever
 * wasteful, not incorrect.
 */
export const sendPayloadToUser = async (userId, channel, payload) => {
  try {
    const io = getIO();

    // No userId (e.g. an unrecognized-person detection) -> there was never a
    // socket to look up. Broadcast straight away — no warn, this is expected,
    // not an anomaly.
    if (!userId) {
      io.emit(channel, payload);
      return;
    }

    const socketId = await redis.get(`socket:${userId}`);

    if (!socketId) {
      logger.warn(`No active socket found for user ${userId} — broadcasting '${channel}' instead`);
      io.emit(channel, payload);
      return;
    }

    const socket = io.sockets.sockets.get(socketId);
    if (!socket) {
      logger.warn(`Socket ID ${socketId} not found in active connections for user ${userId} — broadcasting '${channel}' instead`);
      io.emit(channel, payload);
      return;
    }

    socket.emit(channel, payload);
    logger.info(`Payload sent to user ${userId} via socket ${socketId} on channel '${channel}'`);
  } catch (error) {
    logger.error(`Error sending payload to user ${userId} on channel '${channel}': ${error.message}`);
  }
};
