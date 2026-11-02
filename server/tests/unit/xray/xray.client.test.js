/**
 * X-Ray service client — contract §6 and §10.
 *
 * axios is mocked, so these assert what the client SENDS and how it reacts to
 * what comes back. The end-to-end proof against a live (fake) service is
 * core/v2/xray/dev/probeXrayClient.js; this file covers the failure shapes that
 * are tedious to stage by hand and the credential details nobody can eyeball.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import jwt from "jsonwebtoken";

vi.mock("axios", () => ({ default: vi.fn() }));

const { default: axios } = await import("axios");
const { default: client, JWT_SUBJECT } = await import("../../../core/v2/xray/xray.client.js");

const SECRET = "test-xray-shared-secret";

const ENV_KEYS = [
  "XRAY_SERVICE_URL",
  "XRAY_API_KEY",
  "XRAY_JWT_SECRET",
  "JWT_SECRET_KEY",
  "XRAY_JWT_TTL_SEC",
  "XRAY_SERVICE_TIMEOUT_MS",
];
const saved = {};
for (const key of ENV_KEYS) saved[key] = process.env[key];

beforeEach(() => {
  vi.mocked(axios).mockReset();
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.XRAY_SERVICE_URL = "http://xray.test:8130";
  process.env.XRAY_API_KEY = "test-api-key";
  process.env.XRAY_JWT_SECRET = SECRET;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

/** Make axios resolve with this body. */
const resolveWith = (data) => vi.mocked(axios).mockResolvedValue({ status: 200, data });

/** Make axios reject the way it does for a non-2xx response. */
const rejectWithResponse = (status, data) =>
  vi.mocked(axios).mockRejectedValue(Object.assign(new Error(`status ${status}`), {
    response: { status, data },
  }));

/** Make axios reject the way it does when the request never completes. */
const rejectWithCode = (code, message = "network") =>
  vi.mocked(axios).mockRejectedValue(Object.assign(new Error(message), { code }));

const lastRequest = () => vi.mocked(axios).mock.calls.at(-1)[0];

const VALID_SESSION = {
  cameraId: "507f1f77bcf86cd799439011",
  nvrId: "507f1f77bcf86cd799439012",
  adminId: "507f1f77bcf86cd799439013",
  userId: "tenant-42",
  streamUrl: "http://stream.test:8119/stream/nvr-cam/playlist.m3u8",
};

// ---------------------------------------------------------------------------
// Credentials — contract §6: BOTH, on every request
// ---------------------------------------------------------------------------

