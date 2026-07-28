/**
 * The client-facing port of the superadmin Client Configuration endpoints.
 *
 * The superadmin originals read the tenant from `req.params.adminId`, which is
 * safe only behind verifySuperAdmin. Reachable with an admin token, that shape
 * would let any client read any other client by editing the id in the path.
 * These read it from the token instead — the tests below exist mainly to keep
 * it that way, so the isolation case is the important one.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";

// getAccount enriches from aMember over HTTP; stub it so these stay offline.
global.fetch = vi.fn(async () => ({ json: async () => [] }));

const { default: ClientConfigService } = await import(
  "../../../core/v1/clientConfig/clientConfig.service.js"
);
const { default: Admin } = await import("../../../core/v1/admin/admin.model.js");
const { default: Channel } = await import("../../../core/v1/channels/channels.model.js");
const { default: NVR } = await import("../../../core/v1/NVR/nvr.model.js");
const { default: Allocation } = await import(
  "../../../core/v1/clientConfig/clientDetectionAllocation.model.js"
);
const { default: CameraDetection } = await import(
  "../../../core/v1/clientConfig/clientCameraDetection.model.js"
);

// Minimal res/req doubles — the service writes straight to res.
function ctx(adminId, query = {}) {
  const res = {
    statusCode: 200,
    _body: null,
    status(c) { this.statusCode = c; return this; },
    send(b) { this._body = b; return this; },
  };
  return { req: { verified: { userData: { adminId } }, query }, res };
}
const data = (res) => res._body?.data ?? res._body?.body?.data;

let adminA, adminB, nvr;

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  adminA = await Admin.create({ email: "a@x.com", password: "x", user_id: "1001", login: "alpha" });
  adminB = await Admin.create({ email: "b@x.com", password: "x", user_id: "2002", login: "beta" });
  nvr = await NVR.create({
    userId: "1001",
    nvrName: "NVR-A",
    brand: "hikvision",
    domain: "http://nvr-a.test",
    location: "HQ",
    localNvrId: "local-a",
  });
});

describe("ClientConfigService.getAccount", () => {
  it("400s when the token carries no adminId", async () => {
    const { req, res } = ctx(undefined);
    await ClientConfigService.getAccount(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("returns exactly the caller's own row, never a list of clients", async () => {
    await Admin.updateOne(
      { _id: adminA._id },
      { name_f: "Alpha", name_l: "Client", login: "alpha" }
    );

    const { req, res } = ctx(adminA._id);
    await ClientConfigService.getAccount(req, res);

    const body = data(res);
    // A single object — the superadmin version returns { admins: [...] }.
    expect(Array.isArray(body)).toBe(false);
    expect(body.admins).toBeUndefined();
    expect(String(body.adminId)).toBe(String(adminA._id));
    expect(body.name).toBe("Alpha Client");
    // adminB must not appear anywhere in the response.
    expect(JSON.stringify(body)).not.toContain("b@x.com");
  });

  it("sums camera counts only from the caller's own NVRs", async () => {
    await NVR.updateOne({ _id: nvr._id }, { cameraCount: 4 });
    await NVR.create({
      userId: "2002",
      nvrName: "NVR-B",
      brand: "hikvision",
      domain: "http://nvr-b.test",
      location: "Remote",
      localNvrId: "local-b",
      cameraCount: 99,
    });

    const { req, res } = ctx(adminA._id);
    await ClientConfigService.getAccount(req, res);

    expect(data(res).cameras).toBe(4);
  });

  it("degrades to a status rather than failing when aMember is unreachable", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("aMember down");
    });

    const { req, res } = ctx(adminA._id);
    await ClientConfigService.getAccount(req, res);

    expect(data(res).plan).toBeNull();
    expect(["inactive", "unknown"]).toContain(data(res).status);
  });
});

describe("ClientConfigService.getConfig", () => {
  it("400s when the token carries no adminId", async () => {
    const { req, res } = ctx(undefined);
    await ClientConfigService.getConfig(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("reports purchased / configured / non-configured camera counts", async () => {
    // purchasedCameras is declared in the superadmin's Admin schema, not this
    // one — it's superadmin-owned licensing state. Written at the driver level
    // here because Mongoose strict mode would strip it from an updateOne, which
    // is also why the service reads the admin with .lean(): lean returns fields
    // this schema doesn't declare, exactly as production does.
    await mongoose.connection.db
      .collection("admins")
      .updateOne({ _id: adminA._id }, { $set: { purchasedCameras: 10 } });

    const c1 = await Channel.create({ nvrId: nvr._id, userId: "1001", streamingPath: "/1", localChannelId: "1", name: "C1", isAdded: true });
    await Channel.create({ nvrId: nvr._id, userId: "1001", streamingPath: "/2", localChannelId: "2", name: "C2", isAdded: true });
    // The channel pre-save hook recomputes control from its detections, so set
    // the "configured" marker with an update rather than on create.
    await Channel.updateOne({ _id: c1._id }, { control: 1 });

    const { req, res } = ctx(adminA._id);
    await ClientConfigService.getConfig(req, res);

    expect(data(res).stats).toMatchObject({
      totalCameras: 10,
      configured: 1,
      nonConfigured: 1,
    });
  });

  it("returns every detection type, defaulting unsaved ones to 0/false", async () => {
    await Allocation.create({
      adminId: adminA._id,
      settingType: "vehicleDetectionSettings",
      cameraAllocation: 4,
      enabled: true,
    });

    const { req, res } = ctx(adminA._id);
    await ClientConfigService.getConfig(req, res);

    const rows = data(res).detections;
    const saved = rows.find((d) => d.settingType === "vehicleDetectionSettings");
    expect(saved).toMatchObject({ cameraAllocation: 4, enabled: true });
    // Everything else is present but zeroed rather than omitted.
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.every((d) => typeof d.name === "string")).toBe(true);
    expect(data(res).stats.detectionsEnabled).toBe(1);
  });

  it("never leaks another client's allocations", async () => {
    await Allocation.create({
      adminId: adminB._id,
      settingType: "vehicleDetectionSettings",
      cameraAllocation: 99,
      enabled: true,
    });

    const { req, res } = ctx(adminA._id);
    await ClientConfigService.getConfig(req, res);

    const row = data(res).detections.find((d) => d.settingType === "vehicleDetectionSettings");
    expect(row).toMatchObject({ cameraAllocation: 0, enabled: false });
    expect(data(res).stats.detectionsEnabled).toBe(0);
  });
});

describe("ClientConfigService.getCameras", () => {
  it("returns only the caller's own cameras", async () => {
    await Channel.create({ nvrId: nvr._id, userId: "1001", streamingPath: "/1", localChannelId: "1", name: "Mine", isAdded: true });
    await Channel.create({ nvrId: nvr._id, userId: "2002", streamingPath: "/2", localChannelId: "2", name: "Theirs", isAdded: true });

    const { req, res } = ctx(adminA._id);
    await ClientConfigService.getCameras(req, res);

    expect(data(res).totalCount).toBe(1);
    expect(data(res).cameras[0].name).toBe("Mine");
  });

  it("maps each allocated detection to its saved per-camera boolean", async () => {
    const cam = await Channel.create({ nvrId: nvr._id, userId: "1001", streamingPath: "/1", localChannelId: "1", name: "C1", isAdded: true });
    await Allocation.create({ adminId: adminA._id, settingType: "vehicleDetectionSettings", enabled: true });
    await Allocation.create({ adminId: adminA._id, settingType: "crowdDetectionSettings", enabled: true });
    // Only one of the two has a saved row; the other must read false.
    await CameraDetection.create({
      adminId: adminA._id,
      cameraId: cam._id,
      settingType: "vehicleDetectionSettings",
      enabled: true,
    });

    const { req, res } = ctx(adminA._id);
    await ClientConfigService.getCameras(req, res);

    expect(data(res).cameras[0].detections).toEqual({
      vehicleDetectionSettings: true,
      crowdDetectionSettings: false,
    });
  });

  it("does not write ClientCameraDetection rows — it is read-only", async () => {
    await Channel.create({ nvrId: nvr._id, userId: "1001", streamingPath: "/1", localChannelId: "1", name: "C1", isAdded: true });
    await Allocation.create({ adminId: adminA._id, settingType: "vehicleDetectionSettings", enabled: true });

    const { req, res } = ctx(adminA._id);
    await ClientConfigService.getCameras(req, res);

    // The superadmin version seeds rows here. A client-facing read must not.
    expect(await CameraDetection.countDocuments({})).toBe(0);
  });

  it("filters by search on name and customName", async () => {
    await Channel.create({ nvrId: nvr._id, userId: "1001", streamingPath: "/1", localChannelId: "1", name: "Gate Camera", isAdded: true });
    await Channel.create({ nvrId: nvr._id, userId: "1001", streamingPath: "/2", localChannelId: "2", name: "Lobby", customName: "Gate Backup", isAdded: true });
    await Channel.create({ nvrId: nvr._id, userId: "1001", streamingPath: "/3", localChannelId: "3", name: "Parking", isAdded: true });

    const { req, res } = ctx(adminA._id, { search: "gate" });
    await ClientConfigService.getCameras(req, res);

    expect(data(res).totalCount).toBe(2);
  });

  it("treats a regex-special search as a literal, not a pattern", async () => {
    await Channel.create({ nvrId: nvr._id, userId: "1001", streamingPath: "/1", localChannelId: "1", name: "Gate", isAdded: true });

    const { req, res } = ctx(adminA._id, { search: ".*" });
    await ClientConfigService.getCameras(req, res);

    // If the input were interpolated raw, ".*" would match everything.
    expect(data(res).totalCount).toBe(0);
  });
});
