import express from "express";
import http from "http";
import morgan from "morgan";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import rateLimit from "express-rate-limit";
import mongoSanitize from "express-mongo-sanitize";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import bodyParser from "body-parser";
import config from "config";

import { xss } from "express-xss-sanitizer";
import globalErrorHandler from "./middlewares/errorMiddleware.js";
import routes from "./routes/index.js";
import { connectDB } from "./utils/database.js";
import logger from "./utils/logger.js";
import { auth, swaggerAuthLogger } from "./views/swaggerAuth.js";
import { initSocket } from "./socket.js"; // <-- Socket.io setup
import { mustRunInsideContainer } from "./scripts/check.js";

if (process.env.T === "D") mustRunInsideContainer();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const swaggerFile = JSON.parse(
  fs.readFileSync("./views/swagger-api-view.json", "utf-8")
);

const app = express();
const PORT = config.get("port");

// ------------------------
// 🔧 MIDDLEWARE SETUP
// ------------------------

if (process.env.NODE_ENV === "localDev") {
  app.use(morgan("dev"));
}

app.use(helmet());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cookieParser());
app.use(mongoSanitize());
app.use(
  xss({
    allowedKeys: ["password", "confirmPassword", "secretAccessKey", "oldPassword", "newPassword", "login", "pass"],
  })
);
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);
app.options("*", cors());
app.use(bodyParser.text({ type: "application/xml" }));
app.set("trust proxy", 1);

// if (process.env.NODE_ENV === "production") {
//   const limiter = rateLimit({
//     max: 500,
//     windowMs: 60 * 60 * 1000,
//     message: "Too many requests from this IP, please try again in an hour!",
//   });
//   app.use("/api", limiter);
// }

app.use(compression());
app.use(express.static(path.join(__dirname, "public")));

// ------------------------
// 📦 API ROUTES
// ------------------------

app.get("/", (_req, res) => {
  res.send("Welcome to the API");
});
app.use("/api", routes);

app.use(
  "/api-doc",
  auth,
  swaggerAuthLogger,
  swaggerUi.serve,
  swaggerUi.setup(swaggerFile)
);

// ------------------------
// 🧯 GLOBAL ERROR HANDLER
// ------------------------

app.use(globalErrorHandler);

// ------------------------
// 🚀 START SERVER
// ------------------------

const startServer = async () => {
  try {
    await connectDB();

    const server = http.createServer(app); // 👈 Create HTTP server
    initSocket(server); // 👈 Initialize Socket.IO with HTTP server

    server.listen(PORT, () => {
      logger.info(
        `🚀 Server with Socket.IO running on port ${PORT} in ${process.env.NODE_ENV} mode`
      );
    });
  } catch (error) {
    logger.error(`❗ Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

// ------------------------
// 🔥 GLOBAL ERROR EVENTS
// ------------------------

process.on("unhandledRejection", (err) => {
  logger.error(`Unhandled Rejection: ${err.message}`);
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  process.exit(1);
});

startServer();
