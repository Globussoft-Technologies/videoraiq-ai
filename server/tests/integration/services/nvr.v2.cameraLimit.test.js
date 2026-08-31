/**
 * v2 camera-licence enforcement on the NVR paths.
 *
 * Two bugs this covers:
 *   - addSelectedCameras never checked purchasedCameras, so a client on a
 *     1-camera licence could add a second through Manage Cameras.
 *   - addNvr marked every discovered channel isAdded, ignoring the licence.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

vi.mock("../../../socket.js", () => ({
  emitCameraLimit: vi.fn(),
  sendPayloadToUser: vi.fn(),
  initSocket: vi.fn(),
}));
vi.mock("../../../services/delete.service.js", () => ({
  default: { deleteChannel: vi.fn().mockResolvedValue(true), deleteNVR: vi.fn().mockResolvedValue(true) },
}));

const { default: NVRService } = await import("../../../core/v2/NVR/nvr.service.js");
const { default: Channel } = await import("../../../core/v2/channels/channels.model.js");
const { default: NVR } = await import("../../../core/v2/NVR/nvr.model.js");
const { default: Admin } = await import("../../../core/v2/admin/admin.model.js");
const { emitCameraLimit } = await import("../../../socket.js");
await import("../../../core/v2/profiles/profiles.model.js");
await import("../../../core/v2/authorizedUsers/authorizedUsers.model.js");

const USER_ID = "700";

beforeAll(async () => { await connectMongo(); });
afterAll(async () => { await disconnectMongo(); });
beforeEach(async () => { await clearCollections(); vi.clearAllMocks(); });

const makeAdmin = (purchasedCameras) =>
  Admin.create({ user_id: USER_ID, login: "c", email: "c@test.com", purchasedCameras });

const makeNvr = () =>
  NVR.create({
    userId: USER_ID, nvrName: "NVR-1", brand: "hikvision",
    domain: "http://nvr.local", location: "HQ", localNvrId: "nvr-1",
  });

let seq = 0;
const makeCamera = (nvrId, isAdded) => {
  seq += 1;
  return Channel.create({
    nvrId, userId: USER_ID,
    streamingPath: `/Streaming/Channels/${700 + seq}`,
    localChannelId: String(seq),
    name: `Cam-${seq}`, isAdded,
  });
};

describe("addSelectedCameras — camera licence", () => {
  it("refuses a selection that would exceed the licence", async () => {
    await makeAdmin(1);
    const nvr = await makeNvr();
    const a = await makeCamera(nvr._id, true);
    const b = await makeCamera(nvr._id, false);

    const { req, res, next } = serviceCtx({
      user_id: USER_ID,
      body: { nvrId: nvr._id.toString(), cameraIds: [a.localChannelId, b.localChannelId] },
    });
    await NVRService.addSelectedCameras(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(payload(res).error.code).toBe("CAMERA_LICENSE_EXCEEDED");
    // Nothing was written.
    expect(await Channel.countDocuments({ userId: USER_ID, isAdded: true })).toBe(1);
  });

  it("allows a selection that fits, and pushes the new snapshot", async () => {
    await makeAdmin(2);
    const nvr = await makeNvr();
    const a = await makeCamera(nvr._id, true);
    const b = await makeCamera(nvr._id, false);

    const { req, res, next } = serviceCtx({
      user_id: USER_ID,
      body: { nvrId: nvr._id.toString(), cameraIds: [a.localChannelId, b.localChannelId] },
    });
    await NVRService.addSelectedCameras(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(await Channel.countDocuments({ userId: USER_ID, isAdded: true })).toBe(2);
    // Without this the over-limit lock keeps showing a stale count forever.
    expect(emitCameraLimit).toHaveBeenCalledWith({ userId: USER_ID });
  });

  it("lets an over-limit client remove cameras to get back under", async () => {
    // The exact situation that got a client stuck: 3 added on a 1 licence.
    await makeAdmin(1);
    const nvr = await makeNvr();
    const a = await makeCamera(nvr._id, true);
    await makeCamera(nvr._id, true);
    await makeCamera(nvr._id, true);

    const { req, res, next } = serviceCtx({
      user_id: USER_ID,
      body: { nvrId: nvr._id.toString(), cameraIds: [a.localChannelId] },
    });
    await NVRService.addSelectedCameras(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(await Channel.countDocuments({ userId: USER_ID, isAdded: true })).toBe(1);
    expect(emitCameraLimit).toHaveBeenCalled();
  });

  it("counts cameras already added on OTHER NVRs", async () => {
    await makeAdmin(2);
    const other = await makeNvr();
    await makeCamera(other._id, true); // spends 1 elsewhere

    const nvr = await NVR.create({
      userId: USER_ID, nvrName: "NVR-2", brand: "hikvision",
      domain: "http://nvr2.local", location: "HQ", localNvrId: "nvr-2",
    });
    const b = await makeCamera(nvr._id, false);
    const c = await makeCamera(nvr._id, false);

    const { req, res, next } = serviceCtx({
      user_id: USER_ID,
      body: { nvrId: nvr._id.toString(), cameraIds: [b.localChannelId, c.localChannelId] },
    });
    await NVRService.addSelectedCameras(req, res, next);

    // 1 elsewhere + 2 here = 3 > 2.
    expect(res.statusCode).toBe(403);
  });

  it("refuses everything when there is no licence at all", async () => {
    await makeAdmin(0);
    const nvr = await makeNvr();
    const a = await makeCamera(nvr._id, false);

    const { req, res, next } = serviceCtx({
      user_id: USER_ID,
      body: { nvrId: nvr._id.toString(), cameraIds: [a.localChannelId] },
    });
    await NVRService.addSelectedCameras(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(payload(res).message).toBe(
      "You do not have any camera license. Please contact support to enable cameras."
    );
  });
});

describe("digging out of an over-limit state", () => {
  // The exact trap reported: licence 1, 32 cameras added on another NVR. Every
  // save was refused because of the OTHER NVR, so there was no order in which
  // to fix it — each modal blamed cameras it could not touch.
  it("allows a reduction on this NVR even while the tenant is over limit", async () => {
    await makeAdmin(1);
    const other = await makeNvr();
    for (let i = 0; i < 3; i += 1) await makeCamera(other._id, true);

    const here = await NVR.create({
      userId: USER_ID, nvrName: "NVR-2", brand: "hikvision",
      domain: "http://nvr2.local", location: "HQ", localNvrId: "nvr-2",
    });
    const a = await makeCamera(here._id, true);
    await makeCamera(here._id, true);
    await makeCamera(here._id, true);

    // 6 added, licence 1. Cutting this NVR from 3 to 1 is a reduction (6 -> 4)
    // and must be allowed even though 4 is still over.
    const { req, res, next } = serviceCtx({
      user_id: USER_ID,
      body: { nvrId: here._id.toString(), cameraIds: [a.localChannelId] },
    });
    await NVRService.addSelectedCameras(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(await Channel.countDocuments({ userId: USER_ID, isAdded: true })).toBe(4);
  });

  it("allows clearing this NVR entirely while over limit", async () => {
    await makeAdmin(1);
    const other = await makeNvr();
    await makeCamera(other._id, true);

    const here = await NVR.create({
      userId: USER_ID, nvrName: "NVR-2", brand: "hikvision",
      domain: "http://nvr2.local", location: "HQ", localNvrId: "nvr-2",
    });
    await makeCamera(here._id, true);
    await makeCamera(here._id, true);

    // The UI's clear-everything sentinel.
    const { req, res, next } = serviceCtx({
      user_id: USER_ID,
      body: { nvrId: here._id.toString(), cameraIds: ["__none__"] },
    });
    await NVRService.addSelectedCameras(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(await Channel.countDocuments({ userId: USER_ID, isAdded: true })).toBe(1);
  });

  it("still refuses an increase while over limit", async () => {
    await makeAdmin(1);
    const other = await makeNvr();
    for (let i = 0; i < 3; i += 1) await makeCamera(other._id, true);

    const here = await NVR.create({
      userId: USER_ID, nvrName: "NVR-2", brand: "hikvision",
      domain: "http://nvr2.local", location: "HQ", localNvrId: "nvr-2",
    });
    const a = await makeCamera(here._id, false);

    const { req, res, next } = serviceCtx({
      user_id: USER_ID,
      body: { nvrId: here._id.toString(), cameraIds: [a.localChannelId] },
    });
    await NVRService.addSelectedCameras(req, res, next);

    expect(res.statusCode).toBe(403);
    // The message must point at the other NVRs, not tell them to deselect
    // cameras they never selected here.
    expect(payload(res).message).toContain("other NVRs");
    expect(payload(res).error.addedElsewhere).toBe(3);
    expect(payload(res).error.selectableHere).toBe(0);
  });
});

describe("getRemainingCameraLimit", () => {
  it("is the licence minus what is already added, never negative", async () => {
    await makeAdmin(2);
    const nvr = await makeNvr();
    await makeCamera(nvr._id, true);
    expect(await NVRService.getRemainingCameraLimit(USER_ID)).toBe(1);

    await makeCamera(nvr._id, true);
    await makeCamera(nvr._id, true);
    expect(await NVRService.getRemainingCameraLimit(USER_ID)).toBe(0);
  });

  it("is 0 — not unlimited — when nothing is licensed", async () => {
    await makeAdmin(0);
    expect(await NVRService.getRemainingCameraLimit(USER_ID)).toBe(0);
  });
});
