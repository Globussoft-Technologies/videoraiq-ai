/**
 * src/page/user/Settings/Api/delete/index.jsx — removeRecipient
 * DELETE /api/v1/recipients/delete via axios, unwraps response?.data?.body.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosDelete = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { delete: axiosDelete } }));

const tokenMock = vi.hoisted(() => vi.fn(() => "TOK_A"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const { removeRecipient } = await import(
  "../../../../../../src/page/user/Settings/Api/delete/index.jsx"
);

beforeEach(() => {
  axiosDelete.mockReset();
  tokenMock.mockClear();
});

describe("page/Settings removeRecipient", () => {
  it("DELETEs /api/v1/recipients/delete with the token header and data body", async () => {
    axiosDelete.mockResolvedValue({ data: { body: { removed: 1 } } });
    const payload = { ids: ["r1", "r2"] };
    const r = await removeRecipient(payload);

    expect(axiosDelete).toHaveBeenCalledTimes(1);
    const [url, opts] = axiosDelete.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/recipients\/delete$/);
    expect(opts.headers["x-access-token"]).toBe("TOK_A");
    expect(opts.headers["Content-type"]).toBe("application/json");
    expect(opts.data).toEqual(payload);
    expect(r).toEqual({ removed: 1 });
  });

  it("returns undefined when axios rejects (catches the error)", async () => {
    axiosDelete.mockRejectedValue(new Error("network"));
    const r = await removeRecipient({});
    expect(r).toBeUndefined();
  });

  it("returns undefined body if response has no body field", async () => {
    axiosDelete.mockResolvedValue({ data: {} });
    const r = await removeRecipient({});
    expect(r).toBeUndefined();
  });
});
