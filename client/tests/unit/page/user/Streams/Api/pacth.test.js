/**
 * src/page/user/Streams/Api/pacth/index.jsx — note the typo ("pacth").
 * Contains updateNVRById (PATCH), updateCameraSettingById (PUT) and
 * updateBulkCameraSettings (PUT).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosPatch = vi.hoisted(() => vi.fn());
const axiosPut = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({
  default: { patch: axiosPatch, put: axiosPut },
}));

const tokenMock = vi.hoisted(() => vi.fn(() => "AUTH_T"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const {
  updateNVRById,
  updateCameraSettingById,
  updateBulkCameraSettings,
} = await import(
  "../../../../../../src/page/user/Streams/Api/pacth/index.jsx"
);

beforeEach(() => {
  axiosPatch.mockReset();
  axiosPatch.mockResolvedValue({ data: { ok: true } });
  axiosPut.mockReset();
  axiosPut.mockResolvedValue({ data: { ok: true } });
  tokenMock.mockClear();
});

describe("page/Streams updateNVRById", () => {
  it("PATCHes /api/v1/nvr/:id with the body and token header", async () => {
    await updateNVRById("nvr-1", { name: "front-door" });
    const [url, body, opts] = axiosPatch.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/nvr\/nvr-1$/);
    expect(body).toEqual({ name: "front-door" });
    expect(opts.headers["x-access-token"]).toBe("AUTH_T");
    expect(opts.headers["Content-Type"]).toBe("application/json");
  });

  it("propagates axios rejections", async () => {
    axiosPatch.mockRejectedValueOnce(new Error("boom"));
    await expect(updateNVRById("x", {})).rejects.toThrow("boom");
  });
});

describe("page/Streams updateCameraSettingById", () => {
  it("PUTs /api/v1/channel/:id with the body and token header", async () => {
    await updateCameraSettingById("cam-7", { enabled: true });
    const [url, body, opts] = axiosPut.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/channel\/cam-7$/);
    expect(body).toEqual({ enabled: true });
    expect(opts.headers["x-access-token"]).toBe("AUTH_T");
  });
});

describe("page/Streams updateBulkCameraSettings", () => {
  it("PUTs /api/v1/channel/channels/bulk-update with the body and token", async () => {
    await updateBulkCameraSettings([{ id: 1 }, { id: 2 }]);
    const [url, body, opts] = axiosPut.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/channel\/channels\/bulk-update$/);
    expect(body).toEqual([{ id: 1 }, { id: 2 }]);
    expect(opts.headers["x-access-token"]).toBe("AUTH_T");
  });

  it("returns the axios response unchanged", async () => {
    const fake = { data: { updated: 2 } };
    axiosPut.mockResolvedValueOnce(fake);
    const r = await updateBulkCameraSettings([]);
    expect(r).toBe(fake);
  });
});
