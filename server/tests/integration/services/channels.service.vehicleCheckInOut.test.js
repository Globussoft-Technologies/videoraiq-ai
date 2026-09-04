/**
 * The toggle call site has to hand the check-in/out geometry to python.service.
 *
 * This is the level the original defect lived at, and the only level that would
 * have caught it: the parameter existed on handleDetectionStartStop, the picker
 * worked, and the payload builder was correct — but toggleDetection called the
 * function with one argument too few, so the settings were always the `{}`
 * default and the detector shipped with no line and no reference point.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx } from "../../helpers/service.js";

vi.mock("../../../services/python.service.js", () => ({
  default: {
    handleDetectionStartStop: vi.fn().mockResolvedValue({ ok: true }),
    registerChannel: vi.fn().mockResolvedValue({}),
    stopDetection: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock("../../../services/delete.service.js", () => ({
  default: { deleteChannel: vi.fn().mockResolvedValue(true) },
}));
// Only the licence gate is stubbed, and only because this suite is about
// argument passing. A new detection type has no allocation row for an admin
// that already has planCamerasGranted set, so the real check 403s before
// python.service is ever reached -- see the note in the summary.
vi.mock("../../../core/v2/clientConfig/detectionLicense.service.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    assertCanEnableDetection: vi.fn().mockResolvedValue({ ok: true }),
  };
});

const { default: ChannelsService } = await import(
  "../../../core/v2/channels/channels.service.js"
);
const { default: Channel } = await import(
  "../../../core/v2/channels/channels.model.js"
);
const { default: pythonService } = await import(
  "../../../services/python.service.js"
);
const { vehicleCheckInOutDetectionSetting } = await import(
  "../../../core/v2/detectionSettings/detectionSettings.model.js"
);
await import("../../../core/v1/NVR/nvr.model.js");
await import("../../../core/v1/profiles/profiles.model.js");
await import("../../../core/v1/authorizedUsers/authorizedUsers.model.js");
await import("../../../core/v1/users/users.model.js");

const GEOMETRY = {
  line_coordinates: [
    [100, 500],
    [1800, 500],
  ],
  inside_reference_point: [900, 300],
  zone_name: "Main Gate",
};

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  vi.clearAllMocks();
});

/** userId is deliberately not "32" — toggleDetection 403s that account. */
const seed = async () => {
  const setting = await vehicleCheckInOutDetectionSetting.create({
    userId: "u1",
    settingType: "vehicleCheckInOutSettings",
    name: "Main Gate",
    enabled: true,
    settings: { ...GEOMETRY, camType: ["checkin", "checkout"] },
  });
  const channel = await Channel.create({
    nvrId: new mongoose.Types.ObjectId(),
    userId: "u1",
    streamingPath: "/Streaming/Channels/101",
    localChannelId: "1",
    name: "Main Gate Cam",
    isAdded: true,
    detections: {
      vehicleCheckInOutSettings: { id: setting._id, enabled: false },
    },
  });
  return { setting, channel };
};

const toggle = async (channel, enable) => {
  const { req, res, next } = serviceCtx({
    body: {
      channelId: channel._id.toString(),
      detectionType: "vehicleCheckInOutSettings",
      enable,
    },
  });
  await ChannelsService.toggleDetection(req, res, next);
  return res;
};

describe("toggleDetection — vehicleCheckInOut geometry reaches python.service", () => {
  it("passes the detection settings through to handleDetectionStartStop", async () => {
    const { channel } = await seed();
    await toggle(channel, true);

    expect(pythonService.handleDetectionStartStop).toHaveBeenCalled();
    const args = pythonService.handleDetectionStartStop.mock.calls.at(-1);

    // The argument the defect omitted. Asserted by position because the
    // function takes twelve positional parameters, and a shift here is exactly
    // how the value went missing the first time.
    const vehicleSettings = args[11];
    expect(vehicleSettings).toBeTruthy();
    expect(vehicleSettings.line_coordinates).toEqual(GEOMETRY.line_coordinates);
    expect(vehicleSettings.inside_reference_point).toEqual(
      GEOMETRY.inside_reference_point,
    );
  });

  it("still passes the line-crossing settings in their own slot", async () => {
    const { channel } = await seed();
    await toggle(channel, true);

    const args = pythonService.handleDetectionStartStop.mock.calls.at(-1);
    // Both slots carry the same settings document; each picker takes only the
    // fields its own detector understands. Losing this would mean the new
    // argument had displaced the existing one.
    expect(args[10]).toBeTruthy();
    expect(args[10].line_coordinates).toEqual(GEOMETRY.line_coordinates);
  });
});
