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
import { parseV2StoragePath, resolveStorageConfig } from "./adminStorage.resolver.js";
import config from "config";

const objectClients = new Map();

const sanitize = (value) => String(value ?? "")
  .replace(/[/\\]/g, "_")
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

async function withSftp(cfg, callback) {
  assertConfigured("nas", cfg);
  const client = new Client();
  await client.connect({
    host: cfg.host,
    port: Number(cfg.port) || 22,
    username: cfg.username,
    password: cfg.password,
    readyTimeout: 30000,
  });
  try {
    return await callback(client);
  } finally {
    await client.end().catch(() => {});
  }
}

function mediaKey(context, mediaType, folderName, originalName) {
  const leaf = `${Date.now()}-${randomUUID()}-${sanitize(path.basename(String(originalName || "file")))}`;
  return `v2/${context.adminId}/${context.versionId}/${context.provider}/uploads/${mediaType}s/${sanitize(folderName)}/${leaf}`;
}

function legacyPath(value) {
  return !parseV2StoragePath(value);
}

export async function putMediaV2({ adminId, buffer, mediaType, folderName, originalName }) {
  if (!adminId) return putLegacyMedia({ buffer, mediaType, folderName, originalName });
  if (!Buffer.isBuffer(buffer)) throw new Error("Media buffer is required");
  if (!["image", "video", "report"].includes(mediaType)) throw new Error("Invalid media type");

  const context = await resolveStorageConfig({ adminId });
  const key = mediaKey(context, mediaType, folderName, originalName);
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
    ContentType: mime.lookup(originalName) || "application/octet-stream",
  }));
  return `/${key}`;
}

export async function streamMediaV2(mediaPath, res) {
  if (legacyPath(mediaPath)) return streamLegacyMedia(mediaPath, res);
  const context = await resolveStorageConfig({ storagePath: mediaPath });
  if (context.provider === "nas") {
    return withSftp(context.config, async (sftp) => {
      const remotePath = `${String(context.config.basePath || "").replace(/\/$/, "")}/${context.parsed.relativeKey}`;
      if (!(await sftp.exists(remotePath))) {
        const error = new Error("File not found in storage");
        error.statusCode = 404;
        throw error;
      }
      await pipeline(await sftp.createReadStream(remotePath), res);
    });
  }
  const client = clientFor(context.provider, context.config);
  const result = await client.send(new GetObjectCommand({
    Bucket: context.config.bucket,
    Key: context.parsed.relativeKey,
  }));
  if (!res.headersSent && result.ContentType) res.setHeader("Content-Type", result.ContentType);
  if (!res.headersSent && result.ContentLength != null) res.setHeader("Content-Length", String(result.ContentLength));
  await pipeline(result.Body, res);
}

export async function mediaExistsV2(mediaPath) {
  if (legacyPath(mediaPath)) return legacyMediaExists(mediaPath);
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
  if (legacyPath(mediaPath)) return deleteLegacyMedia(mediaPath);
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
