import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import config from "config";
import { redis } from "./utils/database.js"
import logger from "./utils/logger.js";
import { checkActivePlanSocket } from "./middlewares/checkActivePlan.js";
import adminModel from "./core/v1/admin/admin.model.js";
import Channel from "./core/v1/channels/channels.model.js";

// Compute an admin's camera-limit snapshot { purchasedCameras, added, remaining }.
// Accepts adminId and/or userId — resolves the missing one from the admin doc.
// purchasedCameras <= 0 means "no limit" -> remaining: null (uncapped).
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
    sub.subscribe("purchasedCameras:update", (err) => {
      if (err) logger.error(`Failed to subscribe purchasedCameras:update: ${err.message}`);
    });
    sub.on("message", async (_channel, message) => {
      try {
        const { adminId, userId } = JSON.parse(message);
        if (!adminId) return;
        // Recompute the full snapshot so `remaining` reflects current state, and
        // emit the SAME shape as the on-connect snapshot (one frontend listener
        // handles both). Channel keyed by adminId so clients filter to their own.
        const snapshot = await getCameraLimitSnapshot({ adminId, userId });
        io.emit(`purchasedCameras_${adminId}`, snapshot);
      } catch (e) {
        logger.error(`purchasedCameras message handling error: ${e.message}`);
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
