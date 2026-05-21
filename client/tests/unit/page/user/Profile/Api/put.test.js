/**
 * src/page/user/Profile/Api/put/index.jsx — updateProfile PUTs to
 * /api/v1/profiles/<profilId._id> with the access token header. Unwraps
 * response.data.body.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosPut = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { put: axiosPut } }));

const tokenMock = vi.hoisted(() => vi.fn(() => "PUT_T"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const { updateProfile } = await import(
  "../../../../../../src/page/user/Profile/Api/put/index.jsx"
);

beforeEach(() => {
  axiosPut.mockReset();
  tokenMock.mockClear();
});

describe("page/Profile updateProfile", () => {
  it("PUTs to /profiles/<profilId._id> with payload and token, returns body", async () => {
    axiosPut.mockResolvedValue({ data: { body: { ok: true } } });
    const r = await updateProfile({ _id: "p-7" }, { name: "new" });

    const [url, body, opts] = axiosPut.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/profiles\/p-7$/);
    expect(body).toEqual({ name: "new" });
    expect(opts.headers["x-access-token"]).toBe("PUT_T");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(r).toEqual({ ok: true });
  });

  it("propagates axios rejection", async () => {
    axiosPut.mockRejectedValue(new Error("nope"));
    await expect(updateProfile({ _id: "x" }, {})).rejects.toThrow("nope");
  });
});
