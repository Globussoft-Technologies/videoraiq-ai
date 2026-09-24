import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { pipeline } from "stream/promises";

let client;
let bucketReady;

function settings() {
  return {
    endpoint: String(process.env.MEASUREMENT_MINIO_ENDPOINT || "").replace(/\/$/, ""),
    region: process.env.MEASUREMENT_MINIO_REGION || "us-east-1",
    bucket: process.env.MEASUREMENT_MINIO_BUCKET || "videoraiq-measurement-fallback",
    accessKeyId: process.env.MEASUREMENT_MINIO_ACCESS_KEY || "",
    secretAccessKey: process.env.MEASUREMENT_MINIO_SECRET_KEY || "",
  };
}

export function measurementMinioEnabled() {
  const cfg = settings();
  return Boolean(cfg.endpoint && cfg.accessKeyId && cfg.secretAccessKey);
}

function minioClient() {
  const cfg = settings();
  if (!measurementMinioEnabled()) {
    throw new Error("Measurement MinIO fallback is not configured");
  }
  if (!client) {
    client = new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    });
  }
  return client;
}

async function ensureBucket() {
  if (bucketReady) return bucketReady;
  const cfg = settings();
  bucketReady = (async () => {
    try {
      await minioClient().send(new HeadBucketCommand({ Bucket: cfg.bucket }));
    } catch (error) {
      const status = error?.$metadata?.httpStatusCode;
      if (![400, 404].includes(status) && !["NotFound", "NoSuchBucket"].includes(error?.name)) {
        throw error;
      }
      await minioClient().send(new CreateBucketCommand({ Bucket: cfg.bucket }));
    }
  })().catch((error) => {
    bucketReady = null;
    throw error;
  });
  return bucketReady;
}

export async function putMeasurementFallback({ key, buffer, contentType }) {
  await ensureBucket();
  const cfg = settings();
  await minioClient().send(new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
    Body: buffer,
    ContentLength: buffer.length,
    ContentType: contentType || "application/octet-stream",
  }));
}

export async function getMeasurementFallback(key) {
  const cfg = settings();
  const result = await minioClient().send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
  if (typeof result.Body?.transformToByteArray === "function") {
    return Buffer.from(await result.Body.transformToByteArray());
  }
  const chunks = [];
  for await (const chunk of result.Body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export async function streamMeasurementFallback(key, res) {
  const cfg = settings();
  const result = await minioClient().send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
  if (!res.headersSent && result.ContentType) res.setHeader("Content-Type", result.ContentType);
  if (!res.headersSent && result.ContentLength != null) res.setHeader("Content-Length", String(result.ContentLength));
  await pipeline(result.Body, res);
}

export async function measurementFallbackExists(key) {
  const cfg = settings();
  try {
    await minioClient().send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }));
    return true;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || ["NotFound", "NoSuchKey"].includes(error?.name)) return false;
    throw error;
  }
}

export async function deleteMeasurementFallback(key) {
  const cfg = settings();
  await minioClient().send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
}
