/**
 * Userregister/Api/put — updateUserDetails: PUT to authorizedUsers/update
 * with userId in querystring and the data body. The token is awaited.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosPut = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { put: axiosPut } }));

const tokenMock = vi.hoisted(() => vi.fn(async () => "PUT_TOK"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const { updateUserDetails } = await import(
  "../../../../../src/helpers/Userregister/Api/put/index.jsx"
);

beforeEach(() => {
  axiosPut.mockReset();
  tokenMock.mockClear();
});

describe("updateUserDetails", () => {
  it("PUTs to authorizedUsers/update with userId in the querystring", async () => {
    axiosPut.mockResolvedValue({ data: { updated: true } });
    const out = await updateUserDetails("emp1", { name: "Alpha" });
    expect(axiosPut).toHaveBeenCalledTimes(1);
    const [url, body, opts] = axiosPut.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/authorizedUsers\/update\?userId=emp1$/);
    expect(body).toEqual({ name: "Alpha" });
    expect(opts.headers["x-access-token"]).toBe("PUT_TOK");
    expect(out).toEqual({ updated: true });
  });

  it("returns undefined when axios responds without .data", async () => {
    axiosPut.mockResolvedValue({});
    const out = await updateUserDetails("emp2", {});
    expect(out).toBeUndefined();
  });
});
