// Copy missing documents from one UTC day (override with --timezone).
// Incidents use timeOfIncident, matching Compass; other collections use createdAt.
// Set SOURCE_MONGODB_URI (temporary) and TARGET_MONGODB_URI (original) in server/.env.
// node scripts/copy-mongodb-day.js --date 2026-10-27 --dry-run
// node scripts/copy-mongodb-day.js --date 2026-10-27 --execute
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import dotenv from "dotenv";
import moment from "moment-timezone";
import { BSON, MongoClient } from "mongodb";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const queryOptions = { maxTimeMS: 60_000 };
const idKey = (id) => BSON.EJSON.stringify(id, { relaxed: false });
const counts = () => ({ matched: 0, planned: 0, copied: 0, skipped: 0, failed: 0, undated: 0 });
const errorLabel = (error) => `${error.name || "Error"}${error.code ? ` (code ${error.code})` : ""}`;
const dateFieldFor = (name) => name === "incidents" ? "timeOfIncident" : "createdAt";

export function dayWindow(date, timezone = "UTC") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) throw new Error("--date must be YYYY-MM-DD");
  if (!moment.tz.zone(timezone)) throw new Error(`Unknown timezone: ${timezone}`);
  const start = moment.tz(date, "YYYY-MM-DD", true, timezone);
  if (!start.isValid()) throw new Error("--date is not a valid calendar date");
  return { start: start.toDate(), end: start.clone().add(1, "day").toDate() };
}

async function existingIds(collection, documents) {
  const ids = documents.map((document) => document._id);
  // Let MongoDB compare IDs: equal numeric IDs can have different BSON number types.
  const existing = await collection.aggregate([
    { $match: { _id: { $in: ids } } },
    { $project: { _id: 0, index: { $indexOfArray: [{ $literal: ids }, "$_id"] } } },
  ], { ...queryOptions, collation: { locale: "simple" }, promoteValues: true }).toArray();
  return new Set(existing.map((document) => idKey(ids[document.index])));
}

export async function migrateCollection({ source, target, start, end, execute = false, batchSize = 200, log = console.log }) {
  const dateField = dateFieldFor(source.collectionName);
  const result = { name: source.collectionName, dateField, ...counts(), failures: [] };
  const fail = (document, reason) => {
    result.failed++;
    result.failures.push({ id: idKey(document._id), reason });
    log(`FAILED ${result.name} _id=${idKey(document._id)}: ${reason}`);
  };
  // Do not fall back to createdAt for incidents: it can describe a different day.
  result.undated = Number(await source.countDocuments(
    { $expr: { $ne: [{ $type: `$${dateField}` }, "date"] } }, queryOptions,
  ));
  const cursor = source.find({
    [dateField]: { $gte: start, $lt: end },
    $expr: { $eq: [{ $type: `$${dateField}` }, "date"] },
  }, { ...queryOptions, batchSize, promoteValues: false });

  const copyBatch = async (documents) => {
    result.matched += documents.length;
    const present = await existingIds(target, documents);
    const missing = documents.filter((document) => !present.has(idKey(document._id)));
    result.skipped += documents.length - missing.length;
    if (!execute) {
      result.planned += missing.length;
      return;
    }
    if (!missing.length) return;
    let insertedIds;
    try {
      const inserted = await target.insertMany(missing, { ordered: false, writeConcern: { w: "majority" } });
      result.copied += inserted.insertedCount;
      insertedIds = new Set(Object.values(inserted.insertedIds).map(idKey));
    } catch (error) {
      // Do not report an uncertain network/write-concern outcome as a successful migration.
      if (!error.writeErrors?.length || error.result?.getWriteConcernError()) throw error;
      result.copied += error.result.insertedCount;
      insertedIds = new Set(Object.values(error.result.insertedIds).map(idKey));
      const nowPresent = await existingIds(target, missing);
      for (const writeError of error.writeErrors) {
        const document = missing[writeError.index];
        const code = Number(writeError.code);
        if (code === 11000 && nowPresent.has(idKey(document._id))) result.skipped++;
        else fail(document, code === 11000
          ? "Conflict with another unique index; destination was not overwritten"
          : `Insert rejected (code ${code})`);
      }
    }
    const verified = await existingIds(target, missing);
    for (const document of missing) {
      if (insertedIds.has(idKey(document._id)) && !verified.has(idKey(document._id))) {
        result.copied--;
        fail(document, "Inserted document was not found during verification");
      }
    }
  };

  try {
    let batch = [];
    let lastProgress = Date.now();
    for await (const document of cursor) {
      batch.push(document);
      if (batch.length === batchSize) {
        await copyBatch(batch);
        if (Date.now() - lastProgress >= 5_000) {
          log(`  ${result.name}: ${result.matched} checked, ${result.skipped} existing, ${execute ? `${result.copied} copied` : `${result.planned} to copy`}, ${result.failed} failed`);
          lastProgress = Date.now();
        }
        batch = [];
      }
    }
    if (batch.length) await copyBatch(batch);
  } catch (error) {
    result.error = `${errorLabel(error)}; collection check incomplete, rerun to reconcile any partial writes`;
  } finally {
    await cursor.close();
  }
  return result;
}

