/**
 * src/page/user/UserDetails/Api/Post/index.jsx — getUserDetails, createUser,
 * updateUser, getLocations, getLocation, getNvrs, getDepartment, getChannels,
 * getUserById, getEmployeeLocations. axios wrappers around /api/v1/users/* and
 * /api/v1/authorizedChannels/*.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosPost = vi.hoisted(() => vi.fn());
const axiosPut = vi.hoisted(() => vi.fn());
const axiosGet = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({
  default: { post: axiosPost, put: axiosPut, get: axiosGet },
}));

const tokenMock = vi.hoisted(() => vi.fn(() => "UD_T"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const {
  getUserDetails,
  createUser,
  updateUser,
  getLocations,
  getLocation,
  getNvrs,
  getDepartment,
  getChannels,
  getUserById,
  getEmployeeLocations,
} = await import(
  "../../../../../../src/page/user/UserDetails/Api/Post/index.jsx"
);

beforeEach(() => {
  axiosPost.mockReset();
  axiosPut.mockReset();
  axiosGet.mockReset();
  tokenMock.mockClear();
});

describe("page/UserDetails getUserDetails", () => {
  it("POSTs /api/v1/users/fetch with paged skip and sort params", async () => {
    axiosPost.mockResolvedValue({ data: { users: [] } });
    await getUserDetails("alice", 10, 3, { sortField: "name", sortOrder: "asc" });
    const [url, body, opts] = axiosPost.mock.calls[0];
    // page=3, limit=10 => skip = 20
    expect(url).toContain("/api/v1/users/fetch?skip=20&limit=10&searchQuery=alice");
    expect(url).toContain("orderBy=name&sort=asc");
    expect(body).toEqual({ sortField: "name", sortOrder: "asc" });
    expect(opts.headers["x-access-token"]).toBe("UD_T");
  });

  it("uses {} default for data arg, so sortField/sortOrder become undefined in URL", async () => {
    axiosPost.mockResolvedValue({ data: {} });
    await getUserDetails("", 5, 1);
    expect(axiosPost.mock.calls[0][0]).toContain("skip=0&limit=5");
  });
});

describe("page/UserDetails createUser", () => {
  it("POSTs /api/v1/users/create with payload and token", async () => {
    axiosPost.mockResolvedValue({ data: { id: "u1" } });
    await createUser({ email: "a@b.com" });
    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/users\/create$/);
    expect(body).toEqual({ email: "a@b.com" });
    expect(opts.headers["x-access-token"]).toBe("UD_T");
  });
});

describe("page/UserDetails updateUser", () => {
  it("PUTs /api/v1/users/update?userId=<id> with payload", async () => {
    axiosPut.mockResolvedValue({ data: { ok: 1 } });
    await updateUser("u9", { role: "admin" });
    const [url, body] = axiosPut.mock.calls[0];
    expect(url).toContain("/api/v1/users/update?userId=u9");
    expect(body).toEqual({ role: "admin" });
  });
});

describe("page/UserDetails authorizedChannels endpoints", () => {
  it.each([
    ["getLocations", () => getLocations({ q: 1 }), "/api/v1/authorizedChannels/fetchChannels"],
    ["getLocation", () => getLocation({ q: 1 }), "/api/v1/authorizedChannels/locations"],
    ["getNvrs", () => getNvrs({ q: 1 }), "/api/v1/authorizedChannels/getNVRS"],
    ["getDepartment", () => getDepartment({ q: 1 }), "/api/v1/authorizedChannels/departments"],
    ["getChannels", () => getChannels({ q: 1 }), "/api/v1/authorizedChannels/getChannels"],
  ])("%s POSTs %s with payload+token", async (_name, invoke, expectedPath) => {
    axiosPost.mockResolvedValue({ data: {} });
    await invoke();
    const [url, body, opts] = axiosPost.mock.calls.at(-1);
    expect(url).toContain(expectedPath);
    expect(body).toEqual({ q: 1 });
    expect(opts.headers["x-access-token"]).toBe("UD_T");
  });
});

describe("page/UserDetails getUserById", () => {
  it("GETs /api/v1/users/fetch/<id> with token header", async () => {
    axiosGet.mockResolvedValue({ data: { id: "u5" } });
    const r = await getUserById("u5");
    const [url, opts] = axiosGet.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/users\/fetch\/u5$/);
    expect(opts.headers["x-access-token"]).toBe("UD_T");
    expect(r.data.id).toBe("u5");
  });
});

describe("page/UserDetails getEmployeeLocations", () => {
  it("POSTs /api/v1/locations/employee-location with empty body and token", async () => {
    axiosPost.mockResolvedValue({ data: { rows: [] } });
    await getEmployeeLocations();
    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/locations\/employee-location$/);
    expect(body).toEqual({});
    expect(opts.headers["x-access-token"]).toBe("UD_T");
  });
});
