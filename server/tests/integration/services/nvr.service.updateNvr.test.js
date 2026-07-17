/**
 * Integration coverage for NVRService.updateNvr — the 0-coverage updateNvr
 * method, which in local mode validates the body, looks up the NVR by
 * `localNvrId`, syncs cameras (create/update/skip), and patches NVR metadata.
 *
 * Branches exercised here:
 *   - missing nvrId in params → 400
 *   - validation error → 400
 *   - NVR not found by localNvrId → 404
 *   - happy path: rename + new camera created + existing camera updated +
 *     existing camera left as-is (skipped) + cameraCount recomputed.
 *
 * Mocks: 0 — pure in-memory Mongo, APP_ENV is set to "local" by setup.js.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

const { default: NVRService } = await import(
  "../../../core/v1/NVR/nvr.service.js"
);
const { default: NVR } = await import("../../../core/v1/NVR/nvr.model.js");
const { default: Channel } = await import(
  "../../../core/v1/channels/channels.model.js"
);

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

describe("NVRService.updateNvr — guard branches", () => {
  it("returns 400 when the nvrId param is missing", async () => {
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      params: {},
      body: { nvrName: "x" },
    });
    await NVRService.updateNvr(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when the body fails validation (bad brand)", async () => {
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      params: { id: "any" },
      body: { brand: "not-a-real-brand" },
    });
    await NVRService.updateNvr(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when no NVR matches the localNvrId", async () => {
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      params: { id: "does-not-exist" },
      body: { nvrName: "Renamed" },
    });
    await NVRService.updateNvr(req, res, next);
    expect(res.statusCode).toBe(404);
  });
});

describe("NVRService.updateNvr — happy path", () => {
  it("updates metadata + syncs (create / update / skip) cameras and recomputes cameraCount", async () => {
    const nvr = await NVR.create({
      userId: "u1",
      nvrName: "Old-Name",
      brand: "hikvision",
      domain: "http://nvr.local",
      location: "HQ",
      localNvrId: "nvr-local-1",
    });
    const existingCh = await Channel.create({
      nvrId: nvr._id,
      userId: "u1",
      streamingPath: "/Streaming/Channels/101",
      localChannelId: "ch-1",
      name: "Cam-1",
      isAdded: true,
    });
    const unchangedCh = await Channel.create({
      nvrId: nvr._id,
      userId: "u1",
      streamingPath: "/Streaming/Channels/201",
      localChannelId: "ch-2",
      name: "Cam-2",
      isAdded: true,
    });

    const { req, res, next } = serviceCtx({
      user_id: "u1",
      params: { id: nvr.localNvrId },
      body: {
        nvrName: "New-Name",
        cameras: [
          // ch-1 → renamed (update)
          {
            localChannelId: "ch-1",
            name: "Cam-1-Renamed",
            streamingPath: "/Streaming/Channels/101",
          },
          // ch-2 → same name/path (skip)
          {
            localChannelId: "ch-2",
            name: "Cam-2",
            streamingPath: "/Streaming/Channels/201",
          },
          // ch-3 → new (create)
          {
            localChannelId: "ch-3",
            name: "Cam-3",
            streamingPath: "/Streaming/Channels/301",
          },
        ],
      },
    });
    await NVRService.updateNvr(req, res, next);

    expect(res.statusCode).toBe(200);
    const data = payload(res).data;
    expect(data.nvr.nvrName).toBe("New-Name");
    expect(data.nvr.cameraCount).toBe(3); // total channels
    expect(data.cameras.created).toHaveLength(1);
    expect(data.cameras.created[0].localChannelId).toBe("ch-3");
    expect(data.cameras.updated).toHaveLength(1);
    expect(data.cameras.updated[0].localChannelId).toBe("ch-1");
    expect(data.cameras.skipped).toHaveLength(1);
    expect(data.cameras.skipped[0].localChannelId).toBe("ch-2");

    // Verify DB state was actually persisted.
    const reloadedCh1 = await Channel.findById(existingCh._id).setOptions({ includeInactive: true });
    expect(reloadedCh1.name).toBe("Cam-1-Renamed");
    const newCh = await Channel.findOne({ localChannelId: "ch-3" }).setOptions({ includeInactive: true });
    expect(newCh).toBeTruthy();
    expect(newCh.streamingPath).toBe("/Streaming/Channels/301");
    expect(await Channel.countDocuments({ nvrId: nvr._id }).setOptions({ includeInactive: true })).toBe(3);
  });

  it("returns successfully even when no cameras array is provided (metadata-only update)", async () => {
    const nvr = await NVR.create({
      userId: "u1",
      nvrName: "Original",
      brand: "hikvision",
      domain: "http://nvr.local",
      location: "OldLoc",
      localNvrId: "nvr-local-2",
    });

    const { req, res, next } = serviceCtx({
      user_id: "u1",
      params: { id: nvr.localNvrId },
      body: { location: "NewLoc" },
    });
    await NVRService.updateNvr(req, res, next);

    expect(res.statusCode).toBe(200);
    const reloaded = await NVR.findById(nvr._id);
    expect(reloaded.location).toBe("NewLoc");
  });
});
