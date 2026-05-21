/**
 * src/page/user/Profile/Api/delete/index.jsx — deleteProfile axios.delete
 * helper. Reads token via getAccessToken() and forwards to
 * /api/v1/profiles/<profileId>.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosDelete = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { delete: axiosDelete } }));

const tokenMock = vi.hoisted(() => vi.fn(() => "DEL_T"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const { deleteProfile } = await import(
  "../../../../../../src/page/user/Profile/Api/delete/index.jsx"
);

beforeEach(() => {
  axiosDelete.mockReset();
  tokenMock.mockClear();
});

describe("page/Profile deleteProfile", () => {
  it("DELETEs /api/v1/profiles/<id> with token header", async () => {
    axiosDelete.mockResolvedValue({ data: { ok: true } });
    const r = await deleteProfile("p-42");

    const [url, opts] = axiosDelete.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/profiles\/p-42$/);
    expect(opts.headers["x-access-token"]).toBe("DEL_T");
    expect(opts.headers.Accept).toBe("application/json");
    expect(r).toEqual({ data: { ok: true } });
  });

  it("propagates axios rejection", async () => {
    axiosDelete.mockRejectedValue(new Error("kaboom"));
    await expect(deleteProfile("p-1")).rejects.toThrow("kaboom");
  });
});
