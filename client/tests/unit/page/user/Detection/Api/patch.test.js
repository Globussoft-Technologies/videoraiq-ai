/**
 * src/page/user/Detection/Api/put/index.jsx — updateDetectionSettings and
 * enableDetectionSettings both use axios.put. (Earlier the file lived under
 * `Api/patch/` despite using PUT; the post-pull product rename moved it
 * under `Api/put/` to match the verb.)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosPut = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { put: axiosPut } }));

const tokenMock = vi.hoisted(() => vi.fn(() => "AUTH_T"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const { updateDetectionSettings, enableDetectionSettings } = await import(
  "../../../../../../src/page/user/Detection/Api/put/index.jsx"
);

beforeEach(() => {
  axiosPut.mockReset();
  axiosPut.mockResolvedValue({ data: { ok: true } });
  tokenMock.mockClear();
});

describe("page/Detection updateDetectionSettings", () => {
  it("PUTs /detection-settings/:id with the body and token header", async () => {
    await updateDetectionSettings("ds-1", { name: "x" });
    const [url, body, opts] = axiosPut.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/detection-settings\/ds-1$/);
    expect(body).toEqual({ name: "x" });
    expect(opts.headers["x-access-token"]).toBe("AUTH_T");
    expect(opts.headers["Content-Type"]).toBe("application/json");
  });

  it("propagates rejections", async () => {
    axiosPut.mockRejectedValueOnce(new Error("boom"));
    await expect(updateDetectionSettings("a", {})).rejects.toThrow("boom");
  });
});

describe("page/Detection enableDetectionSettings", () => {
  it("PUTs /channel/detection/toggle with the body and token header", async () => {
    await enableDetectionSettings({ channelId: "c-1", enabled: true });
    const [url, body, opts] = axiosPut.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/channel\/detection\/toggle$/);
    expect(body).toEqual({ channelId: "c-1", enabled: true });
    expect(opts.headers["x-access-token"]).toBe("AUTH_T");
  });

  it("returns the raw axios response", async () => {
    const fake = { data: { toggled: true } };
    axiosPut.mockResolvedValueOnce(fake);
    const r = await enableDetectionSettings({});
    expect(r).toBe(fake);
  });
});
