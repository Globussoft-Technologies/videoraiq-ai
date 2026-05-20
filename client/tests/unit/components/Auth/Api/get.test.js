/**
 * src/components/Auth/Api/get/index.jsx exports checkNVRsPresent which GETs
 * /api/v1/nvr/ with skip + limit query params and an x-access-token header.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosGet = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { get: axiosGet } }));

const tokenMock = vi.hoisted(() => vi.fn(() => "AUTH_T"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const { checkNVRsPresent } = await import(
  "../../../../../src/components/Auth/Api/get/index.jsx"
);

beforeEach(() => {
  axiosGet.mockReset();
  tokenMock.mockClear();
});

describe("components/Auth/Api checkNVRsPresent", () => {
  it("defaults skip=0 and limit=100", async () => {
    axiosGet.mockResolvedValue({ data: { body: { data: [] } } });
    await checkNVRsPresent();
    expect(axiosGet).toHaveBeenCalledTimes(1);
    const [url, opts] = axiosGet.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/nvr\/\?skip=0&limit=100$/);
    expect(opts.headers["x-access-token"]).toBe("AUTH_T");
    expect(opts.headers.Accept).toBe("application/json");
  });

  it("forwards explicit skip / limit", async () => {
    axiosGet.mockResolvedValue({ data: {} });
    await checkNVRsPresent(20, 5);
    expect(axiosGet.mock.calls[0][0]).toMatch(/\?skip=20&limit=5$/);
  });

  it("returns the axios response unchanged", async () => {
    const fake = { data: { body: { data: [{ _id: "n1" }] } } };
    axiosGet.mockResolvedValue(fake);
    const r = await checkNVRsPresent(0, 10);
    expect(r).toBe(fake);
  });

  it("propagates axios rejection", async () => {
    axiosGet.mockRejectedValue(new Error("nope"));
    await expect(checkNVRsPresent()).rejects.toThrow("nope");
  });
});
