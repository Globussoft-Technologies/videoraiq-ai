/**
 * Grant detection allocations to a local fixture admin, so the Detections page
 * actually renders its cards.
 *
 * WHY THIS IS NEEDED TO SEE X-RAY AT ALL
 *
 * The X-Ray pill lives inside DetectionZoneMarking, which Detections.jsx mounts
 * only when a detection card AND a camera are both selected. Its card list is
 * filtered by the licence snapshot:
 *
 *   .filter((m) => !license || (license.allowedDetections || []).includes(...))
 *
 * `allowedDetections` comes from getLicenseState -> getAllowedAllocations,
 * which reads ClientDetectionAllocation rows and — unlike
 * getAllowedDetectionTypes — has NO on-prem bypass. So with the backend's
 * LICENSING_ENABLED false and a tenant that has no allocation rows, the
 * endpoint answers `allowedDetections: []`, the filter removes every card, and
 * the page offers nothing to select. No card, no camera panel, no X-Ray pill.
 *
 * The frontend's own VITE_LICENSING_ENABLED is the other half: with it 'false'
 * the snapshot is never fetched and nothing is filtered. This .env has it
 * 'true' (a staging value) against a backend with licensing off, and that
 * mismatch is what hides the cards. Granting the rows fixes it from the side
 * that needs no vite restart and no edit inside client_v2.
 *
 * Writes go through the raw collection, not the model: the Mongoose schema
 * constrains settingType to Object.keys(DETECTION_TYPES), which is also how
 * the xRayMode licence has to be inserted (decision D1).
 *
 * Usage (from server/):
 *   node core/v2/xray/dev/licenseDetections.js --admin <adminId> [--types a,b]
 *   node core/v2/xray/dev/licenseDetections.js --admin <adminId> --revoke
 */
process.env.NODE_ENV ||= "development";

import mongoose from "mongoose";

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const MONGO_URI = process.env.XRAY_SEED_MONGO_URI || "mongodb://127.0.0.1:27017/xray_dev";
const ADMIN_ID = argOf("admin", "");
const ALLOCATION = Number(argOf("allocation", 10));

// Same refusal as seedXrayFixtures.js: these are writes to a licensing
// collection, and the shipped config names a SHARED database.
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(MONGO_URI)) {
  console.error(`REFUSING to write licence rows to a non-local database: ${MONGO_URI}`);
  process.exit(1);
}
if (!ADMIN_ID) {
  console.error("--admin <adminId> is required (seedXrayFixtures.js prints it)");
  process.exit(1);
}

const { DETECTION_TYPES } = await import("../../../../constants/detectionTypes.js");

const requested = argOf("types", "");
const types = requested
  ? requested.split(",").map((t) => t.trim()).filter(Boolean)
  : Object.keys(DETECTION_TYPES);

const unknown = types.filter((t) => !DETECTION_TYPES[t]);
if (unknown.length) {
  console.error(`not detection types: ${unknown.join(", ")}`);
  process.exit(1);
}

await mongoose.connect(MONGO_URI);
const collection = mongoose.connection.collection("clientdetectionallocations");
const adminId = new mongoose.Types.ObjectId(ADMIN_ID);

if (flag("revoke")) {
  // xRayMode is left alone: it is the X-ray licence itself, granted separately.
  const { deletedCount } = await collection.deleteMany({
    adminId,
    settingType: { $in: types, $ne: "xRayMode" },
  });
  console.log(`revoked ${deletedCount} allocation row(s) for ${ADMIN_ID}`);
} else {
  const now = new Date();
  const result = await collection.bulkWrite(
    types.map((settingType) => ({
      updateOne: {
        filter: { adminId, settingType },
        update: {
          $set: { enabled: true, cameraAllocation: ALLOCATION, updatedAt: now },
          // cameraSelectionConfigured false keeps the numeric-pool semantics
          // (getCameraAssignments only consults per-camera rows when true), so
          // no camera has to be individually assigned for a card to appear.
          $setOnInsert: { cameraSelectionConfigured: false, createdAt: now },
        },
        upsert: true,
      },
    })),
  );
  console.log(
    `granted ${types.length} detection type(s) to ${ADMIN_ID} ` +
      `(allocation ${ALLOCATION} each; ${result.upsertedCount} new, ${result.modifiedCount} updated)`,
  );
}

await mongoose.disconnect();
