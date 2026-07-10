/**
 * getEmpAuthInfo unit-ish coverage. Mocks axios to confirm the wrapper
 * behaviour: returns response.data on success, null on 404, rethrows others.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

import axios from "axios";

const { getEmpAuthInfo } = await import("../../../utils/helperFunctions.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getEmpAuthInfo", () => {
  it("returns response.data on a successful call", async () => {
    axios.post.mockResolvedValueOnce({ data: { data: [{ id: "org1" }] } });
    const out = await getEmpAuthInfo("u@test.com");
    expect(out).toEqual({ data: [{ id: "org1" }] });
    // Check we hit the right path.
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining("/auth/info"),
      { email: "u@test.com" },
      expect.objectContaining({
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    );
  });

  it("returns null when the upstream is null", async () => {
    axios.post.mockResolvedValueOnce({ data: null });
    const out = await getEmpAuthInfo("u@test.com");
    expect(out).toBeNull();
  });

  it("swallows a 404 and returns null", async () => {
    const err = new Error("Not Found");
    err.response = { status: 404 };
    axios.post.mockRejectedValueOnce(err);
    const out = await getEmpAuthInfo("missing@test.com");
    expect(out).toBeNull();
  });

  it("rethrows non-404 errors", async () => {
    const err = new Error("boom");
    err.response = { status: 500 };
    axios.post.mockRejectedValueOnce(err);
    await expect(getEmpAuthInfo("u@test.com")).rejects.toThrow("boom");
  });

  it("rethrows when error has no response object", async () => {
    axios.post.mockRejectedValueOnce(new Error("network down"));
    await expect(getEmpAuthInfo("u@test.com")).rejects.toThrow("network down");
  });
});
