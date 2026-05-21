/**
 * src/page/user/Incidents/Api/post/index.jsx — fetchAllIncidents,
 * fetchIncidentsStats, updateIncidentReportStatus.
 * All call axios.post with the x-access-token header.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosPost = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { post: axiosPost } }));

const tokenMock = vi.hoisted(() => vi.fn(() => "TOK_INC_P"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const { fetchAllIncidents, fetchIncidentsStats, updateIncidentReportStatus } =
  await import("../../../../../../src/page/user/Incidents/Api/post/index.jsx");

beforeEach(() => {
  axiosPost.mockReset();
  tokenMock.mockClear();
});

describe("page/Incidents fetchAllIncidents", () => {
  it("POSTs to /api/v1/incidents with skip+limit and forwards data body", async () => {
    axiosPost.mockResolvedValue({ data: { ok: 1 } });
    const payload = { filter: "fire" };
    const r = await fetchAllIncidents(5, 50, payload);

    expect(axiosPost).toHaveBeenCalledTimes(1);
    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toContain("/api/v1/incidents");
    expect(url).toContain("skip=5");
    expect(url).toContain("limit=50");
    expect(body).toEqual(payload);
    expect(opts.headers["x-access-token"]).toBe("TOK_INC_P");
    expect(opts.headers.Accept).toBe("application/json");
    expect(r).toEqual({ data: { ok: 1 } });
  });

  it("propagates axios rejection", async () => {
    axiosPost.mockRejectedValue(new Error("net"));
    await expect(fetchAllIncidents(0, 1, {})).rejects.toThrow("net");
  });
});

describe("page/Incidents fetchIncidentsStats", () => {
  it("POSTs to /api/v1/dashboard/headerStats with data and token", async () => {
    axiosPost.mockResolvedValue({ data: { totals: 3 } });
    const payload = { from: "2024-01-01" };
    await fetchIncidentsStats(payload);

    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/dashboard\/headerStats$/);
    expect(body).toEqual(payload);
    expect(opts.headers["x-access-token"]).toBe("TOK_INC_P");
  });
});

describe("page/Incidents updateIncidentReportStatus", () => {
  it("POSTs to /api/v1/incidents/update-report-status and unwraps response.data.body", async () => {
    axiosPost.mockResolvedValue({ data: { body: { updated: true } } });
    const r = await updateIncidentReportStatus({ id: "i-1", status: "reviewed" });

    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/incidents\/update-report-status$/);
    expect(body).toEqual({ id: "i-1", status: "reviewed" });
    expect(opts.headers["x-access-token"]).toBe("TOK_INC_P");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(r).toEqual({ updated: true });
  });

  it("returns undefined when response has no body", async () => {
    axiosPost.mockResolvedValue({ data: {} });
    const r = await updateIncidentReportStatus({});
    expect(r).toBeUndefined();
  });
});