export async function migrateDatabase({ source, target, start, end, execute = false, log = console.log, batchSize = 200 }) {
  const sourceCollections = await source.listCollections().toArray();
  const targetCollections = new Map((await target.listCollections().toArray()).map((collection) => [collection.name, collection]));
  const report = { collections: [], excluded: [], totals: counts(), ok: true };
  for (const info of sourceCollections.sort((a, b) => a.name.localeCompare(b.name))) {
    if (info.name.startsWith("system.") || info.type === "view") {
      report.excluded.push({ name: info.name, reason: info.type === "view" ? "View; contains no independent documents" : "MongoDB system collection" });
      continue;
    }
    const destination = targetCollections.get(info.name);
    const dateField = dateFieldFor(info.name);
    log(`Checking ${info.name} (${dateField})...`);
    let result;
    // Capped writes can evict existing records; time-series collections lack unique _id indexes.
    if (info.type !== "collection" || info.options?.capped || (destination && (destination.type !== "collection" || destination.options?.capped))) {
      result = { name: info.name, dateField, ...counts(), error: "Requires separate handling: capped, time-series, or non-writable destination collection" };
    } else {
      try {
        result = await migrateCollection({
          source: source.collection(info.name), target: target.collection(info.name),
          start, end, execute, batchSize, log,
        });
      } catch (error) {
        result = { name: info.name, dateField, ...counts(), error: `${errorLabel(error)}; collection check incomplete` };
      }
    }
    report.collections.push(result);
    for (const key of Object.keys(report.totals)) report.totals[key] += result[key];
    if (result.error || result.failed || result.undated) report.ok = false;
    if (result.error) log(`INCOMPLETE ${result.name}: ${result.error}`);
  }
  return report;
}

export function printCollectionSummary(report) {
  const rows = [...report.collections, {
    name: "TOTAL", ...report.totals, error: report.collections.some((collection) => collection.error),
  }].map((collection) => ({
    Collection: collection.name,
    "Date field": collection.dateField || "",
    Matched: collection.matched,
    "To copy": collection.planned,
    Existing: collection.skipped,
    Copied: collection.copied,
    Failed: collection.failed,
    Undated: collection.undated,
    Status: collection.error ? "INCOMPLETE" : collection.failed || collection.undated ? "REVIEW" : "OK",
  }));
  console.table(rows);
  if (report.totals.undated) console.log("Undated: records across the entire collection without a BSON Date in its selected date field; their day is unknown.");
  if (report.excluded.length) console.log(`Excluded ${report.excluded.length} views/system collections; see the JSON report for their names and reasons.`);
}

