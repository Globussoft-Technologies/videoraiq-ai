/**
 * src/page/user/Dashboard/Api/put/index.jsx — axios.put helpers using
 * waitForToken(): markAlertResolved, updateAuthorizedUsers,
 * createCameraAliasName. The first unwraps response.data.body; the latter
 * two return response.data.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosPut = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { put: axiosPut } }));

const waitForTokenMock = vi.hoisted(() => vi.fn(async () => "DASH_PUT"));
vi.mock("@/utils/waitForToken", () => ({ waitForToken: waitForTokenMock }));

const tokenMock = vi.hoisted(() => vi.fn(() => "UNUSED"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const api = await import(
  "../../../../../../src/page/user/Dashboard/Api/put/index.jsx"
);

beforeEach(() => {
  axiosPut.mockReset();
  waitForTokenMock.mockClear();
});

describe("Dashboard markAlertResolved", () => {
  it("PUTs /incidents/<id> with payload, unwraps response.data.body", async () => {
    axiosPut.mockResolvedValue({ data: { body: { resolved: true } } });
    const r = await api.markAlertResolved("i-1", { status: "resolved" });

    const [url, body, opts] = axiosPut.mock.calls[0];
    expect(url).toMatch(/\/incidents\/i-1$/);
    expect(body).toEqual({ status: "resolved" });
    expect(opts.headers["x-access-token"]).toBe("DASH_PUT");
    expect(r).toEqual({ resolved: true });
  });
});

describe("Dashboard updateAuthorizedUsers", () => {
  it("PUTs /authorizedUsers/update with userId+departmentId query, returns response.data", async () => {
    axiosPut.mockResolvedValue({ data: { ok: true } });
    const r = await api.updateAuthorizedUsers("e-1", { allow: true }, "d-1");

    const [url, body, opts] = axiosPut.mock.calls[0];
    expect(url).toContain("/authorizedUsers/update?userId=e-1&departmentId=d-1");
    expect(body).toEqual({ allow: true });
    expect(opts.headers["x-access-token"]).toBe("DASH_PUT");
    expect(r).toEqual({ ok: true });
  });
});

describe("Dashboard createCameraAliasName", () => {
  it("PUTs /channel/<cameraId> with payload, returns response.data", async () => {
    axiosPut.mockResolvedValue({ data: { alias: "Front" } });
    const r = await api.createCameraAliasName("c-9", { alias: "Front" });

    const [url, body, opts] = axiosPut.mock.calls[0];
    expect(url).toMatch(/\/channel\/c-9$/);
    expect(body).toEqual({ alias: "Front" });
    expect(opts.headers["x-access-token"]).toBe("DASH_PUT");
    expect(r).toEqual({ alias: "Front" });
  });
});
