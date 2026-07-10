/**
 * DetectionSettingsService — outer-catch / 500 arms + python-notify branch
 * + "already linked + enabled" update-skip branch.
 *
 * Existing tests cover all the happy-paths and most validation 404/400 short-
 * circuits, but they never enter:
 *   - getDetectionTypes outer catch (lines 90-96)
 *   - createDetectionSettings outer catch (lines 141-150) — fires when
 *     saveDetectionSettings throws (e.g. existing-channel-already-enabled)
 *   - deleteDetectionSettings outer catch (lines 272-281)
 *   - updateDetectionSettings outer catch (lines 445-454)
 *   - getDetectionSettings outer catch (lines 492-501)
 *   - getAllDetectionSettings outer catch (lines 606-615)
 *   - getDetectionExamples outer catch (lines 650-659) — almost-impossible,
 *     but reachable by spying on res.status to throw on first call (proxy res
 *     pattern) → covered indirectly via the standard "happy path" that
 *     already exists; left out of this file.
 *   - attachDetectionSetting outer catch (lines 725-734)
 *   - detachDetectionSetting outer catch (lines 803-812)
 *
 * Plus two business-logic branches missed today:
 *   - updateDetectionSettings: linkedChannels + enabled:true → fires
 *     pythonService.handleDetectionUpdate per channel (lines 411-436).
 *   - updateDetectionSettings: existingLink already enabled + same id →
 *     pushes "already linked" into `skipped` and `continue`s (lines 361-371).
 *
 * Strategy:
 *   - 1 vi.mock for pythonService → makes the notify-loop deterministic
 *     and verifies the call shape.
 *   - vi.spyOn().mockImplementationOnce(() => throw ...) on Channel /
 *     DetectionSetting model methods to force each outer-catch arm. Spies
 *     are restored per-test via `afterEach(() => vi.restoreAllMocks())`.
 *
 * Mocks used: 1 (vi.mock for pythonService). Spies are not counted against
 * the 8-mock budget but kept minimal regardless.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

// ---- Mock 1/8: python.service so the notify loop is observable & safe.
vi.mock("../../../services/python.service.js", () => ({
  default: {
    handleDetectionUpdate: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

const { default: DetectionSettingsService } = await import(
  "../../../core/v1/detectionSettings/detectionSettings.service.js"
);
const { default: Channel } = await import(
  "../../../core/v1/channels/channels.model.js"
);
const detectionModels = await import(
  "../../../core/v1/detectionSettings/detectionSettings.model.js"
);
const { MotionDetectionSetting, DetectionSetting } = detectionModels;
const { default: NVR } = await import("../../../core/v1/NVR/nvr.model.js");
const { default: pythonService } = await import(
  "../../../services/python.service.js"
);
await import("../../../core/v1/verifyRecipients/recipients.model.js");
await import("../../../core/v1/authorizedUsers/authorizedUsers.model.js");

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  pythonService.handleDetectionUpdate.mockClear();
});
afterEach(() => {
  // Restore any spies installed for catch-path tests.
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
    localNvrId: `local-nvr-catch-${nvrSeq}`,
    ...over,
  });
}

async function makeMotionSetting(over = {}) {
  return MotionDetectionSetting.create({
    name: "motion-catch",
    settingType: "motionDetectionSettings",
    userId: "u1",
    enabled: true,
    settings: { metricType: "gauge" },
    alerts: [],
    ...over,
  });
}

function makeChannel(nvrId, over = {}) {
  return Channel.create({
    nvrId,
    userId: "u1",
    streamingPath: "/Streaming/Channels/101",
    localChannelId: "1",
    name: "Cam-Catch",
    isAdded: true,
    ...over,
  });
}

// ---------------------------------------------------------------------------
// updateDetectionSettings — python notify loop + already-linked-enabled skip
// ---------------------------------------------------------------------------

describe("DetectionSettingsService.updateDetectionSettings — python notify + already-linked branch", () => {
  it("invokes pythonService.handleDetectionUpdate once per linked enabled channel", async () => {
    // The notify loop fires for channels with detections.<type>.enabled=true.
    const setting = await makeMotionSetting({
      settings: {
        metricType: "gauge",
        referencePoints: { dummy: [[0, 0]] },
        obstruction_threshold_sec: 5,
        videoResolution: [1920, 1080],
        levelOfImportance: "high",
      },
    });
    const nvr = await makeNVR();
    // Channel that's already linked AND enabled — so the post-update notify
    // loop picks it up.
    const ch = await makeChannel(nvr._id, {
      detections: {
        motionDetectionSettings: { id: setting._id, enabled: true },
      },
    });

    const { req, res, next } = serviceCtx({
      user_id: "u1",
      adminId: "admin-123",
      params: { id: setting._id.toString() },
      body: {
        NVRId: nvr._id,
        channelId: [ch._id.toString()],
        // touch nested settings so the merge branch fires too
        settings: { metricType: "counter" },
      },
    });
    await DetectionSettingsService.updateDetectionSettings(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(pythonService.handleDetectionUpdate).toHaveBeenCalledTimes(1);
    // First positional arg is the populated channel — _id should match.
    const [channelArg, adminIdArg, settingTypeArg] =
      pythonService.handleDetectionUpdate.mock.calls[0];
    expect(channelArg?._id?.toString()).toBe(ch._id.toString());
    expect(adminIdArg).toBe("admin-123");
    expect(settingTypeArg).toBe("motionDetectionSettings");
  });

  it("pushes 'already linked' into skipped + continues when channel link is same id and enabled", async () => {
    const setting = await makeMotionSetting();
    const nvr = await makeNVR();
    // Pre-link this channel to this same setting with enabled=true → the
    // update-loop should hit the early `skipped.push(...already linked...)`
    // arm at lines 361-371.
    const ch = await makeChannel(nvr._id, {
      detections: {
        motionDetectionSettings: { id: setting._id, enabled: true },
      },
    });

    const { req, res, next } = serviceCtx({
      user_id: "u1",
      adminId: "admin-1",
      params: { id: setting._id.toString() },
      body: {
        NVRId: nvr._id,
        channelId: [ch._id.toString()],
      },
    });
    await DetectionSettingsService.updateDetectionSettings(req, res, next);
    expect(res.statusCode).toBe(200);
    const data = payload(res).data;
    expect(data.skipped).toHaveLength(1);
    expect(data.skipped[0].reason).toMatch(/already linked/i);
    expect(data.saved).toHaveLength(0);
  });

  it("swallows pythonService rejection inside the notify loop and still returns 200", async () => {
    // Hits the per-channel try/catch inside the notify loop (lines 430-435).
    pythonService.handleDetectionUpdate.mockRejectedValueOnce(
      new Error("python down"),
    );
    const setting = await makeMotionSetting();
    const nvr = await makeNVR();
    const ch = await makeChannel(nvr._id, {
      detections: {
        motionDetectionSettings: { id: setting._id, enabled: true },
      },
    });
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      adminId: "admin-2",
      params: { id: setting._id.toString() },
      body: { NVRId: nvr._id, channelId: [ch._id.toString()] },
    });
    await DetectionSettingsService.updateDetectionSettings(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(pythonService.handleDetectionUpdate).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Outer-catch / 500 arms — one per handler that has one.
// ---------------------------------------------------------------------------

describe("DetectionSettingsService — outer-catch 500 arms", () => {
  it("getDetectionTypes returns 500 when res.status throws", async () => {
    // The body is one-liner around the Response helper. We make it explode by
    // passing a res whose `.status()` throws on first call.
    const req = { verified: { userData: { user_id: "u1" } } };
    const explodingRes = {
      _firstCall: true,
      status(code) {
        if (this._firstCall) {
          this._firstCall = false;
          throw new Error("status-boom");
        }
        this.statusCode = code;
        return this;
      },
      json(body) {
        this._body = body;
        return this;
      },
    };
    await DetectionSettingsService.getDetectionTypes(req, explodingRes);
    expect(explodingRes.statusCode).toBe(500);
    expect(explodingRes._body?.body?.message).toMatch(
      /Failed to fetch detection types/,
    );
  });

  it("createDetectionSettings returns 500 when DetectionSetting.findOne throws", async () => {
    vi.spyOn(DetectionSetting, "findOne").mockImplementationOnce(() => {
      throw new Error("create-find-boom");
    });
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      body: {
        name: "motion-y",
        settingType: "motionDetectionSettings",
        NVRId: new mongoose.Types.ObjectId().toString(),
        channelId: [new mongoose.Types.ObjectId().toString()],
        enabled: true,
        settings: { metricType: "gauge" },
      },
    });
    await DetectionSettingsService.createDetectionSettings(req, res, next);
    expect(res.statusCode).toBe(500);
    expect(payload(res).message).toMatch(/Detection settings creation failed/);
  });

  it("deleteDetectionSettings returns 500 when Channel.updateMany throws", async () => {
    const setting = await makeMotionSetting();
    vi.spyOn(Channel, "updateMany").mockImplementationOnce(() => {
      throw new Error("delete-updateMany-boom");
    });
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      params: { id: setting._id.toString() },
    });
    await DetectionSettingsService.deleteDetectionSettings(req, res, next);
    expect(res.statusCode).toBe(500);
    expect(payload(res).message).toMatch(/Failed to delete detection settings/);
  });

  it("updateDetectionSettings returns 500 when DetectionSetting.findOne throws", async () => {
    vi.spyOn(DetectionSetting, "findOne").mockImplementationOnce(() => {
      throw new Error("update-find-boom");
    });
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      params: { id: new mongoose.Types.ObjectId().toString() },
      body: { name: "anything" },
    });
    await DetectionSettingsService.updateDetectionSettings(req, res, next);
    expect(res.statusCode).toBe(500);
    expect(payload(res).message).toMatch(/Failed to update detection settings/);
  });

  it("getDetectionSettings returns 500 when DetectionSetting.findOne throws", async () => {
    vi.spyOn(DetectionSetting, "findOne").mockImplementationOnce(() => {
      throw new Error("get-find-boom");
    });
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      params: { id: new mongoose.Types.ObjectId().toString() },
    });
    await DetectionSettingsService.getDetectionSettings(req, res, next);
    expect(res.statusCode).toBe(500);
    expect(payload(res).message).toMatch(/Failed to fetch detection settings/);
  });

  it("getAllDetectionSettings returns 500 when DetectionSetting.countDocuments throws", async () => {
    vi.spyOn(DetectionSetting, "countDocuments").mockImplementationOnce(() => {
      throw new Error("count-boom");
    });
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      query: {},
    });
    await DetectionSettingsService.getAllDetectionSettings(req, res, next);
    expect(res.statusCode).toBe(500);
    expect(payload(res).message).toMatch(/Failed to fetch detection settings/);
  });

  it("attachDetectionSetting returns 500 when DetectionSetting.findOne throws", async () => {
    vi.spyOn(DetectionSetting, "findOne").mockImplementationOnce(() => {
      throw new Error("attach-find-boom");
    });
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      body: {
        channelId: new mongoose.Types.ObjectId().toString(),
        detectionSettingId: new mongoose.Types.ObjectId().toString(),
      },
    });
    await DetectionSettingsService.attachDetectionSetting(req, res, next);
    expect(res.statusCode).toBe(500);
    expect(payload(res).message).toMatch(/Failed to attach detection setting/);
  });

  it("detachDetectionSetting returns 500 when DetectionSetting.findOne throws", async () => {
    vi.spyOn(DetectionSetting, "findOne").mockImplementationOnce(() => {
      throw new Error("detach-find-boom");
    });
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      body: {
        channelId: new mongoose.Types.ObjectId().toString(),
        detectionSettingId: new mongoose.Types.ObjectId().toString(),
      },
    });
    await DetectionSettingsService.detachDetectionSetting(req, res, next);
    expect(res.statusCode).toBe(500);
    expect(payload(res).message).toMatch(/Failed to detach detection setting/);
  });
});
