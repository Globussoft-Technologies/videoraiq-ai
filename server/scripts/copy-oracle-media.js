// Copy selected Oracle Object Storage media between two accounts without changing
// its stored key. Run --dry-run first, then repeat with --execute.
//
// One object:
// node scripts/copy-oracle-media.js --key "v2/<adminId>/env/oracle/uploads/images/<folder>/<file>.jpg" --dry-run
// node scripts/copy-oracle-media.js --key "v2/<adminId>/env/oracle/uploads/images/<folder>/<file>.jpg" --execute
//
// One folder (the destination path defaults to the same prefix):
// node scripts/copy-oracle-media.js --prefix "v2/<adminId>/env/oracle/uploads/images/<folder>/" --dry-run --concurrency 4
// node scripts/copy-oracle-media.js --prefix "v2/<adminId>/env/oracle/uploads/images/<folder>/" --execute --concurrency 4 --quiet
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const allowed = new Set([
  "--key", "--prefix", "--destination-key", "--destination-prefix", "--dry-run", "--execute", "--check-connection", "--list-prefixes", "--concurrency", "--quiet",
]);
const valueFlags = new Set(["--key", "--prefix", "--destination-key", "--destination-prefix", "--concurrency"]);

function usage(message) {
  if (message) console.error(message);
  console.error("Usage: node scripts/copy-oracle-media.js (--key <key-or-url> | --prefix <prefix>) [--destination-key <key> | --destination-prefix <prefix>] --dry-run|--execute [--concurrency 1-8] [--quiet]");
  process.exitCode = 1;
}

function isNotFound(error) {
  return error?.name === "NotFound" || error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404;
}

function keyFrom(value, label) {
  if (!value) throw new Error(`${label} is required`);
  let key = String(value).trim();
  if (/^https?:\/\//i.test(key)) {
    const url = new URL(key);
    const marker = "/uploads/";
    const start = url.pathname.indexOf(marker);
    if (start < 0) throw new Error(`${label} URL must contain /uploads/`);
    key = url.pathname.slice(start + marker.length);
  }
  key = decodeURIComponent(key).replace(/^\/+/, "");
  if (!key || key.split("/").includes("..")) throw new Error(`${label} is not a valid object key`);
  return key;
}

function prefixFrom(value, label) {
  const prefix = keyFrom(value, label);
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}

function concurrencyFrom(value) {
  if (value === undefined) return 4;
  if (!/^[1-8]$/.test(value)) throw new Error("--concurrency must be an integer from 1 to 8");
  return Number(value);
}

function storageFromEnvironment(name) {
  const variables = ["REGION", "ENDPOINT", "BUCKET", "ACCESS_KEY_ID", "SECRET_ACCESS_KEY"];
  const values = Object.fromEntries(variables.map((key) => [key, process.env[`${name}_OCI_${key}`]]));
  const missing = variables.filter((key) => !values[key]);
  if (missing.length) throw new Error(`Missing ${name}_OCI_${missing.join(`, ${name}_OCI_`)}`);
  return {
    bucket: values.BUCKET,
    endpointHost: new URL(values.ENDPOINT).host,
    client: new S3Client({
      region: values.REGION,
      endpoint: values.ENDPOINT,
      forcePathStyle: true,
      // Oracle rejects the aws-chunked encoding used by automatic streaming checksums.
      requestChecksumCalculation: "WHEN_REQUIRED",
      requestHandler: { connectionTimeout: 10_000, socketTimeout: 60_000 },
      credentials: { accessKeyId: values.ACCESS_KEY_ID, secretAccessKey: values.SECRET_ACCESS_KEY },
    }),
  };
}

function errorDetails(error) {
  const details = [error?.name || "Error"];
  if (error?.message && error.message !== error.name) details.push(error.message);
  if (error?.$metadata?.httpStatusCode) details.push(`HTTP ${error.$metadata.httpStatusCode}`);
  if (error?.$metadata?.requestId) details.push(`request ${error.$metadata.requestId}`);
  return details.join(" | ");
}

