/**
 * Bulk camera start/stop — the call the global schedule runner makes.
 *
 * It fans out to two independent services (detection and attendance). The
 * behaviour that matters: one of them being unreachable must not prevent the
 * other from acting. Under Promise.all it did — a single dead host rejected
 * the whole call, the runner treated it as a total failure, and every camera
 * in the batch stayed at its old state past its scheduled stop time.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted: mock factories are hoisted above normal declarations, so the
// spy must be created in the hoisted scope for axios.post to BE the spy
// rather than a wrapper closing over an uninitialised binding.
const { post } = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("axios", () => ({ default: { post } }));
vi.mock("../../../utils/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../core/v1/NVR/nvr.model.js", () => ({
  default: { findById: vi.fn() },
}));
vi.mock("../../../utils/rtspStream.js", () => ({
  default: vi.fn(),
  buildRTSPUrl: vi.fn(),
  buildStreamingUrl: vi.fn(),
  resolveHost: vi.fn(),
}));
vi.mock("../../../utils/adminEndpoints.js", () => ({
  resolveAdminEndpoints: async () => ({
    detectionUrl: "http://detection.test",
    attendanceUrl: "http://attendance.test",
  }),
}));

const pythonService = (await import("../../../services/python.service.js")).default;

const DETECTION_STOP = "http://detection.test/stream/stop-all";
const DETECTION_RESUME = "http://detection.test/stream/resume-all";
const ATTENDANCE_STOP = "http://attendance.test/api/v1/cameras/stop-all";
const ATTENDANCE_RESUME = "http://attendance.test/api/v1/cameras/resume-all";

const ADMIN = "admin-1";

/**
 * Resolve or reject per URL, so each service can fail independently.
 *
 * url is coerced rather than used raw: a stray argument-less invocation of the
 * spy can land after a test body finishes, and an unguarded .includes() there
 * fails the test for a reason that has nothing to do with the code under test.
 */
const respond = ({ detection = "ok", attendance = "ok" } = {}) => {
  post.mockImplementation(async (url) => {
    const target = String(url ?? "");
    // A URL-less stray invocation must be inert. Letting it fall through to the
    // attendance branch would throw that branch's error with nothing awaiting
    // it, failing the test as an unhandled rejection.
    if (!target) return { data: null };
    const outcome = target.includes("detection.test") ? detection : attendance;
    if (outcome instanceof Error) throw outcome;
    return { data: { status: outcome } };
  });
};

/** Only calls that actually carried a URL — see the note on respond(). */
const realCalls = () => post.mock.calls.filter(([url]) => typeof url === "string");
const urlsCalled = () => realCalls().map(([url]) => url).sort();
const payloadFor = (host) => realCalls().find(([url]) => url.includes(host))?.[1];

beforeEach(() => post.mockReset());

describe("guard clauses", () => {
  it("rejects without an admin id rather than posting to a broken URL", async () => {
    await expect(pythonService.toggleCamerasBulk(undefined, ["c1"], false)).rejects.toThrow(
      /admin_id is required/,
    );
    expect(post).not.toHaveBeenCalled();
  });
});

describe("endpoint selection", () => {
  it("hits both stop endpoints when disabling", async () => {
    respond();
    await pythonService.toggleCamerasBulk(ADMIN, ["c1"], false);
    expect(urlsCalled()).toEqual([ATTENDANCE_STOP, DETECTION_STOP].sort());
  });

  it("hits both resume endpoints when enabling", async () => {
    respond();
    await pythonService.toggleCamerasBulk(ADMIN, ["c1"], true);
    expect(urlsCalled()).toEqual([ATTENDANCE_RESUME, DETECTION_RESUME].sort());
  });
});

describe("payload shape", () => {
  it("sends a bare camera_id for a single camera", async () => {
    respond();
    await pythonService.toggleCamerasBulk(ADMIN, ["c1"], false);
    expect(payloadFor("detection.test")).toEqual({ admin_id: ADMIN, camera_id: "c1" });
  });

  it("sends an array for several cameras", async () => {
    respond();
    await pythonService.toggleCamerasBulk(ADMIN, ["c1", "c2", "c3"], false);
    expect(payloadFor("detection.test")).toEqual({
      admin_id: ADMIN,
      camera_id: ["c1", "c2", "c3"],
    });
  });

  it("omits camera_id entirely when there are none — an admin-wide call", async () => {
    respond();
    await pythonService.toggleCamerasBulk(ADMIN, [], false);
    expect(payloadFor("detection.test")).toEqual({ admin_id: ADMIN });
  });

  it("drops blank ids instead of sending empty strings", async () => {
    respond();
    await pythonService.toggleCamerasBulk(ADMIN, ["c1", "", "  ", null, "c2"], false);
    expect(payloadFor("detection.test").camera_id).toEqual(["c1", "c2"]);
  });

  it("accepts a single id not wrapped in an array", async () => {
    respond();
    await pythonService.toggleCamerasBulk(ADMIN, "c1", false);
    expect(payloadFor("detection.test")).toEqual({ admin_id: ADMIN, camera_id: "c1" });
  });

  it("sends the same payload to both services", async () => {
    respond();
    await pythonService.toggleCamerasBulk(ADMIN, ["c1", "c2"], false);
    expect(payloadFor("attendance.test")).toEqual(payloadFor("detection.test"));
  });
});

describe("one service failing must not block the other", () => {
  it("still stops detection when attendance is unreachable", async () => {
    respond({ attendance: new Error("ECONNREFUSED") });

    const result = await pythonService.toggleCamerasBulk(ADMIN, ["c1"], false);

    // The critical assertion: it resolves. Rejecting here made the runner
    // abandon the whole batch and leave cameras running.
    expect(result.detection).toEqual({ status: "ok" });
    expect(result.attendance).toBeNull();
    expect(result.partialFailure).toBe("detection-only");
  });

  it("still stops attendance when detection is unreachable", async () => {
    respond({ detection: new Error("ECONNREFUSED") });

    const result = await pythonService.toggleCamerasBulk(ADMIN, ["c1"], false);

    expect(result.attendance).toEqual({ status: "ok" });
    expect(result.detection).toBeNull();
    expect(result.partialFailure).toBe("attendance-only");
  });

  it("attempts both even though one is already failing", async () => {
    respond({ detection: new Error("boom") });
    await pythonService.toggleCamerasBulk(ADMIN, ["c1"], false);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("returns the pre-existing shape untouched when both succeed", async () => {
    respond();
    const result = await pythonService.toggleCamerasBulk(ADMIN, ["c1"], false);

    // No partialFailure key at all on the happy path: callers that deep-equal
    // this response predate the field and must keep passing.
    expect(result).toEqual({
      detection: { status: "ok" },
      attendance: { status: "ok" },
    });
    expect("partialFailure" in result).toBe(false);
  });
});

describe("both services failing", () => {
  it("throws, so the caller leaves the stored state alone and retries next tick", async () => {
    respond({
      detection: new Error("detection down"),
      attendance: new Error("attendance down"),
    });

    await expect(pythonService.toggleCamerasBulk(ADMIN, ["c1"], false)).rejects.toThrow(
      /detection down/,
    );
  });

  it("surfaces an HTTP error body rather than swallowing it", async () => {
    const httpError = Object.assign(new Error("Request failed with status code 500"), {
      response: { data: { detail: "worker pool exhausted" } },
    });
    respond({ detection: httpError, attendance: httpError });

    await expect(pythonService.toggleCamerasBulk(ADMIN, ["c1"], false)).rejects.toMatchObject({
      response: { data: { detail: "worker pool exhausted" } },
    });
  });
});
