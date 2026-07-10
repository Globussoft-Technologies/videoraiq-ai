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

// export const sendPayloadToUser = async (userId, channel, payload) => {
//   try {
//     const socketId = await redis.get(`socket:${userId}`);
    
//     if (!socketId) {
//       logger.warn(`No active socket found for user ${userId}`);
//       return;
//     }
    
//     const io = getIO();
//     const socket = io.sockets.sockets.get(socketId);
//     if (!socket) {
//       logger.warn(`Socket ID ${socketId} not found in active connections for user ${userId}`);
//       return;
//     }
    
//     socket.emit(channel, payload);
//     logger.info(`Payload sent to user ${userId} via socket ${socketId}`);
//   } catch (error) {
//     console.log(error,'error');
//     logger.error(`Error sending payload to user ${userId}: ${error.message}`);
//   }
// };
export const sendPayloadToUser = async (userId, channel, payload) => {
  try {
    const io = getIO();

    io.emit(channel, payload); // broadcast to all connected clients

    logger.info(`Broadcasted payload on channel '${channel}'`);
  } catch (error) {
    logger.error(`Error broadcasting payload on channel '${channel}': ${error.message}`);
  }
};
