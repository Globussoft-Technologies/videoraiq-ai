import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../../../client_v2/node_modules/axios/index.js", () => ({ default: { post: vi.fn() } }));
vi.mock("../../../../client_v2/src/utils/jwt", () => ({ isLocalSetup: () => false }));
vi.mock("../../../../client_v2/src/utils/getStreamHost", () => ({ default: () => "https://cloud-stream.example" }));
import axios from "../../../../client_v2/node_modules/axios/index.js";
import { getCamerasStatus } from "../../../../client_v2/src/helpers/cameraStatus.js";
import { streamUrl } from "../../../../client_v2/src/lib/stream.js";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VITE_STATUS_URL", "https://cloud-status.example");
});

describe("hybrid client routing", () => {
  it("groups cloud and installer status requests by their owning server", async () => {
    axios.post.mockResolvedValue({ data: { cameras: [] } });
    await getCamerasStatus([
      { nvrId: { domain: "https://legacy-device.example" }, localChannelId: "cloud", streamingUrl: "https://cloud-stream.example/stream/cloud/playlist.m3u8" },
      { localChannelId: "edge", nvrId: { localNvrId: "edge-nvr", domain: "https://site.example/" } },
    ]);
    expect(axios.post).toHaveBeenCalledWith("https://cloud-status.example/api/cameras/status", { ids: ["cloud"] });
    expect(axios.post).toHaveBeenCalledWith("https://site.example/api/cameras/status", { ids: ["edge"] });
  });

  it("keeps successful camera statuses when another site is unreachable", async () => {
    axios.post.mockRejectedValueOnce(new Error("site offline"))
      .mockResolvedValueOnce({ data: { cameras: [{ id: "cloud", rtsp_online: true }] } });
    const summary = await getCamerasStatus([
      { localChannelId: "edge", nvrId: { localNvrId: "edge-nvr", domain: "https://site.example" } },
      { localChannelId: "cloud" },
    ]);
    expect(summary.cameras).toEqual([{ id: "cloud", rtsp_online: true }]);
  });

  it("resolves relative streams per NVR and retains the cloud fallback", () => {
    expect(streamUrl({ streamingUrl: "stream/edge/playlist.m3u8", nvrId: { localNvrId: "edge-nvr", domain: "https://site.example/" } }))
      .toBe("https://site.example/stream/edge/playlist.m3u8");
    expect(streamUrl({ nvrId: { domain: "https://legacy-device.example" }, streamingUrl: "stream/cloud/playlist.m3u8" }))
      .toBe("https://cloud-stream.example/stream/cloud/playlist.m3u8");
  });
});
