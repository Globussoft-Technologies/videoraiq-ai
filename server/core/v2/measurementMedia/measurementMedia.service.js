import { createHash } from "crypto";
import path from "path";
import mongoose from "mongoose";
import mime from "mime-types";
import logger from "../../../utils/logger.js";
import MeasurementIncident from "../measurementIncidents/measurementIncidents.model.js";
import MeasurementCapture from "../measurements/measurementCapture.model.js";
import {
  deleteMediaV2,
  mediaExistsV2,
  putMediaV2,
  streamMediaV2,
} from "../adminStorage/mediaStorage.v2.js";
import MeasurementMedia from "./measurementMedia.model.js";
import {
  deleteMeasurementFallback,
  getMeasurementFallback,
  measurementFallbackExists,
  measurementMinioEnabled,
  putMeasurementFallback,
  streamMeasurementFallback,
} from "./measurementMinio.js";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const RETRY_INTERVAL_MS = Math.max(5_000, Number(process.env.MEASUREMENT_MEDIA_RETRY_INTERVAL_MS) || 60_000);
const LOCK_MS = Math.max(30_000, Number(process.env.MEASUREMENT_MEDIA_LOCK_MS) || 120_000);
const IMAGE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".jpe", ".jfif", ".png", ".gif", ".webp", ".bmp", ".tiff", ".tif",
  ".avif", ".heic", ".heif",
]);

let workerTimer;
let workerRunning = false;

function clean(value) {
  return String(value || "").trim();
}

function safeSegment(value) {
  return clean(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "file";
}

function stablePath(assetId) {
  return `/api/v2/measurement-media/${assetId}`;
}

function assetIdFor(idempotencyKey) {
  return createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 32);
}

function retryDelay(attempts) {
  return Math.min(30 * 60_000, 15_000 * (2 ** Math.min(Math.max(attempts, 0), 7)));
}

function responseData(asset) {
  return {
    originalName: asset.originalName,
    remotePath: asset.cloudPath || asset.stablePath,
    assetId: asset.assetId,
    syncStatus: asset.cloudPath ? "completed" : "pending",
  };
}

async function findIncident({ incidentId, sku, stationId }) {
  if (incidentId && mongoose.isValidObjectId(incidentId)) {
    const byId = await MeasurementIncident.findById(incidentId).lean();
    if (byId) return byId;
  }
  const normalizedSku = clean(sku).toUpperCase();
  if (!normalizedSku) return null;
  const filter = { qrSku: normalizedSku, status: "pending" };
  const normalizedStation = clean(stationId).toLowerCase();
  if (normalizedStation) filter.stationId = normalizedStation;
  return MeasurementIncident.findOne(filter).sort({ createdAt: -1 }).lean();
}

async function uploadToConfiguredProvider(asset, buffer) {
  const cloudPath = await putMediaV2({
    adminId: asset.adminId || undefined,
    buffer,
    mediaType: "image",
    folderName: asset.folderName,
    originalName: asset.originalName,
    objectId: asset.assetId,
  });
  if (!(await mediaExistsV2(cloudPath))) {
    throw new Error("Uploaded measurement image could not be verified in configured storage");
  }
  return cloudPath;
}

async function replaceIncidentReferences(asset) {
  if (!asset.cloudPath) return;
  if (asset.source !== "qr-capture") {
    const filter = asset.incidentId
      ? { _id: asset.incidentId, measurementImage: asset.stablePath }
      : { measurementImage: asset.stablePath };
    const result = await MeasurementIncident.updateMany(filter, {
      $set: { measurementImage: asset.cloudPath },
    });
    if (result.modifiedCount) {
      logger.info(
        `[MEASUREMENT_MEDIA] Replaced ${result.modifiedCount} incident media reference(s) asset=${asset.assetId}`,
      );
    }
  }

  if (asset.source === "qr-capture") {
    const captureResult = await MeasurementCapture.updateMany(
      {
        ...(asset.sourceReference ? { filename: asset.sourceReference } : {}),
        storagePath: asset.stablePath,
      },
      { $set: { storagePath: asset.cloudPath } },
    );
    if (captureResult.modifiedCount) {
      logger.info(
        `[MEASUREMENT_MEDIA] Replaced ${captureResult.modifiedCount} QR capture reference(s) asset=${asset.assetId}`,
      );
    }
  }
}