describe("credentials", () => {
  it("sends X-API-Key and a bearer token on every request", async () => {
    resolveWith({ session_id: "abc" });
    await client.createSession(VALID_SESSION);

    const { headers } = lastRequest();
    expect(headers["X-API-Key"]).toBe("test-api-key");
    expect(headers.Authorization).toMatch(/^Bearer \S+$/);
  });

  it("signs the token HS256 with the shared secret and sub videoraiq-backend", async () => {
    resolveWith({ session_id: "abc" });
    await client.createSession(VALID_SESSION);

    const token = lastRequest().headers.Authorization.slice(7);
    const claims = jwt.verify(token, SECRET, { algorithms: ["HS256"] });
    expect(claims.sub).toBe(JWT_SUBJECT);
    expect(claims.sub).toBe("videoraiq-backend");
    expect(claims.iat).toBeTypeOf("number");
    expect(claims.exp).toBeTypeOf("number");
  });

  it("keeps the token lifetime inside the contract's 5-minute cap", async () => {
    resolveWith({ session_id: "abc" });
    await client.createSession(VALID_SESSION);

    const claims = jwt.decode(lastRequest().headers.Authorization.slice(7));
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(300);
  });

  it("clamps an over-long configured TTL rather than exceeding the cap", async () => {
    process.env.XRAY_JWT_TTL_SEC = "86400";
    resolveWith({ session_id: "abc" });
    await client.createSession(VALID_SESSION);

    const claims = jwt.decode(lastRequest().headers.Authorization.slice(7));
    expect(claims.exp - claims.iat).toBe(300);
  });

  // The plan says "mint per request; do not cache a long-lived token". Changing
  // the secret between two calls is the sharpest test of that: a cached token
  // would still verify against the OLD secret.
  it("mints a fresh token per request rather than caching one", async () => {
    resolveWith({ session_id: "abc" });

    await client.createSession(VALID_SESSION);
    const first = lastRequest().headers.Authorization.slice(7);

    process.env.XRAY_JWT_SECRET = "a-different-secret";
    await client.createSession(VALID_SESSION);
    const second = lastRequest().headers.Authorization.slice(7);

    expect(() => jwt.verify(first, SECRET)).not.toThrow();
    expect(() => jwt.verify(second, SECRET)).toThrow(); // not signed with the old one
    expect(() => jwt.verify(second, "a-different-secret")).not.toThrow();
  });

  it("falls back to JWT_SECRET_KEY, the name the Python side uses", async () => {
    delete process.env.XRAY_JWT_SECRET;
    process.env.JWT_SECRET_KEY = "python-side-name";
    resolveWith({ session_id: "abc" });
    await client.createSession(VALID_SESSION);

    const token = lastRequest().headers.Authorization.slice(7);
    expect(() => jwt.verify(token, "python-side-name")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Refusing to make an unauthenticated request
// ---------------------------------------------------------------------------

describe("when the relay is not configured", () => {
  it.each([
    ["XRAY_SERVICE_URL", "XRAY_SERVICE_URL"],
    ["XRAY_API_KEY", "XRAY_API_KEY"],
    ["XRAY_JWT_SECRET", "XRAY_JWT_SECRET"],
  ])("fails without touching the network when %s is missing", async (_label, key) => {
    delete process.env[key];

    const result = await client.createSession(VALID_SESSION);

    expect(result.ok).toBe(false);
    expect(result.status).toBe(503);
    expect(result.code).toBe("service_unavailable");
    // The point: no half-authenticated request is sent. Sending one would
    // surface the service's 401 as though the USER were unauthorised.
    expect(axios).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// What goes out — contract §6 request bodies
// ---------------------------------------------------------------------------

describe("outbound requests", () => {
  it("POST /sessions carries exactly the five contract fields, snake_cased", async () => {
    resolveWith({ session_id: "abc" });
    await client.createSession(VALID_SESSION);

    const request = lastRequest();
    expect(request.method).toBe("post");
    expect(request.url).toBe("http://xray.test:8130/sessions");
    expect(request.data).toEqual({
      camera_id: "507f1f77bcf86cd799439011",
      nvr_id: "507f1f77bcf86cd799439012",
      admin_id: "507f1f77bcf86cd799439013",
      user_id: "tenant-42",
      stream_url: "http://stream.test:8119/stream/nvr-cam/playlist.m3u8",
    });
  });

  it("the prompt body is snake_cased", async () => {
    resolveWith({ obj_id: "obj-1", resolved_seq: 1, resolved_offset: 0 });
    await client.addPrompt("sess1", { xNorm: 0.431, yNorm: 0.662, seq: 12345, offset: 1.24 });

    expect(lastRequest().data).toEqual({ x_norm: 0.431, y_norm: 0.662, seq: 12345, offset: 1.24 });
  });

  // Easy to get wrong, and the contract is explicit: the frontend calls Node's
  // GET /sessions/:id, but Node calls the service's GET /sessions/{id}/status.
  it("reads status from /sessions/:id/status, not /sessions/:id", async () => {
    resolveWith({ session_id: "sess1", state: "ready" });
    await client.getStatus("sess1");

    expect(lastRequest().url).toBe("http://xray.test:8130/sessions/sess1/status");
    expect(lastRequest().method).toBe("get");
  });

  it("percent-encodes ids into the path", async () => {
    resolveWith({});
    await client.removeObject("sess/../1", "obj a");

    expect(lastRequest().url).toBe("http://xray.test:8130/sessions/sess%2F..%2F1/objects/obj%20a");
  });

  it("applies the configured timeout", async () => {
    process.env.XRAY_SERVICE_TIMEOUT_MS = "4000";
    resolveWith({});
    await client.health();

    expect(lastRequest().timeout).toBe(4000);
  });

  it("defaults the timeout to the contract's 15s", async () => {
    resolveWith({});
    await client.health();

    expect(lastRequest().timeout).toBe(15_000);
  });
});

// ---------------------------------------------------------------------------
// What comes back — contract §5 shapes, camelCased
// ---------------------------------------------------------------------------

describe("inbound translation", () => {
  it("camelCases a session response", async () => {
    resolveWith({
      session_id: "deadbeef",
      width: 1920,
      height: 1080,
      frame_rate: 5.0,
      lost_after_frames: 25,
      max_objects: 1,
    });

    const result = await client.createSession(VALID_SESSION);

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({
      sessionId: "deadbeef",
      width: 1920,
      height: 1080,
      frameRate: 5,
      lostAfterFrames: 25,
      maxObjects: 1,
    });
  });

  it("camelCases a prompt response", async () => {
    resolveWith({ obj_id: "obj-a1b2c3d4", resolved_seq: 12345, resolved_offset: 1.19 });

    const result = await client.addPrompt("sess1", { xNorm: 0.4, yNorm: 0.6, seq: 12345, offset: 1.24 });

    expect(result.data).toEqual({ objId: "obj-a1b2c3d4", resolvedSeq: 12345, resolvedOffset: 1.19 });
  });

  it("camelCases a status response, including nested objects", async () => {
    resolveWith({
      session_id: "sess1",
      state: "tracking",
      reason: null,
      frames_behind_live: 142,
      objects: [{ obj_id: "obj-1", bbox: [1, 2, 3, 4], polygon: [[[1, 2]]] }],
    });

    const result = await client.getStatus("sess1");

    expect(result.data).toEqual({
      sessionId: "sess1",
      state: "tracking",
      reason: null,
      framesBehindLive: 142,
      objects: [{ objId: "obj-1", bbox: [1, 2, 3, 4], polygon: [[[1, 2]]] }],
    });
  });

  it("reports both DELETEs as a plain success", async () => {
    resolveWith({ is_success: true });
    expect((await client.closeSession("sess1")).data).toEqual({ isSuccess: true });
    expect((await client.removeObject("sess1", "obj-1")).data).toEqual({ isSuccess: true });
  });
});

// ---------------------------------------------------------------------------
// Failure — contract §10
// ---------------------------------------------------------------------------

describe("the service's own error codes pass through unchanged", () => {
  it.each([
    [409, "frame_not_buffered", false],
    [422, "mask_too_small", false],
    [409, "max_objects_reached", false],
    [503, "stream_not_ready", true],
    [503, "max_sessions_reached", true],
    [403, "stream_url_not_allowed", false],
    [404, "session_not_found", false],
  ])("%i %s", async (status, code, retryable) => {
    rejectWithResponse(status, { error: code, message: "from the service", retryable });

    const result = await client.createSession(VALID_SESSION);

    expect(result.ok).toBe(false);
    expect(result.status).toBe(status);
    expect(result.code).toBe(code); // not remapped
    expect(result.message).toBe("from the service"); // not prettified
    expect(result.retryable).toBe(retryable); // the service's own judgement
  });

  // Contract §10 is unambiguous that the code is forwarded. A 401 here is a
  // Node/service credential mismatch rather than a user problem, but inventing
  // a different code would tell the frontend a story that did not happen.
  it("forwards a 401 rather than disguising it", async () => {
    rejectWithResponse(401, { error: "unauthorized", message: "bad key", retryable: false });

    const result = await client.createSession(VALID_SESSION);

    expect(result.status).toBe(401);
    expect(result.code).toBe("unauthorized");
  });
});

describe("transport failure", () => {
  it.each(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "EHOSTUNREACH"])(
    "%s becomes a retryable 503",
    async (code) => {
      rejectWithCode(code);

      const result = await client.createSession(VALID_SESSION);

      expect(result.ok).toBe(false);
      expect(result.status).toBe(503);
      expect(result.code).toBe("service_unavailable");
      expect(result.retryable).toBe(true);
    },
  );

  it("a timeout becomes a retryable 503 that says so", async () => {
    rejectWithCode("ECONNABORTED", "timeout of 15000ms exceeded");

    const result = await client.createSession(VALID_SESSION);

    expect(result.status).toBe(503);
    expect(result.code).toBe("service_unavailable");
    expect(result.retryable).toBe(true);
    expect(result.message).toMatch(/in time/);
  });

  it("never retries — one call in, one request out", async () => {
    rejectWithCode("ECONNREFUSED");

    await client.createSession(VALID_SESSION);

    // A retry of POST /sessions could strand a second GPU slot: the first
    // attempt may have succeeded on the far side and only the reply been lost.
    expect(axios).toHaveBeenCalledTimes(1);
  });
});

describe("a response that is not in the contract's shape", () => {
  it("maps a 5xx HTML body to a retryable 503 and does not forward the body", async () => {
    rejectWithResponse(502, "<html><body>502 Bad Gateway</body></html>");

    const result = await client.createSession(VALID_SESSION);

    expect(result.status).toBe(503);
    expect(result.code).toBe("service_unavailable");
    expect(result.retryable).toBe(true);
    expect(result.message).not.toMatch(/html/i);
  });

  it("maps an unexpected 4xx to a non-retryable 502", async () => {
    rejectWithResponse(418, { detail: "not a contract body" });

    const result = await client.createSession(VALID_SESSION);

    expect(result.status).toBe(502);
    expect(result.code).toBe("internal_error");
    expect(result.retryable).toBe(false);
  });

  it("treats an empty error field as no error field", async () => {
    rejectWithResponse(500, { error: "", message: "nope" });

    const result = await client.createSession(VALID_SESSION);

    expect(result.code).toBe("service_unavailable");
  });
});
