/**
 * src/page/user/Settings/StorageSetting/Api/* — axios wrappers for the
 * storage settings page. The PUT and DELETE helpers set
 * `validateStatus: () => true` so we should verify that as well.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosGet = vi.hoisted(() => vi.fn());
const axiosPost = vi.hoisted(() => vi.fn());
const axiosPut = vi.hoisted(() => vi.fn());
const axiosDelete = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({
  default: {
    get: axiosGet,
    post: axiosPost,
    put: axiosPut,
    delete: axiosDelete,
  },
}));

const tokenMock = vi.hoisted(() => vi.fn(() => "AUTH_T"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const getApi = await import(
  "../../../../../../../src/page/user/Settings/StorageSetting/Api/get/index.jsx"
);
const postApi = await import(
  "../../../../../../../src/page/user/Settings/StorageSetting/Api/post/index.jsx"
);
const putApi = await import(
  "../../../../../../../src/page/user/Settings/StorageSetting/Api/put/index.jsx"
);
const deleteApi = await import(
  "../../../../../../../src/page/user/Settings/StorageSetting/Api/delete/index.jsx"
);

beforeEach(() => {
  for (const fn of [axiosGet, axiosPost, axiosPut, axiosDelete]) {
    fn.mockReset();
    fn.mockResolvedValue({ data: { ok: true } });
  }
  tokenMock.mockClear();
});

describe("StorageSetting Api/get", () => {
  it("getAllStorageDetails GETs /api/v1/storage/ with the token", async () => {
    await getApi.getAllStorageDetails();
    const [url, opts] = axiosGet.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/storage\/$/);
    expect(opts.headers["x-access-token"]).toBe("AUTH_T");
    expect(opts.headers["Content-Type"]).toBe("application/json");
  });

  it("propagates rejections", async () => {
    axiosGet.mockRejectedValueOnce(new Error("offline"));
    await expect(getApi.getAllStorageDetails()).rejects.toThrow("offline");
  });
});

describe("StorageSetting Api/post", () => {
  it("addStorage POSTs the payload with the token header", async () => {
    await postApi.addStorage({ storageType: "s3", name: "x" });
    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/storage$/);
    expect(body).toEqual({ storageType: "s3", name: "x" });
    expect(opts.headers["x-access-token"]).toBe("AUTH_T");
  });
});

describe("StorageSetting Api/put", () => {
  it("updateStorage PUTs /api/v1/storage/:id with body, token and validateStatus", async () => {
    await putApi.updateStorage("s-1", { name: "y" });
    const [url, body, opts] = axiosPut.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/storage\/s-1$/);
    expect(body).toEqual({ name: "y" });
    expect(opts.headers["x-access-token"]).toBe("AUTH_T");
    expect(typeof opts.validateStatus).toBe("function");
    // validateStatus must accept ANY status
    expect(opts.validateStatus(500)).toBe(true);
    expect(opts.validateStatus(200)).toBe(true);
  });

  it("updateStorageStatus posts {storageId, activate} to /storage/activate", async () => {
    await putApi.updateStorageStatus("s-9", true);
    const [url, body, opts] = axiosPut.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/storage\/activate$/);
    expect(body).toEqual({ storageId: "s-9", activate: true });
    expect(typeof opts.validateStatus).toBe("function");
    expect(opts.validateStatus(418)).toBe(true);
  });

  it("updateStorageStatus accepts a falsy activate flag", async () => {
    await putApi.updateStorageStatus("s-1", false);
    expect(axiosPut.mock.calls[0][1]).toEqual({
      storageId: "s-1",
      activate: false,
    });
  });
});

describe("StorageSetting Api/delete", () => {
  it("deleteStorage DELETEs /api/v1/storage/:id with token and validateStatus", async () => {
    await deleteApi.deleteStorage("s-3");
    const [url, opts] = axiosDelete.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/storage\/s-3$/);
    expect(opts.headers["x-access-token"]).toBe("AUTH_T");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(typeof opts.validateStatus).toBe("function");
    expect(opts.validateStatus(404)).toBe(true);
  });
});
