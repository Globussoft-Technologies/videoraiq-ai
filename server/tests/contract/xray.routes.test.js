/**
 * X-Ray routing and request shaping. Contract §5, §10.
 *
 * The X-ray router is mounted ALONE here, without `verifyToken`, and the
 * service layer is MOCKED. So this file answers exactly two questions:
 *
 *   1. does each URL reach the right service method, with the right arguments
 *      pulled off the request?
 *   2. is malformed input rejected before the service is called at all?
 *
 * The service's own behaviour — authorisation, licensing, idempotency — is
 * proven against a real database in tests/integration/xray.service.test.js.
 * Keeping the two apart means a routing change cannot be mistaken for a logic
 * change, and a logic test needs no fake HTTP request.
 *
 * Until Phase 3 this file asserted six `501 not_implemented` replies. Those
 * stubs are gone, so the assertions became "reaches the right method with the
 * right arguments" instead — the same wiring, now with something behind it.
 *
 * The flag gate lives next door:
 *   xray.disabled.test.js  flag off -> every X-ray URL 404s off the real router
 *   xray.enabled.test.js   flag on  -> routed, and 401 without a token
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

const service = {
  createSession: vi.fn(),
  addPrompt: vi.fn(),
  closeSession: vi.fn(),
  removeObject: vi.fn(),
  getSession: vi.fn(),
  heartbeat: vi.fn(),
};

vi.mock("../../core/v2/xray/xray.service.js", () => ({ default: service }));

const { buildApp } = await import("../helpers/app.js");
const { default: xrayRoutes } = await import("../../core/v2/xray/xray.routes.js");

/**
 * The X-ray router alone. A tiny middleware stands in for `verifyToken` so the
 * controller sees the same `req.verified` shape the real one produces
 * (middlewares/verifyToken.js:157).
 */
const buildXrayApp = (userData = { adminId: "a1", user_id: "tenant-1", memberId: null }) =>
  buildApp((app) => {
    app.use((req, _res, next) => {
      req.verified = { state: true, userData };
      next();
    });
    app.use("/api/v2/xray", xrayRoutes);
  });

const ok = (data, status = 200) => ({ ok: true, status, data });

beforeEach(() => {
  for (const fn of Object.values(service)) fn.mockReset();
});

// ---------------------------------------------------------------------------
// Each URL reaches the right method with the right arguments
// ---------------------------------------------------------------------------

