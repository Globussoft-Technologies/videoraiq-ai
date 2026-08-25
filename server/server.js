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

import sanitizeInput from "./middlewares/xssSanitizer.js";
import globalErrorHandler from "./middlewares/errorMiddleware.js";
import routes from "./routes/index.js";
import { connectDB } from "./utils/database.js";
import logger from "./utils/logger.js";
import { auth, swaggerAuthLogger } from "./views/swaggerAuth.js";
import { initSocket } from "./socket.js"; // <-- Socket.io setup
import { mustRunInsideContainer } from "./scripts/check.js";
import { prometheusMiddleware } from "./middlewares/prometheusMiddleware.js";
import { metricsHandler } from "./utils/prometheus.js";
import { scheduleRetentionSweep } from "./services/retention.service.js";
import { scheduleEmpExitSync } from "./services/empExitSync.service.js";
import DetectionSettingService from "./core/v1/detectionSettings/detectionSettings.service.js";
import AttendanceAutoEmailReportService from "./core/v2/attendanceAutoEmailReport/attendanceAutoEmailReport.service.js";

if (process.env.T === "D") mustRunInsideContainer();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const swaggerFile = JSON.parse(
  fs.readFileSync("./views/swagger-api-view.json", "utf-8")
);

const swaggerFileV2 = fs.existsSync("./views/swagger-api-v2-view.json")
  ? JSON.parse(fs.readFileSync("./views/swagger-api-v2-view.json", "utf-8"))
  : { info: { title: "v2 API — run npm run swagger:v2 to generate" }, paths: {} };

const app = express();
const PORT = config.get("port");

// ------------------------
// 🔧 MIDDLEWARE SETUP
// ------------------------

if (process.env.NODE_ENV === "localDev") {
  app.use(morgan("dev"));
}

app.use(helmet());
app.use(prometheusMiddleware);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cookieParser());
app.use(mongoSanitize());
app.use(sanitizeInput);
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

app.get("/metrics", metricsHandler);

app.use("/api", routes);

// Two Swagger docs on one server: swaggerUi.serve is shared/stateful, so the
// last setup() wins for BOTH mounts. Use serveFiles(spec) per router so each
// mount serves its own spec.
// v2 Swagger UI
const swaggerV2Router = express.Router();
swaggerV2Router.use(auth, swaggerAuthLogger);
swaggerV2Router.use("/", swaggerUi.serveFiles(swaggerFileV2));
swaggerV2Router.get("/", swaggerUi.setup(swaggerFileV2));
app.use("/api-doc/v2", swaggerV2Router);

// v1 Swagger UI
const swaggerV1Router = express.Router();
swaggerV1Router.use(auth, swaggerAuthLogger);
swaggerV1Router.use("/", swaggerUi.serveFiles(swaggerFile));
swaggerV1Router.get("/", swaggerUi.setup(swaggerFile));
app.use("/api-doc", swaggerV1Router);

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

    // Data-retention sweeper (no-op unless DataRetention.enabled). Never throws.
    scheduleRetentionSweep();
    // Suspends VideoRDB users whose EmpMonitor record shows they've exited. Never throws.
    scheduleEmpExitSync();
    DetectionSettingService.startDetectionScheduleRunner();
    AttendanceAutoEmailReportService.startRunner();
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
