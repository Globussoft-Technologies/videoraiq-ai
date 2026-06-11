/**
 * Gap-fills for src/page/user/Streams/Api/post/index.jsx —
 * cover registerAndFetchCameras and addSelectedCameras.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosPost = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { post: axiosPost } }));

const tokenMock = vi.hoisted(() => vi.fn(() => "AUTH_T"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const { registerAndFetchCameras, addSelectedCameras } = await import(
  "../../../../../../src/page/user/Streams/Api/post/index.jsx"
);

beforeEach(() => {
  axiosPost.mockReset();
  axiosPost.mockResolvedValue({ data: { ok: true } });
  tokenMock.mockClear();
});

describe("page/Streams registerAndFetchCameras", () => {
  it("POSTs to /api/v1/nvr/register-and-fetch with the body and token header", async () => {
    await registerAndFetchCameras({ host: "10.0.0.1", port: 554 });
    expect(axiosPost).toHaveBeenCalledTimes(1);
    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/nvr\/register-and-fetch$/);
    expect(body).toEqual({ host: "10.0.0.1", port: 554 });
    expect(opts.headers["x-access-token"]).toBe("AUTH_T");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(opts.headers.Accept).toBe("application/json");
  });

  it("returns the axios response unchanged", async () => {
    const fake = { data: { cameras: [{ id: 1 }] } };
    axiosPost.mockResolvedValueOnce(fake);
    const r = await registerAndFetchCameras({});
    expect(r).toBe(fake);
  });

  it("propagates rejections", async () => {
    axiosPost.mockRejectedValueOnce(new Error("boom"));
    await expect(registerAndFetchCameras({})).rejects.toThrow("boom");
  });
});

describe("page/Streams addSelectedCameras", () => {
  it("POSTs to /api/v1/nvr/add-cameras with the body and token header", async () => {
    await addSelectedCameras({ nvrId: "nvr-1", cameras: [1, 2] });
    expect(axiosPost).toHaveBeenCalledTimes(1);
    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/nvr\/add-cameras$/);
    expect(body).toEqual({ nvrId: "nvr-1", cameras: [1, 2] });
    expect(opts.headers["x-access-token"]).toBe("AUTH_T");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(opts.headers.Accept).toBe("application/json");
  });

  it("returns the axios response unchanged", async () => {
    const fake = { data: { added: 2 } };
    axiosPost.mockResolvedValueOnce(fake);
    const r = await addSelectedCameras({});
    expect(r).toBe(fake);
  });

  it("propagates rejections", async () => {
    axiosPost.mockRejectedValueOnce(new Error("nope"));
    await expect(addSelectedCameras({})).rejects.toThrow("nope");
  });
});
