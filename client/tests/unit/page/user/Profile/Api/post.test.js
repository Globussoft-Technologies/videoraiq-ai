/**
 * src/page/user/Profile/Api/post/index.jsx — axios.post helpers for Profile:
 * getEmployees, importEmployeeProfile, addProfile, deleteBulkProfiles,
 * profileBulkExport. All read the token via getAccessToken();
 * profileBulkExport additionally triggers a blob download.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const axiosPost = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { post: axiosPost } }));

const tokenMock = vi.hoisted(() => vi.fn(() => "PROFILE_T"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const api = await import(
  "../../../../../../src/page/user/Profile/Api/post/index.jsx"
);

beforeEach(() => {
  axiosPost.mockReset();
  tokenMock.mockClear();
});

describe("page/Profile getEmployees", () => {
  it("POSTs to /admin/get-emp-employees-by-organization with token + empty body, returns data", async () => {
    axiosPost.mockResolvedValue({ data: { emps: [1, 2] } });
    const r = await api.getEmployees();

    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toMatch(
      /\/api\/v1\/admin\/get-emp-employees-by-organization\?skip=0&limit=10$/
    );
    expect(body).toEqual({});
    expect(opts.headers["x-access-token"]).toBe("PROFILE_T");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(r).toEqual({ emps: [1, 2] });
  });
});

describe("page/Profile importEmployeeProfile", () => {
  it("POSTs to /admin/import-emp-users with usersData wrapper and returns body", async () => {
    axiosPost.mockResolvedValue({ data: { body: { imported: 3 } } });
    const r = await api.importEmployeeProfile([{ id: 1 }]);

    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/admin\/import-emp-users$/);
    expect(body).toEqual({ usersData: [{ id: 1 }] });
    expect(opts.headers["x-access-token"]).toBe("PROFILE_T");
    expect(r).toEqual({ imported: 3 });
  });
});

describe("page/Profile addProfile", () => {
  it("POSTs to /profiles/ with the payload and returns body", async () => {
    axiosPost.mockResolvedValue({ data: { body: { id: "p1" } } });
    const r = await api.addProfile({ name: "x" });

    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/profiles\/$/);
    expect(body).toEqual({ name: "x" });
    expect(opts.headers["x-access-token"]).toBe("PROFILE_T");
    expect(r).toEqual({ id: "p1" });
  });
});

describe("page/Profile deleteBulkProfiles", () => {
  it("POSTs to /profiles/bulk-delete wrapping ids and returns body", async () => {
    axiosPost.mockResolvedValue({ data: { body: { deleted: 2 } } });
    const r = await api.deleteBulkProfiles(["a", "b"]);

    const [url, body] = axiosPost.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/profiles\/bulk-delete$/);
    expect(body).toEqual({ ids: ["a", "b"] });
    expect(r).toEqual({ deleted: 2 });
  });
});

describe("page/Profile profileBulkExport", () => {
  const origCreateObjectURL = globalThis.URL.createObjectURL;
  const origRevokeObjectURL = globalThis.URL.revokeObjectURL;
  let clickSpy, removeSpy, appendSpy;

  beforeEach(() => {
    globalThis.URL.createObjectURL = vi.fn(() => "blob:fake");
    globalThis.URL.revokeObjectURL = vi.fn();
    appendSpy = vi
      .spyOn(document.body, "appendChild")
      .mockImplementation((el) => el);
    clickSpy = vi.fn();
    removeSpy = vi.fn();
    vi.spyOn(document, "createElement").mockImplementation(() => ({
      href: "",
      setAttribute: vi.fn(),
      click: clickSpy,
      remove: removeSpy,
    }));
  });

  afterEach(() => {
    globalThis.URL.createObjectURL = origCreateObjectURL;
    globalThis.URL.revokeObjectURL = origRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it("POSTs to /profiles/bulk-export, triggers download, returns the axios response", async () => {
    const fake = { data: new Blob(["zip"]) };
    axiosPost.mockResolvedValueOnce(fake);
    const r = await api.profileBulkExport(["a", "b"]);

    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/profiles\/bulk-export$/);
    expect(body).toEqual({ ids: ["a", "b"] });
    expect(opts.responseType).toBe("blob");
    expect(opts.headers["x-access-token"]).toBe("PROFILE_T");
    expect(globalThis.URL.createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");
    expect(r).toBe(fake);
  });

  it("returns null on axios rejection (try/catch swallows)", async () => {
    axiosPost.mockRejectedValueOnce(new Error("net"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await api.profileBulkExport(["a"]);
    expect(r).toBeNull();
    expect(errSpy).toHaveBeenCalled();
  });
});
