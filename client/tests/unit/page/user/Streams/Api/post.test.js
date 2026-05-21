/**
 * src/page/user/Streams/Api/post/index.jsx — addNVRaccount and
 * getDepartmentList (note: "getDepartmentList" uses POST, not GET).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosPost = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { post: axiosPost } }));

const tokenMock = vi.hoisted(() => vi.fn(() => "AUTH_T"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const { addNVRaccount, getDepartmentList } = await import(
  "../../../../../../src/page/user/Streams/Api/post/index.jsx"
);

beforeEach(() => {
  axiosPost.mockReset();
  axiosPost.mockResolvedValue({ data: { ok: true } });
  tokenMock.mockClear();
});

describe("page/Streams addNVRaccount", () => {
  it("POSTs to /api/v1/nvr/register with the body and token header", async () => {
    await addNVRaccount({ host: "1.2.3.4", port: 80 });
    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/nvr\/register$/);
    expect(body).toEqual({ host: "1.2.3.4", port: 80 });
    expect(opts.headers["x-access-token"]).toBe("AUTH_T");
    expect(opts.headers["Content-Type"]).toBe("application/json");
  });

  it("propagates rejections", async () => {
    axiosPost.mockRejectedValueOnce(new Error("nope"));
    await expect(addNVRaccount({})).rejects.toThrow("nope");
  });
});

describe("page/Streams getDepartmentList", () => {
  it("POSTs to /api/v1/departments/get with skip/limit and token", async () => {
    await getDepartmentList();
    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/departments\/get$/);
    expect(body).toEqual({ skip: 0, limit: 100 });
    expect(opts.headers["x-access-token"]).toBe("AUTH_T");
  });

  it("returns the axios response unchanged", async () => {
    const fake = { data: { departments: [] } };
    axiosPost.mockResolvedValueOnce(fake);
    const r = await getDepartmentList();
    expect(r).toBe(fake);
  });
});
