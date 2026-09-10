import path from "path";
import { randomBytes } from "crypto";
import MeasurementCapture from "./measurementCapture.model.js";
import { deleteMedia, putMedia, streamMedia } from "../../../utils/mediaStorage.js";
import logger from "../../../utils/logger.js";

const MAX_CAPTURE_BYTES = 15 * 1024 * 1024;

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
    try {
      const filename = [
        Date.now(),
        safeFilenamePart(stationId),
        safeFilenamePart(cameraId),
        randomBytes(4).toString("hex"),
      ].join("_") + ".jpg";
      storagePath = await putMedia({
        buffer: req.body,
        mediaType: "image",
        folderName: "measurement-captures",
        originalName: filename,
      });

      await MeasurementCapture.create({
        filename,
        storagePath,
        stationId,
        cameraId,
        captureTrigger,
        capturedAt,
        bytes: req.body.length,
      });

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
    } catch {
      if (storagePath) await deleteMedia(storagePath).catch(() => {});
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
      await deleteMedia(capture.storagePath);
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
      await streamMedia(capture.storagePath, res);
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
