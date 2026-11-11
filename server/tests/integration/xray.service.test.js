/**
 * X-Ray service layer against a REAL database. Contract §5, §7, §10.
 *
 * Mongo is a real in-process mongod (tests/integration/dbSetup.js), so the
 * ownership scoping, the Channel model's member pre-hook, and the session
 * records are all genuinely exercised. Only two things are faked:
 *
 *   * xray.client.js — the GPU box does not exist on a laptop;
 *   * utils/rtspStream.js — `buildStreamingUrl` would otherwise POST
 *     /api/add-camera to a real streaming server in cloud mode.
 *
 * Everything the plan's Phase 3 exit gate asks for is here: an unlicensed
 * admin, a camera the user may not see, a double DELETE, and the full
 * lifecycle. The equivalent over real HTTP is
 * core/v2/xray/dev/probeXrayRelay.js.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";

// --- fakes, declared before the module graph loads -------------------------

const client = {
  createSession: vi.fn(),
  addPrompt: vi.fn(),
  closeSession: vi.fn(),
  removeObject: vi.fn(),
  getStatus: vi.fn(),
  // Heartbeat forwarding (contract §10's "S + B, both") was added after this
  // mock was written, and its absence here is how the gap showed up: the mock
  // was a copy of the client's surface at one moment, so it went stale
  // silently. Defaults to success; the tests that care set their own value.
  heartbeat: vi.fn(async () => ({ ok: true, status: 200, data: { isSuccess: true } })),
};
vi.mock("../../core/v2/xray/xray.client.js", () => ({ default: client }));

// Returns a RELATIVE path on purpose: the service must prefix the host itself,
// which is the bug services/python.service.js:519-531 was written to fix.
const rtsp = {
  buildStreamingUrl: vi.fn(async () => "stream/nvr1-cam1/playlist.m3u8"),
  resolveHost: vi.fn(async () => "http://dev-stream.test/"),
};
vi.mock("../../utils/rtspStream.js", () => ({ ...rtsp, default: vi.fn() }));

// Redis is not running; the socket lookup must degrade, not throw.
vi.mock("../../utils/database.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    redis: {
      get: vi.fn(async (key) => (key === "socket:session:tab-1" ? "socket-aaa" : null)),
      set: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { connectMongo, disconnectMongo, clearCollections } = await import("./dbSetup.js");
const { default: service } = await import("../../core/v2/xray/xray.service.js");
const { default: XraySession } = await import("../../core/v2/xray/xray.model.js");
const { default: Channel } = await import("../../core/v2/channels/channels.model.js");
const { default: NVR } = await import("../../core/v1/NVR/nvr.model.js");
const { default: authorizedChannels } = await import(
  "../../core/v1/cameraRestrictions/authorizedChannels.model.js"
);
const { default: adminModel } = await import("../../core/v1/admin/admin.model.js");
const { default: allocationModel } = await import(
  "../../core/v1/clientConfig/clientDetectionAllocation.model.js"
);

const TENANT = "tenant-42";
const OTHER_TENANT = "tenant-99";

let adminId;
let nvrId;
let cameraId;
let otherCameraId;

const actor = () => ({ adminId: String(adminId), userId: TENANT, memberId: null });

const SERVICE_SESSION = {
  sessionId: "deadbeefcafe1234",
  width: 1920,
  height: 1080,
  frameRate: 5,
  lostAfterFrames: 25,
  maxObjects: 1,
};

beforeAll(async () => {
  await connectMongo();
});

afterAll(async () => {
  await disconnectMongo();
});

beforeEach(async () => {
  await clearCollections();

  // tests/setup.js ships LICENSING_ENABLED: true, so the default "auto" mode
  // would enforce the licence gate in EVERY test here and deny them all. The
  // licensing block below opts back in per case, so each test states which
  // licence world it is in rather than inheriting one.
  process.env.XRAY_LICENSE_CHECK = "off";

  for (const fn of Object.values(client)) fn.mockReset();
  rtsp.buildStreamingUrl.mockClear();
  rtsp.buildStreamingUrl.mockImplementation(async () => "stream/nvr1-cam1/playlist.m3u8");

  client.createSession.mockResolvedValue({ ok: true, status: 200, data: SERVICE_SESSION });
  client.closeSession.mockResolvedValue({ ok: true, status: 200, data: { isSuccess: true } });
  client.removeObject.mockResolvedValue({ ok: true, status: 200, data: { isSuccess: true } });
  client.heartbeat.mockResolvedValue({ ok: true, status: 200, data: { isSuccess: true } });

  const admin = await adminModel.create({ user_id: TENANT, login: "t42", email: "t42@test.local" });
  adminId = admin._id;

  const nvr = await NVR.create({
    userId: TENANT,
    domain: "http://dev-stream.test",
    nvrName: "nvr-1",
    location: "default",
    brand: "hikvision",
  });
  nvrId = nvr._id;

  const camera = await Channel.create({
    userId: TENANT,
    nvrId,
    streamingPath: "stream/nvr1-cam1/playlist.m3u8",
    localChannelId: "1",
    name: "Gate camera",
    isAdded: true,
  });
  cameraId = camera._id;

  const other = await Channel.create({
    userId: OTHER_TENANT,
    nvrId,
    streamingPath: "stream/nvr1-cam2/playlist.m3u8",
    localChannelId: "2",
    name: "Someone else's camera",
    isAdded: true,
  });
  otherCameraId = other._id;
});

const create = (over = {}, browser = { clientSessionId: "tab-1" }) =>
  service.createSession(
    { ...actor(), ...(over.actor || {}) },
    { cameraId: String(over.cameraId || cameraId), nvrId: String(over.nvrId || nvrId) },
    browser,
  );

// ---------------------------------------------------------------------------
// Authorisation
// ---------------------------------------------------------------------------

describe("createSession — authorisation", () => {
  it("opens a session on a camera the tenant owns", async () => {
    const result = await create();

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({
      sessionId: SERVICE_SESSION.sessionId,
      width: 1920,
      height: 1080,
      frameRate: 5,
      lostAfterFrames: 25,
      maxObjects: 1,
    });
  });

  // 404 and not 403, deliberately: every other v2 endpoint answers 404 for a
  // resource outside your tenant, and 403 would confirm the id names a real
  // camera somewhere.
  it("refuses a camera belonging to another tenant, with 404", async () => {
    const result = await create({ cameraId: otherCameraId });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
    expect(result.code).toBe("camera_not_found");
    expect(client.createSession).not.toHaveBeenCalled();
  });

  it("refuses a camera that does not exist", async () => {
    const result = await create({ cameraId: new mongoose.Types.ObjectId() });

    expect(result.status).toBe(404);
    expect(client.createSession).not.toHaveBeenCalled();
  });

  // A camera discovered but never added has no stream; the Channel pre-hook
  // filters it out and we inherit that for free.
  it("refuses a camera that was never added", async () => {
    const unadded = await Channel.create({
      userId: TENANT,
      nvrId,
      streamingPath: "stream/nvr1-cam9/playlist.m3u8",
      localChannelId: "9",
      isAdded: false,
    });

    expect((await create({ cameraId: unadded._id })).status).toBe(404);
  });

  // The client sends both ids. Disagreement means the frontend built the
  // request from stale state; trusting the camera's own NVR would open a
  // session on a camera the user did not pick.
  it("refuses a camera/NVR pair that disagree", async () => {
    const otherNvr = await NVR.create({
      userId: TENANT,
      domain: "http://x.test",
      nvrName: "nvr-2",
      location: "default",
      brand: "hikvision",
    });

    const result = await create({ nvrId: otherNvr._id });

    expect(result.status).toBe(404);
    expect(client.createSession).not.toHaveBeenCalled();
  });

  it("refuses a token carrying no tenant key", async () => {
    const result = await create({ actor: { userId: "" } });

    expect(result.status).toBe(403);
    expect(result.code).toBe("forbidden");
    expect(client.createSession).not.toHaveBeenCalled();
  });
});

describe("createSession — per-member camera restrictions", () => {
  // The privilege-escalation case: tenant scope alone would let a restricted
  // sub-user X-ray a camera the UI hides from them.
  it("refuses a sub-user a camera outside their allow-list", async () => {
    const memberId = new mongoose.Types.ObjectId();
    await authorizedChannels.create({ adminId, userId: memberId, channels: [otherCameraId] });

    const result = await create({ actor: { memberId: String(memberId) } });

    expect(result.status).toBe(404);
    expect(client.createSession).not.toHaveBeenCalled();
  });

  it("allows a sub-user a camera that IS on their allow-list", async () => {
    const memberId = new mongoose.Types.ObjectId();
    await authorizedChannels.create({ adminId, userId: memberId, channels: [cameraId] });

    expect((await create({ actor: { memberId: String(memberId) } })).ok).toBe(true);
  });

  // core/v1/channels/channels.model.js:339 — an empty allow-list blocks
  // everything, rather than meaning "unrestricted".
  it("blocks a sub-user whose allow-list is empty", async () => {
    const memberId = new mongoose.Types.ObjectId();
    await authorizedChannels.create({ adminId, userId: memberId, channels: [] });

    expect((await create({ actor: { memberId: String(memberId) } })).status).toBe(404);
  });

  // Current main denies members without a configured camera allow-list.
  it("refuses a sub-user with no allow-list document", async () => {
    const result = await create({ actor: { memberId: String(new mongoose.Types.ObjectId()) } });
    expect(result.status).toBe(404);
    expect(client.createSession).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Licensing — decision D1
// ---------------------------------------------------------------------------

describe("createSession — licensing", () => {
  const withMode = async (mode, fn) => {
    const previous = process.env.XRAY_LICENSE_CHECK;
    process.env.XRAY_LICENSE_CHECK = mode;
    try {
      return await fn();
    } finally {
      if (previous === undefined) delete process.env.XRAY_LICENSE_CHECK;
      else process.env.XRAY_LICENSE_CHECK = previous;
    }
  };

  it("denies 403 not_licensed when no xRayMode allocation exists", async () => {
    const result = await withMode("on", () => create());

    expect(result.status).toBe(403);
    expect(result.code).toBe("not_licensed");
    expect(client.createSession).not.toHaveBeenCalled();
  });

  it("allows when an enabled xRayMode allocation exists", async () => {
    // Inserted through the raw collection: the Mongoose schema's settingType
    // enum is bound to DETECTION_TYPES, which deliberately does NOT contain
    // xRayMode (decision D1), so a model .create() would be rejected. This is
    // exactly how the row has to be created in production today, and is
    // documented in xray.license.js.
    await mongoose.connection.collection("clientdetectionallocations").insertOne({
      adminId,
      settingType: "xRayMode",
      cameraAllocation: 0,
      enabled: true,
      cameraSelectionConfigured: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect((await withMode("on", () => create())).ok).toBe(true);
  });

  it("denies when the allocation exists but is disabled", async () => {
    await mongoose.connection.collection("clientdetectionallocations").insertOne({
      adminId,
      settingType: "xRayMode",
      cameraAllocation: 0,
      enabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect((await withMode("on", () => create())).code).toBe("not_licensed");
  });

  it("allows with the gate switched off, licence or no licence", async () => {
    expect((await withMode("off", () => create())).ok).toBe(true);
  });

  // Another admin's allocation must not license this one.
  it("does not accept another admin's allocation", async () => {
    const otherAdmin = await adminModel.create({
      user_id: OTHER_TENANT,
      login: "t99",
      email: "t99@test.local",
    });
    await mongoose.connection.collection("clientdetectionallocations").insertOne({
      adminId: otherAdmin._id,
      settingType: "xRayMode",
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect((await withMode("on", () => create())).code).toBe("not_licensed");
  });

  it("checks the licence only AFTER authorisation", async () => {
    // Otherwise an unlicensed caller learns whether a camera exists.
    const result = await withMode("on", () => create({ cameraId: otherCameraId }));
    expect(result.code).toBe("camera_not_found");
  });

  // The allocation collection is unreachable -> deny. A Mongo blip must not
  // silently grant a paid feature to every client.
  it("fails closed when the licence lookup throws", async () => {
    const spy = vi.spyOn(allocationModel, "findOne").mockImplementation(() => {
      throw new Error("mongo down");
    });
    try {
      expect((await withMode("on", () => create())).code).toBe("not_licensed");
    } finally {
      spy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// The stream URL — contract §13.2
// ---------------------------------------------------------------------------

describe("createSession — stream URL resolution", () => {
  it("prefixes a relative path with the stream host", async () => {
    await create();

    expect(client.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        streamUrl: "http://dev-stream.test/stream/nvr1-cam1/playlist.m3u8",
      }),
    );
  });

  it("leaves an already-absolute URL alone", async () => {
    rtsp.buildStreamingUrl.mockResolvedValue("http://other.test/stream/n-c/playlist.m3u8");

    await create();

    expect(client.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ streamUrl: "http://other.test/stream/n-c/playlist.m3u8" }),
    );
  });

  it("sends exactly the five contract §6 identifiers", async () => {
    await create();

    expect(Object.keys(client.createSession.mock.calls[0][0]).sort()).toEqual([
      "adminId",
      "cameraId",
      "nvrId",
      "streamUrl",
      "userId",
    ]);
  });

  // Contract §13.2 tripwire. `seq` is only meaningful within one rendition, so
  // a sub-stream URL would make every frame lookup resolve to the wrong moment
  // — silently, with the session appearing to work.
  it.each(["sub-stream", "master-stream"])("refuses a %s URL", async (rendition) => {
    rtsp.buildStreamingUrl.mockResolvedValue(`http://s.test/${rendition}/n-c/playlist.m3u8`);

    const result = await create();

    expect(result.ok).toBe(false);
    expect(result.code).toBe("wrong_rendition");
    expect(client.createSession).not.toHaveBeenCalled();
  });

  it("reports a camera with no resolvable URL as retryable", async () => {
    rtsp.buildStreamingUrl.mockResolvedValue(null);

    const result = await create();

    expect(result.code).toBe("stream_url_unresolved");
    expect(result.retryable).toBe(true);
    expect(client.createSession).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The session record
// ---------------------------------------------------------------------------

describe("createSession — the Mongo record", () => {
  it("writes the record before replying", async () => {
    const result = await create();

    const record = await XraySession.findOne({ sessionId: result.data.sessionId }).lean();
    expect(record).toBeTruthy();
    expect(record).toMatchObject({
      userId: TENANT,
      adminId: String(adminId),
      cameraId: String(cameraId),
      nvrId: String(nvrId),
      state: "ready",
      width: 1920,
      frameRate: 5,
    });
    expect(record.lastHeartbeatAt).toBeInstanceOf(Date);
  });

  // Contract §9: tab-granular delivery. The tab id comes off the x-session-id
  // header and resolves through Redis to this tab's socket.
  it("records the tab's socket id", async () => {
    const result = await create({}, { clientSessionId: "tab-1" });

    const record = await XraySession.findOne({ sessionId: result.data.sessionId }).lean();
    expect(record.socketId).toBe("socket-aaa");
    expect(record.clientSessionId).toBe("tab-1");
  });

  it("still creates the session when no socket can be found", async () => {
    const result = await create({}, { clientSessionId: "tab-unknown" });

    expect(result.ok).toBe(true);
    const record = await XraySession.findOne({ sessionId: result.data.sessionId }).lean();
    expect(record.socketId).toBe("");
  });

  // If the record cannot be written, nothing could ever close the GPU session.
  // Closing it immediately is the only way not to leak the slot.
  it("closes the GPU session if the record cannot be written", async () => {
    const spy = vi.spyOn(XraySession, "create").mockRejectedValue(new Error("disk full"));
    try {
      const result = await create();

      expect(result.ok).toBe(false);
      expect(result.status).toBe(500);
      expect(client.closeSession).toHaveBeenCalledWith(SERVICE_SESSION.sessionId);
    } finally {
      spy.mockRestore();
    }
  });

  it("rejects a 200 from the service that carries no session id", async () => {
    client.createSession.mockResolvedValue({ ok: true, status: 200, data: { sessionId: "" } });

    const result = await create();

    expect(result.ok).toBe(false);
    expect(result.status).toBe(502);
    expect(await XraySession.countDocuments({})).toBe(0);
  });

  it("passes a service failure through and writes nothing", async () => {
    client.createSession.mockResolvedValue({
      ok: false,
      status: 503,
      code: "stream_not_ready",
      message: "camera is not streaming",
      retryable: true,
    });

    const result = await create();

    expect(result.code).toBe("stream_not_ready");
    expect(result.retryable).toBe(true);
    expect(await XraySession.countDocuments({})).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Prompt, status, heartbeat, delete
// ---------------------------------------------------------------------------

describe("the rest of the lifecycle", () => {
  let sessionId;

  beforeEach(async () => {
    sessionId = (await create()).data.sessionId;
    client.addPrompt.mockResolvedValue({
      ok: true,
      status: 200,
      data: { objId: "obj-a1b2c3d4", resolvedSeq: 12345, resolvedOffset: 1.19 },
    });
    client.getStatus.mockResolvedValue({
      ok: true,
      status: 200,
      data: { sessionId, state: "tracking", reason: null, objects: [], framesBehindLive: 3 },
    });
  });

  const click = { xNorm: 0.431, yNorm: 0.662, seq: 12345, offset: 1.24 };

  it("forwards a prompt and records the object", async () => {
    const result = await service.addPrompt(actor(), sessionId, click);

    expect(result.ok).toBe(true);
    expect(result.data.objId).toBe("obj-a1b2c3d4");

    const record = await XraySession.findOne({ sessionId }).lean();
    expect(record.objects).toEqual(["obj-a1b2c3d4"]);
    expect(record.state).toBe("tracking");
  });

  it("does not double-record an object on a repeated prompt", async () => {
    await service.addPrompt(actor(), sessionId, click);
    await service.addPrompt(actor(), sessionId, click);

    const record = await XraySession.findOne({ sessionId }).lean();
    expect(record.objects).toEqual(["obj-a1b2c3d4"]);
  });

  // Never trust a sessionId from the client.
  it("refuses a prompt on another tenant's session", async () => {
    const result = await service.addPrompt(
      { adminId: "x", userId: OTHER_TENANT, memberId: null },
      sessionId,
      click,
    );

    expect(result.status).toBe(404);
    expect(client.addPrompt).not.toHaveBeenCalled();
  });

  // Contract §10: forward it, never auto-retry it.
  it("forwards frame_not_buffered without retrying", async () => {
    client.addPrompt.mockResolvedValue({
      ok: false,
      status: 409,
      code: "frame_not_buffered",
      message: "aged out",
      retryable: false,
    });

    const result = await service.addPrompt(actor(), sessionId, click);

    expect(result.status).toBe(409);
    expect(result.code).toBe("frame_not_buffered");
    expect(client.addPrompt).toHaveBeenCalledTimes(1);
  });

  it("reads live status from the service", async () => {
    const result = await service.getSession(actor(), sessionId);

    expect(result.data.state).toBe("tracking");
    expect(result.data.framesBehindLive).toBe(3);
  });

  it("refuses status for another tenant's session", async () => {
    expect((await service.getSession({ userId: OTHER_TENANT }, sessionId)).status).toBe(404);
    expect(client.getStatus).not.toHaveBeenCalled();
  });

  it("bumps the heartbeat", async () => {
    const before = (await XraySession.findOne({ sessionId }).lean()).lastHeartbeatAt;
    await new Promise((r) => setTimeout(r, 12));

    const result = await service.heartbeat(actor(), sessionId);

    expect(result.ok).toBe(true);
    const after = (await XraySession.findOne({ sessionId }).lean()).lastHeartbeatAt;
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });

  /**
   * The service reaps on MISSING heartbeats and has no other signal, so a
   * heartbeat Node answers but does not forward kills the session at
   * XRAY_IDLE_TIMEOUT_SEC while Node reports it healthy. Measured against the
   * real service before this was wired: 211 masks, then ended/idle_timeout at
   * 45.3s, with four heartbeats answered 200 on the way.
   */
  it("forwards the heartbeat to the service", async () => {
    client.heartbeat.mockClear();

    const result = await service.heartbeat(actor(), sessionId);

    expect(result.ok).toBe(true);
    expect(client.heartbeat).toHaveBeenCalledWith(sessionId);
  });

  it("does not forward a heartbeat for a session it does not own", async () => {
    client.heartbeat.mockClear();

    const result = await service.heartbeat({ userId: OTHER_TENANT }, sessionId);

    expect(result.status).toBe(404);
    // The Mongo scope refused it, so nothing should reach the GPU box at all.
    expect(client.heartbeat).not.toHaveBeenCalled();
  });

  /**
   * The service answering `session_not_found` is the one failure that IS
   * evidence about this session. Node's own reaper only fires on missing
   * heartbeats and the browser is still sending them, so without this the
   * record stays live forever and the UI holds a frozen outline.
   */
  it("ends its own record when the service has no such session", async () => {
    client.heartbeat.mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "session_not_found",
      retryable: false,
    });

    const result = await service.heartbeat(actor(), sessionId);

    expect(result.status).toBe(404);
    expect(result.code).toBe("session_not_found");
    const record = await XraySession.findOne({ sessionId }).lean();
    expect(record.state).toBe("ended");
    expect(record.endReason).toBe("session_expired");
  });

  /**
   * Anything else is not evidence about this session: a timeout, a 503, or a
   * service too old to have the route. Ending a live session because one
   * keepalive could not be delivered would be a worse failure than the one it
   * is guarding against.
   */
  it("keeps the session live when the heartbeat cannot be delivered", async () => {
    client.heartbeat.mockResolvedValueOnce({
      ok: false,
      status: 503,
      code: "service_unavailable",
      retryable: true,
    });

    const result = await service.heartbeat(actor(), sessionId);

    expect(result.ok).toBe(true);
    const record = await XraySession.findOne({ sessionId }).lean();
    expect(record.state).not.toBe("ended");
  });

  it("404s a heartbeat for an unknown session, so the frontend learns it is gone", async () => {
    expect((await service.heartbeat(actor(), "0123456789abcdef")).status).toBe(404);
  });

  it("404s a heartbeat for another tenant's session", async () => {
    expect((await service.heartbeat({ userId: OTHER_TENANT }, sessionId)).status).toBe(404);
  });

  it("closes the session and marks it ended", async () => {
    const result = await service.closeSession(actor(), sessionId);

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ isSuccess: true });

    const record = await XraySession.findOne({ sessionId }).lean();
    expect(record.state).toBe("ended");
    expect(record.endReason).toBe("closed_by_user");
    expect(record.endedAt).toBeInstanceOf(Date);
  });

  // Contract §5: idempotent. A frontend closing twice is the normal case.
  it("a second close is also 200", async () => {
    await service.closeSession(actor(), sessionId);
    const second = await service.closeSession(actor(), sessionId);

    expect(second.ok).toBe(true);
    expect(second.data).toEqual({ isSuccess: true });
  });

  it("closing an unknown session is 200 and does not call the service", async () => {
    const result = await service.closeSession(actor(), "0123456789abcdef");

    expect(result.ok).toBe(true);
    expect(client.closeSession).not.toHaveBeenCalled();
  });

  // Guessing an id must not let one tenant close another's session.
  it("closing another tenant's session is 200 but does nothing", async () => {
    const result = await service.closeSession({ userId: OTHER_TENANT }, sessionId);

    expect(result.ok).toBe(true);
    expect(client.closeSession).not.toHaveBeenCalled();
    expect((await XraySession.findOne({ sessionId }).lean()).state).toBe("ready");
  });

  // If the service refuses, the GPU may still hold the slot — leave the record
  // live so Phase 5's sweep retries instead of forgetting it.
  it("leaves the record live when the service refuses to close", async () => {
    client.closeSession.mockResolvedValue({
      ok: false,
      status: 503,
      code: "service_unavailable",
      retryable: true,
    });

    const result = await service.closeSession(actor(), sessionId);

    expect(result.ok).toBe(false);
    expect((await XraySession.findOne({ sessionId }).lean()).state).toBe("ready");
  });

  it("answers an ended session from Node's record, keeping the reason", async () => {
    await service.closeSession(actor(), sessionId);

    const result = await service.getSession(actor(), sessionId);

    expect(result.data).toEqual({
      sessionId,
      state: "ended",
      reason: "closed_by_user",
      objects: [],
      framesBehindLive: 0,
    });
    // The GPU state is gone; asking would 404 and lose the reason.
    expect(client.getStatus).not.toHaveBeenCalled();
  });

  it("refuses a prompt on an ended session without calling the service", async () => {
    await service.closeSession(actor(), sessionId);

    const result = await service.addPrompt(actor(), sessionId, click);

    expect(result.status).toBe(404);
    expect(client.addPrompt).not.toHaveBeenCalled();
  });

  it("removes a tracked object and unrecords it", async () => {
    await service.addPrompt(actor(), sessionId, click);

    const result = await service.removeObject(actor(), sessionId, "obj-a1b2c3d4");

    expect(result.ok).toBe(true);
    expect((await XraySession.findOne({ sessionId }).lean()).objects).toEqual([]);
  });

  it("removing an object twice is 200 both times", async () => {
    await service.addPrompt(actor(), sessionId, click);
    await service.removeObject(actor(), sessionId, "obj-a1b2c3d4");

    expect((await service.removeObject(actor(), sessionId, "obj-a1b2c3d4")).ok).toBe(true);
  });
});


