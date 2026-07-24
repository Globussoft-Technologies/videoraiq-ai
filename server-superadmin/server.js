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

// A stray rejected promise from a single request (e.g. a Mongoose CastError on
// a bad _id) must NOT take down the whole server — that 502s every other
// in-flight request. Log it and keep serving. Fix the offending code separately.
process.on("unhandledRejection", (err) => {
  logger.error(`Unhandled Rejection: ${err?.stack || err?.message || err}`);
});

// An uncaught exception can leave the process in a corrupt state, so we still
// exit and let the process manager (PM2/nodemon) restart cleanly.
process.on("uncaughtException", (err) => {
  logger.error(`Uncaught Exception: ${err?.stack || err?.message || err}`);
  process.exit(1);
});

startServer();
