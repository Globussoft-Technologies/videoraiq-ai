/**
 * Unit coverage for core/v1/detectionObjects/objects.service.js error branches.
 *
 * The integration suite at tests/integration/services/detectionObjects.service.test.js
 * walks the happy paths against in-memory MongoDB but cannot exercise the
 * outer catch arms cheaply — `find().sort()` and `findOneAndUpdate()` don't
 * naturally throw against the in-memory adapter, leaving lines 57-66
 * (`getAllObjects` catch) and 103-104 (`deleteDetectionObjectsByType` catch)
 * at 0%.
 *
 * These tests stub the model at import time to make the queries throw, so the
 * service's error-handling can be observed without touching the DB.
 *
 * Mocks (1, well under the 8-mock ceiling):
 *   1. core/v1/detectionObjects/objects.model.js — find()/findOneAndUpdate()
 *
 * R95 — server phase (test-only, never touch product code).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeReqRes } from "../../helpers/factory.js";

vi.mock("../../../core/v1/detectionObjects/objects.model.js", () => ({
  default: {
    findOneAndUpdate: vi.fn(),
    find: vi.fn(),
  },
}));

const { default: DetectionObjects } = await import(
  "../../../core/v1/detectionObjects/objects.model.js"
);
const { default: ObjectsService } = await import(
  "../../../core/v1/detectionObjects/objects.service.js"
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ObjectsService.getAllObjects — outer catch (lines 57-66)", () => {
  it("returns 400 with errorResp when DetectionObjects.find().sort() rejects", async () => {
    // The service awaits `find({}).select(...).sort(...)`; we make the final
    // `sort()` return a rejected promise so the outer try/catch fires.
    const sortReject = vi.fn().mockRejectedValueOnce(new Error("db down"));
    const selectChain = vi.fn().mockReturnValueOnce({ sort: sortReject });
    DetectionObjects.find.mockReturnValueOnce({ select: selectChain });

    const { req, res, next } = makeReqRes();
    await ObjectsService.getAllObjects(req, res, next);

    expect(res.statusCode).toBe(400);
    // Response.errorResp envelopes { status: "failed", error: <message> }
    expect(res._body?.body?.status).toBe("failed");
    expect(res._body?.body?.message).toBe("Failed to retrieve detection objects");
    expect(next.calls).toHaveLength(0); // catch doesn't call next()
  });

  it("propagates the underlying error message into the errorResp envelope", async () => {
    const boom = new Error("connection refused");
    const sortReject = vi.fn().mockRejectedValueOnce(boom);
    const selectChain = vi.fn().mockReturnValueOnce({ sort: sortReject });
    DetectionObjects.find.mockReturnValueOnce({ select: selectChain });

    const { req, res, next } = makeReqRes();
    await ObjectsService.getAllObjects(req, res, next);

    expect(res.statusCode).toBe(400);
    // errorResp surfaces the original error message under `error` (per response.js).
    const body = res._body?.body;
    expect(JSON.stringify(body)).toContain("connection refused");
  });

  it("still returns 400 when the formatter throws on a malformed doc", async () => {
    // Force the .map() step inside the try-block to throw by returning a doc
    // whose `objects.sort()` is missing — `doc.objects` is null.
    const docs = [{ settingType: "crowdDetection", objects: null }];
    const sortResolve = vi.fn().mockResolvedValueOnce(docs);
    const selectChain = vi.fn().mockReturnValueOnce({ sort: sortResolve });
    DetectionObjects.find.mockReturnValueOnce({ select: selectChain });

    const { req, res, next } = makeReqRes();
    await ObjectsService.getAllObjects(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res._body?.body?.status).toBe("failed");
  });
});

describe("ObjectsService.deleteDetectionObjectsByType — outer catch (lines 103-104)", () => {
  it("forwards the thrown error to next() when findOneAndUpdate rejects", async () => {
    const err = new Error("write conflict");
    DetectionObjects.findOneAndUpdate.mockRejectedValueOnce(err);

    const { req, res, next } = makeReqRes();
    req.body = { settingType: "crowdDetection", objects: ["crowd"] };

    await ObjectsService.deleteDetectionObjectsByType(req, res, next);

    expect(next.calls).toHaveLength(1);
    expect(next.calls[0]).toBe(err);
    // The catch path does NOT touch res — statusCode stays at the default 200
    // and no body was written.
    expect(res._body).toBeUndefined();
  });

  it("does not invoke next() when the early-return guards short-circuit", async () => {
    // Missing settingType -> 400 short-circuit, model is never called.
    const { req, res, next } = makeReqRes();
    req.body = { objects: [] };

    await ObjectsService.deleteDetectionObjectsByType(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(DetectionObjects.findOneAndUpdate).not.toHaveBeenCalled();
    expect(next.calls).toHaveLength(0);
  });
});
