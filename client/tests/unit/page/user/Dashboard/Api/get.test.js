/**
 * src/page/user/Dashboard/Api/get/index.jsx — mixed axios + fetch helpers for
 * the Dashboard page. All use waitForToken() for the access token.
 * Functions: getNvrNames, getFiltersNvrNames, getCamerasBasedOnNvr,
 * getAlertsData, comparisonChart, authorizedUsers, getRecentIncidents,
 * getDepartments, getLocations.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const axiosGet = vi.hoisted(() => vi.fn());
const axiosPost = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({
  default: { get: axiosGet, post: axiosPost },
}));

const waitForTokenMock = vi.hoisted(() => vi.fn(async () => "DASH_T"));
vi.mock("@/utils/waitForToken", () => ({ waitForToken: waitForTokenMock }));

// getAccessToken is imported transitively by some helpers; mock it just in case.
const tokenMock = vi.hoisted(() => vi.fn(() => "UNUSED"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const api = await import(
  "../../../../../../src/page/user/Dashboard/Api/get/index.jsx"
);

const origFetch = globalThis.fetch;

beforeEach(() => {
  axiosGet.mockReset();
  axiosPost.mockReset();
  waitForTokenMock.mockClear();
});

afterEach(() => {
  globalThis.fetch = origFetch;
});

describe("Dashboard getNvrNames (fetch)", () => {
  it("GETs /api/v1/nvr with skip/limit and the token header", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ body: { nvrs: [] } }),
    });
    const r = await api.getNvrNames(5, 20);

    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain("/api/v1/nvr?skip=5&limit=20");
    expect(opts.method).toBe("GET");
    expect(opts.headers["x-access-token"]).toBe("DASH_T");
    expect(r).toEqual({ body: { nvrs: [] } });
  });

  it("uses default skip=0 limit=100 when called with no args", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ json: async () => ({}) });
    await api.getNvrNames();
    expect(globalThis.fetch.mock.calls[0][0]).toContain("skip=0&limit=100");
  });
});

describe("Dashboard getFiltersNvrNames (fetch)", () => {
  it("POSTs /authorizedChannels/getNVRS with JSON body and token", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ filtered: true }),
    });
    await api.getFiltersNvrNames({ location: "lobby" });

    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain("/api/v1/authorizedChannels/getNVRS");
    expect(opts.method).toBe("POST");
    expect(opts.headers["x-access-token"]).toBe("DASH_T");
    expect(JSON.parse(opts.body)).toEqual({ location: "lobby" });
  });
});

describe("Dashboard getCamerasBasedOnNvr (axios.get)", () => {
  it("GETs /channel with nvrId, department, location, skip/limit, camType", async () => {
    axiosGet.mockResolvedValue({ data: { channels: [] } });
    const r = await api.getCamerasBasedOnNvr(
      "nvr-1",
      "dept",
      "loc",
      10,
      30,
      "ptz"
    );

    const [url, opts] = axiosGet.mock.calls[0];
    expect(url).toContain("nvrId=nvr-1");
    expect(url).toContain("skip=10&limit=30");
    expect(url).toContain("department=dept");
    expect(url).toContain("location=loc");
    expect(url).toContain("camType=ptz");
    expect(opts.headers["x-access-token"]).toBe("DASH_T");
    expect(r).toEqual({ channels: [] });
  });

  it("uses default skip=0 limit=50 when omitted", async () => {
    axiosGet.mockResolvedValue({ data: {} });
    await api.getCamerasBasedOnNvr("nvr-2");
    expect(axiosGet.mock.calls[0][0]).toContain("skip=0&limit=50");
  });
});

describe("Dashboard getAlertsData (fetch)", () => {
  it("POSTs /dashboard/headerStats with today's date and forwarded filters", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ total: 5 }),
    });
    const r = await api.getAlertsData("nvr-1", "lobby", "ops");

    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain("/api/v1/dashboard/headerStats");
    expect(opts.headers["x-access-token"]).toBe("DASH_T");
    const body = JSON.parse(opts.body);
    expect(body.nvrId).toBe("nvr-1");
    expect(body.location).toBe("lobby");
    expect(body.department).toBe("ops");
    expect(body.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.endDate).toBe(body.startDate);
    expect(r).toEqual({ total: 5 });
  });
});

describe("Dashboard comparisonChart (axios.post)", () => {
  it("POSTs /dashboardWeeklyComparisonChart and returns response.data", async () => {
    axiosPost.mockResolvedValue({ data: { week: 1 } });
    const r = await api.comparisonChart();

    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toMatch(/dashboardWeeklyComparisonChart$/);
    expect(body).toEqual({});
    expect(opts.headers["x-access-token"]).toBe("DASH_T");
    expect(r).toEqual({ week: 1 });
  });
});

describe("Dashboard authorizedUsers (axios.post)", () => {
  it("POSTs /authorizedUsers/fetch with skip/limit/search in query and data body", async () => {
    axiosPost.mockResolvedValue({ data: { users: [] } });
    const r = await api.authorizedUsers(0, 10, "abc", { dept: "ops" });

    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toContain("skip=0&limit=10&search=abc");
    expect(body).toEqual({ dept: "ops" });
    expect(opts.headers["x-access-token"]).toBe("DASH_T");
    expect(r).toEqual({ users: [] });
  });

  it("defaults data to {} when not provided", async () => {
    axiosPost.mockResolvedValue({ data: {} });
    await api.authorizedUsers(0, 5, "");
    expect(axiosPost.mock.calls[0][1]).toEqual({});
  });
});

describe("Dashboard getRecentIncidents (axios.get)", () => {
  it("GETs /dashboard/recentIncidents and returns the raw response", async () => {
    const fake = { data: { items: [] } };
    axiosGet.mockResolvedValue(fake);
    const r = await api.getRecentIncidents();

    expect(axiosGet.mock.calls[0][0]).toMatch(/\/dashboard\/recentIncidents$/);
    expect(r).toBe(fake);
  });
});

describe("Dashboard getDepartments / getLocations (axios.post, return body)", () => {
  it("getDepartments POSTs and unwraps response.data.body", async () => {
    axiosPost.mockResolvedValue({ data: { body: ["d1"] } });
    const r = await api.getDepartments({ org: "o1" });
    expect(axiosPost.mock.calls[0][0]).toMatch(
      /authorizedChannels\/departments$/
    );
    expect(r).toEqual(["d1"]);
  });

  it("getLocations POSTs and unwraps response.data.body", async () => {
    axiosPost.mockResolvedValue({ data: { body: ["l1"] } });
    const r = await api.getLocations({ org: "o1" });
    expect(axiosPost.mock.calls[0][0]).toMatch(
      /authorizedChannels\/locations$/
    );
    expect(r).toEqual(["l1"]);
  });
});
