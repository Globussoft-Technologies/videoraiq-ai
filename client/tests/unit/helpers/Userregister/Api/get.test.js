/**
 * Userregister/Api/get — isEmailExist: GET /users/isEmailExist with email in
 * the params object.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosGet = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { get: axiosGet } }));

const tokenMock = vi.hoisted(() => vi.fn(() => "GET_TOK"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const { isEmailExist } = await import(
  "../../../../../src/helpers/Userregister/Api/get/index.jsx"
);

beforeEach(() => {
  axiosGet.mockReset();
  tokenMock.mockClear();
});

describe("isEmailExist", () => {
  it("GETs /users/isEmailExist with email as a params object value", async () => {
    axiosGet.mockResolvedValue({ data: { exists: false } });
    await isEmailExist("user@example.com");
    expect(axiosGet).toHaveBeenCalledTimes(1);
    const [url, opts] = axiosGet.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/users\/isEmailExist\/$/);
    expect(opts.params).toEqual({ email: "user@example.com" });
    expect(opts.headers["x-access-token"]).toBe("GET_TOK");
    expect(opts.headers["Content-Type"]).toBe("application/json");
  });

  it("propagates axios rejection", async () => {
    axiosGet.mockRejectedValue(new Error("nope"));
    await expect(isEmailExist("x@y.z")).rejects.toThrow("nope");
  });
});
