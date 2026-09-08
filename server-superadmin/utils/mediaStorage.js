/**
 * Global media storage for NAS/SFTP, AWS S3, Google Cloud Storage, and
 * Oracle Object Storage.
 *
 * `MediaStorage.provider` (or MEDIA_STORAGE_PROVIDER) selects where new media
 * is written. Cloud paths include a provider prefix so reads and deletes keep
 * using the original backend after the active provider changes.
 *
 * AWS uses the native S3 API. GCP uses Cloud Storage's S3-compatible XML API
 * with HMAC credentials. Oracle uses OCI's S3-compatible API. All three reuse
 * the already-installed @aws-sdk/client-s3 package and are initialized lazily.
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

export const AWS_PREFIX = "aws/";
export const GCP_PREFIX = "gcp/";
export const ORACLE_PREFIX = "oracle/";

const OBJECT_PROVIDERS = new Set(["aws", "gcp", "oracle"]);
const PROVIDER_ALIASES = {
  nas: "nas",
  sftp: "nas",
  aws: "aws",
  s3: "aws",
  gcp: "gcp",
  gcs: "gcp",
  oracle: "oracle",
  oci: "oracle",
};

function getMediaConfig() {
  try {
    if (config.has("MediaStorage")) return config.get("MediaStorage") || {};
  } catch {
    // Missing optional config falls back to NAS.
  }
  return {};
}

/** Active backend for new uploads. Common aliases (s3/gcs/oci/sftp) work too. */
export function getActiveProvider() {
  const requested = String(
    process.env.MEDIA_STORAGE_PROVIDER || getMediaConfig().provider || "nas"
  ).trim().toLowerCase();
  const provider = PROVIDER_ALIASES[requested];
  if (!provider) {
    throw new Error(
      `Unsupported MediaStorage provider "${requested}". Use nas, aws, gcp, or oracle.`
    );
  }
  return provider;
}

function normalizeKey(mediaPath) {
  return String(mediaPath).replace(/^\/+/, "").replace(/\/+/g, "/");
}

export function isOraclePath(mediaPath) {
  return normalizeKey(mediaPath).startsWith(ORACLE_PREFIX);
}

function providerFromPath(mediaPath) {
  const provider = normalizeKey(mediaPath).split("/", 1)[0];
  return OBJECT_PROVIDERS.has(provider) ? provider : null;
}

function contentTypeFor(name) {
  return mime.lookup(name) || "application/octet-stream";
}

function sanitizeSegment(segment) {
  const cleaned = String(segment ?? "")
    .replace(/[/\\]/g, "_")
    .replace(/\.\.+/g, "_")
    .trim();
  return cleaned || "default";
}

// Cloud operations are restricted to keys created by putMedia. Unprefixed
// keys remain valid for media written by the original Oracle implementation.
const OBJECT_KEY_RE = /^(?:(?:aws|gcp|oracle)\/)?uploads\/(?:image|video|report)s\/[^/]+\/[^/]+$/;

function objectKeyFor(mediaPath) {
  const key = normalizeKey(mediaPath);
  if (!OBJECT_KEY_RE.test(key)) {
    const error = new Error("Invalid media path.");
    error.statusCode = 400;
    throw error;
  }
  return key;
}

const objectStores = new Map();

function assertConfigured(label, values) {
  const missing = Object.entries(values)
    .filter(([, value]) => value === undefined || value === null || value === "")
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(`${label} is not fully configured. Missing: ${missing.join(", ")}.`);
  }
}

function credentialsFor(
  label,
  accessKeyId,
  secretAccessKey,
  sessionToken,
  optional = false
) {
  if (optional && !accessKeyId && !secretAccessKey && !sessionToken) return undefined;
  assertConfigured(label, { accessKeyId, secretAccessKey });
  return {
    accessKeyId,
    secretAccessKey,
    ...(sessionToken ? { sessionToken } : {}),
  };
}

