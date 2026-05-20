/**
 * src/page/admin/Api/post/index.jsx — adminLoginLocal POSTs to
 * /api/v1/auth/by-login-pass with form-urlencoded headers. No token; this
 * endpoint is the login itself.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosPost = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { post: axiosPost } }));

const { adminLoginLocal } = await import(
  "../../../../src/page/admin/Api/post/index.jsx"
);

beforeEach(() => {
  axiosPost.mockReset();
});

describe("page/admin adminLoginLocal", () => {
  it("POSTs to /api/v1/auth/by-login-pass with form-urlencoded header", async () => {
    axiosPost.mockResolvedValue({ data: { token: "ok" } });
    await adminLoginLocal({ username: "u", password: "p" });

    expect(axiosPost).toHaveBeenCalledTimes(1);
    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/auth\/by-login-pass$/);
    expect(body).toEqual({ username: "u", password: "p" });
    expect(opts.headers["Content-Type"]).toBe(
      "application/x-www-form-urlencoded"
    );
  });

  it("returns response.data", async () => {
    axiosPost.mockResolvedValue({ data: { token: "abc" } });
    const r = await adminLoginLocal({});
    expect(r).toEqual({ token: "abc" });
  });

  it("propagates rejections", async () => {
    axiosPost.mockRejectedValue(new Error("network"));
    await expect(adminLoginLocal({})).rejects.toThrow("network");
  });
});
