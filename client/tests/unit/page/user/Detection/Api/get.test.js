/**
 * src/page/user/Detection/Api/get/index.jsx — collection of axios.get helpers
 * for the Detection page. All share the same shape: read the access token
 * via getAccessToken(), call axios.get with the token header, return the
 * response unchanged.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosGet = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { get: axiosGet } }));

const tokenMock = vi.hoisted(() => vi.fn(() => "AUTH_T"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const api = await import(
  "../../../../../../src/page/user/Detection/Api/get/index.jsx"
);

beforeEach(() => {
  axiosGet.mockReset();
  axiosGet.mockResolvedValue({ data: {} });
  tokenMock.mockClear();
});

describe("page/Detection Api/get", () => {
  it("getAllDetectionTypes hits /detection-settings/types with the token", async () => {
    await api.getAllDetectionTypes();
    const [url, opts] = axiosGet.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/detection-settings\/types$/);
    expect(opts.headers["x-access-token"]).toBe("AUTH_T");
    expect(opts.headers.Accept).toBe("application/json");
  });

  it("getNvrWithChannels embeds the settingType in the query string", async () => {
    await api.getNvrWithChannels("motion");
    expect(axiosGet.mock.calls[0][0]).toMatch(
      /\/api\/v1\/nvr\/with-channels\?settingType=motion$/
    );
  });

  it("getRecipientsData defaults skip=0 and limit=10", async () => {
    await api.getRecipientsData();
    expect(axiosGet.mock.calls[0][0]).toMatch(
      /\/api\/v1\/recipients\/fetch\?alertType=''&skip=0&limit=10$/
    );
  });

  it("getRecipientsData forwards explicit pagination", async () => {
    await api.getRecipientsData(20, 50);
    expect(axiosGet.mock.calls[0][0]).toMatch(/skip=20&limit=50$/);
  });

  it("getVerifiedRecipients defaults to email alertType and verified filter", async () => {
    await api.getVerifiedRecipients();
    expect(axiosGet.mock.calls[0][0]).toMatch(
      /alertType=email.*filterByStatus=verified/
    );
  });

  it("getAllDetectionDetails builds query from all params", async () => {
    await api.getAllDetectionDetails("cam", "n1", "c1", 5, 25);
    const url = axiosGet.mock.calls[0][0];
    expect(url).toMatch(/nvrIds=n1/);
    expect(url).toMatch(/channelIds=c1/);
    expect(url).toMatch(/name=cam/);
    expect(url).toMatch(/skip=5&limit=25/);
  });

  it("getAllNVRs uses default skip/limit when called with no args", async () => {
    await api.getAllNVRs();
    expect(axiosGet.mock.calls[0][0]).toMatch(/skip=0&limit=100$/);
  });

  it("getAllNVRs honours explicit skip/limit", async () => {
    await api.getAllNVRs(10, 50);
    expect(axiosGet.mock.calls[0][0]).toMatch(/skip=10&limit=50$/);
  });

  it("getChannelsWithDetections passes nvrId/search/pagination", async () => {
    await api.getChannelsWithDetections("nvr-7", "lobby", 2, 4);
    const url = axiosGet.mock.calls[0][0];
    expect(url).toMatch(/nvrId=nvr-7/);
    expect(url).toMatch(/search=lobby/);
    expect(url).toMatch(/skip=2&limit=4/);
  });

  it("getChannelsWithDetections defaults search to '' and pagination", async () => {
    await api.getChannelsWithDetections("nvr-1");
    const url = axiosGet.mock.calls[0][0];
    expect(url).toMatch(/search=/); // empty
    expect(url).toMatch(/skip=0&limit=10/);
  });

  it("getAppliedProfile uses the cameraId path param", async () => {
    await api.getAppliedProfile("cam-99");
    expect(axiosGet.mock.calls[0][0]).toMatch(/\/api\/v1\/channel\/cam-99$/);
  });

  it("getDetectionSettingType combines settingType and channelIds", async () => {
    await api.getDetectionSettingType("motion", "c-1");
    expect(axiosGet.mock.calls[0][0]).toMatch(
      /settingType=motion.*channelIds=c-1/
    );
  });

  it("rethrows axios errors (sample on getAllNVRs)", async () => {
    axiosGet.mockRejectedValueOnce(new Error("offline"));
    await expect(api.getAllNVRs()).rejects.toThrow("offline");
  });
});
