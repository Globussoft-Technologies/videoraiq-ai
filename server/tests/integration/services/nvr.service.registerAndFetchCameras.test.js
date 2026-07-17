/**
 * Coverage for NVRService.registerAndFetchCameras — the single biggest
 * uncovered method left on nvr.service.js after R83 (lines 895-986, ~92 LOC).
 *
 * The method orchestrates:
 *   1. Joi validation via NVRValidation.registerNVR
 *   2. NVR.find({ userId, port }) + per-doc decrypt(ip) comparison to detect
 *      an already-registered NVR
 *   3. `this._fetchCamerasFromNvr(...)` to authenticate against the device
 *   4. Existing-NVR branch — returns 200 + cameras-with-isAdded markers
 *   5. New-NVR branch — NVR.create with the device-info fields → 201
 *   6. Outer catch — 400 on E11000 duplicate-key, 500 otherwise
 *
 * Strategy:
 *   • We DO NOT touch the product. We `vi.spyOn(NVRService, "_fetchCamerasFromNvr")`
 *     per-test to decide what the helper returns. This is the same pattern the
 *     R83 cameraOps test established (see nvr.service.cameraOps.test.js).
 *   • We `vi.spyOn(NVR, "create")` to bypass the local-schema mismatch on the
 *     new-NVR happy path (the service hands NVR.create the cloud-schema fields
 *     ip/port/password/rtspPort/etc. which don't exist on the local schema
 *     pinned by tests/setup.js — under strict mode those get stripped, but
 *     the local schema also requires `domain` + `localNvrId` which the service
 *     never provides, so a real NVR.create would always reject validation
 *     here. Spying NVR.create lets us decouple the test from that schema gap.)
 *   • For the existing-NVR branch we manually `.set("ip", encrypt(...), { strict: false })`
 *     then `.save({ validateBeforeSave: false })` so the decrypt(ip) comparison
 *     can land. We also `.set("port", N, { strict: false })` so the NVR.find
 *     `{ userId, port }` selector matches it.
 *
 * Mocks (3 — well under the 8 cap):
 *   1. core/v1/NVR/nvr.brands.js — empty default + updateHandlers (mirrors
 *      the sibling nvr.service.cameraOps.test.js pattern, avoids the chained
 *      brand imports pulling in digest-fetch at import-time)
 *   2. utils/rtspStream.js — buildRTSPUrl / register / update stubs (this
 *      method doesn't call them, but the service imports them at the top, so
 *      we stub for safety and to avoid axios at import-time)
 *   3. digest-fetch — empty stub class (transitive import, not used here)
 *
 * R84 — server phase (test-only). 1 new test file. Mock budget: 3.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

vi.mock("../../../core/v1/NVR/nvr.brands.js", () => ({
  default: {},
  updateHandlers: {},
}));
vi.mock("../../../utils/rtspStream.js", () => ({
  buildRTSPUrl: vi.fn(() => "rtsp://stub/main"),
  registerCameraStream: vi.fn().mockResolvedValue(true),
  updateCameraStream: vi.fn().mockResolvedValue(true),
}));
vi.mock("digest-fetch", () => ({
  default: class {
    constructor() {}
    async fetch() {
      return { ok: true, text: async () => "" };
    }
  },
}));

const { default: NVRService } = await import(
  "../../../core/v1/NVR/nvr.service.js"
);
const { default: NVR } = await import("../../../core/v1/NVR/nvr.model.js");
const { default: Camera } = await import(
  "../../../core/v1/channels/channels.model.js"
);
const { encrypt } = await import("../../../utils/cryptoUtils.js");

const USER_ID = "9100";

/** A valid Joi-passing request body for registerNVR. */
function validBody(overrides = {}) {
  return {
    ip: "10.20.30.40",
    port: 8000,
    rtspPort: 554,
    nvrName: "Lobby-NVR",
    username: "admin",
    password: "Pass1234",
    brand: "hikvision",
    location: "HQ",
    ...overrides,
  };
}

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

