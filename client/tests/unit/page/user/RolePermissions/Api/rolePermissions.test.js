/**
 * src/page/user/RolePermissions/Api/{get,post,put,delete}/index.jsx — role &
 * permission CRUD axios wrappers. All read token via getAccessToken().
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosPost = vi.hoisted(() => vi.fn());
const axiosPut = vi.hoisted(() => vi.fn());
const axiosDelete = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({
  default: { post: axiosPost, put: axiosPut, delete: axiosDelete },
}));

const tokenMock = vi.hoisted(() => vi.fn(() => "RP_T"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const { getAllRolesAndPermissionDetails } = await import(
  "../../../../../../src/page/user/RolePermissions/Api/get/index.jsx"
);
const { createRole } = await import(
  "../../../../../../src/page/user/RolePermissions/Api/post/index.jsx"
);
const { updateRole, updatePermissionByRole, updateRolePermissions } =
  await import(
    "../../../../../../src/page/user/RolePermissions/Api/put/index.jsx"
  );
const { deleteRoleById } = await import(
  "../../../../../../src/page/user/RolePermissions/Api/delete/index.jsx"
);

beforeEach(() => {
  axiosPost.mockReset();
  axiosPut.mockReset();
  axiosDelete.mockReset();
  tokenMock.mockClear();
});

describe("page/RolePermissions getAllRolesAndPermissionDetails", () => {
  it("POSTs /api/v1/permissions/roles_permissions with search/skip/limit and token", async () => {
    axiosPost.mockResolvedValue({ data: [] });
    await getAllRolesAndPermissionDetails(0, 25, "admin");
    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toContain(
      "/api/v1/permissions/roles_permissions?searchQuery=admin&skip=0&limit=25"
    );
    expect(body).toEqual({});
    expect(opts.headers["x-access-token"]).toBe("RP_T");
    expect(opts.headers.Accept).toBe("application/json");
  });

  it("defaults searchQuery to empty when omitted", async () => {
    axiosPost.mockResolvedValue({});
    await getAllRolesAndPermissionDetails(0, 10);
    expect(axiosPost.mock.calls[0][0]).toContain("searchQuery=&skip=0&limit=10");
  });
});

describe("page/RolePermissions createRole", () => {
  it("POSTs /api/v1/roles/create and returns response.data", async () => {
    axiosPost.mockResolvedValue({ data: { id: "r1" } });
    const r = await createRole({ name: "Manager" });
    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/roles\/create$/);
    expect(body).toEqual({ name: "Manager" });
    expect(opts.headers["x-access-token"]).toBe("RP_T");
    expect(r).toEqual({ id: "r1" });
  });

  it("returns undefined when response has no data and no .data property", async () => {
    axiosPost.mockResolvedValue(null);
    const r = await createRole({});
    expect(r).toBeUndefined();
  });
});

describe("page/RolePermissions updateRole", () => {
  it("PUTs /api/v1/roles/update?roleId=<id> with payload, returns response.data", async () => {
    axiosPut.mockResolvedValue({ data: { ok: 1 } });
    const r = await updateRole("r9", { name: "X" });
    const [url, body, opts] = axiosPut.mock.calls[0];
    expect(url).toContain("/api/v1/roles/update?roleId=r9");
    expect(body).toEqual({ name: "X" });
    expect(opts.headers["x-access-token"]).toBe("RP_T");
    expect(r).toEqual({ ok: 1 });
  });
});

describe("page/RolePermissions updatePermissionByRole", () => {
  it("PUTs /api/v1/permissions/update?permissionId=<id>", async () => {
    axiosPut.mockResolvedValue({ data: { saved: true } });
    const r = await updatePermissionByRole("p1", { canRead: true });
    const [url, body] = axiosPut.mock.calls[0];
    expect(url).toContain("/api/v1/permissions/update?permissionId=p1");
    expect(body).toEqual({ canRead: true });
    expect(r).toEqual({ saved: true });
  });
});

describe("page/RolePermissions updateRolePermissions", () => {
  it("PUTs /api/v1/roles/update?roleId=<id> (duplicate of updateRole)", async () => {
    axiosPut.mockResolvedValue({ data: { ok: 1 } });
    await updateRolePermissions("r2", { perms: [] });
    expect(axiosPut.mock.calls[0][0]).toContain("/api/v1/roles/update?roleId=r2");
  });
});

describe("page/RolePermissions deleteRoleById", () => {
  it("DELETEs /api/v1/roles/delete?roleId=<id> and returns raw response", async () => {
    axiosDelete.mockResolvedValue({ status: 204 });
    const r = await deleteRoleById("r5");
    const [url, opts] = axiosDelete.mock.calls[0];
    expect(url).toContain("/api/v1/roles/delete?roleId=r5");
    expect(opts.headers["x-access-token"]).toBe("RP_T");
    expect(r).toEqual({ status: 204 });
  });

  it("propagates axios rejection", async () => {
    axiosDelete.mockRejectedValue(new Error("nope"));
    await expect(deleteRoleById("x")).rejects.toThrow("nope");
  });
});
