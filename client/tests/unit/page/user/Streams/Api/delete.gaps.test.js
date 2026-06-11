/**
 * Gap-fills for src/page/user/Streams/Api/delete/index.jsx —
 * cover removeCamera which is missed by delete.test.js.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosDelete = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { delete: axiosDelete } }));

const tokenMock = vi.hoisted(() => vi.fn(() => "AUTH_T"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const { removeCamera } = await import(
  "../../../../../../src/page/user/Streams/Api/delete/index.jsx"
);

beforeEach(() => {
  axiosDelete.mockReset();
  tokenMock.mockClear();
});

describe("page/Streams removeCamera", () => {
  it("DELETEs /api/v1/nvr/camera/:id with access-token header", async () => {
    axiosDelete.mockResolvedValue({ data: { ok: true } });
    await removeCamera("cam-99");

    expect(axiosDelete).toHaveBeenCalledTimes(1);
    const [url, opts] = axiosDelete.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/nvr\/camera\/cam-99$/);
    expect(opts.headers["x-access-token"]).toBe("AUTH_T");
    expect(opts.headers.Accept).toBe("application/json");
  });

  it("returns the axios response unchanged", async () => {
    const fake = { data: { removed: 1 } };
    axiosDelete.mockResolvedValue(fake);
    const r = await removeCamera("c");
    expect(r).toBe(fake);
  });

  it("propagates rejections", async () => {
    axiosDelete.mockRejectedValue(new Error("nope"));
    await expect(removeCamera("z")).rejects.toThrow("nope");
  });
});
