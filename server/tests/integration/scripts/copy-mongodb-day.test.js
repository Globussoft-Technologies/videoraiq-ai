import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { MongoMemoryServer } from "mongodb-memory-server";
import { BSON, MongoClient, ObjectId } from "mongodb";
import { configuredClient, dayWindow, migrateCollection, migrateDatabase } from "../../../scripts/copy-mongodb-day.js";

let mongo;
let client;
let source;
let target;
const window = dayWindow("2026-10-27");
const log = () => {};
const record = (extra = {}) => ({ _id: new ObjectId(), createdAt: window.start, ...extra });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  client = new MongoClient(mongo.getUri(), { promoteValues: false });
  await client.connect();
  source = client.db("migration_source_test");
  target = client.db("migration_target_test");
});

beforeEach(async () => {
  if (client.options.hosts[0].port !== mongo.instanceInfo.port) throw new Error("Tests require disposable MongoDB");
  await Promise.all([source.dropDatabase(), target.dropDatabase()]);
});

afterAll(async () => {
  await client?.close();
  await mongo?.stop();
});

describe("one-day missing-document migration", () => {
  it("defaults to the Compass UTC day and supports explicit local dates/timezones", () => {
    expect(window.start.toISOString()).toBe("2026-10-27T00:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-10-28T00:00:00.000Z");
    const india = dayWindow("2026-10-27", "Asia/Kolkata");
    expect(india.start.toISOString()).toBe("2026-10-26T18:30:00.000Z");
    expect(india.end.toISOString()).toBe("2026-10-27T18:30:00.000Z");
    const dst = dayWindow("2026-03-08", "America/New_York");
    expect(dst.end - dst.start).toBe(23 * 60 * 60 * 1000);
    expect(() => dayWindow("2026-02-30")).toThrow("valid calendar date");
    expect(() => dayWindow("yesterday")).toThrow("YYYY-MM-DD");
    expect(() => dayWindow("2026-10-27", "Not/AZone")).toThrow("Unknown timezone");
  });

  it("matches the Compass incident day regardless of createdAt and preserves existing IDs", async () => {
    const selected = [
      record({ timeOfIncident: window.start, createdAt: new Date("2026-10-26T23:59:59.999Z") }),
      record({ timeOfIncident: new Date("2026-10-27T23:59:59.999Z"), createdAt: window.end }),
      record({ timeOfIncident: new Date("2026-10-27T12:00:00.000Z"), value: "source" }),
    ];
    await source.collection("incidents").insertMany([
      ...selected,
      record({ timeOfIncident: new Date("2026-10-26T23:59:59.999Z") }),
      record({ timeOfIncident: window.end }),
      record(),
      record({ timeOfIncident: null }),
      record({ timeOfIncident: window.start.toISOString() }),
    ]);
    await target.collection("incidents").insertOne({ ...selected[2], value: "keep original" });
    await source.collection("events").insertOne(record());

    const dryRun = await migrateDatabase({ source, target, ...window, log });
    const incidents = dryRun.collections.find((collection) => collection.name === "incidents");
    const compassCount = Number(await source.collection("incidents").countDocuments({
      timeOfIncident: { $gte: new Date("2026-10-27T00:00:00.000Z"), $lt: new Date("2026-10-28T00:00:00.000Z") },
    }));
    expect(compassCount).toBe(3);
    expect(incidents).toMatchObject({ dateField: "timeOfIncident", matched: compassCount, planned: 2, skipped: 1, copied: 0, undated: 3 });
    expect(dryRun.collections.find((collection) => collection.name === "events")).toMatchObject({ dateField: "createdAt", matched: 1 });
    expect(dryRun.ok).toBe(false);
    expect(Number(await target.collection("incidents").countDocuments())).toBe(1);

    const executed = await migrateDatabase({ source, target, ...window, execute: true, log });
    expect(executed.collections.find((collection) => collection.name === "incidents")).toMatchObject({ matched: 3, copied: 2, skipped: 1, undated: 3 });
    const copied = await target.collection("incidents").find({}).toArray();
    expect(copied.map((document) => document._id.toHexString()).sort()).toEqual(selected.map((document) => document._id.toHexString()).sort());
    expect(copied.find((document) => document._id.equals(selected[2]._id)).value).toBe("keep original");
  });

  it("dry-runs all collections without writing, using createdAt and exclusive end boundaries", async () => {
    const existing = record({ value: "temporary" });
    const undated = record();
    delete undated.createdAt;
    await source.collection("events").insertMany([
      record({ createdAt: new Date(window.start.getTime() - 1), updatedAt: window.start }),
      record(), existing,
      record({ createdAt: new Date(window.end.getTime() - 1) }),
      record({ createdAt: window.end }),
      record({ createdAt: window.start.toISOString() }), undated,
    ]);
    await source.collection("another_collection").insertOne(record());
    await target.collection("events").insertOne({ ...existing, value: "original" });
    const result = await migrateDatabase({ source, target, ...window, log, batchSize: 2 });
    expect(result.totals).toEqual({ matched: 4, planned: 3, copied: 0, skipped: 1, failed: 0, undated: 2 });
    expect(result.ok).toBe(false);
    expect(Number(await target.collection("events").countDocuments())).toBe(1);
    expect((await target.collection("events").findOne({ _id: existing._id })).value).toBe("original");
    expect(await target.listCollections({ name: "another_collection" }).toArray()).toEqual([]);
  });

  it("preserves IDs, BSON values and existing data; a rerun inserts nothing", async () => {
    const existing = record({ value: "source" });
    const missing = record({
      reference: existing._id,
      amount: BSON.Decimal128.fromString("123.456"),
      large: BSON.Long.fromString("9007199254740993"),
      integer: new BSON.Int32(7), floating: new BSON.Double(7),
      bytes: new BSON.Binary(Buffer.from([0, 1, 255])),
      nested: [{ seenAt: window.start, reference: existing._id }],
    });
    await source.collection("events").insertMany([existing, missing, record({ createdAt: window.end })]);
    await source.collection("second").insertOne(record());
    await target.collection("events").insertOne({ ...existing, value: "keep original", updatedAt: new Date(0) });
    const originalSource = await source.collection("events").findOne({ _id: missing._id });
    const result = await migrateDatabase({ source, target, ...window, execute: true, log, batchSize: 1 });
    expect(result.ok).toBe(true);
    expect(result.totals).toEqual({ matched: 3, planned: 0, copied: 2, skipped: 1, failed: 0, undated: 0 });
    const copied = await target.collection("events").findOne({ _id: missing._id });
    expect(BSON.serialize(copied)).toEqual(BSON.serialize(originalSource));
    expect(Number(await source.collection("events").countDocuments())).toBe(3);
    expect((await target.collection("events").findOne({ _id: existing._id })).value).toBe("keep original");
    expect((await target.collection("events").findOne({ _id: existing._id })).updatedAt).toEqual(new Date(0));
    const rerun = await migrateDatabase({ source, target, ...window, execute: true, log });
    expect(rerun.totals.copied).toBe(0);
    expect(rerun.totals.skipped).toBe(3);
    expect(Number(await target.collection("events").countDocuments())).toBe(2);
  });

  it("reports another unique-key conflict and still inserts the other missing document", async () => {
    await target.collection("users").createIndex({ email: 1 }, { unique: true });
    const original = record({ email: "same@example.test", value: "keep" });
    const conflict = record({ email: original.email });
    const valid = record({ email: "new@example.test" });
    await target.collection("users").insertOne(original);
    await source.collection("users").insertMany([conflict, valid]);
    const result = await migrateDatabase({ source, target, ...window, execute: true, log });
    expect(result.ok).toBe(false);
    expect(result.totals).toMatchObject({ copied: 1, skipped: 0, failed: 1 });
    expect(await target.collection("users").findOne({ _id: conflict._id })).toBeNull();
    expect((await target.collection("users").findOne({ _id: original._id })).value).toBe("keep");
    expect(await target.collection("users").findOne({ _id: valid._id })).not.toBeNull();
  });

  it("handles a concurrent insertion of the same ID without overwriting it", async () => {
    const documents = [record(), record()];
    await source.collection("events").insertMany(documents);
    const destination = target.collection("events");
    const insertMany = destination.insertMany.bind(destination);
    vi.spyOn(destination, "insertMany").mockImplementationOnce(async (batch, options) => {
      await destination.insertOne({ ...batch[0], value: "concurrent original" });
      return insertMany(batch, options);
    });
    const result = await migrateCollection({ source: source.collection("events"), target: destination, ...window, execute: true, log });
    expect(result).toMatchObject({ copied: 1, skipped: 1, failed: 0 });
    expect((await destination.findOne({ _id: documents[0]._id })).value).toBe("concurrent original");
    expect(Number(await destination.countDocuments())).toBe(2);
  });

  it("skips equal numeric IDs even when their BSON number types differ", async () => {
    await source.collection("events").insertOne(record({ _id: new BSON.Double(1), value: "temporary" }));
    await target.collection("events").insertOne(record({ _id: BSON.Long.fromString("1"), value: "original" }));
    const result = await migrateDatabase({ source, target, ...window, execute: true, log });
    expect(result.totals).toMatchObject({ matched: 1, copied: 0, skipped: 1, failed: 0 });
    expect((await target.collection("events").findOne({ _id: 1 })).value).toBe("original");
  });

  it("reports collections that cannot safely support insert-only copying", async () => {
    await source.createCollection("capped", { capped: true, size: 1024 * 1024 });
    await source.collection("capped").insertOne(record());
    await source.createCollection("series", { timeseries: { timeField: "createdAt" } });
    await source.collection("series").insertOne(record());
    await source.createCollection("view", { viewOn: "capped", pipeline: [] });
    const result = await migrateDatabase({ source, target, ...window, execute: true, log });
    expect(result.ok).toBe(false);
    expect(result.collections.filter((collection) => collection.error).map((collection) => collection.name).sort()).toEqual(["capped", "series"]);
    expect(result.excluded.some((collection) => collection.name === "view")).toBe(true);
    expect(await target.listCollections().toArray()).toEqual([]);
  });

  it("requires an explicit application database and does not expose malformed credentials", () => {
    expect(() => configuredClient("SOURCE_MONGODB_URI", "")).toThrow("Set SOURCE_MONGODB_URI");
    expect(() => configuredClient("TARGET_MONGODB_URI", "mongodb://localhost:27017")).toThrow("explicit database");
    expect(() => configuredClient("TARGET_MONGODB_URI", "mongodb://localhost:27017/admin")).toThrow("application database");
    expect(() => configuredClient("TARGET_MONGODB_URI", "mongodb://user:secret@bad:port/db")).toThrow("TARGET_MONGODB_URI is not a valid");
  });

  it("defaults the real CLI to dry run, writes a report, and rejects identical databases", async () => {
    await source.collection("events").insertOne(record());
    await source.collection("incidents").insertOne(record({
      timeOfIncident: new Date("2026-10-27T23:59:59.999Z"), createdAt: window.end,
    }));
    const directory = await mkdtemp(path.join(tmpdir(), "videora-mongo-migration-"));
    const reportPath = path.join(directory, "report.json");
    const env = {
      ...process.env,
      SOURCE_MONGODB_URI: mongo.getUri(source.databaseName),
      TARGET_MONGODB_URI: mongo.getUri(target.databaseName),
    };
    const args = [path.resolve("scripts/copy-mongodb-day.js"), "--date", "2026-10-27", "--report", reportPath];
    try {
      const dryRun = spawnSync(process.execPath, args, { env, encoding: "utf8", timeout: 30_000 });
      expect(dryRun.status, dryRun.stderr).toBe(0);
      const report = JSON.parse(await readFile(reportPath, "utf8"));
      expect(report.mode).toBe("dry-run");
      expect(report).toMatchObject({ timezone: "UTC", startInclusive: "2026-10-27T00:00:00.000Z", endExclusive: "2026-10-28T00:00:00.000Z" });
      expect(report.collections.find((collection) => collection.name === "incidents")).toMatchObject({ dateField: "timeOfIncident", matched: 1, planned: 1 });
      expect(report.totals).toMatchObject({ matched: 2, planned: 2, copied: 0 });
      expect(dryRun.stdout).toContain("timeOfIncident");
      expect(await target.listCollections().toArray()).toEqual([]);
      const execution = spawnSync(process.execPath, [...args, "--execute"], { env, encoding: "utf8", timeout: 30_000 });
      expect(execution.status, execution.stderr).toBe(0);
      expect(JSON.parse(await readFile(reportPath, "utf8")).totals.copied).toBe(2);
      const sameDatabase = spawnSync(process.execPath, args, {
        env: { ...env, TARGET_MONGODB_URI: env.SOURCE_MONGODB_URI }, encoding: "utf8", timeout: 30_000,
      });
      expect(sameDatabase.status).toBe(1);
      expect(sameDatabase.stderr).toContain("Source and target must be different databases");
    } finally {
      await rm(reportPath, { force: true });
      await rmdir(directory);
    }
  });
});
