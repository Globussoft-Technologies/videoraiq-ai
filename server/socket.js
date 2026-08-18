import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import config from "config";
import { redis } from "./utils/database.js"
import logger from "./utils/logger.js";
import { checkActivePlanSocket } from "./middlewares/checkActivePlan.js";

let io;

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

  

  // Handle socket connection
  io.on("connection", async (socket) => {
    // logger.info(`✅ Socket connected: ${socket.id}, user:`, socket.user);

    const userId = socket?.user?.user_id || "";

    if (userId) {
      // Store in Redis
      let ack = await redis.set(`socket:${userId}`, socket.id);
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
