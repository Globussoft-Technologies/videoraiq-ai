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
  it('clears a shared failed lookup so the next request can retry', async () => {
    let reject;
    axios.post.mockImplementationOnce(() => new Promise((_done, fail) => { reject = fail; }));
    const first = getEmpAuthInfo('failed@test.com', { scope: 'a' });
    const second = getEmpAuthInfo('failed@test.com', { scope: 'a' });
    const settled = Promise.allSettled([first, second]);
    reject(new Error('EMP unavailable'));
    expect((await settled).map(item => item.status)).toEqual(['rejected', 'rejected']);
    axios.post.mockResolvedValueOnce({ data: { data: [{ id: 99 }] } });
    await expect(getEmpAuthInfo('failed@test.com', { scope: 'a' })).resolves.toEqual({ data: [{ id: 99 }] });
    expect(axios.post).toHaveBeenCalledTimes(2);
  });
  it('shares concurrent identical lookups but refreshes after completion', async () => {
    let resolve;
    axios.post.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const first = getEmpAuthInfo('same@test.com', { scope: 'a' });
    const second = getEmpAuthInfo('same@test.com', { scope: 'a' });
    expect(axios.post).toHaveBeenCalledTimes(1);
    resolve({ data: { data: [{ id: 42 }] } });
    expect(await Promise.all([first, second])).toEqual([{ data: [{ id: 42 }] }, { data: [{ id: 42 }] }]);
    axios.post.mockResolvedValueOnce({ data: { data: [{ id: 43 }] } });
    expect(await getEmpAuthInfo('same@test.com', { scope: 'a' })).toEqual({ data: [{ id: 43 }] });
    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(axios.post.mock.calls[0][2].timeout).toBe(5000);
  });

  it('isolates accounts and emails and retries after a timeout', async () => {
    axios.post.mockResolvedValue({ data: { data: [{ id: 'org' }] } });
    await Promise.all([
      getEmpAuthInfo('same@test.com', { scope: 'a' }),
      getEmpAuthInfo('same@test.com', { scope: 'b' }),
      getEmpAuthInfo('other@test.com', { scope: 'a' }),
    ]);
    expect(axios.post).toHaveBeenCalledTimes(3);
    axios.post.mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }));
    await expect(getEmpAuthInfo('same@test.com', { scope: 'a' })).rejects.toThrow('timeout');
    await expect(getEmpAuthInfo('same@test.com', { scope: 'a' })).resolves.toEqual({ data: [{ id: 'org' }] });
  });
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