async function syncAsset(asset) {
  let current = asset;
  if (!current.cloudPath) {
    if (!current.localKey || !(await measurementFallbackExists(current.localKey))) {
      throw new Error("Pending measurement image is missing from local MinIO");
    }
    const buffer = await getMeasurementFallback(current.localKey);
    const cloudPath = await uploadToConfiguredProvider(current, buffer);
    current = await MeasurementMedia.findOneAndUpdate(
      { _id: current._id },
      { $set: { cloudPath, status: "cloud_synced", lastError: null, syncedAt: new Date() } },
      { new: true },
    ).lean();
  }

  // Replace incidents that already carry the temporary path. A late DS
  // callback is handled by resolveMeasurementMediaReference below.
  await replaceIncidentReferences(current);

  if (current.localKey && !current.localDeletedAt) {
    await deleteMeasurementFallback(current.localKey);
  }
  await MeasurementMedia.updateOne(
    { _id: current._id },
    {
      $set: {
        status: "completed",
        localDeletedAt: current.localDeletedAt || new Date(),
        lockUntil: null,
        nextRetryAt: null,
        lastError: null,
      },
    },
  );
  logger.info(`[MEASUREMENT_MEDIA] Fallback synchronized asset=${current.assetId} cloudPath=${current.cloudPath}`);
}

async function claimNextAsset() {
  const now = new Date();
  return MeasurementMedia.findOneAndUpdate(
    {
      localKey: { $ne: null },
      status: { $in: ["pending", "failed", "syncing", "cloud_synced"] },
      $and: [
        { $or: [{ nextRetryAt: null }, { nextRetryAt: { $lte: now } }] },
        { $or: [{ lockUntil: null }, { lockUntil: { $lte: now } }] },
      ],
    },
    {
      $set: { status: "syncing", lockUntil: new Date(Date.now() + LOCK_MS) },
      $inc: { attempts: 1 },
    },
    { new: true, sort: { createdAt: 1 } },
  ).lean();
}

export async function runMeasurementMediaRetryOnce() {
  if (workerRunning || !measurementMinioEnabled()) return;
  workerRunning = true;
  try {
    for (let processed = 0; processed < 25; processed += 1) {
      const asset = await claimNextAsset();
      if (!asset) break;
      try {
        await syncAsset(asset);
      } catch (error) {
        const attempts = Number(asset.attempts || 1);
        await MeasurementMedia.updateOne(
          { _id: asset._id },
          {
            $set: {
              status: "failed",
              lockUntil: null,
              nextRetryAt: new Date(Date.now() + retryDelay(attempts)),
              lastError: clean(error.message).slice(0, 2000),
            },
          },
        ).catch(() => {});
        logger.warn(
          `[MEASUREMENT_MEDIA] Retry failed asset=${asset.assetId} attempt=${attempts}: ${error.message}`,
        );
      }
    }
  } finally {
    workerRunning = false;
  }
}

export function startMeasurementMediaRetryWorker() {
  if (workerTimer || !measurementMinioEnabled()) {
    if (!measurementMinioEnabled()) {
      logger.info("[MEASUREMENT_MEDIA] MinIO fallback is disabled; retry worker not started");
    }
    return;
  }
  const run = () => runMeasurementMediaRetryOnce().catch((error) => {
    logger.error(`[MEASUREMENT_MEDIA] Retry worker failed: ${error.message}`);
  });
  setTimeout(run, 5_000).unref();
  workerTimer = setInterval(run, RETRY_INTERVAL_MS);
  workerTimer.unref();
  logger.info(`[MEASUREMENT_MEDIA] Retry worker started intervalMs=${RETRY_INTERVAL_MS}`);
}

