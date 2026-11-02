/**
 * Seed a local database with just enough to exercise the X-ray relay over HTTP,
 * and print the tokens needed to do it.
 *
 * THIS IS A DEV FIXTURE. It is destructive about its own records and must only
 * ever point at a local database — it refuses to run against anything that is
 * not loopback, because the development config names a shared MongoDB and
 * seeding fake admins into it would be somebody else's bad afternoon.
 *
 * What it creates:
 *   * admin A      the operator, with an ACTIVE subscription (an expired one
 *                  makes checkActivePlan revoke live services — see
 *                  core/v2/xray/dev/run-local.ps1)
 *   * NVR + camera owned by A
 *   * admin B + a camera owned by B, to prove cross-tenant refusal
 *   * a restricted sub-user of A, allowed only B's camera, to prove the
 *     per-member camera restriction
 *
 * Usage (from server/):
 *   node core/v2/xray/dev/seedXrayFixtures.js
 *
 * It prints shell-ready exports. Pair it with dev/run-local.ps1 and
 * dev/fakeXrayService.js, then curl.
 */
process.env.NODE_ENV ||= "development";
process.env.NODE_CONFIG_DIR ||= "C:\\Users\\Admin\\face_auth\\videoraiq-config";

import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import config from "config";

const MONGO_URI = process.env.XRAY_SEED_MONGO_URI || "mongodb://127.0.0.1:27017/xray_dev";

// Refuse anything that is not clearly a local database. The cost of being
// wrong here is writing fake admins into a shared system.
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(MONGO_URI)) {
  console.error(`REFUSING to seed a non-local database: ${MONGO_URI}`);
  console.error("This script only ever runs against 127.0.0.1 or localhost.");
  process.exit(1);
}

const { default: adminModel } = await import("../../../v1/admin/admin.model.js");
const { default: NVR } = await import("../../../v1/NVR/nvr.model.js");
const { default: Channel } = await import("../../../v1/channels/channels.model.js");
const { default: authorizedChannels } = await import(
  "../../../v1/cameraRestrictions/authorizedChannels.model.js"
);
const { default: sessionModel } = await import("../../sessions/sessions.model.js");

await mongoose.connect(MONGO_URI);
console.log(`connected to ${MONGO_URI}`);

const TENANT_A = "xray-tenant-a";
const TENANT_B = "xray-tenant-b";

// Clear only OUR fixtures, by tenant key. Never a blanket deleteMany.
//
// authorizedChannels is keyed differently from the rest: its `userId` is the
// MEMBER's ObjectId, not the tenant string, so it is cleared by the admins it
// belongs to. Clearing it by tenant key throws a CastError rather than silently
// matching nothing, which is at least a loud mistake.
const staleAdmins = await adminModel
  .find({ user_id: { $in: [TENANT_A, TENANT_B] } })
  .select("_id")
  .lean();
if (staleAdmins.length) {
  await authorizedChannels.deleteMany({ adminId: { $in: staleAdmins.map((a) => a._id) } });
}
for (const model of [Channel, NVR]) {
  await model.deleteMany({ userId: { $in: [TENANT_A, TENANT_B] } });
}
await adminModel.deleteMany({ user_id: { $in: [TENANT_A, TENANT_B] } });
await mongoose.connection
  .collection("clientdetectionallocations")
  .deleteMany({ settingType: "xRayMode" });

/** A year out, so checkActivePlan sees an active plan. */
const nextYear = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
const subscriptions = { "1": nextYear };

const adminA = await adminModel.create({
  user_id: TENANT_A,
  login: "xray-a",
  email: "xray-a@local.test",
  purchasedCameras: 10,
});
const adminB = await adminModel.create({
  user_id: TENANT_B,
  login: "xray-b",
  email: "xray-b@local.test",
  purchasedCameras: 10,
});

const nvrA = await NVR.create({
  userId: TENANT_A,
  nvrName: "xray-nvr-a",
  location: "default",
  brand: "hikvision",
  // buildStreamingUrl uses `${nvr.domain}/${channel.streamingPath}` in local
  // mode, so this is the host the relay will hand to the X-ray service.
  domain: "http://127.0.0.1:8119",
});

const cameraA = await Channel.create({
  userId: TENANT_A,
  nvrId: nvrA._id,
  streamingPath: `stream/${nvrA._id}-cam-a/playlist.m3u8`,
  localChannelId: "1",
  name: "Gate camera",
  customName: "Gate camera",
  isAdded: true,
});