async function objectHead(storage, key, label) {
  try {
    return await storage.client.send(new HeadObjectCommand({ Bucket: storage.bucket, Key: key }));
  } catch (error) {
    error.operation = `${label} HEAD for ${key}`;
    throw error;
  }
}

async function checkConnection(storage, label) {
  try {
    await storage.client.send(new HeadBucketCommand({ Bucket: storage.bucket }));
    console.log(`CONNECTED ${label}: ${storage.bucket} at ${storage.endpointHost}`);
  } catch (error) {
    error.operation = `${label} HeadBucket for ${storage.bucket} at ${storage.endpointHost}`;
    throw error;
  }
}

async function listPrefixes(storage) {
  const prefixes = new Set();
  const rootObjects = [];
  let token;
  do {
    const page = await storage.client.send(new ListObjectsV2Command({
      Bucket: storage.bucket, Delimiter: "/", ContinuationToken: token,
    }));
    for (const entry of page.CommonPrefixes || []) prefixes.add(entry.Prefix);
    for (const entry of page.Contents || []) if (entry.Key) rootObjects.push(entry.Key);
    token = page.NextContinuationToken;
  } while (token);
  console.log(`Source top-level prefixes in ${storage.bucket} at ${storage.endpointHost}:`);
  for (const prefix of [...prefixes].sort()) console.log(prefix);
  for (const key of rootObjects.sort()) console.log(key);
}

async function destinationState(target, key, sourceHead) {
  try {
    const existing = await objectHead(target, key, "target");
    const sameContent = existing.ContentLength === sourceHead.ContentLength
      && existing.ETag && sourceHead.ETag && existing.ETag === sourceHead.ETag;
    if (sameContent) return "already-copied";
    throw new Error(`Destination already contains a different object: ${key}`);
  } catch (error) {
    if (isNotFound(error)) return "missing";
    throw error;
  }
}

async function copyObject(source, target, sourceKey, targetKey, execute, quiet) {
  const sourceHead = await objectHead(source, sourceKey, "source");
  const state = await destinationState(target, targetKey, sourceHead);
  if (state === "already-copied") {
    if (!quiet) console.log(`SKIP ${sourceKey}`);
    return "skipped";
  }
  if (!execute) {
    if (!quiet) console.log(`DRY RUN ${sourceKey} -> ${targetKey}`);
    return "planned";
  }

  let sourceObject;
  try {
    sourceObject = await source.client.send(new GetObjectCommand({ Bucket: source.bucket, Key: sourceKey }));
  } catch (error) {
    error.operation = `source GET for ${sourceKey}`;
    throw error;
  }
  try {
    await target.client.send(new PutObjectCommand({
      Bucket: target.bucket,
      Key: targetKey,
      Body: sourceObject.Body,
      ContentLength: sourceHead.ContentLength,
      ContentType: sourceHead.ContentType,
      CacheControl: sourceHead.CacheControl,
      ContentDisposition: sourceHead.ContentDisposition,
      ContentEncoding: sourceHead.ContentEncoding,
      ContentLanguage: sourceHead.ContentLanguage,
      Expires: sourceHead.Expires,
      Metadata: sourceHead.Metadata,
      IfNoneMatch: "*",
    }));
  } catch (error) {
    sourceObject.Body?.destroy?.();
    error.operation = `target PUT for ${targetKey}`;
    throw error;
  }

  const copiedHead = await objectHead(target, targetKey, "target verification");
  if (copiedHead.ContentLength !== sourceHead.ContentLength || !copiedHead.ETag || copiedHead.ETag !== sourceHead.ETag) {
    throw new Error(`Verification failed after copying: ${sourceKey}`);
  }
  if (!quiet) console.log(`COPIED ${sourceKey} -> ${targetKey}`);
  return "copied";
}

