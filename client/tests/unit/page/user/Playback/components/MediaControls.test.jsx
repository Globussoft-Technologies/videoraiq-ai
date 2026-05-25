/**
 * src/page/user/Playback/components/MediaControls.jsx — pure presentational
 * playback control bar (Skip-Prev/Rewind/Play-Pause/FastForward/Skip-Next +
 * speed indicator + fullscreen toggle). Calls `togglePlayback`,
 * `changePlaybackRate`, `toggleFullscreen`, and a position-updating
 * `setPosition(prev => ...)` for the +/- 30 and +/- 60 second buttons.
 *
 * Behaviour pinned:
 *   - Play/Pause button is disabled while `isBuffering` is true (RotateCw
 *     spinner replaces the play/stop icon).
 *   - Skip / rewind / fast-forward buttons get the disabled class when
 *     `availableSegments` is empty.
 *   - `jumpSeconds` invokes `setPosition` with a function that clamps to
 *     `>= 0 + currentTime` and `<= 86400` (24h in seconds).
 *   - Fullscreen icon flips between MdFullscreen and MdFullscreenExit.
 *
 * Mocks: 0 — pure component, no imports beyond icon libraries.
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import MediaControls from "@/page/user/Playback/components/MediaControls.jsx";

const baseProps = () => ({
  currentSegmentIndex: 0,
  videoRef: { current: null },
  handlePreviousSegment: vi.fn(),
  skipBackward: vi.fn(),
  togglePlayback: vi.fn(),
  isBuffering: false,
  isPlaying: false,
  selectedRange: null,
  skipForward: vi.fn(),
  handleNextSegment: vi.fn(),
  availableSegments: [{ start: "a", end: "b" }],
  changePlaybackRate: vi.fn(),
  playbackRate: 1,
  handleZoomIn: vi.fn(),
  handleZoomOut: vi.fn(),
  toggleFullscreen: vi.fn(),
  isFullscreen: false,
  setPosition: vi.fn(),
  position: 0,
  currentTime: 0,
});

describe("MediaControls", () => {
  it("renders the five transport buttons, the speed indicator, and fullscreen toggle", () => {
    render(<MediaControls {...baseProps()} />);
    // 5 transport buttons + speed button + fullscreen = 7 buttons total
    expect(screen.getAllByRole("button")).toHaveLength(7);
    // Speed indicator shows current playbackRate (default 1x)
    expect(screen.getByTitle("Playback Speed")).toHaveTextContent("1x");
    // Fullscreen has the "Enter Fullscreen" title when not in fullscreen mode
    expect(screen.getByTitle("Enter Fullscreen")).toBeInTheDocument();
  });

  it("invokes togglePlayback when the Play button is clicked", () => {
    const props = baseProps();
    render(<MediaControls {...props} />);
    fireEvent.click(screen.getByTitle("Play"));
    expect(props.togglePlayback).toHaveBeenCalledTimes(1);
  });

  it("shows Pause title and uses the stop icon when isPlaying is true", () => {
    const props = { ...baseProps(), isPlaying: true };
    render(<MediaControls {...props} />);
    expect(screen.getByTitle("Pause")).toBeInTheDocument();
  });

  it("disables the play button while isBuffering", () => {
    const props = { ...baseProps(), isBuffering: true };
    render(<MediaControls {...props} />);
    const playBtn = screen.getByTitle("Play");
    expect(playBtn).toBeDisabled();
  });

  it("invokes changePlaybackRate when the speed indicator is clicked and reflects custom rate", () => {
    const props = { ...baseProps(), playbackRate: 2 };
    render(<MediaControls {...props} />);
    const speed = screen.getByTitle("Playback Speed");
    expect(speed).toHaveTextContent("2x");
    fireEvent.click(speed);
    expect(props.changePlaybackRate).toHaveBeenCalledTimes(1);
  });

  it("invokes toggleFullscreen when fullscreen button is clicked and swaps the title in fullscreen mode", () => {
    const props = { ...baseProps(), isFullscreen: true };
    render(<MediaControls {...props} />);
    const fs = screen.getByTitle("Exit Fullscreen");
    fireEvent.click(fs);
    expect(props.toggleFullscreen).toHaveBeenCalledTimes(1);
  });

  it("Rewind 30 invokes setPosition with a function that adds -30 (clamped at 0) using currentTime", () => {
    const setPosition = vi.fn();
    const props = { ...baseProps(), setPosition, currentTime: 100 };
    render(<MediaControls {...props} />);
    fireEvent.click(screen.getByTitle("Rewind 30 sec"));
    expect(setPosition).toHaveBeenCalledTimes(1);
    const updater = setPosition.mock.calls[0][0];
    expect(typeof updater).toBe("function");
    // jumpSeconds(-30): Math.min(Math.max(prev + sec, 0) + currentTime, 86400)
    // With prev=0, sec=-30, currentTime=100 -> Math.max(-30,0)+100 = 100, clamped at 86400.
    expect(updater(0)).toBe(100);
  });

  it("Fast Forward 30 invokes setPosition and clamps the upper bound to 86400", () => {
    const setPosition = vi.fn();
    const props = { ...baseProps(), setPosition, currentTime: 86000 };
    render(<MediaControls {...props} />);
    fireEvent.click(screen.getByTitle("Fast Forward 30 sec"));
    const updater = setPosition.mock.calls[0][0];
    // prev=1000, sec=30 -> Math.max(1030,0)+86000 = 87030, clamped to 86400.
    expect(updater(1000)).toBe(86400);
  });

  it("Skip Forward jumps +60 and Skip Backward jumps -60 via setPosition", () => {
    const setPosition = vi.fn();
    const props = { ...baseProps(), setPosition, currentTime: 0 };
    render(<MediaControls {...props} />);

    fireEvent.click(screen.getByTitle("Skip Forward"));
    fireEvent.click(screen.getByTitle("Skip Backward"));

    expect(setPosition).toHaveBeenCalledTimes(2);
    const forwardUpdater = setPosition.mock.calls[0][0];
    const backwardUpdater = setPosition.mock.calls[1][0];

    // Forward: prev=10, sec=60, currentTime=0 -> 70
    expect(forwardUpdater(10)).toBe(70);
    // Backward: prev=10, sec=-60 -> Math.max(-50,0)+0 = 0
    expect(backwardUpdater(10)).toBe(0);
  });

  it("marks transport buttons as disabled (via class) when availableSegments is empty", () => {
    const props = { ...baseProps(), availableSegments: [] };
    render(<MediaControls {...props} />);
    // The component does NOT pass disabled on the rewind / skip buttons,
    // but applies the disabled class. Verify class string contains "cursor-not-allowed".
    const rewind = screen.getByTitle("Rewind 30 sec");
    expect(rewind.className).toMatch(/cursor-not-allowed/);
    const skipPrev = screen.getByTitle("Skip Backward");
    expect(skipPrev.className).toMatch(/cursor-not-allowed/);
    // And the play button picks up the disabled style too (no segments).
    const playBtn = screen.getByTitle("Play");
    expect(playBtn.className).toMatch(/cursor-not-allowed/);
  });
});
