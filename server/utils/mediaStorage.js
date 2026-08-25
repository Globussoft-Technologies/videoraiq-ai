/**
 * Media storage abstraction for the Uploads APIs.
 *
 * Lets the deployment store media on either the NAS (over SFTP, the existing
 * behaviour) or Oracle Cloud Infrastructure (OCI) Object Storage, switchable
 * via a single global config flag `MediaStorage.provider` ("nas" | "oracle")
 * — or the MEDIA_STORAGE_PROVIDER env var.
 *
 * Oracle is accessed through its S3-compatible API using the already-present
 * @aws-sdk/client-s3 and an OCI "Customer Secret Key" (Access Key + Secret
 * Key). The S3-compat endpoint is `https://<namespace>.compat.objectstorage.
 * <region>.oraclecloud.com` and path-style addressing is required.
 *
 * Reads are routed deterministically by a marker: every Oracle object key is
 * stored with a leading `oracle/` segment. Anything else is treated as a NAS
 * path, so all pre-existing NAS media keeps working unchanged after a switch.
 *
 * The S3 client is created lazily and cached, and only when the Oracle backend
 * is actually used, so NAS-only deployments need no Oracle config.
 */
import path from "path";
import stream from "stream";
import { randomUUID } from "crypto";
import { pipeline } from "stream/promises";
import config from "config";
import mime from "mime-types";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import logger from "./logger.js";
import { withSFTPConnection } from "./newSFTPConnectionCheck.js";

// Objects written to Oracle are keyed under this prefix; it doubles as the
// routing marker for reads/deletes.
export const ORACLE_PREFIX = "oracle/";

function getMediaConfig() {
  try {
    if (config.has("MediaStorage")) return config.get("MediaStorage") || {};
  } catch {
    /* config key absent — fall through to defaults */
  }
  return {};
}

/** Active backend for new uploads: "oracle" or "nas" (default). */
export function getActiveProvider() {
  const fromEnv = process.env.MEDIA_STORAGE_PROVIDER;
  const fromCfg = getMediaConfig().provider;
  const provider = String(fromEnv || fromCfg || "nas").toLowerCase();
  return provider === "oracle" ? "oracle" : "nas";
}

/** Strip leading slashes and collapse consecutive slashes so paths compare cleanly. */
function normalizeKey(mediaPath) {
  return String(mediaPath)
    .replace(/^\/+/, "") // Remove leading slashes
    .replace(/\/+/g, "/"); // Collapse consecutive slashes to single slash
}

/** True when a stored path points at Oracle Object Storage. */
export function isOraclePath(mediaPath) {
  return normalizeKey(mediaPath).startsWith(ORACLE_PREFIX);
}

function contentTypeFor(name) {
  return mime.lookup(name) || "application/octet-stream";
}

/** Collapse path separators / traversal out of a single path segment. */
function sanitizeSegment(seg) {
  const cleaned = String(seg ?? "")
    .replace(/[/\\]/g, "_")
    .replace(/\.\.+/g, "_")
    .trim();
  return cleaned || "default";
}

// Canonical shape produced by putMedia — used to constrain reads/deletes so a
// caller can't address arbitrary keys in the bucket via the mediaPath param.
// Matches both oracle/ prefixed and non-prefixed paths for backward compatibility
const ORACLE_KEY_RE = /^(?:oracle\/)?uploads\/(?:image|video)s\/[^/]+\/[^/]+$/;

/** Validate + normalize an Oracle object key, rejecting out-of-namespace keys. */
function oracleKeyFor(mediaPath) {
  const key = normalizeKey(mediaPath);
  if (!ORACLE_KEY_RE.test(key)) {
    const err = new Error("Invalid media path.");
    err.statusCode = 400;
    throw err;
  }
  return key;
}

// ---- Oracle (OCI Object Storage, S3-compatible API) lazy client -----------

let _oracle = null;

