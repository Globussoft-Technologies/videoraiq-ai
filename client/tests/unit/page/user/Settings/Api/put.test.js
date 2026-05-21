/**
 * src/page/user/Settings/Api/put/index.jsx — updateRecipient
 * PUT /api/v1/recipients/update?id=... via global fetch + waitForToken.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const waitForTokenMock = vi.hoisted(() => vi.fn(async () => "TOK_PUT"));
vi.mock("@/utils/waitForToken", () => ({ waitForToken: waitForTokenMock }));

const { updateRecipient } = await import(
  "../../../../../../src/page/user/Settings/Api/put/index.jsx"
);

const origFetch = globalThis.fetch;

beforeEach(() => {
  waitForTokenMock.mockClear();
});

afterEach(() => {
  globalThis.fetch = origFetch;
});

describe("page/Settings updateRecipient", () => {
  it("PUTs to /api/v1/recipients/update with id query, token header, and JSON body", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ body: { updated: true } }),
    });
    const payload = { fullName: "Alice" };
    const r = await updateRecipient("REC-1", payload);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/recipients\/update\?id=REC-1$/);
    expect(opts.method).toBe("PUT");
    expect(opts.headers["x-access-token"]).toBe("TOK_PUT");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(opts.body)).toEqual(payload);
    expect(r).toEqual({ updated: true });
  });

  it("falls back to result when result.body is missing", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ status: "ok" }),
    });
    const r = await updateRecipient("X", {});
    expect(r).toEqual({ status: "ok" });
  });

  it("returns an error object when fetch rejects", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("boom"));
    const r = await updateRecipient("X", {});
    expect(r).toEqual({ status: "error", message: "boom" });
  });

  it("awaits the token before invoking fetch", async () => {
    let resolveTok;
    waitForTokenMock.mockImplementationOnce(
      () => new Promise((res) => (resolveTok = res))
    );
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ body: {} }),
    });
    const p = updateRecipient("A", {});
    // fetch should not yet have been called
    expect(globalThis.fetch).not.toHaveBeenCalled();
    resolveTok("LATE_TOK");
    await p;
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [, opts] = globalThis.fetch.mock.calls[0];
    expect(opts.headers["x-access-token"]).toBe("LATE_TOK");
  });
});
