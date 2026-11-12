import path from "path";
import stream from "stream";
import { randomUUID, createHash } from "crypto";
import { pipeline } from "stream/promises";
import mime from "mime-types";
import Client from "ssh2-sftp-client";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import {
  deleteMedia as deleteLegacyMedia,
  mediaExists as legacyMediaExists,
  putMedia as putLegacyMedia,
  streamMedia as streamLegacyMedia,
} from "../../../utils/mediaStorage.js";
import { parseV2StoragePath, resolveEnvStorage, resolveStorageConfig } from "./adminStorage.resolver.js";
import config from "config";
import logger from "../../../utils/logger.js";

const objectClients = new Map();

const sanitize = (value) => String(value ?? "")
  .replace(/[/\\]/g, "_")
  .replace(/[\x00-\x1f\x7f]/g, "_")
  .replace(/\.\.+/g, "_")
  .trim() || "default";

function assertConfigured(provider, cfg) {
  const required = provider === "nas"
    ? ["host", "username", "password", "basePath"]
    : ["region", "bucket", "accessKeyId", "secretAccessKey"];
  const missing = required.filter((key) => cfg[key] === undefined || cfg[key] === null || cfg[key] === "");
  if (missing.length) throw new Error(`${provider} storage is missing: ${missing.join(", ")}`);
}

function clientFor(provider, cfg) {
  assertConfigured(provider, cfg);
  const fingerprint = createHash("sha256").update(JSON.stringify({ provider, ...cfg })).digest("hex");
  if (!objectClients.has(fingerprint)) {
    objectClients.set(fingerprint, new S3Client({
      region: cfg.region,
      ...(cfg.endpoint ? { endpoint: cfg.endpoint } : {}),
      forcePathStyle: Boolean(cfg.forcePathStyle),
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
        ...(cfg.sessionToken ? { sessionToken: cfg.sessionToken } : {}),
      },
    }));
  }
  return objectClients.get(fingerprint);
}

async function withSftp(cfg, callback, signal) {
  assertConfigured("nas", cfg);
  const client = new Client();
  try {
    signal?.throwIfAborted();
    await client.connect({
      host: cfg.host,
      port: Number(cfg.port) || 22,
      username: cfg.username,
      password: cfg.password,
      readyTimeout: 30000,
    });
    signal?.throwIfAborted();
    return await callback(client);
  } finally {
    await client.end().catch(() => {});
  }
}

function mediaKey(context, mediaType, folderName, originalName, objectId) {
  const safeOriginalName = sanitize(path.basename(String(originalName || "file")));
  const leaf = objectId
    ? `${sanitize(objectId)}-${safeOriginalName}`
    : `${Date.now()}-${randomUUID()}-${safeOriginalName}`;
  return `v2/${context.adminId}/${context.versionId}/${context.provider}/uploads/${mediaType}s/${sanitize(folderName)}/${leaf}`;
}

function legacyPath(value) {
  return !parseV2StoragePath(value);
}

