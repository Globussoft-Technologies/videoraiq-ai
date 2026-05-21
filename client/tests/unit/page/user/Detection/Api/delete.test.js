/**
 * src/page/user/Detection/Api/delete/index.jsx — deleteDetectionSettings
 * DELETEs /api/v1/detection-settings/:id with the access-token header.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosDelete = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { delete: axiosDelete } }));

const tokenMock = vi.hoisted(() => vi.fn(() => "AUTH_T"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const { deleteDetectionSettings } = await import(
  "../../../../../../src/page/user/Detection/Api/delete/index.jsx"
);

beforeEach(() => {
  axiosDelete.mockReset();
  tokenMock.mockClear();
});

describe("page/Detection deleteDetectionSettings", () => {
  it("DELETEs /api/v1/detection-settings/:id with the token header", async () => {
    axiosDelete.mockResolvedValue({ data: { ok: true } });
    await deleteDetectionSettings("ds-7");

    expect(axiosDelete).toHaveBeenCalledTimes(1);
    const [url, opts] = axiosDelete.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/detection-settings\/ds-7$/);
    expect(opts.headers["x-access-token"]).toBe("AUTH_T");
    expect(opts.headers["Content-Type"]).toBe("application/json");
  });

  it("returns the raw axios response", async () => {
    const fake = { status: 204 };
    axiosDelete.mockResolvedValue(fake);
    const r = await deleteDetectionSettings("a");
    expect(r).toBe(fake);
  });

  it("propagates rejections from axios", async () => {
    axiosDelete.mockRejectedValue(new Error("nope"));
    await expect(deleteDetectionSettings("b")).rejects.toThrow("nope");
  });
});
