/**
 * src/layout/Api/get/index.jsx — getSideBarConfig
 * Single named export. Calls axios.get against
 * `${VITE_BACKEND}/api/v1/dashboard/getSidebarConfig` with the awaited token
 * from waitForToken() in the `x-access-token` header. Returns `response.data`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosGet = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({
  default: { get: axiosGet },
}));

const waitForTokenMock = vi.hoisted(() => vi.fn(async () => "SIDEBAR_T"));
vi.mock("@/utils/waitForToken", () => ({ waitForToken: waitForTokenMock }));

const tokenMock = vi.hoisted(() => vi.fn(() => "UNUSED"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const { getSideBarConfig } = await import(
  "../../../../src/layout/Api/get/index.jsx"
);

beforeEach(() => {
  axiosGet.mockReset();
  waitForTokenMock.mockClear();
});

describe("layout/Api/get getSideBarConfig", () => {
  it("GETs /api/v1/dashboard/getSidebarConfig with the awaited token header and returns response.data", async () => {
    axiosGet.mockResolvedValue({
      data: { body: { items: [{ id: "dash" }] }, status: 200 },
    });

    const r = await getSideBarConfig();

    expect(waitForTokenMock).toHaveBeenCalledTimes(1);
    expect(axiosGet).toHaveBeenCalledTimes(1);
    const [url, opts] = axiosGet.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/dashboard\/getSidebarConfig$/);
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(opts.headers["x-access-token"]).toBe("SIDEBAR_T");
    expect(r).toEqual({ body: { items: [{ id: "dash" }] }, status: 200 });
  });

  it("propagates axios rejections (no internal try/catch)", async () => {
    axiosGet.mockRejectedValue(new Error("sidebar-down"));
    await expect(getSideBarConfig()).rejects.toThrow("sidebar-down");
  });
});