export async function resolveMeasurementMediaReference(value) {
  const source = typeof value === "string"
    ? clean(value)
    : clean(value?.url || value?.storagePath);
  const match = source.match(/\/api\/v2\/measurement-media\/([a-f\d]{32})(?:[/?#]|$)/i);
  if (!match) return source || null;
  const asset = await MeasurementMedia.findOne({ assetId: match[1].toLowerCase() })
    .select("cloudPath stablePath")
    .lean();
  return asset?.cloudPath || asset?.stablePath || source;
}

export async function storeMeasurementMediaBuffer({
  buffer,
  originalName,
  contentType,
  folderName,
  adminId,
  incidentId,
  stationId,
  sku,
  idempotencyKey: suppliedKey,
  source = "measurement-result",
  sourceReference,
}) {
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const owner = clean(adminId || "system");
  const identityKey = clean(suppliedKey)
    || [owner, incidentId || sourceReference || "unlinked", folderName, checksum].join(":");
  const idempotencyKey = createHash("sha256").update(identityKey).digest("hex");
  const assetId = assetIdFor(idempotencyKey);
  const localKey = `measurement-fallback/${assetId}/${safeSegment(originalName)}`;

  let asset = await MeasurementMedia.findOneAndUpdate(
    { idempotencyKey },
    {
      $setOnInsert: {
        assetId,
        idempotencyKey,
        adminId: adminId || null,
        incidentId: incidentId || null,
        source,
        sourceReference: sourceReference || null,
        stationId: clean(stationId).toLowerCase() || null,
        sku: clean(sku).toUpperCase() || null,
        originalName,
        contentType,
        bytes: buffer.length,
        checksum,
        folderName,
        stablePath: stablePath(assetId),
        status: "uploading",
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();

  if (asset.checksum !== checksum) {
    const error = new Error("Idempotency key was already used for another image");
    error.statusCode = 409;
    throw error;
  }
  if (asset.cloudPath) return asset;
  if (asset.localKey && ["pending", "syncing", "cloud_synced"].includes(asset.status)) return asset;

  try {
    const cloudPath = await uploadToConfiguredProvider(asset, buffer);
    asset = await MeasurementMedia.findOneAndUpdate(
      { _id: asset._id },
      {
        $set: {
          cloudPath,
          status: "completed",
          syncedAt: new Date(),
          lastError: null,
          nextRetryAt: null,
        },
      },
      { new: true },
    ).lean();
    logger.info(`[MEASUREMENT_MEDIA] Uploaded directly asset=${asset.assetId} source=${source} cloudPath=${cloudPath}`);
  } catch (cloudError) {
    if (!measurementMinioEnabled()) throw cloudError;
    await putMeasurementFallback({ key: localKey, buffer, contentType });
    asset = await MeasurementMedia.findOneAndUpdate(
      { _id: asset._id },
      {
        $set: {
          localKey,
          status: "pending",
          nextRetryAt: new Date(Date.now() + retryDelay(0)),
          lastError: clean(cloudError.message).slice(0, 2000),
        },
      },
      { new: true },
    ).lean();
    logger.warn(
      `[MEASUREMENT_MEDIA] Cloud upload failed; saved to local MinIO asset=${asset.assetId} source=${source}: ${cloudError.message}`,
    );
  }
  return asset;
}

function assetIdFromReference(value) {
  return clean(value).match(/\/api\/v2\/measurement-media\/([a-f\d]{32})(?:[/?#]|$)/i)?.[1]?.toLowerCase() || null;
}

export async function streamMeasurementMediaReference(reference, res) {
  const assetId = assetIdFromReference(reference);
  if (!assetId) return false;
  const asset = await MeasurementMedia.findOne({ assetId }).lean();
  if (!asset) {
    const error = new Error("Measurement image not found");
    error.statusCode = 404;
    throw error;
  }
  if (asset.cloudPath) {
    try {
      await streamMediaV2(asset.cloudPath, res);
      return true;
    } catch (error) {
      if (!asset.localKey || res.headersSent) throw error;
    }
  }
  if (asset.localKey) {
    await streamMeasurementFallback(asset.localKey, res);
    return true;
  }
  const error = new Error("Measurement image not found");
  error.statusCode = 404;
  throw error;
}

export async function deleteMeasurementMediaReference({ reference, sourceReference }) {
  const assetId = assetIdFromReference(reference);
  const clauses = [];
  if (assetId) clauses.push({ assetId });
  if (clean(reference)) clauses.push({ cloudPath: clean(reference) });
  if (clean(sourceReference)) clauses.push({ sourceReference: clean(sourceReference) });
  if (!clauses.length) return false;
  const asset = await MeasurementMedia.findOne({ $or: clauses }).lean();
  if (!asset) return false;
  if (asset.localKey) await deleteMeasurementFallback(asset.localKey).catch(() => {});
  if (asset.cloudPath) await deleteMediaV2(asset.cloudPath).catch(() => {});
  await MeasurementMedia.deleteOne({ _id: asset._id });
  return true;
}

class MeasurementMediaService {
  async upload(req, res) {
    const file = req.file;
    const mediaType = clean(req.query.mediaType).toLowerCase();
    const folderName = clean(req.query.folderName);
    if (mediaType !== "image") {
      return res.status(400).json({ status: "failed", message: 'mediaType must be "image".' });
    }
    if (!folderName) {
      return res.status(400).json({ status: "failed", message: "folderName is required." });
    }
    if (!file?.buffer?.length) {
      return res.status(400).json({ status: "failed", message: "No file uploaded." });
    }
    if (file.buffer.length > MAX_IMAGE_BYTES) {
      return res.status(413).json({ status: "failed", message: "Measurement image exceeds the 20 MB limit." });
    }
    const extension = path.extname(file.originalname).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) {
      return res.status(400).json({ status: "failed", message: "Invalid measurement image format." });
    }

    try {
      const incident = await findIncident({
        incidentId: req.query.incidentId,
        sku: req.query.sku,
        stationId: req.query.stationId,
      });
      const suppliedKey = clean(req.get("x-idempotency-key") || req.query.idempotencyKey);
      const contentType = file.mimetype || mime.lookup(file.originalname) || "application/octet-stream";
      const asset = await storeMeasurementMediaBuffer({
        buffer: file.buffer,
        originalName: file.originalname,
        contentType,
        folderName,
        adminId: incident?.adminId || req.verified?.userData?.adminId || null,
        incidentId: incident?._id || null,
        stationId: req.query.stationId || incident?.stationId,
        sku: req.query.sku || incident?.qrSku,
        idempotencyKey: suppliedKey,
      });

      return res.status(200).json({
        status: "success",
        message: "image uploaded successfully.",
        data: responseData(asset),
      });
    } catch (error) {
      logger.error(`[MEASUREMENT_MEDIA] Upload failed: ${error.message}`);
      return res.status(error.statusCode || 503).json({
        status: "failed",
        message: error.statusCode === 409
          ? "Idempotency key was already used for another image."
          : "Measurement image could not be stored. Please retry.",
      });
    }
  }

  async fetch(req, res) {
    const assetId = clean(req.params.assetId).toLowerCase();
    if (!/^[a-f\d]{32}$/.test(assetId)) {
      return res.status(400).json({ status: "failed", message: "Invalid measurement media id." });
    }
    try {
      const asset = await MeasurementMedia.findOne({ assetId }).lean();
      if (!asset) return res.status(404).json({ status: "failed", message: "Measurement image not found." });
      res.setHeader("Content-Type", asset.contentType || "application/octet-stream");
      res.setHeader("Content-Disposition", `inline; filename="${safeSegment(asset.originalName)}"`);
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      await streamMeasurementMediaReference(asset.stablePath, res);
      return;
    } catch (error) {
      if (!res.headersSent) {
        return res.status(error?.$metadata?.httpStatusCode === 404 ? 404 : 500).json({
          status: "failed",
          message: "Failed to fetch measurement image.",
        });
      }
    }
  }
}

export { MAX_IMAGE_BYTES, stablePath };
export default new MeasurementMediaService();
