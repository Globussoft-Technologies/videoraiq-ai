/**
 * Guards the `lastCreatedAt` denormalization on OptimizedAccessLogs.
 *
 * The access-logs list used to compute `lastCreatedAt` with a `$max` over
 * `sessions[].timestamp` at query time, which forced a blocking in-memory sort
 * over every doc in the date range (~560k docs / 47 CPU-seconds in production).
 * Storing it lets match + sort + skip + limit run off
 * {admin, lastCreatedAt, createdAt} and fetch only the page being returned.
 *
 * Two things have to hold for that to keep working, and both are checked here:
 *   1. the pre-save hook keeps the stored value equal to the max session
 *      timestamp (a stale field would silently mis-sort the list), and
 *   2. the query plan stays index-driven — no SORT stage, docs examined bounded
 *      by the page size rather than the range.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";

const { default: OptimizedAccessLogs } = await import(
  "../../../core/v1/accesslogs/newAccessLogs.model.js"
);

const admin = new mongoose.Types.ObjectId();
const nvr = new mongoose.Types.ObjectId();
const channel = new mongoose.Types.ObjectId();

const session = (timestamp) => ({ nvr, channel, personName: "P", timestamp });
const at = (iso) => new Date(iso);

beforeAll(async () => {
  await connectMongo();
  await OptimizedAccessLogs.collection.createIndex({
    admin: 1,
    lastCreatedAt: -1,
    createdAt: 1,
  });
  await OptimizedAccessLogs.collection.createIndex({
    admin: 1,
    createdAt: -1,
    lastCreatedAt: 1,
  });
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

describe("OptimizedAccessLogs.lastCreatedAt", () => {
  it("stores the max session timestamp, not the first or last", async () => {
    const doc = await OptimizedAccessLogs.create({
      admin,
      sessions: [
        session(at("2026-05-01T10:00:00Z")),
        session(at("2026-05-01T12:00:00Z")),
        session(at("2026-05-01T11:00:00Z")),
      ],
    });
    expect(doc.lastCreatedAt).toEqual(at("2026-05-01T12:00:00Z"));
  });

  it("is null with no sessions, so 'has sessions' is an index-only check", async () => {
    const doc = await OptimizedAccessLogs.create({ admin });
    expect(doc.lastCreatedAt).toBeNull();
  });

  it("moves forward when a session is appended to an existing doc", async () => {
    // createAccessLog's same-group branch does exactly this: push + save.
    const doc = await OptimizedAccessLogs.create({
      admin,
      sessions: [session(at("2026-05-01T10:00:00Z"))],
    });
    doc.sessions.push(session(at("2026-05-01T15:00:00Z")));
    await doc.save();

    const reread = await OptimizedAccessLogs.findById(doc._id);
    expect(reread.lastCreatedAt).toEqual(at("2026-05-01T15:00:00Z"));
  });

  // 200 docs spread over the range, seeded via create() so the hook runs
  // (insertMany would bypass pre-save and leave the field unset).
  async function seed200() {
    await OptimizedAccessLogs.create(
      Array.from({ length: 200 }, (_, i) => ({
        admin,
        sessions: [session(new Date(at("2026-05-01T00:00:00Z").getTime() + i * 60000))],
      }))
    );
  }

  it("sorts and paginates from the index without a blocking sort", async () => {
    await seed200();

    const stats = await mongoose.connection.db.command({
      explain: {
        aggregate: "optimizedaccesslogs",
        pipeline: [
          {
            $match: {
              admin,
              createdAt: { $gte: at("2000-01-01T00:00:00Z"), $lte: at("2100-01-01T00:00:00Z") },
              lastCreatedAt: { $ne: null },
            },
          },
          { $sort: { lastCreatedAt: -1 } },
          { $skip: 0 },
          { $limit: 10 },
        ],
        cursor: {},
      },
      verbosity: "executionStats",
    });

    // Only the winning plan matters — the planner always considers (and here
    // rejects) a blocking-sort alternative, so checking the whole explain blob
    // would match that instead.
    const winning = JSON.stringify(stats.queryPlanner.winningPlan);
    expect(winning).toContain("admin_1_lastCreatedAt_-1_createdAt_1");
    // A SORT stage means the ordering was computed in memory over the whole
    // range rather than read off the index.
    expect(winning).not.toContain('"SORT"');
    // Only the returned page should be touched, not all 200 docs.
    expect(stats.executionStats.totalKeysExamined).toBeLessThanOrEqual(10);
    expect(stats.executionStats.totalDocsExamined).toBeLessThanOrEqual(10);
  });

  // The total needs a different index than the page. {admin, lastCreatedAt,
  // createdAt} puts the sort key ahead of createdAt, so a count can't seek to
  // the date window — in production that meant scanning all 2.7M keys of a
  // tenant to count a single day's 1,225 rows, and the endpoint took 3s.
  // {admin, createdAt, lastCreatedAt} seeks to the window and still answers
  // "has sessions" from the key, so it fetches nothing.
  it("counts a narrow window by seeking to it, without fetching documents", async () => {
    await seed200();

    // A window covering 20 of the 200 seeded docs.
    const from = at("2026-05-01T00:00:00Z");
    const to = new Date(from.getTime() + 19 * 60000);

    const stats = await mongoose.connection.db.command({
      explain: {
        aggregate: "optimizedaccesslogs",
        pipeline: [
          { $match: { admin, createdAt: { $gte: from, $lte: to }, lastCreatedAt: { $ne: null } } },
          { $count: "total" },
        ],
        cursor: {},
      },
      verbosity: "executionStats",
    });

    const qp = stats.queryPlanner || stats.stages?.[0]?.["$cursor"]?.queryPlanner;
    const x = stats.executionStats || stats.stages?.[0]?.["$cursor"]?.executionStats;

    expect(JSON.stringify(qp.winningPlan)).toContain("admin_1_createdAt_-1_lastCreatedAt_1");
    // Covered: the count must never crack a document open.
    expect(x.totalDocsExamined).toBe(0);
    // And it must not walk the whole tenant to count a slice of it.
    expect(x.totalKeysExamined).toBeLessThan(200);
  });
});