/** Resolve Oracle settings from config (`MediaStorage.oracle`) or OCI_* env. */
function resolveOracleConfig() {
  const cfg = getMediaConfig().oracle || {};
  const region = process.env.OCI_REGION || cfg.region;
  const namespace = process.env.OCI_NAMESPACE || cfg.namespace;
  const bucket = process.env.OCI_BUCKET || cfg.bucket;
  const accessKeyId = process.env.OCI_ACCESS_KEY_ID || cfg.accessKeyId;
  const secretAccessKey = process.env.OCI_SECRET_ACCESS_KEY || cfg.secretAccessKey;
  // S3-compat endpoint can be given explicitly or derived from namespace+region.
  const endpoint =
    process.env.OCI_ENDPOINT ||
    cfg.endpoint ||
    (namespace && region
      ? `https://${namespace}.compat.objectstorage.${region}.oraclecloud.com`
      : undefined);
  return { region, namespace, bucket, accessKeyId, secretAccessKey, endpoint };
}

function getOracle() {
  if (_oracle) return _oracle;

  const { region, bucket, accessKeyId, secretAccessKey, endpoint } =
    resolveOracleConfig();

  const missing = Object.entries({
    region, bucket, accessKeyId, secretAccessKey, endpoint,
  })
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new Error(
      `Oracle Object Storage is not fully configured. Missing: ${missing.join(", ")}.`
    );
  }

  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle: true, // required for the OCI S3-compatible endpoint
    credentials: { accessKeyId, secretAccessKey },
  });

  _oracle = { client, bucket };
  return _oracle;
}

// ---- Public operations -----------------------------------------------------

/**
 * Upload a media buffer to the active backend.
 * @returns {Promise<string>} the stored path (NAS remote path, or an
 *   `oracle/...` object key) to persist and use for later fetch/delete.
 */
export async function putMedia({ buffer, mediaType, folderName, originalName }) {
  // Sanitize caller-supplied path segments so they can't inject extra path
  // components / traversal into the object key or NAS path. A UUID keeps keys
  // collision-proof under same-millisecond concurrent uploads.
  const folder = sanitizeSegment(folderName);
  const leaf = `${Date.now()}-${randomUUID()}-${sanitizeSegment(path.basename(String(originalName ?? "")))}`;

  if (getActiveProvider() === "oracle") {
    const { client, bucket } = getOracle();
    // Store without oracle/ prefix to match existing images
    const objectName = `uploads/${mediaType}s/${folder}/${leaf}`;
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectName,
        Body: buffer,
        ContentLength: buffer.length,
        ContentType: contentTypeFor(leaf),
      })
    );
    // Return path without leading slash for consistency with existing images
    return `/${objectName}`;
  }

  // NAS over SFTP (existing behaviour).
  const mainPath = config.get("SFTP.Path");
  const remoteDir = `${mainPath}/uploads/${mediaType}s/${folder}`;
  const remotePath = `${remoteDir}/${leaf}`;
  await withSFTPConnection(async (sftp) => {
    await sftp.mkdir(remoteDir, true).catch(() => {});
    const bufferStream = new stream.PassThrough();
    bufferStream.end(buffer);
    await sftp.put(bufferStream, remotePath);
  });
  return remotePath;
}

/**
 * Stream a stored media file to an Express response. Headers are expected to be
 * set by the caller; this only pipes the bytes. Routes by the stored path.
 */