describe("routing", () => {
  it("POST /sessions -> createSession(actor, body, browser)", async () => {
    service.createSession.mockResolvedValue(ok({ sessionId: "deadbeef", width: 1920 }));

    const res = await request(buildXrayApp())
      .post("/api/v2/xray/sessions")
      .set("x-session-id", "tab-77")
      .send({ cameraId: "507f1f77bcf86cd799439011", nvrId: "507f1f77bcf86cd799439012" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sessionId: "deadbeef", width: 1920 });
    expect(service.createSession).toHaveBeenCalledWith(
      { adminId: "a1", userId: "tenant-1", memberId: null },
      { cameraId: "507f1f77bcf86cd799439011", nvrId: "507f1f77bcf86cd799439012" },
      { clientSessionId: "tab-77" },
    );
  });

  // Contract §9 needs tab granularity, and the tab id arrives in a header the
  // frontend may omit. The controller passes "" rather than undefined so the
  // service's fallback is a plain string check.
  it("passes an empty clientSessionId when the tab header is absent", async () => {
    service.createSession.mockResolvedValue(ok({ sessionId: "x" }));

    await request(buildXrayApp())
      .post("/api/v2/xray/sessions")
      .send({ cameraId: "507f1f77bcf86cd799439011", nvrId: "507f1f77bcf86cd799439012" });

    expect(service.createSession.mock.calls[0][2]).toEqual({ clientSessionId: "" });
  });

  // The two identities are NOT interchangeable: adminId is a Mongo _id,
  // user_id is the tenant key every Channel row is stamped with. Swapping them
  // would scope every query by the wrong field.
  it("maps user_id -> userId and adminId -> adminId, keeping them distinct", async () => {
    service.heartbeat.mockResolvedValue(ok({ isSuccess: true }));

    await request(
      buildXrayApp({ adminId: "507f1f77bcf86cd799439013", user_id: "tenant-42", memberId: "m9" }),
    ).post("/api/v2/xray/sessions/abc123def456/heartbeat");

    expect(service.heartbeat).toHaveBeenCalledWith(
      { adminId: "507f1f77bcf86cd799439013", userId: "tenant-42", memberId: "m9" },
      "abc123def456",
    );
  });

  it("POST /sessions/:id/prompt -> addPrompt(actor, id, body)", async () => {
    service.addPrompt.mockResolvedValue(ok({ objId: "obj-a1b2c3d4", resolvedSeq: 12345 }));

    const res = await request(buildXrayApp())
      .post("/api/v2/xray/sessions/abc123def456/prompt")
      .send({ xNorm: 0.431, yNorm: 0.662, seq: 12345, offset: 1.24 });

    expect(res.status).toBe(200);
    expect(service.addPrompt).toHaveBeenCalledWith(expect.any(Object), "abc123def456", {
      xNorm: 0.431,
      yNorm: 0.662,
      seq: 12345,
      offset: 1.24,
    });
  });

  it("GET /sessions/:id -> getSession", async () => {
    service.getSession.mockResolvedValue(ok({ sessionId: "abc123def456", state: "ready" }));

    const res = await request(buildXrayApp()).get("/api/v2/xray/sessions/abc123def456");

    expect(res.status).toBe(200);
    expect(res.body.state).toBe("ready");
    expect(service.getSession).toHaveBeenCalledWith(expect.any(Object), "abc123def456");
  });

  // The controller supplies the end reason, not the client: contract §7's
  // reasons are a closed set, and a client-chosen string would escape it.
  it("DELETE /sessions/:id -> closeSession with reason closed_by_user", async () => {
    service.closeSession.mockResolvedValue(ok({ isSuccess: true }));

    await request(buildXrayApp()).delete("/api/v2/xray/sessions/abc123def456");

    expect(service.closeSession).toHaveBeenCalledWith(
      expect.any(Object),
      "abc123def456",
      "closed_by_user",
    );
  });

  it("DELETE /sessions/:id/objects/:objId -> removeObject", async () => {
    service.removeObject.mockResolvedValue(ok({ isSuccess: true }));

    await request(buildXrayApp()).delete("/api/v2/xray/sessions/abc123def456/objects/obj-a1b2c3d4");

    expect(service.removeObject).toHaveBeenCalledWith(
      expect.any(Object),
      "abc123def456",
      "obj-a1b2c3d4",
    );
  });
});

// ---------------------------------------------------------------------------
// Failures are shaped as contract §10, never as the house error body
// ---------------------------------------------------------------------------

describe("error shaping", () => {
  it("sends the service's failure as { error, message, retryable }", async () => {
    service.createSession.mockResolvedValue({
      ok: false,
      status: 409,
      code: "frame_not_buffered",
      message: "that frame has aged out",
      retryable: false,
    });

    const res = await request(buildXrayApp())
      .post("/api/v2/xray/sessions")
      .send({ cameraId: "507f1f77bcf86cd799439011", nvrId: "507f1f77bcf86cd799439012" });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: "frame_not_buffered",
      message: "that frame has aged out",
      retryable: false,
    });
    // NOT the house shape (utils/response.js), which the frontend's error
    // switch would not recognise.
    expect(res.body).not.toHaveProperty("status");
  });

  it("turns an unexpected throw into one internal_error, not a stack", async () => {
    service.getSession.mockRejectedValue(new Error("mongo exploded: connection string leaked"));

    const res = await request(buildXrayApp()).get("/api/v2/xray/sessions/abc123def456");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("internal_error");
    expect(JSON.stringify(res.body)).not.toMatch(/exploded|leaked|stack/i);
  });

  // A service method that forgot to return would otherwise reach
  // res.status(undefined) and throw something unreadable.
  it("turns a malformed service result into one internal_error", async () => {
    service.heartbeat.mockResolvedValue(undefined);

    const res = await request(buildXrayApp()).post("/api/v2/xray/sessions/abc123def456/heartbeat");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("internal_error");
  });
});

