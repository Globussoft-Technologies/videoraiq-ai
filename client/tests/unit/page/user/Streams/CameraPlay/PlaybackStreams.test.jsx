/**
 * src/page/user/Streams/CameraPlay/PlaybackStreams.jsx — the JSMpeg-driven
 * playback tile that sits inside the Playback page. Pure DOM tile (canvas
 * + container ref), no toolbar buttons rendered (the toggleFullscreen
 * button is currently commented out in the source). Lifecycle behaviour:
 *
 *   1. Mount: if window.JSMpeg.Player is available and a playbackChannel
 *      is passed, the component constructs a `new window.JSMpeg.Player(
 *      ${VITE_SOCKET_URL}/${playbackChannel}, { canvas, autoplay: isPlaying,
 *      audio: true, onSourceCompleted, onPlay, onPause })`. Within 100ms
 *      it also invokes the onLoadedMetadata callback exactly once.
 *   2. Player.onPlay hook -> calls the consumer's onPlaying prop.
 *      Player.onPause hook -> calls the consumer's onEnded prop.
 *      Player.onSourceCompleted -> wired directly to onEnded.
 *   3. While `isPlaying` is true the component schedules a
 *      requestAnimationFrame loop that reads playerRef.currentTime and
 *      fires onTimeUpdate(now) once per frame; when isPlaying flips to
 *      false the existing rAF is cancelled.
 *   4. playbackRate changes write through to playerRef.playbackRate.
 *   5. forwardRef: parent-passed ref (object or function) receives the
 *      container div on mount.
 *   6. Unmount destroys the player and cancels the rAF.
 *
 * Branches we exercise:
 *   - canvas renders inside the container; container ref is forwarded
 *   - missing JSMpeg / missing playbackChannel: no Player constructed
 *   - JSMpeg.Player constructed with the right URL + options
 *   - onLoadedMetadata fires once shortly after mount
 *   - the Player.onPlay hook invokes the onPlaying prop
 *   - the Player.onPause hook invokes the onEnded prop
 *   - playbackRate prop change writes through to playerRef.playbackRate
 *   - unmount calls player.destroy()
 *
 * Mocks: 0 module mocks (no Api / toast surfaces). We stub window.JSMpeg.
 * Mock budget used: 0 — well under 8.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

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

beforeEach(() => {
  playerInstances.length = 0;
  rafCallbacks = [];

  origJSMpeg = globalThis.window.JSMpeg;
  origRAF = globalThis.requestAnimationFrame;
  origCAF = globalThis.cancelAnimationFrame;

  globalThis.requestAnimationFrame = (cb) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length; // 1-based id
  };
  globalThis.cancelAnimationFrame = vi.fn();

  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  globalThis.window.JSMpeg = origJSMpeg;
  globalThis.requestAnimationFrame = origRAF;
  globalThis.cancelAnimationFrame = origCAF;
});

describe("Streams/CameraPlay/PlaybackStreams", () => {
  it("renders a canvas inside the container and forwards the container to a function ref", () => {
    delete globalThis.window.JSMpeg;
    const refFn = vi.fn();

    const { container } = render(
      <PlaybackStreams ref={refFn} playbackChannel="" isPlaying={false} />
    );

    // Outer container is a div with the documented classes.
    const outer = container.firstChild;
    expect(outer.tagName).toBe("DIV");
    expect(outer.className).toMatch(/bg-black/);

    // The single child is the canvas with the fixed 1280x720 dimensions.
    const canvas = outer.querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(canvas.getAttribute("width")).toBe("1280");
    expect(canvas.getAttribute("height")).toBe("720");

    // Function ref is invoked at least once with the container element.
    expect(refFn).toHaveBeenCalled();
    expect(refFn.mock.calls[refFn.mock.calls.length - 1][0]).toBe(outer);
  });

  it("constructs a JSMpeg Player against `${VITE_SOCKET_URL}/${playbackChannel}` with audio + autoplay options", () => {
    globalThis.window.JSMpeg = { Player: FakeJSMpegPlayer };

    render(
      <PlaybackStreams
        playbackChannel="cam-7"
        isPlaying={true}
        onLoadedMetadata={vi.fn()}
        onPlaying={vi.fn()}
        onEnded={vi.fn()}
      />
    );

    expect(playerInstances).toHaveLength(1);
    const p = playerInstances[0];
    // VITE_SOCKET_URL is undefined in tests; the source still passes it
    // through, so just assert the suffix is the channel.
    expect(p.url.endsWith("/cam-7")).toBe(true);
    expect(p.opts.autoplay).toBe(true);
    expect(p.opts.audio).toBe(true);
    expect(typeof p.opts.onPlay).toBe("function");
    expect(typeof p.opts.onPause).toBe("function");
    expect(typeof p.opts.onSourceCompleted).toBe("function");
    expect(p.opts.canvas).not.toBeNull();
  });

  it("does NOT construct a Player when window.JSMpeg is missing", () => {
    delete globalThis.window.JSMpeg;
    render(<PlaybackStreams playbackChannel="cam-3" isPlaying={true} />);
    expect(playerInstances).toHaveLength(0);
  });

  it("does NOT construct a Player when playbackChannel is empty", () => {
    globalThis.window.JSMpeg = { Player: FakeJSMpegPlayer };
    render(<PlaybackStreams playbackChannel="" isPlaying={true} />);
    expect(playerInstances).toHaveLength(0);
  });

  it("fires onLoadedMetadata exactly once ~100ms after mount", () => {
    globalThis.window.JSMpeg = { Player: FakeJSMpegPlayer };
    const onLoadedMetadata = vi.fn();

    render(
      <PlaybackStreams
        playbackChannel="cam-9"
        isPlaying={false}
        onLoadedMetadata={onLoadedMetadata}
      />
    );

    expect(onLoadedMetadata).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onLoadedMetadata).toHaveBeenCalledTimes(1);
  });

  it("Player.onPlay invokes onPlaying, Player.onPause invokes onEnded", () => {
    globalThis.window.JSMpeg = { Player: FakeJSMpegPlayer };
    const onPlaying = vi.fn();
    const onEnded = vi.fn();

    render(
      <PlaybackStreams
        playbackChannel="cam-1"
        isPlaying={false}
        onPlaying={onPlaying}
        onEnded={onEnded}
      />
    );

    const p = playerInstances[0];

    act(() => {
      p.opts.onPlay();
    });
    expect(onPlaying).toHaveBeenCalledTimes(1);

    act(() => {
      p.opts.onPause();
    });
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it("playbackRate prop change writes through to playerRef.playbackRate", () => {
    globalThis.window.JSMpeg = { Player: FakeJSMpegPlayer };

    const { rerender } = render(
      <PlaybackStreams playbackChannel="cam-2" isPlaying={false} playbackRate={1} />
    );

    const p = playerInstances[0];
    expect(p.playbackRate).toBe(1);

    rerender(
      <PlaybackStreams playbackChannel="cam-2" isPlaying={false} playbackRate={2} />
    );
    expect(p.playbackRate).toBe(2);
  });

  it("unmount destroys the active player", () => {
    globalThis.window.JSMpeg = { Player: FakeJSMpegPlayer };

    const { unmount } = render(
      <PlaybackStreams playbackChannel="cam-4" isPlaying={true} />
    );

    const p = playerInstances[0];
    expect(p.destroyed).toBe(false);
    unmount();
    expect(p.destroyed).toBe(true);
  });

  it("an object-style ref also receives the container element", () => {
    delete globalThis.window.JSMpeg;
    const ref = { current: null };
    const { container } = render(
      <PlaybackStreams ref={ref} playbackChannel="" isPlaying={false} />
    );
    expect(ref.current).toBe(container.firstChild);
  });
});
