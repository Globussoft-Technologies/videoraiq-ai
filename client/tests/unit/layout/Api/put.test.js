/**
 * src/layout/Api/put/index.jsx — updateSidebarConfig(detectionData)
 * Calls axios.put against
 * `${VITE_BACKEND}/api/v1/dashboard/updateSidebarConfig` with the awaited
 * token in the `x-access-token` header. Returns `response.data`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosPut = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({
  default: { put: axiosPut },
}));

const waitForTokenMock = vi.hoisted(() => vi.fn(async () => "SB_PUT"));
vi.mock("@/utils/waitForToken", () => ({ waitForToken: waitForTokenMock }));

const tokenMock = vi.hoisted(() => vi.fn(() => "UNUSED"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const { updateSidebarConfig } = await import(
  "../../../../src/layout/Api/put/index.jsx"
);

beforeEach(() => {
  axiosPut.mockReset();
  waitForTokenMock.mockClear();
});

describe("layout/Api/put updateSidebarConfig", () => {
  it("PUTs the supplied payload with token header and returns response.data", async () => {
    axiosPut.mockResolvedValue({ data: { ok: true, updated: 3 } });
    const payload = { items: [{ id: "dashboard", visible: true }] };

    const r = await updateSidebarConfig(payload);

    expect(waitForTokenMock).toHaveBeenCalledTimes(1);
    expect(axiosPut).toHaveBeenCalledTimes(1);
    const [url, body, opts] = axiosPut.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/dashboard\/updateSidebarConfig$/);
    expect(body).toBe(payload);
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(opts.headers["x-access-token"]).toBe("SB_PUT");
    expect(r).toEqual({ ok: true, updated: 3 });
  });

  it("forwards undefined payloads unchanged (no defaulting)", async () => {
    axiosPut.mockResolvedValue({ data: null });
    const r = await updateSidebarConfig(undefined);
    const [, body] = axiosPut.mock.calls[0];
    expect(body).toBeUndefined();
    expect(r).toBeNull();
  });

  it("propagates axios rejections (no internal try/catch)", async () => {
    axiosPut.mockRejectedValue(new Error("update-failed"));
    await expect(updateSidebarConfig({})).rejects.toThrow("update-failed");
  });
});
