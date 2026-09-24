import path from "path";
import { createHash } from "crypto";
import MeasurementCapture from "./measurementCapture.model.js";
import {
  deleteMediaV2 as deleteMedia,
  streamMediaV2 as streamMedia,
} from "../adminStorage/mediaStorage.v2.js";
import logger from "../../../utils/logger.js";
import {
  deleteMeasurementMediaReference,
  storeMeasurementMediaBuffer,
  streamMeasurementMediaReference,
} from "../measurementMedia/measurementMedia.service.js";

const MAX_CAPTURE_BYTES = 15 * 1024 * 1024;
const MEASUREMENT_DIAGNOSTIC_EVENTS = new Set([
  "request",
  "success",
  "timeout",
  "unreachable",
  "service-error",
]);

function safeLogValue(value, maxLength = 300) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeFilenamePart(value) {
  return String(value || "unknown")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function isJpeg(buffer) {
  return Buffer.isBuffer(buffer) &&
    buffer.length >= 4 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[buffer.length - 2] === 0xff &&
    buffer[buffer.length - 1] === 0xd9;
}

function capturePath(filename) {
  return `/api/v2/measurements/captures/${encodeURIComponent(filename)}`;
}

function captureUrl(req, filename) {
  const forwardedProto = String(req.get("x-forwarded-proto") || "").split(",")[0].trim();
  const protocol = forwardedProto || req.protocol;
  return `${protocol}://${req.get("host")}${capturePath(filename)}`;
}

class MeasurementsService {
  async createDiagnostic(req, res) {
    const stationId = String(req.stationToken?.stationId || "").trim().toLowerCase();
    const event = safeLogValue(req.body?.event, 40).toLowerCase();
    if (!MEASUREMENT_DIAGNOSTIC_EVENTS.has(event)) {
      return res.status(400).json({ ok: false, message: "Invalid measurement diagnostic event" });
    }

    const endpoint = safeLogValue(req.body?.endpoint);
    const sku = safeLogValue(req.body?.sku, 100).toUpperCase();
    const rawStatus = req.body?.status;
    const rawDurationMs = req.body?.durationMs;
    const status = rawStatus !== null && rawStatus !== undefined && rawStatus !== ""
      && Number.isInteger(Number(rawStatus)) ? Number(rawStatus) : null;
    const durationMs = rawDurationMs !== null && rawDurationMs !== undefined && rawDurationMs !== ""
      && Number.isFinite(Number(rawDurationMs))
      ? Math.max(0, Math.round(Number(rawDurationMs)))
      : null;
    const message = safeLogValue(req.body?.message);
    const dimensions = req.body?.dimensions && typeof req.body.dimensions === "object"
      ? {
          length: Number(req.body.dimensions.length) || null,
          width: Number(req.body.dimensions.width) || null,
          height: Number(req.body.dimensions.height) || null,
        }
      : null;
    const details = [
      `event=${event}`,
      `station=${safeLogValue(stationId, 100)}`,
      `endpoint=${endpoint || "unknown"}`,
      `sku=${sku || "unknown"}`,
      dimensions ? `dimensions=${dimensions.length}x${dimensions.width}x${dimensions.height}` : "",
      status !== null ? `status=${status}` : "",
      durationMs !== null ? `durationMs=${durationMs}` : "",
      message ? `message=${message}` : "",
    ].filter(Boolean).join(" ");

    if (["timeout", "unreachable", "service-error"].includes(event)) {
      logger.warn(`[MEASUREMENT_DS] ${details}`);
    } else {
      logger.info(`[MEASUREMENT_DS] ${details}`);
    }
    return res.status(202).json({ ok: true });
  }

  async createCapture(req, res) {
    const cameraId = String(req.get("x-camera-id") || "").trim();
    const stationId = String(req.get("x-station-id") || "").trim().toLowerCase();
    const captureTrigger = String(req.get("x-capture-trigger") || "").trim().toLowerCase();
    const capturedAtHeader = String(req.get("x-captured-at") || "").trim();
    const tokenStationId = String(req.stationToken?.stationId || "").trim().toLowerCase();
    const contentType = String(req.get("content-type") || "").split(";", 1)[0].toLowerCase();

    if (!cameraId || !stationId || !captureTrigger || !capturedAtHeader) {
      return res.status(400).json({ ok: false, message: "Missing required capture headers" });
    }
    if (stationId !== tokenStationId) {
      return res.status(403).json({ ok: false, message: "X-Station-Id does not match the station token" });
    }
    if (captureTrigger !== "start") {
      return res.status(400).json({ ok: false, message: "X-Capture-Trigger must be start" });
    }
    if (contentType !== "image/jpeg") {
      return res.status(415).json({ ok: false, message: "Content-Type must be image/jpeg" });
    }

    const isoTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
    const capturedAt = new Date(capturedAtHeader);
    if (!isoTimestamp.test(capturedAtHeader) || Number.isNaN(capturedAt.getTime())) {
      return res.status(400).json({ ok: false, message: "X-Captured-At must be an ISO timestamp" });
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ ok: false, message: "JPEG body is required" });
    }
    if (req.body.length > MAX_CAPTURE_BYTES) {
      return res.status(413).json({ ok: false, message: "JPEG exceeds the 15 MB limit" });
    }
    if (!isJpeg(req.body)) {
      return res.status(400).json({ ok: false, message: "Invalid JPEG framing" });
    }

    let storagePath = "";
    let filename = "";
    try {
      const captureIdentity = createHash("sha256")
        .update(stationId)
        .update("\0")
        .update(cameraId)
        .update("\0")
        .update(capturedAt.toISOString())
        .update("\0")
        .update(req.body)
        .digest("hex");
      filename = [
        capturedAt.getTime(),
        safeFilenamePart(stationId),
        safeFilenamePart(cameraId),
        captureIdentity.slice(0, 16),
      ].join("_") + ".jpg";
      const asset = await storeMeasurementMediaBuffer({
        adminId: req.stationDevice?.admin,
        buffer: req.body,
        folderName: "measurement-captures",
        originalName: filename,
        contentType: "image/jpeg",
        stationId,
        idempotencyKey: `qr-capture:${captureIdentity}`,
        source: "qr-capture",
        sourceReference: filename,
      });
      storagePath = asset.cloudPath || asset.stablePath;

      await MeasurementCapture.findOneAndUpdate(
        { filename },
        {
          $setOnInsert: {
            filename,
            storagePath,
            stationId,
            cameraId,
            captureTrigger,
            capturedAt,
            bytes: req.body.length,
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );

      logger.info(
        `[MEASUREMENT_CAPTURE] Upload stored filename=${filename} station=${stationId} camera=${cameraId} bytes=${req.body.length} storagePath=${storagePath}`,
      );

      return res.status(201).json({
        ok: true,
        filename,
        bytes: req.body.length,
        path: capturePath(filename),
        url: captureUrl(req, filename),
        captured_at: capturedAt.toISOString(),
      });
    } catch (error) {
      if (storagePath) {
        const handled = await deleteMeasurementMediaReference({
          reference: storagePath,
          sourceReference: filename,
        }).catch(() => false);
        if (!handled) await deleteMedia(storagePath).catch(() => {});
      }
      logger.error(`[MEASUREMENT_CAPTURE] Upload failed station=${stationId} camera=${cameraId}: ${error.message}`);
      return res.status(500).json({ ok: false, message: "Failed to store measurement capture" });
    }
  }

  async deleteCapture(req, res) {
    const filename = path.basename(String(req.params.filename || ""));
    const stationId = String(req.stationToken?.stationId || "").trim().toLowerCase();
    if (!filename || filename !== req.params.filename) {
      return res.status(400).json({ ok: false, message: "Invalid capture filename" });
    }

    try {
      const capture = await MeasurementCapture.findOne({ filename, stationId }).lean();
      if (!capture) return res.status(404).json({ ok: false, message: "Capture not found" });
      const handled = await deleteMeasurementMediaReference({
        reference: capture.storagePath,
        sourceReference: capture.filename,
      });
      if (!handled) await deleteMedia(capture.storagePath);
      await MeasurementCapture.deleteOne({ _id: capture._id });
      logger.info(
        `[MEASUREMENT_CAPTURE] Upload deleted filename=${filename} station=${stationId} storagePath=${capture.storagePath}`,
      );
      return res.status(200).json({ ok: true, filename });
    } catch {
      return res.status(500).json({ ok: false, message: "Failed to delete measurement capture" });
    }
  }

  async fetchCapture(req, res) {
    const filename = path.basename(String(req.params.filename || ""));
    if (!filename || filename !== req.params.filename) {
      return res.status(400).json({ ok: false, message: "Invalid capture filename" });
    }

    try {
      const capture = await MeasurementCapture.findOne({ filename }).lean();
      if (!capture) return res.status(404).json({ ok: false, message: "Capture not found" });
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Content-Disposition", `inline; filename="${capture.filename}"`);
      // The station UI and API use different ports (for example 5173 and
      // 5055). Helmet defaults this header to same-origin, which lets the
      // image open directly but prevents an <img> on the UI from embedding it.
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      const handled = await streamMeasurementMediaReference(capture.storagePath, res);
      if (!handled) await streamMedia(capture.storagePath, res);
    } catch (error) {
      if (!res.headersSent) {
        return res.status(error.statusCode || 500).json({
          ok: false,
          message: error.statusCode === 404 ? "Capture not found" : "Failed to fetch capture",
        });
      }
    }
  }
}

export { MAX_CAPTURE_BYTES, capturePath, captureUrl, isJpeg, safeFilenamePart };
export default new MeasurementsService();