function booleanValue(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return value === true || String(value).toLowerCase() === "true";
}

function resolveObjectStore(provider) {
  const media = getMediaConfig();

  if (provider === "aws") {
    const cfg = media.aws || media.s3 || {};
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || cfg.region;
    const bucket = process.env.AWS_S3_BUCKET || cfg.bucket;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID || cfg.accessKeyId;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || cfg.secretAccessKey;
    const sessionToken = process.env.AWS_SESSION_TOKEN || cfg.sessionToken;
    const endpoint = process.env.AWS_S3_ENDPOINT || cfg.endpoint;
    const forcePathStyle = booleanValue(
      process.env.AWS_S3_FORCE_PATH_STYLE ?? cfg.forcePathStyle
    );
    const credentials = credentialsFor(
      "AWS S3 credentials",
      accessKeyId,
      secretAccessKey,
      sessionToken,
      true
    );

    assertConfigured("AWS S3", { region, bucket });
    return {
      bucket,
      clientOptions: {
        region,
        forcePathStyle,
        ...(endpoint ? { endpoint } : {}),
        ...(credentials ? { credentials } : {}),
      },
    };
  }

  if (provider === "gcp") {
    const cfg = media.gcp || media.gcs || {};
    const region = process.env.GCP_STORAGE_REGION || cfg.region || "auto";
    const bucket = process.env.GCP_STORAGE_BUCKET || cfg.bucket;
    const accessKeyId = process.env.GCP_HMAC_ACCESS_KEY_ID || cfg.accessKeyId;
    const secretAccessKey =
      process.env.GCP_HMAC_SECRET_ACCESS_KEY || cfg.secretAccessKey;
    const endpoint =
      process.env.GCP_STORAGE_ENDPOINT ||
      cfg.endpoint ||
      "https://storage.googleapis.com";

    assertConfigured("Google Cloud Storage", {
      bucket,
      accessKeyId,
      secretAccessKey,
      endpoint,
    });
    return {
      bucket,
      clientOptions: {
        region,
        endpoint,
        forcePathStyle: true,
        credentials: { accessKeyId, secretAccessKey },
      },
    };
  }

  const cfg = media.oracle || {};
  const region = process.env.OCI_REGION || cfg.region;
  const namespace = process.env.OCI_NAMESPACE || cfg.namespace;
  const bucket = process.env.OCI_BUCKET || cfg.bucket;
  const accessKeyId = process.env.OCI_ACCESS_KEY_ID || cfg.accessKeyId;
  const secretAccessKey = process.env.OCI_SECRET_ACCESS_KEY || cfg.secretAccessKey;
  const endpoint =
    process.env.OCI_ENDPOINT ||
    cfg.endpoint ||
    (namespace && region
      ? `https://${namespace}.compat.objectstorage.${region}.oraclecloud.com`
      : undefined);

  assertConfigured("Oracle Object Storage", {
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    endpoint,
  });
  return {
    bucket,
    clientOptions: {
      region,
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    },
  };
}

function getObjectStore(provider) {
  if (!objectStores.has(provider)) {
    const { bucket, clientOptions } = resolveObjectStore(provider);
    objectStores.set(provider, {
      bucket,
      client: new S3Client(clientOptions),
    });
  }
  return objectStores.get(provider);
}

function isNotFound(error) {
  const status = error?.$metadata?.httpStatusCode;
  return error?.name === "NotFound" || error?.name === "NoSuchKey" || status === 404;
}

async function objectExists(provider, mediaPath) {
  const { client, bucket } = getObjectStore(provider);
  try {
    await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: objectKeyFor(mediaPath) })
    );
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