// ---------------------------------------------------------------------------
// Validation runs BEFORE any logic (plan Phase 1 step 4)
// ---------------------------------------------------------------------------

describe("validation rejects malformed input with 400, before the service is called", () => {
  let app;

  beforeEach(() => {
    app = buildXrayApp();
  });

  const expectRejected = (res, serviceFn) => {
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_failed");
    expect(res.body.retryable).toBe(false);
    if (serviceFn) expect(serviceFn).not.toHaveBeenCalled();
  };

  it("POST /sessions with an empty body", async () => {
    expectRejected(await request(app).post("/api/v2/xray/sessions").send({}), service.createSession);
  });

  it("POST /sessions with a cameraId that is not a 24-hex id", async () => {
    expectRejected(
      await request(app)
        .post("/api/v2/xray/sessions")
        .send({ cameraId: "not-an-id", nvrId: "507f1f77bcf86cd799439012" }),
      service.createSession,
    );
  });

  it("POST /sessions with a missing nvrId", async () => {
    expectRejected(
      await request(app).post("/api/v2/xray/sessions").send({ cameraId: "507f1f77bcf86cd799439011" }),
      service.createSession,
    );
  });

  // Contract §5: xNorm/yNorm are 0..1 against the NATIVE video resolution. A
  // value of 431 means the frontend sent pixels, or measured the CSS box — a
  // bug worth a 400 rather than a track on the wrong object.
  it("prompt with xNorm outside 0..1", async () => {
    expectRejected(
      await request(app)
        .post("/api/v2/xray/sessions/abc123def456/prompt")
        .send({ xNorm: 431, yNorm: 0.662, seq: 12345, offset: 1.24 }),
      service.addPrompt,
    );
  });

  it("prompt with a negative seq", async () => {
    expectRejected(
      await request(app)
        .post("/api/v2/xray/sessions/abc123def456/prompt")
        .send({ xNorm: 0.4, yNorm: 0.6, seq: -1, offset: 1.24 }),
      service.addPrompt,
    );
  });

  it("prompt with a non-integer seq (frag.sn is always whole)", async () => {
    expectRejected(
      await request(app)
        .post("/api/v2/xray/sessions/abc123def456/prompt")
        .send({ xNorm: 0.4, yNorm: 0.6, seq: 12345.5, offset: 1.24 }),
      service.addPrompt,
    );
  });

  // An offset in milliseconds (1240) rather than seconds (1.24) is the likely
  // unit slip; a single HLS segment is seconds long, so 60 is already generous.
  it("prompt with an offset that looks like milliseconds", async () => {
    expectRejected(
      await request(app)
        .post("/api/v2/xray/sessions/abc123def456/prompt")
        .send({ xNorm: 0.4, yNorm: 0.6, seq: 12345, offset: 1240 }),
      service.addPrompt,
    );
  });

  it("prompt with a missing field", async () => {
    expectRejected(
      await request(app)
        .post("/api/v2/xray/sessions/abc123def456/prompt")
        .send({ xNorm: 0.4, yNorm: 0.6, seq: 12345 }),
      service.addPrompt,
    );
  });

  it("a sessionId that is not hex", async () => {
    expectRejected(await request(app).get("/api/v2/xray/sessions/not-hex-at-all"), service.getSession);
  });

  it("an objId that is not obj-prefixed", async () => {
    expectRejected(
      await request(app).delete("/api/v2/xray/sessions/abc123def456/objects/whatever"),
      service.removeObject,
    );
  });
});
