/**
 * src/page/user/Incidents/Api/get/index.js — getAllDetectionsList
 * GETs /api/v1/incidents/getIncidentLists with skip/limit and auth header.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosGet = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { get: axiosGet } }));

const tokenMock = vi.hoisted(() => vi.fn(() => "TOK_INC"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const { getAllDetectionsList } = await import(
  "../../../../../../src/page/user/Incidents/Api/get/index.js"
);

beforeEach(() => {
  axiosGet.mockReset();
  tokenMock.mockClear();
});

describe("page/Incidents getAllDetectionsList", () => {
  it("GETs /api/v1/incidents/getIncidentLists with skip+limit query and token header", async () => {
    axiosGet.mockResolvedValue({ data: { body: { items: [] } } });
    await getAllDetectionsList(10, 25);

    expect(axiosGet).toHaveBeenCalledTimes(1);
    const [url, opts] = axiosGet.mock.calls[0];
    expect(url).toContain("/api/v1/incidents/getIncidentLists");
    expect(url).toContain("skip=10");
    expect(url).toContain("limit=25");
    expect(opts.headers["x-access-token"]).toBe("TOK_INC");
    expect(opts.headers.Accept).toBe("application/json");
    expect(opts.headers["Content-Type"]).toBe("application/json");
  });

  it("returns the raw axios response (no unwrapping)", async () => {
    const fake = { data: { body: { items: [{ id: 1 }] } } };
    axiosGet.mockResolvedValue(fake);
    const r = await getAllDetectionsList(0, 5);
    expect(r).toBe(fake);
  });

  it("propagates axios rejection", async () => {
    axiosGet.mockRejectedValue(new Error("down"));
    await expect(getAllDetectionsList(0, 1)).rejects.toThrow("down");
  });
});