export async function streamMedia(mediaPath, res) {
  if (isOraclePath(mediaPath)) {
    const { client, bucket } = getOracle();
    const data = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: oracleKeyFor(mediaPath) })
    );
    // Forward the stored content metadata so the response is accurate.
    if (!res.headersSent && typeof res.setHeader === "function") {
      if (data.ContentType) res.setHeader("Content-Type", data.ContentType);
      if (data.ContentLength != null) {
        res.setHeader("Content-Length", String(data.ContentLength));
      }
    }
    await pipeline(data.Body, res);
    return;
  }

  // If provider is Oracle, try fetching from Oracle even without oracle/ prefix
  if (getActiveProvider() === "oracle") {
    try {
      const { client, bucket } = getOracle();
      const normalizedPath = normalizeKey(mediaPath);
      const data = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: normalizedPath })
      );
      // Forward the stored content metadata so the response is accurate.
      if (!res.headersSent && typeof res.setHeader === "function") {
        if (data.ContentType) res.setHeader("Content-Type", data.ContentType);
        if (data.ContentLength != null) {
          res.setHeader("Content-Length", String(data.ContentLength));
        }
      }
      await pipeline(data.Body, res);
      return;
    } catch (err) {
      // If not found in Oracle with this path, fall back to NAS
      const code = err?.$metadata?.httpStatusCode;
      if (!(err?.name === "NotFound" || err?.name === "NoSuchKey" || code === 404)) {
        throw err;
      }
    }
  }

  await withSFTPConnection(async (sftp) => {
    // Stat before streaming: the caller has already set image/* headers, so a
    // stream that dies on "No such file" would otherwise go out as a truncated
    // 200 "image" (Telegram reads that as "wrong type of the web page content").
    // A missing file must be a clean 404 instead.
    if (!(await sftp.exists(mediaPath))) {
      const err = new Error("File not found in storage.");
      err.statusCode = 404;
      throw err;
    }
    const sftpStream = await sftp.createReadStream(mediaPath);
    sftpStream.on("error", (err) => {
      logger.error("SFTP stream error:", err);
      if (!res.headersSent) {
        res.status(500).json({ status: "failed", message: "Error streaming file from SFTP." });
      }
    });
    await pipeline(sftpStream, res);
  });
}

/** Whether a stored media file exists on its backend. */
export async function mediaExists(mediaPath) {
  if (isOraclePath(mediaPath)) {
    const { client, bucket } = getOracle();
    try {
      await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: oracleKeyFor(mediaPath) })
      );
      return true;
    } catch (err) {
      // Only a genuine "not found" means the object is absent; surface auth /
      // network / config failures instead of masking them as a 404.
      const code = err?.$metadata?.httpStatusCode;
      if (err?.name === "NotFound" || err?.name === "NoSuchKey" || code === 404) {
        return false;
      }
      throw err;
    }
  }
  return await withSFTPConnection((sftp) => sftp.exists(mediaPath));
}

/** Delete a stored media file from its backend (routed by the stored path). */
export async function deleteMedia(mediaPath) {
  // New Oracle uploads and migrated NAS objects both use uploads/... keys.
  // The explicit oracle/ marker still takes precedence for older records;
  // otherwise route the legacy, non-prefixed path via the active provider.
  if (isOraclePath(mediaPath) || getActiveProvider() === "oracle") {
    const { client, bucket } = getOracle();
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: oracleKeyFor(mediaPath) })
    );
    return;
  }
  await withSFTPConnection((sftp) => sftp.delete(mediaPath));
}

/**
 * Stored media paths (e.g. authorizedUsers.profilePics) must always be
 * relative — the ImageView base is only ever prepended by a client at
 * display time. Some older records were saved with an already-absolute
 * ImageView URL (a display URL passed straight through as if it were a
 * storage path), which then gets double-prefixed by the client. Strip it
 * back to relative here so every API response is safe regardless of how a
 * given record was originally written.
 */
export function toRelativeMediaPath(value) {
  if (typeof value !== "string") return value;
  try {
    const imageBaseUrl = config.get("ImageView");
    return imageBaseUrl && value.startsWith(imageBaseUrl) ? value.slice(imageBaseUrl.length) : value;
  } catch {
    return value;
  }
}

/** Apply toRelativeMediaPath() across an array (e.g. profilePics), tolerating null/undefined. */
export function toRelativeMediaPaths(values) {
  return Array.isArray(values) ? values.map(toRelativeMediaPath) : values;
}
