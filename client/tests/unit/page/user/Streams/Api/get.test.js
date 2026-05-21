/**
 * src/page/user/Streams/Api/get/index.jsx — thin axios wrappers used by the
 * Streams page (NVR list, channels by NVR, refresh request, header camera
 * list).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosGet = vi.hoisted(() => vi.fn());
const axiosPatch = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({
  default: { get: axiosGet, patch: axiosPatch },
}));

const tokenMock = vi.hoisted(() => vi.fn(() => "AUTH_T"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const api = await import(
  "../../../../../../src/page/user/Streams/Api/get/index.jsx"
);

beforeEach(() => {
  axiosGet.mockReset();
  axiosGet.mockResolvedValue({ data: {} });
  axiosPatch.mockReset();
  axiosPatch.mockResolvedValue({ data: {} });
  tokenMock.mockClear();
});

describe("page/Streams Api/get", () => {
  it("getAllNvrDetails uses default skip=0 limit=100", async () => {
    await api.getAllNvrDetails();
    const [url, opts] = axiosGet.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/nvr\/\?skip=0&limit=100$/);
    expect(opts.headers["x-access-token"]).toBe("AUTH_T");
  });

  it("getAllNvrDetails forwards explicit skip/limit", async () => {
    await api.getAllNvrDetails(20, 5);
    expect(axiosGet.mock.calls[0][0]).toMatch(/skip=20&limit=5$/);
  });

  it("getCameraDetailsById uses the nvr id path param", async () => {
    await api.getCameraDetailsById("nvr-7");
    expect(axiosGet.mock.calls[0][0]).toMatch(/\/api\/v1\/channel\/nvr\/nvr-7$/);
  });

  it("requestCameraRefresh PATCHes /nvr/refetch/:id with empty body and token", async () => {
    await api.requestCameraRefresh("nvr-9");
    expect(axiosPatch).toHaveBeenCalledTimes(1);
    const [url, body, opts] = axiosPatch.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/nvr\/refetch\/nvr-9$/);
    expect(body).toEqual({});
    expect(opts.headers["x-access-token"]).toBe("AUTH_T");
  });

  it("getHeaderCamersList hits /detection-settings/types with token", async () => {
    await api.getHeaderCamersList();
    expect(axiosGet.mock.calls[0][0]).toMatch(
      /\/api\/v1\/detection-settings\/types$/
    );
  });

  it("propagates rejections (sample on getAllNvrDetails)", async () => {
    axiosGet.mockRejectedValueOnce(new Error("offline"));
    await expect(api.getAllNvrDetails()).rejects.toThrow("offline");
  });
});
