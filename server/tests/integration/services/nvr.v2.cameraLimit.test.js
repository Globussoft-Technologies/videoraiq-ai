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

vi.mock("../../../utils/rtspStream.js", async (importOriginal) => ({
  ...await importOriginal(),
  generatePlayBackUrl: vi.fn().mockResolvedValue("session/playlist.m3u8"),
}));

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

const makeNvr = (overrides = {}) =>
  NVR.create({
    userId: USER_ID, nvrName: "NVR-1", brand: "hikvision",
    domain: "http://nvr.local", location: "HQ", localNvrId: "nvr-1",
    ...overrides,
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
    expect(await NVRService.getCameraCapacity(USER_ID)).toEqual({
      limit: 2,
      inUse: 1,
      remaining: 1,
    });

    await makeCamera(nvr._id, true);
    await makeCamera(nvr._id, true);
    expect(await NVRService.getRemainingCameraLimit(USER_ID)).toBe(0);
  });

  it("is 0 — not unlimited — when nothing is licensed", async () => {
    await makeAdmin(0);
    expect(await NVRService.getRemainingCameraLimit(USER_ID)).toBe(0);
  });
});

describe("direct RTSP bypass", () => {
  it("returns stored cameras and skips physical NVR refresh", async () => {
    const nvr = await makeNvr({ connectionMode: "direct" });
    const camera = await makeCamera(nvr._id, true);
    const fetchSpy = vi.spyOn(NVRService, "_fetchCamerasFromNvr");

    const edit = serviceCtx({ user_id: USER_ID, params: { nvrId: nvr._id.toString() } });
    await NVRService.editNvrCameras(edit.req, edit.res, edit.next);
    expect(edit.res.statusCode).toBe(200);
    expect(payload(edit.res).data.availableCameras[0].dbId.toString()).toBe(camera._id.toString());
    expect(fetchSpy).not.toHaveBeenCalled();

    const refresh = serviceCtx({ user_id: USER_ID, params: { id: nvr._id.toString() } });
    await NVRService.updateNvrChannels(refresh.req, refresh.res, refresh.next);
    expect(refresh.res.statusCode).toBe(200);
    expect(payload(refresh.res).message).toMatch(/do not require NVR refresh/i);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});


describe("hybrid installer onboarding", () => {
  it.each(["cloud", "onprem"])("registers and retries installer metadata for a %s account without duplicate cameras", async (appEnv) => {
    const admin = await makeAdmin(1);
    await Admin.updateOne({ _id: admin._id }, { appEnv });
    const body = {
      nvr: { nvrName: "Private site", brand: "hikvision", location: "Factory",
        domain: "https://factory.example", localNvrId: "factory-1" },
      cameras: [1, 2].map((id) => ({ name: `Camera ${id}`, localChannelId: `edge-${id}`,
        streamingPath: `stream/edge-${id}/playlist.m3u8` })),
    };
    const first = serviceCtx({ user_id: USER_ID, body });
    await NVRService.addNvr(first.req, first.res, first.next);
    expect(first.res.statusCode).toBe(201);
    const nvr = await NVR.findOne({ userId: USER_ID });
    expect(nvr.managementSource).toBe("installer");
    expect(await Channel.countDocuments({ userId: USER_ID, isAdded: true })).toBe(1);

    const retry = serviceCtx({ user_id: USER_ID, body });
    await NVRService.addNvr(retry.req, retry.res, retry.next);
    expect(retry.res.statusCode).toBe(200);
    expect(await NVR.countDocuments({ userId: USER_ID })).toBe(1);
    expect(await Channel.countDocuments({ userId: USER_ID }).setOptions({ includeInactive: true })).toBe(2);
    expect((await Admin.findById(admin._id)).appEnv).toBe(appEnv);
  });

  it("edits an installer domain by Mongo ID while keeping the account cloud", async () => {
    const admin = await makeAdmin(2);
    await Admin.updateOne({ _id: admin._id }, { appEnv: "cloud" });
    const nvr = await makeNvr();
    const update = serviceCtx({ user_id: USER_ID, params: { id: String(nvr._id) },
      body: { nvrName: "Updated", domain: "https://new-site.example" } });
    await NVRService.updateNvr(update.req, update.res, update.next);
    expect(update.res.statusCode).toBe(200);
    expect((await NVR.findById(nvr._id)).domain).toBe("https://new-site.example");
    expect((await Admin.findById(admin._id)).appEnv).toBe("cloud");
  });

  it("does not discover installer cameras through the private NVR IP", async () => {
    const nvr = await makeNvr();
    const camera = await makeCamera(nvr._id, true);
    const fetchSpy = vi.spyOn(NVRService, "_fetchCamerasFromNvr");
    const ctx = serviceCtx({ user_id: USER_ID, params: { nvrId: String(nvr._id) } });
    await NVRService.editNvrCameras(ctx.req, ctx.res, ctx.next);
    expect(ctx.res.statusCode).toBe(200);
    expect(payload(ctx.res).data.availableCameras[0].channelId).toBe(camera.localChannelId);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});


describe("hybrid playback routing", () => {
  it.each([true, false])("uses the owning server and camera ID (installer=%s)", async (installer) => {
    const { default: ChannelsService } = await import("../../../core/v2/channels/channels.service.js");
    const { generatePlayBackUrl } = await import("../../../utils/rtspStream.js");
    const admin = await makeAdmin(2);
    await Admin.updateOne({ _id: admin._id }, { appEnv: "cloud", streamHost: "https://cloud.example" });
    const nvr = await makeNvr(installer ? {} : { localNvrId: undefined, domain: undefined });
    const camera = await makeCamera(nvr._id, true);
    const ctx = serviceCtx({ user_id: USER_ID, body: {
      channelId: String(camera._id), startTime: "2026-10-01T10:00:00Z", sessionId: "session",
    } });
    await ChannelsService.getPlaybackUrl(ctx.req, ctx.res, ctx.next);
    expect(ctx.res.statusCode).toBe(200);
    expect(generatePlayBackUrl).toHaveBeenCalledWith(
      "session", installer ? camera.localChannelId : `${nvr._id}-${camera._id}`,
      "2026-10-01T10:00:00Z", undefined, USER_ID,
      installer ? "http://nvr.local" : "https://cloud.example",
    );
    expect(payload(ctx.res).data.playbackUrl).toBe(
      `${installer ? "http://nvr.local" : "https://cloud.example"}/session/playlist.m3u8`,
    );
  });
});


describe("existing installer API compatibility", () => {
  it.each(["cloud", "onprem"])("accepts %s installer registration and updates through v1 without changing account mode", async (appEnv) => {
    const { default: LegacyService } = await import("../../../core/v1/NVR/nvr.service.js");
    const admin = await makeAdmin(2);
    await Admin.updateOne({ _id: admin._id }, { appEnv });
    const add = serviceCtx({ user_id: USER_ID, body: {
      nvr: { nvrName: "Existing installer", brand: "hikvision", location: "HQ",
        domain: "https://site.example", localNvrId: "legacy-installer" },
      cameras: [{ name: "Lobby", localChannelId: "edge", streamingPath: "stream/edge/playlist.m3u8" }],
    } });
    await LegacyService.addNvr(add.req, add.res, add.next);
    expect(add.res.statusCode).toBe(201);
    const update = serviceCtx({ user_id: USER_ID, params: { id: "legacy-installer" },
      body: { domain: "https://updated.example" } });
    await LegacyService.updateNvr(update.req, update.res, update.next);
    expect(update.res.statusCode).toBe(200);
    expect((await NVR.findOne({ userId: USER_ID })).domain).toBe("https://updated.example");
    expect((await Admin.findById(admin._id)).appEnv).toBe(appEnv);
  });
});


describe("installer camera deletion protection", () => {
  it.each([
    { managementSource: "installer", localNvrId: undefined },
    { localNvrId: "legacy-edge" },
  ])("rejects deletion for installer marker %j without side effects", async (markers) => {
    const { default: DeleteService } = await import("../../../services/delete.service.js");
    const nvr = await makeNvr(markers);
    const camera = await makeCamera(nvr._id, true);
    const ctx = serviceCtx({ user_id: USER_ID, params: { cameraId: String(camera._id) } });
    await NVRService.removeCamera(ctx.req, ctx.res, ctx.next);
    expect(ctx.res.statusCode).toBe(403);
    expect(payload(ctx.res).error.code).toBe("INSTALLER_MANAGED_CAMERA");
    expect(DeleteService.deleteChannel).not.toHaveBeenCalled();
    expect(emitCameraLimit).not.toHaveBeenCalled();
    expect(await Channel.findById(camera._id)).toBeTruthy();
  });

  it("preserves deletion for application-managed cameras", async () => {
    const { default: DeleteService } = await import("../../../services/delete.service.js");
    const nvr = await makeNvr({ localNvrId: undefined });
    const camera = await makeCamera(nvr._id, true);
    const ctx = serviceCtx({ user_id: USER_ID, params: { cameraId: String(camera._id) } });
    await NVRService.removeCamera(ctx.req, ctx.res, ctx.next);
    expect(ctx.res.statusCode).toBe(200);
    expect(DeleteService.deleteChannel).toHaveBeenCalledWith(String(camera._id));
  });

  it("also rejects the legacy v1 application endpoint for a cloud installer camera", async () => {
    const { default: LegacyService } = await import("../../../core/v1/NVR/nvr.service.js");
    const { default: DeleteService } = await import("../../../services/delete.service.js");
    const admin = await makeAdmin(2);
    await Admin.updateOne({ _id: admin._id }, { appEnv: "cloud" });
    const nvr = await makeNvr();
    const camera = await makeCamera(nvr._id, true);
    const ctx = serviceCtx({ user_id: USER_ID, params: { cameraId: String(camera._id) } });
    await LegacyService.removeCamera(ctx.req, ctx.res, ctx.next);
    expect(ctx.res.statusCode).toBe(403);
    expect(DeleteService.deleteChannel).not.toHaveBeenCalled();
  });
});
