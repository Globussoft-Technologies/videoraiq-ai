/**
 * src/page/user/EmployeeLogs/Api/{get,post}/index.jsx — attendance, track and
 * access logs. Mix of axios.post + axios.get with x-access-token from
 * getAccessToken().
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosPost = vi.hoisted(() => vi.fn());
const axiosGet = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { post: axiosPost, get: axiosGet } }));

const tokenMock = vi.hoisted(() => vi.fn(() => "EL_T"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const {
  getAttendanceLogs,
  getAttendanceUserLogs,
  getTrackUsers,
  getTrackLogs,
  getVehicleList,
  getVehicleLogs,
} = await import(
  "../../../../../../src/page/user/EmployeeLogs/Api/get/index.jsx"
);

const {
  getAllAccessLogsDetails,
  filterByDepartment,
  getNVRs,
  getchannels,
  getEmployeeLocations,
  getDeskChannelGraph,
  getGuardChannelGraph,
} = await import(
  "../../../../../../src/page/user/EmployeeLogs/Api/post/index.jsx"
);

beforeEach(() => {
  axiosPost.mockReset();
  axiosGet.mockReset();
  tokenMock.mockClear();
});

describe("page/EmployeeLogs (get) getAttendanceLogs", () => {
  it("POSTs /api/v1/attendance/get with query params and employeeLocations body", async () => {
    axiosPost.mockResolvedValue({ data: { rows: [] } });
    await getAttendanceLogs(
      "alice",
      "nvr1",
      "ch1",
      "2026-01-01",
      "2026-01-31",
      2,
      20,
      "date",
      "desc",
      "dep1",
      "08:00",
      "18:00",
      "in",
      false,
      ["loc1"]
    );
    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/attendance\/get$/);
    // skip = (page-1)*limit = (2-1)*20 = 20
    expect(opts.params.skip).toBe(20);
    expect(opts.params.limit).toBe(20);
    expect(opts.params.name).toBe("alice");
    expect(opts.params.startDate).toBe("2026-01-01");
    expect(opts.params.endDate).toBe("2026-01-31");
    expect(opts.params.sortField).toBe("date");
    expect(opts.params.sortOrder).toBe("desc");
    expect(opts.params.export).toBe("");
    expect(body).toEqual({ employeeLocations: ["loc1"] });
    expect(opts.headers["x-access-token"]).toBe("EL_T");
  });

  it("defaults to page=1/limit=10 and non-array employeeLocations becomes []", async () => {
    axiosPost.mockResolvedValue({ data: {} });
    await getAttendanceLogs("", "", "", "", "");
    const [, body, opts] = axiosPost.mock.calls[0];
    expect(opts.params.skip).toBe(0);
    expect(opts.params.limit).toBe(10);
    expect(opts.params.sortField).toBe("name");
    expect(opts.params.sortOrder).toBe("asc");
    expect(body.employeeLocations).toEqual([]);
  });

  it("sets export=true when isExport truthy", async () => {
    axiosPost.mockResolvedValue({ data: {} });
    await getAttendanceLogs(
      "",
      "",
      "",
      "",
      "",
      1,
      10,
      "name",
      "asc",
      undefined,
      undefined,
      undefined,
      undefined,
      true,
      []
    );
    expect(axiosPost.mock.calls[0][2].params.export).toBe(true);
  });
});

describe("page/EmployeeLogs (get) getAttendanceUserLogs", () => {
  it("POSTs /api/v1/attendance/user-logs with employeeId+date body", async () => {
    axiosPost.mockResolvedValue({ data: { logs: [] } });
    await getAttendanceUserLogs("u1", "2026-05-21");
    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/attendance\/user-logs$/);
    expect(body).toEqual({ employeeId: "u1", date: "2026-05-21" });
    expect(opts.headers["x-access-token"]).toBe("EL_T");
  });
});

describe("page/EmployeeLogs (get) track + vehicle helpers", () => {
  it("getTrackUsers GETs /api/v1/entry/users?search=<q>", async () => {
    axiosGet.mockResolvedValue({ data: [] });
    await getTrackUsers("bob");
    expect(axiosGet.mock.calls[0][0]).toContain("/api/v1/entry/users?search=bob");
  });

  it("getTrackLogs GETs /api/v1/entry/user/<id>?startDate=<d>", async () => {
    axiosGet.mockResolvedValue({ data: [] });
    await getTrackLogs("u5", "2026-01-01");
    expect(axiosGet.mock.calls[0][0]).toContain(
      "/api/v1/entry/user/u5?startDate=2026-01-01"
    );
  });

  it("getVehicleList GETs /api/v1/vehicle/vehicles?search=", async () => {
    axiosGet.mockResolvedValue({ data: [] });
    await getVehicleList("ABC");
    expect(axiosGet.mock.calls[0][0]).toContain(
      "/api/v1/vehicle/vehicles?search=ABC"
    );
  });

  it("getVehicleLogs GETs /api/v1/vehicle/vehicle/<id>?startDate=", async () => {
    axiosGet.mockResolvedValue({ data: [] });
    await getVehicleLogs("v3", "2026-02-02");
    expect(axiosGet.mock.calls[0][0]).toContain(
      "/api/v1/vehicle/vehicle/v3?startDate=2026-02-02"
    );
  });
});

describe("page/EmployeeLogs (post) getAllAccessLogsDetails", () => {
  it("POSTs /api/v1/accessLogs/get with sortField/sortOrder split into query", async () => {
    axiosPost.mockResolvedValue({ data: {} });
    await getAllAccessLogsDetails({
      sortField: "time",
      sortOrder: "desc",
      foo: 1,
    });
    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toContain("/api/v1/accessLogs/get?sortField=time&sortOrder=desc");
    expect(body).toEqual({ foo: 1 });
    expect(opts.headers["x-access-token"]).toBe("EL_T");
  });
});

describe("page/EmployeeLogs (post) misc helpers", () => {
  it.each([
    ["filterByDepartment", (d) => filterByDepartment(d), "/api/v1/departments/get"],
    ["getNVRs", () => getNVRs(), "/api/v1/authorizedChannels/getNVRS"],
    ["getchannels", (d) => getchannels(d), "/api/v1/authorizedChannels/getChannels"],
  ])("%s POSTs %s with token", async (_n, invoke, expected) => {
    axiosPost.mockResolvedValue({ data: {} });
    await invoke({ x: 1 });
    const [url, , opts] = axiosPost.mock.calls.at(-1);
    expect(url).toContain(expected);
    expect(opts.headers["x-access-token"]).toBe("EL_T");
  });
});

describe("page/EmployeeLogs (post) getEmployeeLocations", () => {
  it("POSTs /api/v1/locations/employee-location with query string", async () => {
    axiosPost.mockResolvedValue({ data: {} });
    await getEmployeeLocations({ skip: 10, limit: 50, search: "abc" });
    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toContain("/api/v1/locations/employee-location?");
    expect(url).toContain("skip=10");
    expect(url).toContain("limit=50");
    expect(url).toContain("search=abc");
    expect(body).toEqual({});
    expect(opts.headers["x-access-token"]).toBe("EL_T");
  });

  it("uses defaults and omits search when not provided", async () => {
    axiosPost.mockResolvedValue({ data: {} });
    await getEmployeeLocations();
    const [url] = axiosPost.mock.calls[0];
    expect(url).toContain("skip=0");
    expect(url).toContain("limit=100");
    expect(url).not.toContain("search=");
  });
});

describe("page/EmployeeLogs (post) absence-data helpers", () => {
  it("getDeskChannelGraph POSTs /api/v1/incidents/deskAbsenceData with search/skip/limit", async () => {
    axiosPost.mockResolvedValue({ data: {} });
    await getDeskChannelGraph("foo", 0, 10, { a: 1 });
    const [url, body] = axiosPost.mock.calls[0];
    expect(url).toContain(
      "/api/v1/incidents/deskAbsenceData?search=foo&skip=0&limit=10"
    );
    expect(body).toEqual({ a: 1 });
  });

  it("getGuardChannelGraph POSTs /api/v1/incidents/guardAbsenceData", async () => {
    axiosPost.mockResolvedValue({ data: {} });
    await getGuardChannelGraph("bar", 1, 5, { z: 2 });
    const [url, body] = axiosPost.mock.calls[0];
    expect(url).toContain(
      "/api/v1/incidents/guardAbsenceData?search=bar&skip=1&limit=5"
    );
    expect(body).toEqual({ z: 2 });
  });
});
