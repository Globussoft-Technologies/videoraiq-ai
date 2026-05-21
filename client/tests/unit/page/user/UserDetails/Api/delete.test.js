/**
 * src/page/user/UserDetails/Api/delete/index.jsx — deleteUser, deleteBulkUser.
 * Thin axios.delete wrappers with token. deleteBulkUser also sends a body.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosDelete = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { delete: axiosDelete } }));

const tokenMock = vi.hoisted(() => vi.fn(() => "UDD_T"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const { deleteUser, deleteBulkUser } = await import(
  "../../../../../../src/page/user/UserDetails/Api/delete/index.jsx"
);

beforeEach(() => {
  axiosDelete.mockReset();
  tokenMock.mockClear();
});

describe("page/UserDetails deleteUser", () => {
  it("DELETEs /api/v1/users/delete?userId=<id> with token header", async () => {
    axiosDelete.mockResolvedValue({ data: { ok: true } });
    const r = await deleteUser("u-7");
    const [url, opts] = axiosDelete.mock.calls[0];
    expect(url).toContain("/api/v1/users/delete?userId=u-7");
    expect(opts.headers["x-access-token"]).toBe("UDD_T");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(r.data.ok).toBe(true);
  });

  it("propagates axios rejection", async () => {
    axiosDelete.mockRejectedValue(new Error("nope"));
    await expect(deleteUser("x")).rejects.toThrow("nope");
  });
});

describe("page/UserDetails deleteBulkUser", () => {
  it("DELETEs /api/v1/users/bulk-delete with data.userIds and token", async () => {
    axiosDelete.mockResolvedValue({ data: { count: 2 } });
    const r = await deleteBulkUser(["u1", "u2"]);
    const [url, opts] = axiosDelete.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/users\/bulk-delete$/);
    expect(opts.data).toEqual({ userIds: ["u1", "u2"] });
    expect(opts.headers["x-access-token"]).toBe("UDD_T");
    expect(r.data.count).toBe(2);
  });
});
