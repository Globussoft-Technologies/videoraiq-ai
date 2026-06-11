/**
 * Gap-fill for utils/rtspStream.js — covers the cloud branch of
 * buildStreamingUrl (lines 189-191) and the catch block (lines 196-199).
 *
 * The existing rtspStream.test.js only exercises the local branch because
 * APP_ENV is fixed to "local" at module load time (tests/setup.js seeds
 * NODE_CONFIG before any import). Here we override `config` for this file
 * so `APP_ENV === "cloud"`, re-import the module, and assert both the
 * cloud success path (which delegates to getStreamingUrl) and the catch
 * path (which logs + returns null).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("config", () => {
  const map = {
    APP_ENV: "cloud",
    "RTSPStream.host": "http://rtsp.test",
    "RTSPStream.token": "test-rtsp-token",
    "RTSPStream.terminateHost": "http://rtsp-terminate.test",
    "RTSPStream.terminateKey": "test-terminate-key",
    "ENCRYPTION_KEY": "0".repeat(64),
    "IV": "0".repeat(32),
  };
  return {
    default: {
      get: (k) => {
        if (k in map) return map[k];
        // Surface missing keys instead of returning undefined silently.
        throw new Error(`mock config: missing key ${k}`);
      },
      has: (k) => k in map,
    },
  };
});
vi.mock("axios", () => ({
  default: { post: vi.fn(), put: vi.fn() },
}));
vi.mock("../../../utils/database.js", () => ({
  redis: { get: vi.fn(), set: vi.fn() },
}));

const axios = (await import("axios")).default;
const { redis } = await import("../../../utils/database.js");
const rtsp = await import("../../../utils/rtspStream.js");
const { encrypt } = await import("../../../utils/cryptoUtils.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildStreamingUrl (cloud branch — gap-fill)", () => {
  it("delegates to getStreamingUrl on the cloud path", async () => {
    redis.get.mockResolvedValueOnce(null);
    axios.post.mockResolvedValueOnce({
      data: { status: "success", url: "rtsp://cloud.test/stream" },
    });
    const ip = encrypt("10.0.0.1");
    const pwd = encrypt("supersecret");
    const nvr = {
      _id: "n-1",
      brand: "hikvision",
      ip,
      password: pwd,
      username: "admin",
      rtspPort: 554,
    };
    const channel = {
      _id: "c-1",
      streamEndpoint: "/Streaming/Channels/",
      rtspChannels: [{ id: "101" }],
    };
    const url = await rtsp.buildStreamingUrl(nvr, channel);
    // getStreamingUrl writes to redis on success — confirms the cloud branch ran.
    expect(redis.set).toHaveBeenCalledWith(
      "stream_url:n-1-c-1",
      "rtsp://cloud.test/stream",
    );
    expect(url).toBe("rtsp://cloud.test/stream");
  });

  it("returns null when buildRTSPUrl throws (catch branch)", async () => {
    // An unknown brand makes buildRTSPUrl throw — that throw is caught by
    // buildStreamingUrl's outer catch, which logs + returns null.
    const ip = encrypt("10.0.0.1");
    const pwd = encrypt("supersecret");
    const nvr = {
      _id: "n-2",
      brand: "unknown-brand",
      ip,
      password: pwd,
      username: "admin",
      rtspPort: 554,
    };
    const channel = { _id: "c-2" };
    const url = await rtsp.buildStreamingUrl(nvr, channel);
    expect(url).toBeNull();
  });
});