async function copyPage(objects, copy, concurrency, failures) {
  let cursor = 0;
  const worker = async () => {
    while (cursor < objects.length) {
      const object = objects[cursor++];
      if (!object?.Key) continue;
      try {
        await copy(object.Key);
      } catch (error) {
        failures.push({ key: object.Key, error });
        console.error(`FAILED ${object.Key}${error.operation ? ` during ${error.operation}` : ""}: ${errorDetails(error)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, objects.length) }, worker));
}

export async function main(args = process.argv.slice(2)) {
  const valueFor = (name) => {
    const index = args.indexOf(name);
    return index < 0 ? undefined : args[index + 1];
  };
  const has = (name) => args.includes(name);
  const invalidArguments = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!allowed.has(argument)) {
      invalidArguments.push(argument);
      continue;
    }
    if (valueFlags.has(argument)) {
      if (!args[index + 1] || args[index + 1].startsWith("--")) invalidArguments.push(argument);
      else index += 1;
    }
  }
  const keyArgument = valueFor("--key");
  const prefixArgument = valueFor("--prefix");
  const destinationKeyArgument = valueFor("--destination-key");
  const destinationPrefixArgument = valueFor("--destination-prefix");
  const concurrencyArgument = valueFor("--concurrency");
  const execute = has("--execute");
  const dryRun = has("--dry-run");
  const quiet = has("--quiet");
  const connectionCheck = has("--check-connection");
  const listPrefixMode = has("--list-prefixes");

  const utilityMode = connectionCheck || listPrefixMode;
  const invalidUtilityMode = utilityMode && (keyArgument || prefixArgument || destinationKeyArgument || destinationPrefixArgument || concurrencyArgument || execute || dryRun || quiet);
  const invalidCopy = !utilityMode && (Boolean(keyArgument) === Boolean(prefixArgument) || execute === dryRun
    || (keyArgument && destinationPrefixArgument) || (prefixArgument && destinationKeyArgument));
  if (invalidArguments.length || (connectionCheck && listPrefixMode) || invalidUtilityMode || invalidCopy) {
    return usage("Choose exactly one source target and one mode.");
  }
  const concurrency = concurrencyFrom(concurrencyArgument);

  const source = storageFromEnvironment("SOURCE");
  const target = storageFromEnvironment("TARGET");
  if (connectionCheck) {
    await checkConnection(source, "source");
    await checkConnection(target, "target");
    return;
  }
  if (listPrefixMode) {
    await listPrefixes(source);
    return;
  }
  console.log(`Source bucket: ${source.bucket}; target bucket: ${target.bucket}; mode: ${execute ? "execute" : "dry run"}; concurrency: ${concurrency}`);
  const summary = { planned: 0, copied: 0, skipped: 0, failed: 0 };
  const failures = [];
  const copy = async (sourceKey, targetKey) => {
    const result = await copyObject(source, target, sourceKey, targetKey, execute, quiet);
    summary[result] += 1;
    const completed = summary.planned + summary.copied + summary.skipped;
    if (quiet && (completed === 1 || completed % 100 === 0)) console.log(`Progress: ${completed} objects processed`);
  };

  if (keyArgument) {
    const sourceKey = keyFrom(keyArgument, "--key");
    try {
      await copy(sourceKey, destinationKeyArgument ? keyFrom(destinationKeyArgument, "--destination-key") : sourceKey);
    } catch (error) {
      failures.push({ key: sourceKey, error });
      console.error(`FAILED ${sourceKey}${error.operation ? ` during ${error.operation}` : ""}: ${errorDetails(error)}`);
    }
  } else {
    const sourcePrefix = prefixFrom(prefixArgument, "--prefix");
    const destinationPrefix = destinationPrefixArgument ? prefixFrom(destinationPrefixArgument, "--destination-prefix") : sourcePrefix;
    let token;
    do {
      const page = await source.client.send(new ListObjectsV2Command({
        Bucket: source.bucket, Prefix: sourcePrefix, ContinuationToken: token,
      }));
      await copyPage(page.Contents || [],
        (sourceKey) => copy(sourceKey, `${destinationPrefix}${sourceKey.slice(sourcePrefix.length)}`),
        concurrency, failures);
      token = page.NextContinuationToken;
    } while (token);
  }
  summary.failed = failures.length;
  console.log(JSON.stringify(summary));
  if (failures.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Copy failed${error.operation ? ` during ${error.operation}` : ""}: ${errorDetails(error)}`);
    process.exitCode = 1;
  });
}
