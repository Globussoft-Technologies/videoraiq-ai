/**
 * src/page/user/Profile/Api/get/index.jsx — axios.get helpers for the Profile
 * page (getProfileDetails, getProfileExport, getObjectDetectionList,
 * getStorage). All share the same shape: read token via getAccessToken(),
 * call axios.get with the token header. getProfileExport additionally
 * triggers a blob download via window.URL/createObjectURL + a fake <a> click.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const axiosGet = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { get: axiosGet } }));

const tokenMock = vi.hoisted(() => vi.fn(() => "PROFILE_T"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const api = await import(
  "../../../../../../src/page/user/Profile/Api/get/index.jsx"
);

beforeEach(() => {
  axiosGet.mockReset();
  axiosGet.mockResolvedValue({ data: {} });
  tokenMock.mockClear();
});

describe("page/Profile getProfileDetails", () => {
  it("GETs /api/v1/profiles with pagination + sort params and the token", async () => {
    await api.getProfileDetails({
      page: 2,
      limit: 5,
      search: "alice",
      orderBy: "basics.profileName",
      sort: "desc",
    });

    const [url, opts] = axiosGet.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/profiles$/);
    expect(opts.params).toEqual({
      skip: 5, // (page-1)*limit = 1*5
      limit: 5,
      orderBy: "basics.profileName",
      sort: "desc",
      name: "alice",
    });
    expect(opts.headers["x-access-token"]).toBe("PROFILE_T");
    expect(opts.headers.Accept).toBe("application/json");
  });

  it("uses defaults when called with empty args", async () => {
    await api.getProfileDetails({});
    const [, opts] = axiosGet.mock.calls[0];
    expect(opts.params.skip).toBe(0); // (1-1)*10
    expect(opts.params.limit).toBe(10);
    expect(opts.params.sort).toBe("asc");
    expect(opts.params.orderBy).toBe("basics.profileName");
    expect(opts.params.name).toBe("");
  });
});

describe("page/Profile getObjectDetectionList", () => {
  it("GETs /api/v1/detection-objects/ with token header", async () => {
    await api.getObjectDetectionList();
    const [url, opts] = axiosGet.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/detection-objects\/$/);
    expect(opts.headers["x-access-token"]).toBe("PROFILE_T");
  });
});

describe("page/Profile getStorage", () => {
  it("GETs /api/v1/storage/ with token header", async () => {
    await api.getStorage();
    const [url, opts] = axiosGet.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/storage\/$/);
    expect(opts.headers["x-access-token"]).toBe("PROFILE_T");
  });
});

describe("page/Profile getProfileExport", () => {
  const origCreateObjectURL = globalThis.URL.createObjectURL;
  let clickSpy;
  let removeSpy;
  let appendSpy;

  beforeEach(() => {
    globalThis.URL.createObjectURL = vi.fn(() => "blob:fake");
    // We can't easily stub createElement output globally; spy on body methods.
    appendSpy = vi
      .spyOn(document.body, "appendChild")
      .mockImplementation((el) => el);
    clickSpy = vi.fn();
    removeSpy = vi.fn();
    vi.spyOn(document, "createElement").mockImplementation(() => {
      const el = {
        href: "",
        setAttribute: vi.fn(),
        click: clickSpy,
        remove: removeSpy,
      };
      return el;
    });
  });

  afterEach(() => {
    globalThis.URL.createObjectURL = origCreateObjectURL;
    vi.restoreAllMocks();
  });

  it("downloads a blob and clicks the synthetic <a> link", async () => {
    axiosGet.mockResolvedValueOnce({ data: new Blob(["enc"]) });
    await api.getProfileExport("p-9");

    const [url, opts] = axiosGet.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/profiles\/export\/p-9$/);
    expect(opts.responseType).toBe("blob");
    expect(opts.headers["x-access-token"]).toBe("PROFILE_T");
    expect(globalThis.URL.createObjectURL).toHaveBeenCalled();
    expect(appendSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();
  });

  it("swallows axios errors via try/catch (returns undefined)", async () => {
    axiosGet.mockRejectedValueOnce(new Error("boom"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await api.getProfileExport("p-x");
    expect(r).toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
  });
});