const nvrB = await NVR.create({
  userId: TENANT_B,
  nvrName: "xray-nvr-b",
  location: "default",
  brand: "hikvision",
  domain: "http://127.0.0.1:8119",
});

const cameraB = await Channel.create({
  userId: TENANT_B,
  nvrId: nvrB._id,
  streamingPath: `stream/${nvrB._id}-cam-b/playlist.m3u8`,
  localChannelId: "1",
  name: "Another tenant's camera",
  isAdded: true,
});

// A sub-user of admin A whose allow-list contains only tenant B's camera —
// so every camera they could reach is one they are not allowed to see.
const memberId = new mongoose.Types.ObjectId();
await authorizedChannels.create({
  adminId: adminA._id,
  userId: memberId,
  channels: [cameraB._id],
});

// A login session per tab.
//
// This is not optional decoration. verifyToken runs
// sessionsService.enforceRequestSession (sessions.service.js:292), which looks
// the `x-session-id` header up in this collection and answers 401
// SESSION_INVALID when it names nothing. So a tab id cannot be invented by a
// caller — which is what makes contract §9's tab-granular mask delivery safe to
// key on: the header is validated, not merely trusted.
const TAB_A = "tab-alpha";
const TAB_MEMBER = "tab-member";
await sessionModel.deleteMany({ sessionId: { $in: [TAB_A, TAB_MEMBER] } });
await sessionModel.create({
  sessionId: TAB_A,
  deviceId: "xray-dev-box",
  adminId: adminA._id,
  userType: "admin",
  status: "active",
});
await sessionModel.create({
  sessionId: TAB_MEMBER,
  deviceId: "xray-dev-box",
  adminId: adminA._id,
  memberId,
  userType: "user",
  status: "active",
});

const secret = config.get("jwt.secretKey");
const sign = (claims) => jwt.sign(claims, secret, { expiresIn: "2h" });

const tokenA = sign({
  adminId: String(adminA._id),
  user_id: TENANT_A,
  userSubscriptionType: subscriptions,
});
const tokenB = sign({
  adminId: String(adminB._id),
  user_id: TENANT_B,
  userSubscriptionType: subscriptions,
});
const tokenMember = sign({
  adminId: String(adminA._id),
  user_id: TENANT_A,
  memberId: String(memberId),
  userSubscriptionType: subscriptions,
});

const out = {
  XRAY_CAMERA_A: String(cameraA._id),
  XRAY_NVR_A: String(nvrA._id),
  XRAY_CAMERA_B: String(cameraB._id),
  XRAY_NVR_B: String(nvrB._id),
  XRAY_ADMIN_A: String(adminA._id),
  XRAY_TOKEN_A: tokenA,
  XRAY_TOKEN_B: tokenB,
  XRAY_TOKEN_MEMBER: tokenMember,
  XRAY_TAB_A: TAB_A,
  XRAY_TAB_MEMBER: TAB_MEMBER,
};

console.log("\nseeded:");
console.log(`  admin A  ${adminA._id}  (${TENANT_A})  camera ${cameraA._id}`);
console.log(`  admin B  ${adminB._id}  (${TENANT_B})  camera ${cameraB._id}`);
console.log(`  sub-user ${memberId} of A, allowed only B's camera`);
console.log("\n# eval this in bash:");
for (const [key, value] of Object.entries(out)) console.log(`export ${key}='${value}'`);

// To license X-ray for admin A, insert the allocation row straight into the
// collection: the Mongoose schema's settingType enum is bound to
// DETECTION_TYPES, which deliberately does not contain xRayMode (decision D1 in
// docs/xray/status_backend.md), so a model .create() would be rejected. This is
// the same insert a production grant needs today.
if (process.argv.includes("--license")) {
  await mongoose.connection.collection("clientdetectionallocations").insertOne({
    adminId: adminA._id,
    settingType: "xRayMode",
    cameraAllocation: 0,
    enabled: true,
    cameraSelectionConfigured: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  console.log("\nlicensed: admin A now has an enabled xRayMode allocation");
}

await mongoose.disconnect();

// Importing the models pulls in utils/database.js, which opens a Redis client
// at module scope. That client keeps the event loop alive forever, so a plain
// `await` at the end of this script finishes its work and then hangs. Exiting
// explicitly is correct here: every write above is already awaited, so there is
// nothing in flight to lose.
process.exit(0);
