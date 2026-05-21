/**
 * src/page/user/Dashboard/Api/post/index.jsx — axios.post helpers using
 * waitForToken(): getCriticalityStats, getDetectionData, getIncidentData.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosPost = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { post: axiosPost } }));

const waitForTokenMock = vi.hoisted(() => vi.fn(async () => "DASH_P"));
vi.mock("@/utils/waitForToken", () => ({ waitForToken: waitForTokenMock }));

const tokenMock = vi.hoisted(() => vi.fn(() => "UNUSED"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const api = await import(
  "../../../../../../src/page/user/Dashboard/Api/post/index.jsx"
);

beforeEach(() => {
  axiosPost.mockReset();
  waitForTokenMock.mockClear();
});

describe("Dashboard getCriticalityStats", () => {
  it("POSTs /criticalityStats with skip/limit query and unwraps response.data.body", async () => {
    axiosPost.mockResolvedValue({ data: { body: [{ id: 1 }] } });
    const r = await api.getCriticalityStats(0, 10);

    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toContain("/dashboard/criticalityStats?skip=0&limit=10");
    expect(body).toEqual({});
    expect(opts.headers["x-access-token"]).toBe("DASH_P");
    expect(r).toEqual([{ id: 1 }]);
  });

  it("uses default limit=5 when omitted", async () => {
    axiosPost.mockResolvedValue({ data: {} });
    await api.getCriticalityStats(2);
    expect(axiosPost.mock.calls[0][0]).toContain("skip=2&limit=5");
  });
});

describe("Dashboard getDetectionData", () => {
  it("POSTs /dashboard/detectionChart with empty body and returns raw response", async () => {
    const fake = { data: { values: [1] } };
    axiosPost.mockResolvedValue(fake);
    const r = await api.getDetectionData();

    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toMatch(/dashboard\/detectionChart$/);
    expect(body).toEqual({});
    expect(opts.headers["x-access-token"]).toBe("DASH_P");
    expect(r).toBe(fake);
  });
});

describe("Dashboard getIncidentData", () => {
  it("POSTs /incidents/getIncidentsDetails with all params in query, payload in body, returns data", async () => {
    axiosPost.mockResolvedValue({ data: { count: 2 } });
    const r = await api.getIncidentData(
      { foo: 1 },
      "nvr-1",
      "ch-1",
      "alpha",
      0,
      10
    );

    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toContain("/incidents/getIncidentsDetails");
    expect(url).toContain("search=alpha");
    expect(url).toContain("nvrId=nvr-1");
    expect(url).toContain("channelId=ch-1");
    expect(url).toContain("skip=0&limit=10");
    expect(body).toEqual({ foo: 1 });
    expect(opts.headers["x-access-token"]).toBe("DASH_P");
    expect(r).toEqual({ count: 2 });
  });
});
