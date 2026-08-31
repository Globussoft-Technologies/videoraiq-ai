/**
 * Revoking a detection must actually stop it.
 *
 * The allocation alone only hides a detection from the UI. The CV backend reads
 * channels as a `system` caller and is deliberately unfiltered, so a revoked
 * detection used to keep running and producing incidents — with no control left
 * anywhere to switch it off, because the client's toggle had been hidden.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";

vi.mock("../../../services/python.service.js", () => ({
  default: {
    handleDetectionStartStop: vi.fn().mockResolvedValue({ ok: true }),
    handleDetectionUpdate: vi.fn().mockResolvedValue({}),
    registerChannel: vi.fn().mockResolvedValue({}),
  },
}));

const { revokeDetectionEverywhere } = await import(
  "../../../core/v2/clientConfig/detectionLicense.service.js"
);
const { default: Channel } = await import("../../../core/v2/channels/channels.model.js");
const { default: NVR } = await import("../../../core/v2/NVR/nvr.model.js");
const { default: pythonService } = await import("../../../services/python.service.js");
await import("../../../core/v2/detectionSettings/detectionSettings.model.js");
await import("../../../core/v2/profiles/profiles.model.js");
await import("../../../core/v2/authorizedUsers/authorizedUsers.model.js");

const USER_ID = "900";
const ADMIN_ID = new mongoose.Types.ObjectId().toString();

beforeAll(async () => { await connectMongo(); });
afterAll(async () => { await disconnectMongo(); });
beforeEach(async () => { await clearCollections(); vi.clearAllMocks(); });

const makeNvr = () =>
  NVR.create({
    userId: USER_ID, nvrName: "NVR-1", brand: "hikvision",
    domain: "http://nvr.local", location: "HQ", localNvrId: "nvr-1",
  });

let seq = 0;
const makeCamera = (nvrId, detections) => {
  seq += 1;
  return Channel.create({
    nvrId, userId: USER_ID,
    streamingPath: `/Streaming/Channels/${900 + seq}`,
    localChannelId: String(seq), name: `Cam-${seq}`, isAdded: true,
    detections,
  });
};

describe("revokeDetectionEverywhere", () => {
  it("switches the detection off on every camera running it", async () => {
    const nvr = await makeNvr();
    const settingId = new mongoose.Types.ObjectId();
    const a = await makeCamera(nvr._id, {
      carModelDetectionSettings: { id: settingId, enabled: true },
    });
    const b = await makeCamera(nvr._id, {
      carModelDetectionSettings: { id: settingId, enabled: true },
    });

    const result = await revokeDetectionEverywhere({
      adminId: ADMIN_ID, userId: USER_ID, settingType: "carModelDetectionSettings",
    });

    expect(result.stopped).toBe(2);
    for (const id of [a._id, b._id]) {
      const fresh = await Channel.findById(id);
      expect(fresh.detections.carModelDetectionSettings.enabled).toBe(false);
    }
  });

  it("tells the CV backend to stop each one", async () => {
    const nvr = await makeNvr();
    await makeCamera(nvr._id, {
      carModelDetectionSettings: { id: new mongoose.Types.ObjectId(), enabled: true },
    });

    await revokeDetectionEverywhere({
      adminId: ADMIN_ID, userId: USER_ID, settingType: "carModelDetectionSettings",
    });

    expect(pythonService.handleDetectionStartStop).toHaveBeenCalledTimes(1);
    const [, adminArg, enableArg, typeArg] =
      pythonService.handleDetectionStartStop.mock.calls[0];
    expect(adminArg).toBe(ADMIN_ID);
    expect(enableArg).toBe(false);
    expect(typeArg).toBe("carModelDetectionSettings");
  });

  it("leaves other detections on the same camera running", async () => {
    const nvr = await makeNvr();
    const cam = await makeCamera(nvr._id, {
      carModelDetectionSettings: { id: new mongoose.Types.ObjectId(), enabled: true },
      crowdDetectionSettings: { id: new mongoose.Types.ObjectId(), enabled: true },
    });

    await revokeDetectionEverywhere({
      adminId: ADMIN_ID, userId: USER_ID, settingType: "carModelDetectionSettings",
    });

    const fresh = await Channel.findById(cam._id);
    expect(fresh.detections.carModelDetectionSettings.enabled).toBe(false);
    expect(fresh.detections.crowdDetectionSettings.enabled).toBe(true);
    // Still running something, so the camera still holds its licence slot.
    expect(fresh.control).toBe(1);
  });

  it("clears `control` when it was the camera's last running detection", async () => {
    // updateMany would bypass the pre-save hook that maintains `control`,
    // leaving the camera marked running with nothing running on it.
    const nvr = await makeNvr();
    const cam = await makeCamera(nvr._id, {
      carModelDetectionSettings: { id: new mongoose.Types.ObjectId(), enabled: true },
    });
    expect((await Channel.findById(cam._id)).control).toBe(1);

    await revokeDetectionEverywhere({
      adminId: ADMIN_ID, userId: USER_ID, settingType: "carModelDetectionSettings",
    });

    expect((await Channel.findById(cam._id)).control).toBe(0);
  });

  it("clears a manual override so the schedule runner cannot turn it back on", async () => {
    const nvr = await makeNvr();
    const cam = await makeCamera(nvr._id, {
      carModelDetectionSettings: {
        id: new mongoose.Types.ObjectId(),
        enabled: true,
        overrideState: true,
        overrideUntil: new Date(Date.now() + 3600_000),
      },
    });

    await revokeDetectionEverywhere({
      adminId: ADMIN_ID, userId: USER_ID, settingType: "carModelDetectionSettings",
    });

    const fresh = await Channel.findById(cam._id);
    expect(fresh.detections.carModelDetectionSettings.overrideState).toBeUndefined();
    expect(fresh.detections.carModelDetectionSettings.overrideUntil).toBeUndefined();
  });

  it("still disables the camera when the engine stop fails", async () => {
    pythonService.handleDetectionStartStop.mockRejectedValueOnce(new Error("DS down"));
    const nvr = await makeNvr();
    const cam = await makeCamera(nvr._id, {
      carModelDetectionSettings: { id: new mongoose.Types.ObjectId(), enabled: true },
    });

    const result = await revokeDetectionEverywhere({
      adminId: ADMIN_ID, userId: USER_ID, settingType: "carModelDetectionSettings",
    });

    expect(result.failed).toBe(1);
    expect(result.stopped).toBe(1);
    // The state the UI and the licence read from must be correct either way.
    expect((await Channel.findById(cam._id)).detections.carModelDetectionSettings.enabled)
      .toBe(false);
  });

  it("is a no-op when nothing is running it", async () => {
    const result = await revokeDetectionEverywhere({
      adminId: ADMIN_ID, userId: USER_ID, settingType: "carModelDetectionSettings",
    });
    expect(result).toEqual({ stopped: 0, failed: 0, cameras: 0 });
    expect(pythonService.handleDetectionStartStop).not.toHaveBeenCalled();
  });
});
