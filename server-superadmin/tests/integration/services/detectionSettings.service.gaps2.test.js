/**
 * Gap-fill round 2 for detectionSettings.service.js.
 *
 * Existing tests cover the happy paths and most outer catches. Residual
 * uncovered ranges per v8: 173-174, 187-192, 213-219, 236-237, 303-306.
 *
 * Targeted here:
 *   - 173-174  saveDetectionSettings throws "Unsupported detection type:"
 *              when an unknown settingType is provided. Exercised via
 *              the static directly (no public route can reach it because
 *              Joi rejects unknown settingTypes earlier).
 *   - 187-192  pre-existing channel already has this detection type
 *              enabled → throws "Channel 'X' already has Y enabled."
 *              Exercised via the static directly with a seeded channel.
 *   - 213-219  per-channel skip in the second loop because that channel
 *              also has the type enabled (caught via channel.save chain
 *              after the pre-check).
 *   - 236-237  per-channel catch: channel.save rejects → pushed to
 *              skippedChannels with err.message reason.
 *   - 303-306  updateDetectionSettings: detection setting not found → 404.
 *
 * UNREACHABLE / not chased:
 *   - 658-667  getDetectionExamples outer catch — the function builds a
 *              static object literal from imported constants and calls
 *              res.status; only res.status throwing could trigger the
 *              catch and that's outside normal injection points.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

const { default: DetectionSettingsService } = await import(
  "../../../core/v1/detectionSettings/detectionSettings.service.js"
);
const { default: Channel } = await import(
  "../../../core/v1/channels/channels.model.js"
);
const { default: NVR } = await import("../../../core/v1/NVR/nvr.model.js");
const detectionModels = await import(
  "../../../core/v1/detectionSettings/detectionSettings.model.js"
);
const { DetectionSetting } = detectionModels;

// Resolve the controller class via the singleton's prototype to call its
// static `saveDetectionSettings` (it's defined on the class body).
const DetectionSettingsClass = Object.getPrototypeOf(DetectionSettingsService).constructor;

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  vi.restoreAllMocks();
});

let nvrSeq = 0;
async function makeNVR(over = {}) {
  nvrSeq += 1;
  return NVR.create({
    userId: "u1",
    nvrName: "TestNVR",
    brand: "hikvision",
    domain: "http://nvr.local",
    location: "HQ",
    localNvrId: `local-nvr-ds-gaps2-${nvrSeq}`,
    ...over,
  });
}

let chSeq = 0;
async function makeChannel(over = {}) {
  chSeq += 1;
  return Channel.create({
    userId: "u1",
    name: `ch-${chSeq}`,
    nvrId: over.nvrId,
    channelNumber: chSeq,
    streamUrl: "rtsp://x",
    localChannelId: `lc-${chSeq}`,
    streamingPath: `/streams/${chSeq}.m3u8`,
    isAdded: true,
    ...over,
  });
}

describe("saveDetectionSettings — Unsupported detection type (lines 173-174)", () => {
  it("throws when settingType is not in modelMap", async () => {
    await expect(
      DetectionSettingsClass.saveDetectionSettings({
        settingType: "totallyUnknownSettings",
        settings: {},
        channelId: [],
        NVRId: new mongoose.Types.ObjectId().toString(),
        userId: "u1",
        name: "x",
      }),
    ).rejects.toThrow(/Unsupported detection type: totallyUnknownSettings/);
  });
});

describe("saveDetectionSettings — channel already has this detection enabled (lines 187-192)", () => {
  it("throws 'Channel X already has Y enabled.' when an existing channel has it enabled", async () => {
    const nvr = await makeNVR();
    const ch = await makeChannel({ nvrId: nvr._id });
    // Mongoose strict-mode may strip the deeply nested detections seed —
    // patch directly via $set so the in-memory doc carries the enabled
    // flag the pre-check reads.
    await Channel.updateOne(
      { _id: ch._id },
      { $set: { detections: { motionDetectionSettings: { enabled: true } } } },
    );

    await expect(
      DetectionSettingsClass.saveDetectionSettings({
        settingType: "motionDetectionSettings",
        enabled: true,
        settings: {},
        channelId: [ch._id.toString()],
        NVRId: nvr._id.toString(),
        userId: "u1",
        name: "newName",
      }),
    ).rejects.toThrow(/already has/);
  });
});

describe("saveDetectionSettings — skip channels that already-linked check at second loop (lines 213-219)", () => {
  it("the second per-channel loop pushes a skipped entry when the channel was concurrently enabled", async () => {
    // First-loop guard (line 185-193) reads `channel.detections?[type]?.enabled` from the
    // initial Channel.find result. The SECOND per-channel loop re-reads with
    // findOne and re-checks the same flag (line 212). To exercise the second-loop skip
    // *without* the first loop also skipping, we have to make the first read miss the
    // flag and the second read see it set.
    //
    // We do that by spying on Channel.find (first call) to return a no-detections
    // channel doc, then letting Channel.findOne return the real seeded doc with
    // detections.{type}.enabled=true.
    const nvr = await makeNVR();
    const ch = await makeChannel({
      nvrId: nvr._id,
      detections: {
        motionDetectionSettings: { enabled: true },
      },
    });

    // First Channel.find returns the doc WITHOUT detections so the first-loop
    // pre-check passes. (The subsequent findOne in the second loop reads the
    // real doc with enabled:true.)
    vi.spyOn(Channel, "find").mockResolvedValueOnce([
      { _id: ch._id, name: ch.name, detections: undefined },
    ]);

    const result = await DetectionSettingsClass.saveDetectionSettings({
      settingType: "motionDetectionSettings",
      enabled: true,
      settings: {},
      channelId: [ch._id.toString()],
      NVRId: nvr._id.toString(),
      userId: "u1",
      name: "newName2",
    });

    expect(result.saved).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toMatch(/already linked/);
  });
});

describe("saveDetectionSettings — per-channel catch (lines 235-237)", () => {
  it("pushes channel.save reject into skipped with err.message", async () => {
    const nvr = await makeNVR();
    const ch = await makeChannel({ nvrId: nvr._id });

    // The second-loop catch fires when channel.save() throws. We mock
    // Channel.findOne to return a doc whose .save rejects.
    vi.spyOn(Channel, "findOne").mockResolvedValueOnce({
      _id: ch._id,
      name: ch.name,
      detections: {},
      save: vi.fn().mockRejectedValueOnce(new Error("save-blew-up")),
    });

    const result = await DetectionSettingsClass.saveDetectionSettings({
      settingType: "motionDetectionSettings",
      enabled: true,
      settings: {},
      channelId: [ch._id.toString()],
      NVRId: nvr._id.toString(),
      userId: "u1",
      name: "name-x",
    });

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toMatch(/save-blew-up/);
  });
});

describe("updateDetectionSettings — 404 when setting not found (lines 303-306)", () => {
  it("returns 404 + userFailResp when the id doesn't resolve to a DetectionSetting", async () => {
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      params: { id: new mongoose.Types.ObjectId().toString() },
      body: { name: "irrelevant" },
    });
    await DetectionSettingsService.updateDetectionSettings(req, res, next);
    expect(res.statusCode).toBe(404);
    const body = payload(res);
    expect(body.status).toBe("failed");
    expect(body.message || body.error).toMatch(/not found/i);
  });
});
