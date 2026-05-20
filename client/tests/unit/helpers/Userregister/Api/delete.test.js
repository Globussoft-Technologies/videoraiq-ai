/**
 * Userregister/Api/delete — small set of DELETE wrappers. Token is sync here
 * (getAccessToken() with no await), so we mock it as a regular function.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosDelete = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { delete: axiosDelete } }));

const tokenMock = vi.hoisted(() => vi.fn(() => "DEL_TOK"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const api = await import(
  "../../../../../src/helpers/Userregister/Api/delete/index.jsx"
);

beforeEach(() => {
  axiosDelete.mockReset();
  tokenMock.mockClear();
});

describe("Userregister/Api/delete", () => {
  it("delete_user DELETEs /authorizedUsers/delete with userId as a param", async () => {
    axiosDelete.mockResolvedValue({ data: { ok: 1 } });
    await api.delete_user("u123");
    expect(axiosDelete).toHaveBeenCalledTimes(1);
    const [url, opts] = axiosDelete.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/authorizedUsers\/delete$/);
    expect(opts.params).toEqual({ userId: "u123" });
    expect(opts.headers["x-access-token"]).toBe("DEL_TOK");
    expect(opts.headers["Content-Type"]).toBe("application/json");
  });

  it("remove_image DELETEs /uploads/deleteMedia with mediaPath", async () => {
    axiosDelete.mockResolvedValue({ data: {} });
    await api.remove_image("/some/path.jpg");
    expect(axiosDelete.mock.calls[0][0]).toMatch(/\/uploads\/deleteMedia$/);
    expect(axiosDelete.mock.calls[0][1].params).toEqual({ mediaPath: "/some/path.jpg" });
  });

  it("remove_image_edit forwards both mediaPath and userId", async () => {
    axiosDelete.mockResolvedValue({ data: {} });
    await api.remove_image_edit("/p.jpg", "u9");
    expect(axiosDelete.mock.calls[0][0]).toMatch(/\/uploads\/deleteUserMedia$/);
    expect(axiosDelete.mock.calls[0][1].params).toEqual({
      mediaPath: "/p.jpg",
      userId: "u9",
    });
  });

  it("delete_all_users sends no params", async () => {
    axiosDelete.mockResolvedValue({ data: { deleted: 0 } });
    await api.delete_all_users();
    expect(axiosDelete.mock.calls[0][0]).toMatch(/\/authorizedUsers\/delete-all$/);
    // there's no params key, only headers
    expect(axiosDelete.mock.calls[0][1].params).toBeUndefined();
  });
});
