/**
 * useHlsPlayer is a long, event-driven hook. We exercise only the no-op
 * branches (no video element, disabled, empty url) and the Safari-native
 * path; the full Hls lifecycle (events, retries, live-sync) is out of scope.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const HlsMock = vi.hoisted(() => {
  const inst = { destroy: vi.fn() };
  const ctor = vi.fn(() => inst);
  ctor.isSupported = vi.fn().mockReturnValue(true);
  ctor.DefaultConfig = { loader: class {} };
  ctor.Events = { ERROR: "hlsError", MEDIA_ATTACHED: "mediaAttached" };
  return Object.assign(ctor, { _inst: inst });
});
vi.mock("hls.js", () => ({ default: HlsMock }));

vi.mock("@/utils/getAccessToken", () => ({ default: () => "test-token" }));

const { default: useHlsPlayer } = await import(
  "../../../src/hooks/useHlsPlayer.js"
);

function makeVideo(over = {}) {
  return {
    pause: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    load: vi.fn(),
    removeAttribute: vi.fn(),
    canPlayType: vi.fn().mockReturnValue(""),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  HlsMock.mockReset();
  HlsMock.mockImplementation(() => HlsMock._inst);
  HlsMock.isSupported.mockReset().mockReturnValue(true);
});

describe("useHlsPlayer", () => {
  it("is a no-op when the videoRef is null", () => {
    renderHook(() => useHlsPlayer({ current: null }, "stream.m3u8"));
    expect(HlsMock).not.toHaveBeenCalled();
  });

  it("does not init Hls when enabled is false", () => {
    const video = makeVideo();
    renderHook(() =>
      useHlsPlayer({ current: video }, "stream.m3u8", { enabled: false })
    );
    expect(HlsMock).not.toHaveBeenCalled();
  });

  it("does not init Hls when url is empty", () => {
    const video = makeVideo();
    renderHook(() => useHlsPlayer({ current: video }, ""));
    expect(HlsMock).not.toHaveBeenCalled();
  });

  it("falls back to native HLS on Safari when Hls.isSupported() is false", () => {
    HlsMock.isSupported.mockReturnValue(false);
    const video = makeVideo({
      canPlayType: vi.fn().mockReturnValue("probably"),
    });
    renderHook(() => useHlsPlayer({ current: video }, "stream.m3u8"));
    expect(video.src).toBe("stream.m3u8");
    expect(video.play).toHaveBeenCalled();
    expect(HlsMock).not.toHaveBeenCalled();
  });

  it("does not assign src on Safari when canPlayType returns empty", () => {
    HlsMock.isSupported.mockReturnValue(false);
    const video = makeVideo();
    renderHook(() => useHlsPlayer({ current: video }, "stream.m3u8"));
    expect(video.src).toBeUndefined();
    expect(video.play).not.toHaveBeenCalled();
  });
});
