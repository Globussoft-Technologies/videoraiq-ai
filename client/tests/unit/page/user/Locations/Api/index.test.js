/**
 * src/page/user/Locations/Api/index.jsx — fetchLocations, createLocation,
 * updateLocation, deleteLocation. Thin axios wrappers, x-access-token from
 * getAccessToken().
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosPost = vi.hoisted(() => vi.fn());
const axiosPut = vi.hoisted(() => vi.fn());
const axiosDelete = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({
  default: { post: axiosPost, put: axiosPut, delete: axiosDelete },
}));

const tokenMock = vi.hoisted(() => vi.fn(() => "LOC_T"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const {
  fetchLocations,
  createLocation,
  updateLocation,
  deleteLocation,
} = await import("../../../../../../src/page/user/Locations/Api/index.jsx");

beforeEach(() => {
  axiosPost.mockReset();
  axiosPut.mockReset();
  axiosDelete.mockReset();
  tokenMock.mockClear();
});

describe("page/Locations fetchLocations", () => {
  it("POSTs /api/v1/locations/fetch?skip=&limit=&search= with empty body and token", async () => {
    axiosPost.mockResolvedValue({ data: { items: [] } });
    const r = await fetchLocations(2, 50, "warehouse");
    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toContain("/api/v1/locations/fetch?skip=2&limit=50&search=warehouse");
    expect(body).toEqual({});
    expect(opts.headers["x-access-token"]).toBe("LOC_T");
    expect(r.data.items).toEqual([]);
  });

  it("defaults skip=0, limit=10, search='' when called without args", async () => {
    axiosPost.mockResolvedValue({ data: {} });
    await fetchLocations();
    expect(axiosPost.mock.calls[0][0]).toContain("skip=0&limit=10&search=");
  });
});

describe("page/Locations createLocation", () => {
  it("POSTs /api/v1/locations/create with payload", async () => {
    axiosPost.mockResolvedValue({ data: { id: "L1" } });
    await createLocation({ name: "HQ" });
    const [url, body] = axiosPost.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/locations\/create$/);
    expect(body).toEqual({ name: "HQ" });
  });
});

describe("page/Locations updateLocation", () => {
  it("PUTs /api/v1/locations/update?id=<id> with payload and headers", async () => {
    axiosPut.mockResolvedValue({ data: { ok: 1 } });
    await updateLocation("L9", { name: "Office" });
    const [url, body, opts] = axiosPut.mock.calls[0];
    expect(url).toContain("/api/v1/locations/update?id=L9");
    expect(body).toEqual({ name: "Office" });
    expect(opts.headers["x-access-token"]).toBe("LOC_T");
  });
});

describe("page/Locations deleteLocation", () => {
  it("DELETEs /api/v1/locations/delete?id=<id> with token header", async () => {
    axiosDelete.mockResolvedValue({ data: { ok: true } });
    const r = await deleteLocation("L3");
    const [url, opts] = axiosDelete.mock.calls[0];
    expect(url).toContain("/api/v1/locations/delete?id=L3");
    expect(opts.headers["x-access-token"]).toBe("LOC_T");
    expect(r.data.ok).toBe(true);
  });

  it("propagates axios rejection", async () => {
    axiosDelete.mockRejectedValue(new Error("kaboom"));
    await expect(deleteLocation("x")).rejects.toThrow("kaboom");
  });
});
