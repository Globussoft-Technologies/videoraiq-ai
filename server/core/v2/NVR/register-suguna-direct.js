/**
 * One-off direct registration for Suguna Foods. This intentionally skips NVR
 * HTTP/CGI discovery and stores the supplied RTSP channels directly.
 *
 * Preview: node core/v2/NVR/register-suguna-direct.js
 * Apply:   node core/v2/NVR/register-suguna-direct.js --apply
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import "dotenv/config";

process.env.NODE_ENV ||= "production";
const localConfigDir = path.resolve("config");
const parentConfigDir = path.resolve("../config");
if (!process.env.NODE_CONFIG_DIR && !existsSync(localConfigDir) && existsSync(parentConfigDir)) {
  process.env.NODE_CONFIG_DIR = parentConfigDir;
}

const configDir = process.env.NODE_CONFIG_DIR || localConfigDir;
const encryptedConfig = path.join(configDir, `${process.env.NODE_ENV}.json.enc`);
if (!process.env.NODE_CONFIG && existsSync(encryptedConfig)) {
  if (!process.env.MK) throw new Error(`MK is required to decrypt ${encryptedConfig}`);
  const { decryptConfig } = await import("../../../scripts/decrypt.js");
  process.env.NODE_CONFIG = JSON.stringify(decryptConfig(process.env.MK, encryptedConfig));
}

const [{ default: config }, { encrypt }] = await Promise.all([
  import("config"),
  import("../../../utils/cryptoUtils.js"),
]);

const APPLY = process.argv.includes("--apply");
let seedRedis;
const settings = {
  login: "sugunafoods",
  nvrName: "suguna",
  location: "default",
  brand: "dahua",
  ip: "14.102.13.217",
  httpPort: 80,
  rtspPort: 554,
  rtspUsername: "cctvpoc",
  rtspPassword: process.env.SUGUNA_RTSP_PASSWORD || "",
};
const channels = [
  { id: "1", name: "Camera 1", codec: "h264" },
  { id: "2", name: "Camera 2", codec: "h264" },
  { id: "3", name: "Camera 3", codec: "h264" },
  { id: "4", name: "Camera 4", codec: "h264" },
  { id: "6", name: "Camera 5", codec: "hevc" },
  { id: "7", name: "Camera 6", codec: "h264" },
];

const rtspUrl = (channelId) =>
  `rtsp://${settings.rtspUsername}:${settings.rtspPassword}@${settings.ip}:${settings.rtspPort}/cam/realmonitor?channel=${channelId}&subtype=0`;

function selfCheck() {
  assert.deepEqual(channels.map(({ id }) => id), ["1", "2", "3", "4", "6", "7"]);
  assert.deepEqual(channels.map(({ name }) => name), ["Camera 1", "Camera 2", "Camera 3", "Camera 4", "Camera 5", "Camera 6"]);
  assert.equal(new Set(channels.map(({ id }) => id)).size, channels.length);
  assert.equal(settings.login, "sugunafoods");
  assert.equal(settings.brand, "dahua");
  assert.equal(settings.rtspPort, 554);
}

async function main() {
  selfCheck();

  if (!APPLY) {
    console.log("DRY RUN: Suguna NVR + channels 1,2,3,4,6,7 are ready to seed.");
    console.log("Run again with --apply to store and register them.");
    return;
  }
  if (!settings.rtspPassword) {
    throw new Error("SUGUNA_RTSP_PASSWORD is required with --apply");
  }
  if (config.get("APP_ENV") !== "cloud") {
    throw new Error("This direct RTSP seed is only valid when APP_ENV=cloud");
  }

  await mongoose.connect(config.get("mongodb_uri"));
  const db = mongoose.connection.db;
  const admin = await db.collection("admins").findOne({ login: settings.login });
  if (!admin) throw new Error(`Admin login '${settings.login}' was not found`);
  if (!admin.user_id) throw new Error(`Admin login '${settings.login}' has no user_id`);

  const userId = String(admin.user_id);
  const now = new Date();
  const encryptedIp = encrypt(settings.ip);
  const existingNvr = await db.collection("nvrs").findOne({
    userId,
    ip: encryptedIp,
    port: settings.httpPort,
  });
  const channelIds = channels.map(({ id }) => id);
  const alreadyAdded = existingNvr
    ? await db.collection("channels").countDocuments({
        nvrId: existingNvr._id,
        userId,
        channelId: { $in: channelIds },
        isAdded: true,
      })
    : 0;
  const inUse = await db.collection("channels").countDocuments({ userId, isAdded: true });
  const requested = channels.length - alreadyAdded;
  const limit = Number(admin.purchasedCameras) || 0;
  if (inUse + requested > limit) {
    throw new Error(
      `Camera license exceeded: ${inUse} already added, ${requested} new requested, ${limit} allowed`,
    );
  }

  const nvr = await db.collection("nvrs").findOneAndUpdate(
    { userId, ip: encryptedIp, port: settings.httpPort },
    {
      $set: {
        nvrName: settings.nvrName,
        location: settings.location,
        brand: settings.brand,
        connectionMode: "direct",
        username: settings.rtspUsername,
        password: encrypt(settings.rtspPassword),
        rtspPort: settings.rtspPort,
        updatedAt: now,
      },
      $setOnInsert: {
        deviceName: settings.nvrName,
        cameraCount: 0,
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: "after" },
  );
  if (!nvr?._id) throw new Error("NVR upsert did not return an NVR document");

  const savedChannels = [];
  for (const channel of channels) {
    const saved = await db.collection("channels").findOneAndUpdate(
      { nvrId: nvr._id, userId, channelId: channel.id },
      {
        $set: {
          name: channel.name,
          streamEndpoint: "/cam/realmonitor",
          rtspChannels: [{
            id: `${channel.id}01`,
            codec: channel.codec,
            resolution: { width: 0, height: 0 },
          }],
          manualRtspUrl: encrypt(rtspUrl(channel.id)),
          isAdded: true,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true, returnDocument: "after" },
    );
    if (!saved?._id) throw new Error(`Channel ${channel.id} upsert failed`);
    savedChannels.push(saved);
  }

  const cameraCount = await db.collection("channels").countDocuments({
    nvrId: nvr._id,
    isAdded: true,
  });
  await db.collection("nvrs").updateOne(
    { _id: nvr._id },
    { $set: { cameraCount, updatedAt: new Date() } },
  );

  const [{ default: axios }, { resolveStream }, { redis }] = await Promise.all([
    import("axios"),
    import("../../../utils/rtspStream.js"),
    import("../../../utils/database.js"),
  ]);
  seedRedis = redis;
  const { host, token } = await resolveStream(userId);

  const failed = [];
  for (const channel of savedChannels) {
    const uid = `${nvr._id}-${channel._id}`;
    try {
      const response = await axios.post(
        `${host}/api/add-camera`,
        { id: uid, rtsp_url: rtspUrl(channel.channelId), generate: "true" },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (response.data?.status !== "success" || !response.data?.url) throw new Error();
      await redis.set(`stream_url:${uid}`, response.data.url);
    } catch {
      failed.push(channel.channelId);
    }
  }
  if (failed.length) {
    throw new Error(`Streaming registration failed for channel(s): ${failed.join(", ")}`);
  }

  console.log(`DONE: NVR ${nvr._id}; ${savedChannels.length} channels stored and registered.`);
}

main()
  .catch((error) => {
    console.error(`FAILED: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
    await seedRedis?.quit().catch(() => {});
  });
