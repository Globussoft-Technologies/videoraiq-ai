/**
 * Backfills OptimizedAccessLogs.lastCreatedAt (the max of sessions[].timestamp)
 * and builds the {admin, lastCreatedAt, createdAt} index the access-logs list
 * query hints.
 *
 * RUN THIS BEFORE DEPLOYING the getLogs change. Until it finishes, existing
 * docs have no lastCreatedAt and the new query would treat them as sessionless,
 * so the list would come back empty. The script is idempotent and resumable —
 * it only touches docs that don't have the field yet, so a re-run after an
 * interrupted pass picks up where it stopped.
 *
 *   node scripts/migrate-accesslogs-lastCreatedAt.js
 */
import mongoose from "mongoose";
import config from "config";

const MONGO_URI = config.get("mongodb_uri");

// Docs are updated with a server-side aggregation pipeline, so only _ids cross
// the wire — the sessions arrays never leave the database.
const BATCH = 2000;

async function migrate() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected");

  const coll = mongoose.connection.db.collection("optimizedaccesslogs");

  const total = await coll.countDocuments({ lastCreatedAt: { $exists: false } });
  console.log(`${total} docs to backfill`);

  // Walk forward through _id order rather than repeatedly asking for "the next
  // docs without the field". The latter has no index to work with, so every
  // batch would rescan the whole already-migrated prefix — O(n²) collection
  // scans against a collection this size. Paging on _id rides the _id index and
  // visits each doc once.
  let done = 0;
  let lastId = null;
  for (;;) {
    const batch = await coll
      .find(
        {
          ...(lastId ? { _id: { $gt: lastId } } : {}),
          lastCreatedAt: { $exists: false },
        },
        { projection: { _id: 1 } }
      )
      .sort({ _id: 1 })
      .limit(BATCH)
      .toArray();

    if (!batch.length) break;
    lastId = batch[batch.length - 1]._id;

    // $max over an empty or missing sessions array yields null, which is
    // exactly the "no sessions" marker the query filters on.
    await coll.updateMany(
      { _id: { $in: batch.map((d) => d._id) } },
      [{ $set: { lastCreatedAt: { $max: "$sessions.timestamp" } } }]
    );

    done += batch.length;
    if (done % (BATCH * 10) === 0 || done >= total) {
      console.log(`  ${done}/${total}`);
    }
  }

  console.log("Building index { admin: 1, lastCreatedAt: -1, createdAt: 1 }...");
  await coll.createIndex({ admin: 1, lastCreatedAt: -1, createdAt: 1 });

  // Self-check: every doc with sessions must now have a lastCreatedAt.
  const stragglers = await coll.countDocuments({
    "sessions.0": { $exists: true },
    lastCreatedAt: null,
  });
  if (stragglers) {
    console.error(`FAILED: ${stragglers} docs have sessions but no lastCreatedAt`);
    process.exitCode = 1;
  } else {
    console.log(`Done. Backfilled ${done} docs, index built, 0 stragglers.`);
  }

  await mongoose.connection.close();
}

migrate().catch(async (err) => {
  console.error("Migration failed:", err);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
