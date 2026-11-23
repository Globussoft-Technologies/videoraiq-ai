import { createLogger, format, transports } from "winston";
import winston from "winston"
import DailyRotateFile from "winston-daily-rotate-file";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logDir = path.join(__dirname, "../logs");

const { combine, timestamp, printf, errors } = format;

const SPLAT = Symbol.for("splat");

// logger.error("prefix:", value) puts `value` here, not on `message` — winston
// only merges it in automatically for %s-style tokens. Format it explicitly so
// extra args (a plain object, a string) stop getting silently dropped from
// every "prefix:" + value log call across the codebase. An Error arg is
// skipped here — winston's own errors({stack:true}) already folds a lone
// Error argument into message/stack, so re-adding it would print it twice.
const formatExtra = (arg) => {
  if (typeof arg === "object" && arg !== null) {
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }
  return String(arg);
};

const logFormat = printf((info) => {
  const { level, message, timestamp, stack } = info;
  const extraArgs = info[SPLAT];
  const extra = Array.isArray(extraArgs) && extraArgs.length
    ? extraArgs
        .filter((arg) => !(arg instanceof Error))
        .map(formatExtra)
        .map((s) => " " + s)
        .join("")
    : "";
  return `${timestamp} ${level}: ${stack || message}${extra}`;
});

function reportLoggingError(error, transport) {
  console.error(`[FILE-LOG] ${transport?.filename || "logger"}:`, error);
}

function rotatingFile(options) {
  try {
    const transport = new DailyRotateFile(options);
    // The underlying rotator stream can emit filesystem errors directly.
    transport.logStream.on("error", error => reportLoggingError(error, transport));
    return [transport];
  } catch (error) {
    reportLoggingError(error, options);
    return [];
  }
}

const dailyRotateTransports = rotatingFile({
  dirname: logDir,
  filename: `%DATE%.log`,
  datePattern: "YYYY-MM-DD",
  zippedArchive: false,
  maxFiles: "15d", // keep logs for last 15 days
});

const logger = createLogger({
  level: process.env.NODE_ENV === "development" ? "debug" : "info",
  format: combine(
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    errors({ stack: true }),
    logFormat
  ),
  transports: [
    new transports.Console(),
    ...dailyRotateTransports
  ]
});
logger.on("error", reportLoggingError);

if (process.env.NODE_ENV !== "production") {
  logger.add(
    new transports.Console({
      format: format.simple(),
    })
  );
}

const nasFileTransports = [
  ...rotatingFile({
    filename: 'logs/nas-sucess/nas-success-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    level: 'info',
    maxFiles: '14d',
    zippedArchive: false
  }),
  ...rotatingFile({
    filename: 'logs/nas-err/nas-error-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    maxFiles: '30d',
    zippedArchive: false
  }),
];

export const nasLogger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: nasFileTransports.length ? nasFileTransports : [new transports.Console()],
});
nasLogger.on("error", reportLoggingError);

export default logger;
