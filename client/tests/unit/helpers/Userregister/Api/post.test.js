/**
 * Userregister/Api/post — large group of POST/GET/DELETE wrappers around axios.
 * Each function calls getAccessToken (await), then axios.<verb>, then returns
 * response?.data. We mock axios to a per-test-suite shared object so we can
 * use post/get/delete on it interchangeably.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosShape = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("axios", () => ({ default: axiosShape }));

const tokenMock = vi.hoisted(() => vi.fn(async () => "POST_TOK"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const api = await import(
  "../../../../../src/helpers/Userregister/Api/post/index.jsx"
);

beforeEach(() => {
  axiosShape.post.mockReset();
  axiosShape.get.mockReset();
  axiosShape.delete.mockReset();
  tokenMock.mockClear();
});

describe("Userregister/Api/post", () => {
  it("bulkUploadUsers POSTs to bulk-import and returns response.data", async () => {
    axiosShape.post.mockResolvedValue({ data: { ok: true } });
    const out = await api.bulkUploadUsers({ rows: [] });
    expect(axiosShape.post).toHaveBeenCalledTimes(1);
    expect(axiosShape.post.mock.calls[0][0]).toMatch(
      /\/api\/v1\/authorizedUsers\/bulk-import$/
    );
    expect(axiosShape.post.mock.calls[0][1]).toEqual({ rows: [] });
    expect(axiosShape.post.mock.calls[0][2].headers["x-access-token"]).toBe("POST_TOK");
    expect(out).toEqual({ ok: true });
  });

  it("verifyUser POSTs to verifyUser endpoint", async () => {
    axiosShape.post.mockResolvedValue({ data: { verified: true } });
    const out = await api.verifyUser({ email: "x@y.z" });
    expect(axiosShape.post.mock.calls[0][0]).toMatch(
      /\/api\/v1\/authorizedUsers\/verifyUser$/
    );
    expect(out.verified).toBe(true);
  });

  it("isEmpAdminApi hits /users/check-emp-admin", async () => {
    axiosShape.post.mockResolvedValue({ data: { isAdmin: false } });
    const out = await api.isEmpAdminApi({ email: "x" });
    expect(axiosShape.post.mock.calls[0][0]).toMatch(/\/users\/check-emp-admin$/);
    expect(out.isAdmin).toBe(false);
  });

  it("getEmpUsers POSTs to /users/allOrgEmployee", async () => {
    axiosShape.post.mockResolvedValue({ data: { rows: [1, 2] } });
    const out = await api.getEmpUsers({ q: "" });
    expect(axiosShape.post.mock.calls[0][0]).toMatch(/\/users\/allOrgEmployee$/);
    expect(out.rows).toEqual([1, 2]);
  });

  it("addempUsers POSTs to /users/import-users", async () => {
    axiosShape.post.mockResolvedValue({ data: { id: 9 } });
    const out = await api.addempUsers({ name: "X" });
    expect(axiosShape.post.mock.calls[0][0]).toMatch(/\/users\/import-users$/);
    expect(out.id).toBe(9);
  });

  it("addEmpEmails POSTs to /admin/add-emp-emails", async () => {
    axiosShape.post.mockResolvedValue({ data: { added: 2 } });
    const out = await api.addEmpEmails({ emails: ["a"] });
    expect(axiosShape.post.mock.calls[0][0]).toMatch(/\/admin\/add-emp-emails$/);
    expect(out.added).toBe(2);
  });

  it("getEmpEmails GETs /admin/get-emp-emails", async () => {
    axiosShape.get.mockResolvedValue({ data: { emails: ["a@b.c"] } });
    const out = await api.getEmpEmails();
    expect(axiosShape.get).toHaveBeenCalledTimes(1);
    expect(axiosShape.get.mock.calls[0][0]).toMatch(/\/admin\/get-emp-emails$/);
    expect(out.emails).toEqual(["a@b.c"]);
  });

  it("deleteEmpEmail DELETEs /admin/delete-emp-email with data body", async () => {
    axiosShape.delete.mockResolvedValue({ data: { deleted: true } });
    const out = await api.deleteEmpEmail({ id: "abc" });
    expect(axiosShape.delete).toHaveBeenCalledTimes(1);
    const [url, opts] = axiosShape.delete.mock.calls[0];
    expect(url).toMatch(/\/admin\/delete-emp-email$/);
    expect(opts.data).toEqual({ id: "abc" });
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(out.deleted).toBe(true);
  });

  it("getLocationByEmpEmail hits /admin/get-location-by-emp-email", async () => {
    axiosShape.get.mockResolvedValue({ data: { locations: [] } });
    const out = await api.getLocationByEmpEmail();
    expect(axiosShape.get.mock.calls[0][0]).toMatch(
      /\/admin\/get-location-by-emp-email$/
    );
    expect(out.locations).toEqual([]);
  });

  it("importUsersProgress sends 'accept: application/json'", async () => {
    axiosShape.get.mockResolvedValue({ data: { pct: 50 } });
    const out = await api.importUsersProgress();
    expect(axiosShape.get.mock.calls[0][1].headers.accept).toBe("application/json");
    expect(out.pct).toBe(50);
  });

  it("fetchUniqueLocations encodes skip/limit/search into URL", async () => {
    axiosShape.post.mockResolvedValue({ data: { items: [] } });
    await api.fetchUniqueLocations(10, 50, "del");
    expect(axiosShape.post.mock.calls[0][0]).toMatch(
      /\/locations\/employee-location\?skip=10&limit=50&search=del$/
    );
  });

  it("fetchUniqueLocations uses default skip/limit/search when not provided", async () => {
    axiosShape.post.mockResolvedValue({ data: {} });
    await api.fetchUniqueLocations();
    expect(axiosShape.post.mock.calls[0][0]).toMatch(/\?skip=0&limit=200&search=$/);
  });

  it("returns undefined when axios response is missing .data", async () => {
    axiosShape.post.mockResolvedValue(null);
    const out = await api.verifyUser({});
    expect(out).toBeUndefined();
  });
});
