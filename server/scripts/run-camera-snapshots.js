// Run inside the staging backend directory with its deployed configuration:
// node scripts/run-camera-snapshots.js --user-id 13
// node scripts/run-camera-snapshots.js --all
import "dotenv/config";

const args = process.argv.slice(2);
const userIndex = args.indexOf("--user-id");
const userId = userIndex >= 0 ? args[userIndex + 1] : null;
const all = args.includes("--all");
if ((all && userIndex >= 0) || (!all && !/^\d+$/.test(userId || "")) || args.some(arg => arg !== "--all" && arg !== "--user-id" && arg !== userId)) {
  console.error("Usage: node scripts/run-camera-snapshots.js --user-id <numeric-user-id> | --all");
  process.exit(1);
}

let mongoose;
let redis;
let exitCode = 0;
try {
  const { default: config } = await import("config");
  ({ default: mongoose } = await import("mongoose"));
  const database = await import("../utils/database.js");
  redis = database.redis;
  await mongoose.connect(config.get("mongodb_uri"), { serverSelectionTimeoutMS: 10000 });
  const { runCameraSnapshotSweep } = await import("../services/cameraSnapshots.service.js");
  console.log(`Starting one-time snapshot sweep for ${all ? "all added cameras" : `user ${userId}`}. Active capture leases remain protected.`);
  const summary = await runCameraSnapshotSweep({ force: true, ...(all ? {} : { userId }) });
  console.log(JSON.stringify(summary, null, 2));
  if (summary.error || summary.failed || summary.alreadyRunning) exitCode = 1;
} catch (error) {
  console.error(`Snapshot sweep could not complete (${error.code || error.name || "error"}).`);
  exitCode = 1;
} finally {
  redis?.disconnect();
  await mongoose?.disconnect();
  // Existing media-storage pools may have keepalive timers after the sweep.
  process.exit(exitCode);
}