/** Upload media to the globally selected backend and return its stored path. */
export async function putMedia({ buffer, mediaType, folderName, originalName }) {
  if (!["image", "video", "report"].includes(mediaType)) {
    const error = new Error("Invalid media type.");
    error.statusCode = 400;
    throw error;
  }
  const folder = sanitizeSegment(folderName);
  const leaf = `${Date.now()}-${randomUUID()}-${sanitizeSegment(
    path.basename(String(originalName ?? ""))
  )}`;
  const provider = getActiveProvider();

  if (OBJECT_PROVIDERS.has(provider)) {
    const { client, bucket } = getObjectStore(provider);
    const objectName = `${provider}/uploads/${mediaType}s/${folder}/${leaf}`;
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectName,
        Body: buffer,
        ContentLength: buffer.length,
        ContentType: contentTypeFor(leaf),
      })
    );
    return `/${objectName}`;
  }

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

/** Stream media from its marked provider, or the active provider for legacy paths. */
export async function streamMedia(mediaPath, res) {
  const explicitProvider = providerFromPath(mediaPath);
  const activeProvider = getActiveProvider();
  const objectProvider =
    explicitProvider || (OBJECT_PROVIDERS.has(activeProvider) ? activeProvider : null);

  if (objectProvider) {
    try {
      const { client, bucket } = getObjectStore(objectProvider);
      const data = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: objectKeyFor(mediaPath) })
      );
      if (!res.headersSent && typeof res.setHeader === "function") {
        if (data.ContentType) res.setHeader("Content-Type", data.ContentType);
        if (data.ContentLength != null) {
          res.setHeader("Content-Length", String(data.ContentLength));
        }
      }
      await pipeline(data.Body, res);
      return;
    } catch (error) {
      // Only unmarked legacy paths may predate cloud storage and fall back to NAS.
      if (explicitProvider || !isNotFound(error)) throw error;
    }
  }

  await withSFTPConnection(async (sftp) => {
    if (!(await sftp.exists(mediaPath))) {
      const error = new Error("File not found in storage.");
      error.statusCode = 404;
      throw error;
    }
    const sftpStream = await sftp.createReadStream(mediaPath);
    sftpStream.on("error", (error) => {
      logger.error("SFTP stream error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          status: "failed",
          message: "Error streaming file from SFTP.",
        });
      }
    });
    await pipeline(sftpStream, res);
  });
}

/** Whether a stored media file exists on its original backend. */
export async function mediaExists(mediaPath) {
  const explicitProvider = providerFromPath(mediaPath);
  const activeProvider = getActiveProvider();
  const objectProvider =
    explicitProvider || (OBJECT_PROVIDERS.has(activeProvider) ? activeProvider : null);

  if (objectProvider) {
    const exists = await objectExists(objectProvider, mediaPath);
    if (exists || explicitProvider) return exists;
  }
  return await withSFTPConnection((sftp) => sftp.exists(mediaPath));
}

/** Delete a stored media file from its original backend. */
export async function deleteMedia(mediaPath) {
  const explicitProvider = providerFromPath(mediaPath);
  const activeProvider = getActiveProvider();
  const objectProvider =
    explicitProvider || (OBJECT_PROVIDERS.has(activeProvider) ? activeProvider : null);

  if (
    objectProvider &&
    (explicitProvider || (await objectExists(objectProvider, mediaPath)))
  ) {
    const { client, bucket } = getObjectStore(objectProvider);
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: objectKeyFor(mediaPath) })
    );
    return;
  }
  await withSFTPConnection((sftp) => sftp.delete(mediaPath));
}

/** Strip an accidentally persisted ImageView base URL back to a storage path. */
export function toRelativeMediaPath(value) {
  if (typeof value !== "string") return value;
  try {
    const imageBaseUrl = config.get("ImageView");
    return imageBaseUrl && value.startsWith(imageBaseUrl)
      ? value.slice(imageBaseUrl.length)
      : value;
  } catch {
    return value;
  }
}

export function toRelativeMediaPaths(values) {
  return Array.isArray(values) ? values.map(toRelativeMediaPath) : values;
}