// ---------------------------------------------------------------------------
// Validation arm
// ---------------------------------------------------------------------------
describe("NVRService.registerAndFetchCameras — validation", () => {
  it("returns 400 when ip is missing (Joi failure)", async () => {
    const body = validBody();
    delete body.ip;
    const { req, res, next } = serviceCtx({ user_id: USER_ID, body });
    await NVRService.registerAndFetchCameras(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(payload(res).message).toBe("Validation Failed");
  });

  it("returns 400 when nvrName contains script-related characters", async () => {
    const { req, res, next } = serviceCtx({
      user_id: USER_ID,
      body: validBody({ nvrName: "<script>x</script>" }),
    });
    await NVRService.registerAndFetchCameras(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(payload(res).message).toBe("Validation Failed");
  });

  it("returns 400 when port is not a valid port number", async () => {
    const { req, res, next } = serviceCtx({
      user_id: USER_ID,
      body: validBody({ port: 99999 }),
    });
    await NVRService.registerAndFetchCameras(req, res, next);
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// camerasData.error arm
// ---------------------------------------------------------------------------
describe("NVRService.registerAndFetchCameras — auth/camera fetch failure", () => {
  it("returns 400 when _fetchCamerasFromNvr returns { error }", async () => {
    const helperSpy = vi
      .spyOn(NVRService, "_fetchCamerasFromNvr")
      .mockResolvedValue({ error: "Failed to authenticate with Hikvision NVR" });

    const { req, res, next } = serviceCtx({
      user_id: USER_ID,
      body: validBody(),
    });
    await NVRService.registerAndFetchCameras(req, res, next);

    expect(helperSpy).toHaveBeenCalledOnce();
    expect(helperSpy).toHaveBeenCalledWith(
      "hikvision",
      "10.20.30.40",
      8000,
      "admin",
      "Pass1234",
    );
    expect(res.statusCode).toBe(400);
    expect(payload(res).message).toBe("NVR Authentication failed");
  });
});

// ---------------------------------------------------------------------------
// Existing-NVR branch (IP match)
// ---------------------------------------------------------------------------
describe("NVRService.registerAndFetchCameras — existing-NVR branch", () => {
  it("returns 200 + cameras with isAdded markers when an NVR already exists for the IP", async () => {
    // The service does `NVR.find({ userId, port })` then iterates calling
    // `decrypt(nvr.ip)` and comparing to the request ip. Under the local
    // schema `ip`/`port` are stripped on Mongoose hydration even if we insert
    // them through the raw collection — so we spy on NVR.find to return a
    // POJO-like object carrying both fields verbatim. The downstream Camera
    // lookup still uses real mongo so the isAdded mapping stays meaningful.
    const nvrId = new mongoose.Types.ObjectId();
    const fakeNvr = {
      _id: nvrId,
      userId: USER_ID,
      nvrName: "Pre-existing",
      brand: "hikvision",
      ip: encrypt("10.20.30.40"),
      port: 8000,
      location: "HQ",
    };
    vi.spyOn(NVR, "find").mockResolvedValue([fakeNvr]);

    // Camera persisted under the same nvrId. Under the local Camera schema
    // `channelId` doesn't exist on the schema and is stripped on save → so
    // when the service maps `addedCameras.map(c => c.channelId)` it produces
    // `[undefined]`, which doesn't match either returned camera. Both isAdded
    // values end up false. We pin that outcome explicitly below.
    await Camera.create({
      nvrId,
      userId: USER_ID,
      streamingPath: "/stream/x",
      localChannelId: "ch-1",
      name: "cam-1",
      isAdded: true,
    });

    vi.spyOn(NVRService, "_fetchCamerasFromNvr").mockResolvedValue({
      deviceInfo: { deviceName: "DS-1234" },
      cameras: [
        { channelId: "101", name: "Front Door" },
        { channelId: "202", name: "Lobby" },
      ],
    });

    const { req, res, next } = serviceCtx({
      user_id: USER_ID,
      body: validBody(),
    });
    await NVRService.registerAndFetchCameras(req, res, next);

    expect(res.statusCode).toBe(200);
    const data = payload(res).data;
    expect(data.isNew).toBe(false);
    expect(data.nvr._id.toString()).toBe(nvrId.toString());
    // Two cameras returned, order preserved. Under the local Camera schema
    // `channelId` isn't a real field so the addedChannelIds array doesn't
    // include either returned id → both isAdded=false. The point of the
    // assertion is to pin that the mapping fires once per returned camera
    // AND that the field is always present in the response (not undefined).
    expect(data.cameras).toHaveLength(2);
    expect(data.cameras[0]).toMatchObject({
      channelId: "101",
      name: "Front Door",
      isAdded: false,
    });
    expect(data.cameras[1]).toMatchObject({
      channelId: "202",
      name: "Lobby",
      isAdded: false,
    });
  });
});

// ---------------------------------------------------------------------------
// New-NVR branch (NVR.create)
// ---------------------------------------------------------------------------
describe("NVRService.registerAndFetchCameras — new-NVR branch", () => {
  it("returns 201 with the saved NVR + cameras when no existing NVR is found", async () => {
    // No NVRs in mongo → registerAndFetchCameras goes to the NVR.create arm.
    // Local schema requires `domain` + `localNvrId` which the service doesn't
    // pass, so a real .create() would reject validation. Spy NVR.create to
    // return a deterministic saved doc so we can pin the 201 response shape
    // without coupling to the schema gap.
    const savedNvrId = new mongoose.Types.ObjectId();
    const fakeSavedNvr = {
      _id: savedNvrId,
      // Response spreads `savedNvr._doc`, so mirror a Mongoose doc here.
      _doc: {
        _id: savedNvrId,
        userId: USER_ID,
        nvrName: "Lobby-NVR",
        brand: "hikvision",
        location: "HQ",
        cameraCount: 0,
      },
    };
    const createSpy = vi.spyOn(NVR, "create").mockResolvedValue(fakeSavedNvr);

    // The service now persists each fetched camera via Camera.create. Under the
    // local Channel schema those docs require localChannelId/streamingPath which
    // the cloud-shaped fetch payload doesn't carry — spy Camera.create to keep
    // this test decoupled from the schema gap (same reasoning as NVR.create).
    vi.spyOn(Camera, "create").mockImplementation(async (doc) => ({
      _id: new mongoose.Types.ObjectId(),
      ...doc,
    }));

    vi.spyOn(NVRService, "_fetchCamerasFromNvr").mockResolvedValue({
      deviceInfo: {
        deviceName: "DS-1234",
        model: "DS-7616NI-K2",
        serialNumber: "SN-9001",
        macAddress: "AA:BB:CC:DD:EE:FF",
        firmwareVersion: "V4.5.0",
        deviceType: "NVR",
      },
      cameras: [{ channelId: "101", name: "Front Door" }],
    });

    const { req, res, next } = serviceCtx({
      user_id: USER_ID,
      body: validBody(),
    });
    await NVRService.registerAndFetchCameras(req, res, next);

    expect(res.statusCode).toBe(201);
    const data = payload(res).data;
    expect(data.isNew).toBe(true);
    expect(data.cameras).toEqual(
      expect.arrayContaining([expect.objectContaining({ channelId: "101", name: "Front Door" })])
    );
    expect(data.nvr._id).toBe(fakeSavedNvr._id);

    // Verify the .create() payload pulled the device-info fields into the
    // doc shape the schema expects (this is the 17-key contract — pin a
    // representative subset).
    expect(createSpy).toHaveBeenCalledOnce();
    const createArg = createSpy.mock.calls[0][0];
    expect(createArg.userId).toBe(USER_ID);
    expect(createArg.ip).toBe("10.20.30.40");
    expect(createArg.port).toBe(8000);
    expect(createArg.brand).toBe("hikvision"); // lower-cased in the service
    expect(createArg.deviceName).toBe("DS-1234");
    expect(createArg.serialNumber).toBe("SN-9001");
    expect(createArg.cameraCount).toBe(0);
    expect(createArg.location).toBe("hq"); // lower-cased in the service
  });

  it("lower-cases the brand before persisting (HIKVISION → hikvision)", async () => {
    const createSpy = vi
      .spyOn(NVR, "create")
      .mockResolvedValue({ _id: new mongoose.Types.ObjectId() });

    vi.spyOn(NVRService, "_fetchCamerasFromNvr").mockResolvedValue({
      deviceInfo: {},
      cameras: [],
    });

    const { req, res, next } = serviceCtx({
      user_id: USER_ID,
      body: validBody({ brand: "HIKVISION" }),
    });
    await NVRService.registerAndFetchCameras(req, res, next);

    expect(res.statusCode).toBe(201);
    expect(createSpy.mock.calls[0][0].brand).toBe("hikvision");
  });

  it("falls back to empty strings for missing deviceInfo fields", async () => {
    // When `deviceInfo` is an empty object the service uses `|| ""` for each
    // field. Pin that contract — string-only, no undefined leaking through.
    const createSpy = vi
      .spyOn(NVR, "create")
      .mockResolvedValue({ _id: new mongoose.Types.ObjectId() });

    vi.spyOn(NVRService, "_fetchCamerasFromNvr").mockResolvedValue({
      deviceInfo: {},
      cameras: [],
    });

    const { req, res, next } = serviceCtx({
      user_id: USER_ID,
      body: validBody(),
    });
    await NVRService.registerAndFetchCameras(req, res, next);

    const arg = createSpy.mock.calls[0][0];
    expect(arg.deviceName).toBe("");
    expect(arg.model).toBe("");
    expect(arg.serialNumber).toBe("");
    expect(arg.macAddress).toBe("");
    expect(arg.firmwareVersion).toBe("");
    expect(arg.deviceType).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Outer catch arms
// ---------------------------------------------------------------------------
describe("NVRService.registerAndFetchCameras — outer catch", () => {
  it("returns 400 with 'NVR already exists' when NVR.create throws an E11000 duplicate-key error", async () => {
    const dupErr = new Error(
      'E11000 duplicate key error collection: videora.nvrs index: ip_1 dup key: { ip: "..." }',
    );
    dupErr.code = 11000;
    vi.spyOn(NVR, "create").mockRejectedValue(dupErr);

    vi.spyOn(NVRService, "_fetchCamerasFromNvr").mockResolvedValue({
      deviceInfo: {},
      cameras: [],
    });

    const { req, res, next } = serviceCtx({
      user_id: USER_ID,
      body: validBody(),
    });
    await NVRService.registerAndFetchCameras(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(payload(res).message).toBe("NVR already exists");
  });

  it("returns 500 with 'Failed to register and fetch cameras' on a non-duplicate error", async () => {
    vi.spyOn(NVR, "create").mockRejectedValue(new Error("mongo unavailable"));
    vi.spyOn(NVRService, "_fetchCamerasFromNvr").mockResolvedValue({
      deviceInfo: {},
      cameras: [],
    });

    const { req, res, next } = serviceCtx({
      user_id: USER_ID,
      body: validBody(),
    });
    await NVRService.registerAndFetchCameras(req, res, next);

    expect(res.statusCode).toBe(500);
    expect(payload(res).message).toBe("Failed to register and fetch cameras");
  });
});