describe('local relay session lifecycle', () => {
  const browser = { clientSessionId: 'tab-1', streamToken: 'test-browser-token' };
  const setup = () => {
    process.env.XRAY_LOCAL_TEST_MODE = 'true';
    process.env.XRAY_LOCAL_STREAM_HOSTS = 'dev-stream.test';
  };
  const cleanup = async () => {
    const { releaseLocalHls } = await import('../../core/v2/xray/dev/localHlsRelay.js');
    for(const [request] of client.createSession.mock.calls) releaseLocalHls(request.streamUrl);
    delete process.env.XRAY_LOCAL_TEST_MODE;
    delete process.env.XRAY_LOCAL_STREAM_HOSTS;
  };
  it('failed GPU starts reclaim relay references before the next attempt', async () => {
    setup();
    client.createSession.mockResolvedValue({ ok: false, status: 503, code: 'stream_not_ready' });
    try {
      for(let i=0;i<12;i++) expect((await create({},browser)).code).toBe('stream_not_ready');
      expect(client.createSession).toHaveBeenCalledTimes(12);
      expect(await XraySession.countDocuments()).toBe(0);
    } finally { await cleanup(); }
  });
  it('confirmed session closes reclaim relay capacity for repeated selections', async () => {
    setup();
    try {
      for(let i=0;i<12;i++) {
        const id='local-reset-'+i;
        client.createSession.mockResolvedValue({ok:true,status:200,data:{...SERVICE_SESSION,sessionId:id}});
        expect((await create({},browser)).ok).toBe(true);
        expect((await service.closeSession(actor(),id)).ok).toBe(true);
      }
      expect(client.createSession).toHaveBeenCalledTimes(12);
      expect(client.closeSession).toHaveBeenCalledTimes(12);
      expect(await XraySession.countDocuments({state:{$ne:'ended'}})).toBe(0);
    } finally { await cleanup(); }
  });
});