export function configuredClient(variable, value) {
  if (!value) throw new Error(`Set ${variable} in server/.env, including the database name`);
  if (!/^mongodb(?:\+srv)?:\/\/[^/]+\/[^?\/]+(?:\?.*)?$/.test(value)) {
    throw new Error(`${variable} must be a MongoDB URI with an explicit database name`);
  }
  let client;
  try {
    client = new MongoClient(value, { serverSelectionTimeoutMS: 15_000, connectTimeoutMS: 10_000, promoteValues: false });
  } catch {
    throw new Error(`${variable} is not a valid MongoDB connection string`);
  }
  if (["admin", "config", "local"].includes(client.db().databaseName)) throw new Error(`${variable} must select an application database`);
  return client;
}

export async function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({ args: argv, options: {
    date: { type: "string" }, timezone: { type: "string", default: "UTC" },
    "dry-run": { type: "boolean" }, execute: { type: "boolean" },
    report: { type: "string" }, help: { type: "boolean" },
  } });
  if (values.help) {
    console.log("Usage: node scripts/copy-mongodb-day.js --date YYYY-MM-DD [--timezone UTC] [--dry-run | --execute] [--report file.json]\nSet SOURCE_MONGODB_URI (temporary) and TARGET_MONGODB_URI (original) in server/.env.\nDry run and UTC are the defaults. Incidents are selected by timeOfIncident; all other collections use createdAt.\nSelects BSON Dates from midnight inclusive to the next midnight exclusive; skips existing _id values.\nUse --timezone Asia/Kolkata only when you intend an India calendar day instead of a UTC day.\nDoes not merge updates into older documents or recreate indexes/validators. Unique-index conflicts fail without overwriting.\nMissing/invalid selected dates and unsupported collections are reported for review (exit code 1). Dry-run planned counts check _id only.");
    return;
  }
  if (values.execute && values["dry-run"]) throw new Error("Choose --dry-run or --execute, not both");
  const window = dayWindow(values.date, values.timezone);
  dotenv.config({ path: path.join(serverRoot, ".env"), quiet: true });
  const sourceClient = configuredClient("SOURCE_MONGODB_URI", process.env.SOURCE_MONGODB_URI);
  const targetClient = configuredClient("TARGET_MONGODB_URI", process.env.TARGET_MONGODB_URI);
  const identity = (client) => ({
    hosts: client.options.srvHost || client.options.hosts.map((host) => host.toString()).sort().join(","),
    database: client.db().databaseName,
  });
  const source = identity(sourceClient);
  const target = identity(targetClient);
  if (source.hosts === target.hosts && source.database === target.database) {
    throw new Error(`Source and target must be different databases. Both point to ${source.hosts}/${source.database}. The same database name is allowed on different servers. Check SOURCE_MONGODB_URI (temporary) and TARGET_MONGODB_URI (original) in server/.env.`);
  }
  const mode = values.execute ? "execute" : "dry-run";
  const reportPath = path.resolve(values.report || `mongodb-migration-${values.date}-${mode}.json`);
  const header = { mode, date: values.date, timezone: values.timezone, startInclusive: window.start, endExclusive: window.end, source, target };
  console.log(`${mode.toUpperCase()} | ${values.date} (${values.timezone})\nWindow: ${window.start.toISOString()} inclusive to ${window.end.toISOString()} exclusive\nSource: ${source.hosts}/${source.database}\nTarget: ${target.hosts}/${target.database}`);
  try {
    await Promise.all([sourceClient.connect(), targetClient.connect()]);
    const result = await migrateDatabase({ source: sourceClient.db(), target: targetClient.db(), ...window, execute: Boolean(values.execute) });
    await writeFile(reportPath, JSON.stringify({ ...header, completedAt: new Date(), ...result }, null, 2) + "\n");
    printCollectionSummary(result);
    console.log(`${values.execute ? "Migration" : "Dry run"} ${result.ok ? "complete" : "needs review"}. Report: ${reportPath}`);
    if (!result.ok) process.exitCode = 1;
  } finally {
    await Promise.allSettled([sourceClient.close(), targetClient.close()]);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    // Driver errors can contain connection strings or document values; never log credentials.
    console.error(error.name?.startsWith("Mongo") ? errorLabel(error) : error.message);
    process.exitCode = 1;
  });
}
