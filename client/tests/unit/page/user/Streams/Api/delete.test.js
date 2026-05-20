/**
 * src/page/user/Streams/Api/delete/index.jsx — deleteNVR DELETEs
 * /api/v1/nvr/:id with an access-token header.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosDelete = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { delete: axiosDelete } }));

const tokenMock = vi.hoisted(() => vi.fn(() => "AUTH_T"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const { deleteNVR } = await import(
  "../../../../../../src/page/user/Streams/Api/delete/index.jsx"
);

beforeEach(() => {
  axiosDelete.mockReset();
  tokenMock.mockClear();
});

describe("page/Streams deleteNVR", () => {
  it("interpolates the NVR id into the path", async () => {
    axiosDelete.mockResolvedValue({ data: { ok: true } });
    await deleteNVR("nvr-42");

    expect(axiosDelete).toHaveBeenCalledTimes(1);
    const [url, opts] = axiosDelete.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/nvr\/nvr-42$/);
    expect(opts.headers["x-access-token"]).toBe("AUTH_T");
    expect(opts.headers.Accept).toBe("application/json");
  });

  it("returns the axios response unchanged", async () => {
    const fake = { data: { deleted: 1 } };
    axiosDelete.mockResolvedValue(fake);
    const r = await deleteNVR("x");
    expect(r).toBe(fake);
  });

  it("propagates rejections", async () => {
    axiosDelete.mockRejectedValue(new Error("nope"));
    await expect(deleteNVR("y")).rejects.toThrow("nope");
  });
});
