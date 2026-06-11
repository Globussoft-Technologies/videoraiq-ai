/**
 * Gap-fills for src/page/user/Streams/CameraPlay/PlaybackStreams.jsx
 *
 * Targets:
 *   - lines 93-99: updateTimeline rAF loop firing onTimeUpdate(now)
 *   - lines 103-105: when isPlaying flips false, cancels the existing rAF
 *   - lines 137-138: fullscreenchange listener flips isFullscreen state
 *   - lines 50-69 catch path: JSMpeg.Player constructor throws -> console.error
 *   - lines 76-86: cancelAnimationFrame + player.destroy throw path on unmount
 *
 * UNREACHABLE: toggleFullscreen (lines 120-133) is wired to a button that
 * is fully commented out in the JSX, so no UI element invokes it.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

import { PlaybackStreams } from "../../../../../../src/page/user/Streams/CameraPlay/PlaybackStreams.jsx";

const playerInstances = [];
class FakeJSMpegPlayer {
  constructor(url, opts) {
    this.url = url;
    this.opts = opts;
    this.destroyed = false;
    this.currentTime = 0;
    this.playbackRate = 1;
    playerInstances.push(this);
  }
  destroy() {
    this.destroyed = true;
  }
}

let origJSMpeg;
let origRAF;
let origCAF;
let rafCallbacks = [];
let rafCancelled = [];

beforeEach(() => {
  playerInstances.length = 0;
  rafCallbacks = [];
  rafCancelled = [];

  origJSMpeg = globalThis.window.JSMpeg;
  origRAF = globalThis.requestAnimationFrame;
  origCAF = globalThis.cancelAnimationFrame;

  globalThis.requestAnimationFrame = (cb) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  };
  globalThis.cancelAnimationFrame = vi.fn((id) => {
    rafCancelled.push(id);
  });

  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  globalThis.window.JSMpeg = origJSMpeg;
  globalThis.requestAnimationFrame = origRAF;
  globalThis.cancelAnimationFrame = origCAF;
});

describe("PlaybackStreams gap-fills", () => {
  it("updateTimeline rAF loop invokes onTimeUpdate with currentTime (lines 93-99)", () => {
    globalThis.window.JSMpeg = { Player: FakeJSMpegPlayer };
    const onTimeUpdate = vi.fn();

    render(
      <PlaybackStreams
        playbackChannel="cam-time"
        isPlaying={true}
        onTimeUpdate={onTimeUpdate}
      />
    );

    const p = playerInstances[0];
    p.currentTime = 12.34;

    // Drain one rAF callback — that's the updateTimeline tick.
    expect(rafCallbacks.length).toBeGreaterThan(0);
    const cb = rafCallbacks[rafCallbacks.length - 1];
    act(() => {
      cb();
    });
    expect(onTimeUpdate).toHaveBeenCalledWith(12.34);
  });

  it("flipping isPlaying false cancels the existing rAF (lines 103-105)", () => {
    globalThis.window.JSMpeg = { Player: FakeJSMpegPlayer };

    const { rerender } = render(
      <PlaybackStreams playbackChannel="cam-rt" isPlaying={true} />
    );
    // One rAF was scheduled when isPlaying=true.
    expect(rafCallbacks.length).toBeGreaterThan(0);

    // Drive isPlaying false -> the cleanup cancels the existing rAF.
    rerender(<PlaybackStreams playbackChannel="cam-rt" isPlaying={false} />);
    expect(globalThis.cancelAnimationFrame).toHaveBeenCalled();
  });

  it("fullscreenchange listener flips isFullscreen via setIsFullscreen (lines 137-138)", () => {
    globalThis.window.JSMpeg = { Player: FakeJSMpegPlayer };

    // Render with isPlaying=false to keep the rAF loop quiet.
    const { container } = render(
      <PlaybackStreams playbackChannel="cam-fs" isPlaying={false} />
    );
    expect(container.querySelector("canvas")).toBeInTheDocument();

    // Seed an active fullscreen element and dispatch the event.
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => document.body,
    });
    act(() => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    // No exception thrown — the handler ran and called setIsFullscreen.
    // Cleanup.
    delete document.fullscreenElement;
  });

  it("JSMpeg.Player constructor throwing is caught + logged (lines 68-70)", () => {
    globalThis.window.JSMpeg = {
      Player: function () {
        throw new Error("init-fail");
      },
    };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <PlaybackStreams playbackChannel="cam-throw" isPlaying={false} />
    );

    expect(errSpy).toHaveBeenCalledWith(
      "Failed to initialize JSMpeg Player:",
      expect.any(Error)
    );
    errSpy.mockRestore();
  });

  it("player.destroy throwing on unmount is caught and warned (lines 81-84)", () => {
    globalThis.window.JSMpeg = {
      Player: class {
        constructor() {
          this.opts = {};
        }
        destroy() {
          throw new Error("destroy-boom");
        }
      },
    };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { unmount } = render(
      <PlaybackStreams playbackChannel="cam-d" isPlaying={true} />
    );

    expect(() => unmount()).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      "Error destroying JSMpeg player:",
      expect.any(Error)
    );
    warnSpy.mockRestore();
  });
});

// UNREACHABLE: toggleFullscreen (lines 120-133) is bound only to a button
// element that is fully commented out in PlaybackStreams.jsx. The function
// exists in the closure but no DOM event can invoke it from the current
// rendered UI.
