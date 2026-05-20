/**
 * Extended useHlsPlayer coverage: drives the Hls happy path and the various
 * error / buffer / live-sync handlers that the smaller useHlsPlayer.test.jsx
 * does not touch. We use a fake Hls implementation that records the
 * `on(event, handler)` registrations so the test can fire each handler.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

const HlsMock = vi.hoisted(() => {
  const EVENTS = {
    ERROR: "hlsError",
    MEDIA_ATTACHED: "mediaAttached",
    MANIFEST_PARSED: "manifestParsed",
    BUFFER_STALLED_ERROR: "bufferStalled",
  };

  const handlers = new Map();
  const inst = {
    destroy: vi.fn(),
    attachMedia: vi.fn(),
    loadSource: vi.fn(),
    startLoad: vi.fn(),
    recoverMediaError: vi.fn(),
    on: vi.fn((evt, fn) => {
      handlers.set(evt, fn);
    }),
    _fire(evt, data) {
      const fn = handlers.get(evt);
      if (fn) fn(evt, data);
    },
    _handlers: handlers,
  };

  const ctor = vi.fn(() => inst);
  ctor.isSupported = vi.fn(() => true);
  ctor.DefaultConfig = {
    loader: class DefaultLoader {
      load() {}
    },
  };
  ctor.Events = EVENTS;
  ctor.ErrorTypes = { MEDIA_ERROR: "mediaError", NETWORK_ERROR: "networkError" };
  return Object.assign(ctor, { _inst: inst, _handlers: handlers });
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
    readyState: 4,
    ...over,
  };
}

beforeEach(() => {
  HlsMock._handlers.clear();
  HlsMock.mockClear();
  HlsMock._inst.destroy.mockClear();
  HlsMock._inst.attachMedia.mockClear();
  HlsMock._inst.loadSource.mockClear();
  HlsMock._inst.startLoad.mockClear();
  HlsMock._inst.recoverMediaError.mockClear();
  HlsMock._inst.on.mockClear();
  HlsMock.isSupported.mockReset().mockReturnValue(true);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useHlsPlayer Hls happy path", () => {
  it("instantiates Hls and attaches media when supported", () => {
    const video = makeVideo();
    renderHook(() => useHlsPlayer({ current: video }, "stream.m3u8"));

    expect(HlsMock).toHaveBeenCalledTimes(1);
    expect(HlsMock._inst.attachMedia).toHaveBeenCalledWith(video);
    // event registrations
    expect(HlsMock._inst.on).toHaveBeenCalled();
    expect(HlsMock._handlers.has("mediaAttached")).toBe(true);
    expect(HlsMock._handlers.has("hlsError")).toBe(true);
    expect(HlsMock._handlers.has("manifestParsed")).toBe(true);
    expect(HlsMock._handlers.has("bufferStalled")).toBe(true);
  });

  it("loads the source on MEDIA_ATTACHED", () => {
    const video = makeVideo();
    renderHook(() => useHlsPlayer({ current: video }, "stream.m3u8"));
    HlsMock._inst._fire("mediaAttached");
    expect(HlsMock._inst.loadSource).toHaveBeenCalledWith("stream.m3u8");
  });

  it("calls video.play() on MANIFEST_PARSED when autoPlay is true (default)", () => {
    const video = makeVideo();
    renderHook(() => useHlsPlayer({ current: video }, "stream.m3u8"));
    HlsMock._inst._fire("manifestParsed");
    expect(video.play).toHaveBeenCalled();
  });

  it("does not play on MANIFEST_PARSED when autoPlay is false", () => {
    const video = makeVideo();
    renderHook(() =>
      useHlsPlayer({ current: video }, "stream.m3u8", { autoPlay: false })
    );
    HlsMock._inst._fire("manifestParsed");
    expect(video.play).not.toHaveBeenCalled();
  });

  it("calls startLoad(-1) on BUFFER_STALLED_ERROR", () => {
    const video = makeVideo();
    renderHook(() => useHlsPlayer({ current: video }, "stream.m3u8"));
    HlsMock._inst._fire("bufferStalled");
    expect(HlsMock._inst.startLoad).toHaveBeenCalledWith(-1);
  });

  it("kicks live-sync startLoad every 15s while readyState < 3", () => {
    const video = makeVideo({ readyState: 1 });
    renderHook(() => useHlsPlayer({ current: video }, "stream.m3u8"));
    HlsMock._inst.startLoad.mockClear();
    vi.advanceTimersByTime(15000);
    expect(HlsMock._inst.startLoad).toHaveBeenCalledWith(-1);
  });

  it("does NOT call startLoad in live-sync when readyState >= 3", () => {
    const video = makeVideo({ readyState: 4 });
    renderHook(() => useHlsPlayer({ current: video }, "stream.m3u8"));
    HlsMock._inst.startLoad.mockClear();
    vi.advanceTimersByTime(15000);
    expect(HlsMock._inst.startLoad).not.toHaveBeenCalled();
  });
});

describe("useHlsPlayer error handler", () => {
  it("invokes onError + schedules retry on 404 before playback", () => {
    const onError = vi.fn();
    const video = makeVideo();
    renderHook(() =>
      useHlsPlayer({ current: video }, "stream.m3u8", { onError })
    );
    HlsMock._inst._fire("hlsError", { response: { status: 404 } });
    expect(onError).toHaveBeenCalledWith("Stream not found (404)");
    // After 2s the retry destroys + creates a new Hls.
    HlsMock.mockClear();
    vi.advanceTimersByTime(2000);
    expect(HlsMock).toHaveBeenCalled();
  });

  it("ignores 404 once playback has started", () => {
    const onError = vi.fn();
    const video = makeVideo();
    renderHook(() =>
      useHlsPlayer({ current: video }, "stream.m3u8", { onError })
    );
    // Simulate playback started — onplaying is set on the video.
    video.onplaying && video.onplaying();
    HlsMock._inst._fire("hlsError", { response: { status: 404 } });
    expect(onError).not.toHaveBeenCalled();
  });

  it("recovers from a fatal MEDIA_ERROR", () => {
    const video = makeVideo();
    renderHook(() => useHlsPlayer({ current: video }, "stream.m3u8"));
    HlsMock._inst._fire("hlsError", { fatal: true, type: "mediaError" });
    expect(HlsMock._inst.recoverMediaError).toHaveBeenCalled();
  });

  it("calls startLoad(-1) on a fatal NETWORK_ERROR", () => {
    const video = makeVideo();
    renderHook(() => useHlsPlayer({ current: video }, "stream.m3u8"));
    HlsMock._inst.startLoad.mockClear();
    HlsMock._inst._fire("hlsError", { fatal: true, type: "networkError" });
    expect(HlsMock._inst.startLoad).toHaveBeenCalledWith(-1);
  });

  it("non-fatal, non-404 errors are silently dropped", () => {
    const onError = vi.fn();
    const video = makeVideo();
    renderHook(() =>
      useHlsPlayer({ current: video }, "stream.m3u8", { onError })
    );
    HlsMock._inst.recoverMediaError.mockClear();
    HlsMock._inst.startLoad.mockClear();
    HlsMock._inst._fire("hlsError", { fatal: false, type: "other" });
    expect(onError).not.toHaveBeenCalled();
    expect(HlsMock._inst.recoverMediaError).not.toHaveBeenCalled();
  });
});

describe("useHlsPlayer cleanup", () => {
  it("destroys the Hls instance on unmount", () => {
    const video = makeVideo();
    const { unmount } = renderHook(() =>
      useHlsPlayer({ current: video }, "stream.m3u8")
    );
    HlsMock._inst.destroy.mockClear();
    unmount();
    expect(HlsMock._inst.destroy).toHaveBeenCalled();
    expect(video.pause).toHaveBeenCalled();
    expect(video.removeAttribute).toHaveBeenCalledWith("src");
    expect(video.load).toHaveBeenCalled();
  });

  it("re-uses the same Hls when the url is unchanged", () => {
    const video = makeVideo();
    const { rerender } = renderHook(
      ({ url }) => useHlsPlayer({ current: video }, url),
      { initialProps: { url: "stream.m3u8" } }
    );
    expect(HlsMock).toHaveBeenCalledTimes(1);
    rerender({ url: "stream.m3u8" });
    expect(HlsMock).toHaveBeenCalledTimes(1);
  });
});

describe("useHlsPlayer custom loader", () => {
  it("appends ?token= when the url has no token", () => {
    const video = makeVideo();
    renderHook(() => useHlsPlayer({ current: video }, "stream.m3u8"));
    // Hls is called with a config — pull out the loader and exercise it.
    const cfg = HlsMock.mock.calls[0][0];
    const LoaderClass = cfg.loader;
    const loader = new LoaderClass();
    const superLoad = vi.fn();
    Object.getPrototypeOf(Object.getPrototypeOf(loader)).load = superLoad;
    const context = { url: "https://example.com/play.m3u8" };
    loader.load(context, {}, {});
    expect(context.url).toBe("https://example.com/play.m3u8?token=test-token");
    expect(superLoad).toHaveBeenCalled();
  });

  it("uses & when the url already has a query string", () => {
    const video = makeVideo();
    renderHook(() => useHlsPlayer({ current: video }, "stream.m3u8"));
    const cfg = HlsMock.mock.calls[0][0];
    const LoaderClass = cfg.loader;
    const loader = new LoaderClass();
    Object.getPrototypeOf(Object.getPrototypeOf(loader)).load = vi.fn();
    const context = { url: "https://example.com/play.m3u8?foo=bar" };
    loader.load(context, {}, {});
    expect(context.url).toBe(
      "https://example.com/play.m3u8?foo=bar&token=test-token"
    );
  });

  it("leaves the url alone when it already includes token=", () => {
    const video = makeVideo();
    renderHook(() => useHlsPlayer({ current: video }, "stream.m3u8"));
    const cfg = HlsMock.mock.calls[0][0];
    const LoaderClass = cfg.loader;
    const loader = new LoaderClass();
    Object.getPrototypeOf(Object.getPrototypeOf(loader)).load = vi.fn();
    const context = { url: "https://example.com/play.m3u8?token=keep-me" };
    loader.load(context, {}, {});
    expect(context.url).toBe("https://example.com/play.m3u8?token=keep-me");
  });
});