export function isGeneralFilePath(value) {
  const key = parseV2StoragePath(value)?.relativeKey;
  return Boolean(key && /^v2\/[^/]+\/[^/]+\/[^/]+\/uploads\/files\//i.test(path.posix.normalize(key)));
}

function resolveLegacyMediaPath(value) {
  const mediaPath = String(value || "").replace(/\\/g, "/");
  if (!/^\/?uploads\//i.test(mediaPath)) return value;
  const basePath = String(config.get("SFTP.Path") || "").replace(/\/+$/, "");
  return basePath ? `${basePath}/${mediaPath.replace(/^\/+/, "")}` : value;
}

async function putWithContext({ context, adminId, buffer, mediaType, folderName, originalName, objectId }) {
  const key = mediaKey({ ...context, adminId }, mediaType, folderName, originalName, objectId);
  if (context.provider === "nas") {
    const remotePath = `${String(context.config.basePath || "").replace(/\/$/, "")}/${key}`;
    await withSftp(context.config, async (sftp) => {
      await sftp.mkdir(path.posix.dirname(remotePath), true).catch(() => {});
      const body = new stream.PassThrough();
      body.end(buffer);
      await sftp.put(body, remotePath);
    });
    return `/${key}`;
  }

  const client = clientFor(context.provider, context.config);
  await client.send(new PutObjectCommand({
    Bucket: context.config.bucket,
    Key: key,
    Body: buffer,
    ContentLength: buffer.length,
    ContentType: mediaType === "file" ? "application/octet-stream" : mime.lookup(originalName) || "application/octet-stream",
    ...(mediaType === "file" ? { ContentDisposition: "attachment" } : {}),
  }));
  return `/${key}`;
}

export async function putMediaV2({ adminId, buffer, mediaType, folderName, originalName, objectId, fallbackToEnv = false }) {
  if (mediaType === "file" && !adminId) throw new Error("An organisation account is required to upload files");
  if (!adminId) return putLegacyMedia({ buffer, mediaType, folderName, originalName, objectId });
  if (!Buffer.isBuffer(buffer)) throw new Error("Media buffer is required");
  if (!["image", "video", "report", "file"].includes(mediaType)) throw new Error("Invalid media type");

  const context = await resolveStorageConfig({ adminId });
  try {
    return await putWithContext({ context, adminId, buffer, mediaType, folderName, originalName, objectId });
  } catch (error) {
    logger.error(`[MEDIA-UPLOAD] ${JSON.stringify({ provider: context.provider, source: context.source, versionId: context.versionId, stage: "primary", reason: /authentication methods failed/i.test(error?.message || "") ? "authentication_rejected" : "upload_failed", code: error?.code })}`);
    // Some older admin records contain expired cloud credentials. Callers
    // that explicitly opt in (currently assistant uploads) can fall back to
    // the environment storage without changing the storage choice for other
    // application media.
    if (!fallbackToEnv || context.source !== "admin") throw error;
    const envContext = { ...resolveEnvStorage(), adminId, versionId: "env" };
    try {
      return await putWithContext({ context: envContext, adminId, buffer, mediaType, folderName, originalName, objectId });
    } catch (fallbackError) {
      logger.error(`[MEDIA-UPLOAD] ${JSON.stringify({ provider: envContext.provider, source: "env", stage: "fallback", reason: /authentication methods failed/i.test(fallbackError?.message || "") ? "authentication_rejected" : "upload_failed", code: fallbackError?.code })}`);
      throw fallbackError;
    }
  }
}

export async function streamMediaV2(mediaPath, res, { signal } = {}) {
  signal?.throwIfAborted();
  if (legacyPath(mediaPath)) return streamLegacyMedia(resolveLegacyMediaPath(mediaPath), res, { signal });
  const context = await resolveStorageConfig({ storagePath: mediaPath });
  signal?.throwIfAborted();
  const isFile = isGeneralFilePath(mediaPath);
  if (isFile && !res.headersSent) {
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (!String(res.getHeader?.("Content-Disposition") || "").startsWith("attachment")) {
      res.setHeader("Content-Disposition", "attachment");
    }
  }
  if (context.provider === "nas") {
    return withSftp(context.config, async (sftp) => {
      const remotePath = `${String(context.config.basePath || "").replace(/\/$/, "")}/${context.parsed.relativeKey}`;
      if (!(await sftp.exists(remotePath))) {
        const error = new Error("File not found in storage");
        error.statusCode = 404;
        throw error;
      }
      signal?.throwIfAborted();
      const source = await sftp.createReadStream(remotePath);
      await pipeline(source, res, { signal });
    }, signal);
  }
  const client = clientFor(context.provider, context.config);
  const result = await client.send(new GetObjectCommand({
    Bucket: context.config.bucket,
    Key: context.parsed.relativeKey,
  }), { abortSignal: signal });
  signal?.throwIfAborted();
  if (!res.headersSent && !isFile && result.ContentType) res.setHeader("Content-Type", result.ContentType);
  if (!res.headersSent && result.ContentLength != null) res.setHeader("Content-Length", String(result.ContentLength));
  await pipeline(result.Body, res, { signal });
}

/** Read a remotely stored media object into memory for an immediate downstream
 * processing step. This does not create a local file or local cache. */
export async function readMediaV2(mediaPath) {
  if (legacyPath(mediaPath)) {
    throw new Error("Legacy media paths cannot be read through the V2 assistant storage flow");
  }
  const context = await resolveStorageConfig({ storagePath: mediaPath });
  if (context.provider === "nas") {
    const remotePath = `${String(context.config.basePath || "").replace(/\/$/, "")}/${context.parsed.relativeKey}`;
    return withSftp(context.config, (sftp) => sftp.get(remotePath));
  }
  const result = await clientFor(context.provider, context.config).send(new GetObjectCommand({
    Bucket: context.config.bucket,
    Key: context.parsed.relativeKey,
  }));
  const chunks = [];
  for await (const chunk of result.Body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export async function mediaExistsV2(mediaPath) {
  if (legacyPath(mediaPath)) return legacyMediaExists(resolveLegacyMediaPath(mediaPath));
  const context = await resolveStorageConfig({ storagePath: mediaPath });
  if (context.provider === "nas") {
    const remotePath = `${String(context.config.basePath || "").replace(/\/$/, "")}/${context.parsed.relativeKey}`;
    return withSftp(context.config, (sftp) => sftp.exists(remotePath));
  }
  try {
    await clientFor(context.provider, context.config).send(new HeadObjectCommand({
      Bucket: context.config.bucket,
      Key: context.parsed.relativeKey,
    }));
    return true;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || ["NotFound", "NoSuchKey"].includes(error?.name)) return false;
    throw error;
  }
}

export async function deleteMediaV2(mediaPath) {
  if (legacyPath(mediaPath)) return deleteLegacyMedia(resolveLegacyMediaPath(mediaPath));
  const context = await resolveStorageConfig({ storagePath: mediaPath });
  if (context.provider === "nas") {
    const remotePath = `${String(context.config.basePath || "").replace(/\/$/, "")}/${context.parsed.relativeKey}`;
    return withSftp(context.config, (sftp) => sftp.delete(remotePath));
  }
  await clientFor(context.provider, context.config).send(new DeleteObjectCommand({
    Bucket: context.config.bucket,
    Key: context.parsed.relativeKey,
  }));
}

export async function testStorageConnection(provider, cfg) {
  if (provider === "nas") {
    return withSftp(cfg, async (sftp) => {
      await sftp.list(cfg.basePath);
      return true;
    });
  }
  await clientFor(provider, cfg).send(new HeadBucketCommand({ Bucket: cfg.bucket }));
  return true;
}

async function bodyBuffer(body) {
  if (typeof body?.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/** Upload, fetch, byte-verify and remove a small UI-provided image. */
export async function testStorageRoundTrip(provider, cfg, probe) {
  if (!Buffer.isBuffer(probe) || !probe.length) throw new Error("Test image is required");
  const expected = createHash("sha256").update(probe).digest("hex");
  const leaf = `videoraiq-storage-test-${randomUUID()}.png`;

  if (provider === "nas") {
    const testDir = `${String(cfg.basePath || "").replace(/\/$/, "")}/.videoraiq-tests`;
    const remotePath = `${testDir}/${leaf}`;
    return withSftp(cfg, async (sftp) => {
      await sftp.mkdir(testDir, true).catch(() => {});
      try {
        await sftp.put(probe, remotePath);
        const downloaded = await sftp.get(remotePath);
        const actual = createHash("sha256").update(Buffer.from(downloaded)).digest("hex");
        if (actual !== expected) throw new Error("Uploaded test image did not match the fetched image");
        return true;
      } finally {
        await sftp.delete(remotePath).catch(() => {});
      }
    });
  }

  const client = clientFor(provider, cfg);
  const key = `.videoraiq-tests/${leaf}`;
  try {
    await client.send(new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: probe,
      ContentLength: probe.length,
      ContentType: "image/png",
    }));
    const fetched = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
    const actual = createHash("sha256").update(await bodyBuffer(fetched.Body)).digest("hex");
    if (actual !== expected) throw new Error("Uploaded test image did not match the fetched image");
    return true;
  } finally {
    await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key })).catch(() => {});
  }
}

export function toRelativeMediaPathV2(value) {
  if (typeof value !== "string") return value;
  try {
    const base = config.has("ImageView") ? String(config.get("ImageView") || "") : "";
    return base && value.startsWith(base) ? value.slice(base.length) : value;
  } catch {
    return value;
  }
}

export function toRelativeMediaPathsV2(values) {
  return Array.isArray(values) ? values.map(toRelativeMediaPathV2) : values;
}
