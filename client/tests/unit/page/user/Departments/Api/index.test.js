/**
 * src/page/user/Departments/Api/index.jsx — fetchDepartments, createDepartment,
 * updateDepartment, deleteDepartment. Thin axios wrappers, x-access-token from
 * getAccessToken().
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosPost = vi.hoisted(() => vi.fn());
const axiosPut = vi.hoisted(() => vi.fn());
const axiosDelete = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({
  default: { post: axiosPost, put: axiosPut, delete: axiosDelete },
}));

const tokenMock = vi.hoisted(() => vi.fn(() => "DEP_T"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const {
  fetchDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} = await import("../../../../../../src/page/user/Departments/Api/index.jsx");

beforeEach(() => {
  axiosPost.mockReset();
  axiosPut.mockReset();
  axiosDelete.mockReset();
  tokenMock.mockClear();
});

describe("page/Departments fetchDepartments", () => {
  it("POSTs /api/v1/departments/get with skip/limit/search body and token", async () => {
    axiosPost.mockResolvedValue({ data: { items: [] } });
    const r = await fetchDepartments(5, 20, "abc");
    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/departments\/get$/);
    expect(body).toEqual({ skip: 5, limit: 20, search: "abc" });
    expect(opts.headers["x-access-token"]).toBe("DEP_T");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(r).toEqual({ data: { items: [] } });
  });

  it("defaults skip=0, limit=10, search='' when called without args", async () => {
    axiosPost.mockResolvedValue({ data: {} });
    await fetchDepartments();
    expect(axiosPost.mock.calls[0][1]).toEqual({ skip: 0, limit: 10, search: "" });
  });
});

describe("page/Departments createDepartment", () => {
  it("POSTs /api/v1/departments/create with payload and headers", async () => {
    axiosPost.mockResolvedValue({ data: { id: "d1" } });
    const r = await createDepartment({ name: "HR" });
    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/departments\/create$/);
    expect(body).toEqual({ name: "HR" });
    expect(opts.headers["x-access-token"]).toBe("DEP_T");
    expect(r.data.id).toBe("d1");
  });
});

describe("page/Departments updateDepartment", () => {
  it("PUTs /api/v1/departments/update?departmentId=<id> with payload", async () => {
    axiosPut.mockResolvedValue({ data: { ok: 1 } });
    await updateDepartment("d99", { name: "Ops" });
    const [url, body, opts] = axiosPut.mock.calls[0];
    expect(url).toContain("/api/v1/departments/update?departmentId=d99");
    expect(body).toEqual({ name: "Ops" });
    expect(opts.headers["x-access-token"]).toBe("DEP_T");
  });
});

describe("page/Departments deleteDepartment", () => {
  it("DELETEs /api/v1/departments/delete?departmentId=<id>", async () => {
    axiosDelete.mockResolvedValue({ data: { ok: true } });
    const r = await deleteDepartment("d3");
    const [url, opts] = axiosDelete.mock.calls[0];
    expect(url).toContain("/api/v1/departments/delete?departmentId=d3");
    expect(opts.headers["x-access-token"]).toBe("DEP_T");
    expect(r).toEqual({ data: { ok: true } });
  });

  it("propagates axios rejection", async () => {
    axiosDelete.mockRejectedValue(new Error("nope"));
    await expect(deleteDepartment("x")).rejects.toThrow("nope");
  });
});
