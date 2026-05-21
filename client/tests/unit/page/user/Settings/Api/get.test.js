/**
 * src/page/user/Settings/Api/get/index.jsx — getRecipients, getDetectionTypes
 * Both call fetch + waitForToken; result unwrapping defaults to []/{}.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const waitForTokenMock = vi.hoisted(() => vi.fn(async () => "TOK_GET"));
vi.mock("@/utils/waitForToken", () => ({ waitForToken: waitForTokenMock }));

const tokenMock = vi.hoisted(() => vi.fn(() => "UNUSED"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const { getRecipients, getDetectionTypes } = await import(
  "../../../../../../src/page/user/Settings/Api/get/index.jsx"
);

const origFetch = globalThis.fetch;

beforeEach(() => {
  waitForTokenMock.mockClear();
});

afterEach(() => {
  globalThis.fetch = origFetch;
});

describe("page/Settings getRecipients", () => {
  it("GETs /api/v1/recipients/fetch with all query params and the token header", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ body: { data: { alerts: [{ id: 1 }] } } }),
    });
    const r = await getRecipients("email", "alice", "active", 5, 20);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain("/api/v1/recipients/fetch");
    expect(url).toContain("alertType=email");
    expect(url).toContain("search=alice");
    expect(url).toContain("filterByStatus=active");
    expect(url).toContain("skip=5");
    expect(url).toContain("limit=20");
    expect(opts.method).toBe("GET");
    expect(opts.headers["x-access-token"]).toBe("TOK_GET");
    expect(r).toEqual([{ id: 1 }]);
  });

  it("returns [] when data.body.data.alerts is missing", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ body: {} }),
    });
    const r = await getRecipients("sms", "", "all");
    expect(r).toEqual([]);
  });

  it("defaults skip=0 and limit=100 when omitted", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => ({}),
    });
    await getRecipients("sms", "", "all");
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain("skip=0");
    expect(url).toContain("limit=100");
  });

  it("returns undefined when fetch rejects (catches)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("net"));
    const r = await getRecipients("e", "s", "f");
    expect(r).toBeUndefined();
  });
});

describe("page/Settings getDetectionTypes", () => {
  it("GETs /api/v1/detection-settings/types with the token header", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        body: { data: { detectionTypes: { fire: { id: 1 } } } },
      }),
    });
    const r = await getDetectionTypes();

    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/detection-settings\/types$/);
    expect(opts.headers["x-access-token"]).toBe("TOK_GET");
    expect(r).toEqual({ fire: { id: 1 } });
  });

  it("returns {} when detectionTypes is missing in the response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ body: {} }),
    });
    const r = await getDetectionTypes();
    expect(r).toEqual({});
  });

  it("returns {} when fetch rejects", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("down"));
    const r = await getDetectionTypes();
    expect(r).toEqual({});
  });
});
