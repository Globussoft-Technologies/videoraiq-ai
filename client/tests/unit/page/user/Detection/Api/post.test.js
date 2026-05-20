/**
 * src/page/user/Detection/Api/post/index.jsx — addNewDetectionConfiguration
 * POSTs to /api/v1/detection-settings with the access token header.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosPost = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { post: axiosPost } }));

const tokenMock = vi.hoisted(() => vi.fn(() => "AUTH_T"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const { addNewDetectionConfiguration } = await import(
  "../../../../../../src/page/user/Detection/Api/post/index.jsx"
);

beforeEach(() => {
  axiosPost.mockReset();
  tokenMock.mockClear();
});

describe("page/Detection addNewDetectionConfiguration", () => {
  it("POSTs the payload to /api/v1/detection-settings with the token header", async () => {
    axiosPost.mockResolvedValue({ data: { id: "ok" } });
    await addNewDetectionConfiguration({ foo: 1 });

    expect(axiosPost).toHaveBeenCalledTimes(1);
    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/detection-settings$/);
    expect(body).toEqual({ foo: 1 });
    expect(opts.headers["x-access-token"]).toBe("AUTH_T");
    expect(opts.headers.Accept).toBe("application/json");
  });

  it("returns the raw axios response (no unwrapping)", async () => {
    const fake = { data: { id: "x" } };
    axiosPost.mockResolvedValue(fake);
    const r = await addNewDetectionConfiguration({});
    expect(r).toBe(fake);
  });

  it("propagates axios rejection", async () => {
    axiosPost.mockRejectedValue(new Error("boom"));
    await expect(addNewDetectionConfiguration({})).rejects.toThrow("boom");
  });
});
