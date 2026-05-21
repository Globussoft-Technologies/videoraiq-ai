/**
 * src/page/user/Users/api/post/Index.jsx — userLogin, forgotPassword,
 * resetpassword. All three are thin axios.post wrappers around
 * /api/v1/users/<...> with no auth header (pre-auth endpoints).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosPost = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { post: axiosPost } }));

const { userLogin, forgotPassword, resetpassword } = await import(
  "../../../../../../src/page/user/Users/api/post/Index.jsx"
);

beforeEach(() => {
  axiosPost.mockReset();
});

describe("page/Users userLogin", () => {
  it("POSTs to /api/v1/users/login with payload and JSON headers", async () => {
    const fake = { data: { token: "t" } };
    axiosPost.mockResolvedValue(fake);
    const r = await userLogin({ email: "a@b.com", password: "x" });

    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/users\/login$/);
    expect(body).toEqual({ email: "a@b.com", password: "x" });
    expect(opts.headers.Accept).toBe("application/json");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(r).toBe(fake);
  });

  it("propagates axios rejection", async () => {
    axiosPost.mockRejectedValue(new Error("bad creds"));
    await expect(userLogin({})).rejects.toThrow("bad creds");
  });
});

describe("page/Users forgotPassword", () => {
  it("POSTs to /api/v1/users/forgot-password with payload", async () => {
    axiosPost.mockResolvedValue({ data: { sent: true } });
    const r = await forgotPassword({ email: "a@b.com" });

    const [url, body] = axiosPost.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/users\/forgot-password$/);
    expect(body).toEqual({ email: "a@b.com" });
    expect(r).toEqual({ data: { sent: true } });
  });
});

describe("page/Users resetpassword", () => {
  it("POSTs to /api/v1/users/reset-password with payload and JSON headers", async () => {
    axiosPost.mockResolvedValue({ data: { ok: true } });
    const r = await resetpassword({ token: "t", password: "new" });

    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/users\/reset-password$/);
    expect(body).toEqual({ token: "t", password: "new" });
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(r).toEqual({ data: { ok: true } });
  });
});
