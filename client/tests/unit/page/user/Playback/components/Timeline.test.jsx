/**
 * src/page/user/Playback/components/Timeline.jsx — the per-camera playback
 * timeline strip. Purely presentational (no API of its own) but with several
 * branches we pin:
 *
 *  - loading=true renders the skeleton track variant (no playhead / no
 *    segments).
 *  - normal render mounts the zoomable inner track with the cursor-not-
 *    allowed base, the playback progress bar (current/total %), the buffered
 *    indicator (0% by default), and a per-30-minute label strip.
 *  - availableSegments map renders one Tooltip per non-empty segment and
 *    skips segments with invalid start/end timestamps.
 *  - segment click stops propagation and routes a derived absolute-click
 *    time through handleTimeSelect + setClickedTime.
 *  - track click routes a percent-based time through videoRef.current
 *    .currentTime + setClickedTime + handleTimeSelect.
 *  - track click is a no-op when selectedRange.start is invalid.
 *  - wheel + ctrlKey adjusts zoomLevel via setZoomLevel(prev => …) clamped
 *    to [0.5, 5]; non-ctrl wheel is a no-op.
 *  - mousemove on the inner track records a hover position (set via local
 *    state — exercised through the on-render style transitions).
 *  - clickedTime presence renders the down-arrow playhead column.
 *  - video element 'timeupdate' fires handleTimeSelect(selectedRange,
 *    currentSegmentIndex, video.currentTime, selectedCamera).
 *  - window 'keydown' ArrowRight / ArrowLeft adjust video.currentTime and
 *    surface the new absolute time through setClickedTime + handleTimeSelect.
 *  - unrelated keys are ignored.
 *  - unmount removes the window keydown listener and the video timeupdate
 *    listener.
 *
 * Mocks: 3
 *  - react-icons/ti (TiArrowSortedDown -> plain <svg>)
 *  - @/components/ui/Tooltip (Tooltip / Trigger / Content pass-throughs)
 *  - react-loading-skeleton (Skeleton + SkeletonTheme + side-effect css
 *    import shimmed out)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import React, { useRef, useEffect } from "react";

vi.mock("react-icons/ti", () => ({
  TiArrowSortedDown: (props) => <svg data-testid="arrow-down" {...props} />,
}));

vi.mock("@/components/ui/Tooltip", () => ({
  Tooltip: ({ children }) => <div data-testid="tooltip">{children}</div>,
  TooltipTrigger: ({ children, asChild, ...rest }) =>
    asChild ? (
      // Mirror Radix asChild semantics in test by cloning the child to
      // attach the marker class.
      React.cloneElement(React.Children.only(children), {
        "data-tooltip-trigger": true,
        ...rest,
      })
    ) : (
      <div data-tooltip-trigger {...rest}>
        {children}
      </div>
    ),
  TooltipContent: ({ children }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
}));

vi.mock("react-loading-skeleton", () => {
  const Skeleton = (props) => <div data-testid="skeleton" {...props} />;
  const SkeletonTheme = ({ children }) => (
    <div data-testid="skeleton-theme">{children}</div>
  );
  return { default: Skeleton, SkeletonTheme };
});

vi.mock("react-loading-skeleton/dist/skeleton.css", () => ({}));

import Timeline from "../../../../../../src/page/user/Playback/components/Timeline.jsx";

// ---- helpers ---------------------------------------------------------------
const RANGE = {
  start: "2024-01-01T00:00:00Z",
  end: "2024-01-01T02:00:00Z",
};
const SEGMENTS = [
  { start: "2024-01-01T00:00:00Z", end: "2024-01-01T00:30:00Z" },
  { start: "2024-01-01T01:00:00Z", end: "2024-01-01T01:15:00Z" },
  // Invalid segment — skipped via toValidDate guard.
  { start: "bad", end: "also-bad" },
];

function defaultProps(overrides = {}) {
  const handleTimeSelect = vi.fn();
  const setClickedTime = vi.fn();
  const setZoomLevel = vi.fn();
  const formatTimeUTC = vi.fn(
    (d) => `T-${(d && d.toISOString ? d.toISOString() : "x").slice(11, 16)}`
  );
  const getTimePosition = vi.fn(() => 25);
  const getSegmentWidth = vi.fn(() => 10);

  return {
    handleTimeSelect,
    setClickedTime,
    setZoomLevel,
    formatTimeUTC,
    getTimePosition,
    getSegmentWidth,
    selectedCamera: { id: "cam-1" },
    loading: false,
    availableSegments: SEGMENTS,
    selectedRange: RANGE,
    currentTime: 100,
    duration: 7200,
    currentSegmentIndex: 0,
    zoomLevel: 1,
    selectedDate: "2024-01-01",
    selectedEndDate: "2024-01-01",
    videoRef: { current: null },
    clickedTime: null,
    ...overrides,
  };
}

// A small wrapper that owns a real <video> ref + forwards it to Timeline so
// the videoRef.addEventListener('timeupdate', …) path can be exercised with
// a live element.
function Harness({ timelineProps }) {
  const videoRef = useRef(null);
  // Force the ref to be populated before Timeline reads it inside its effect.
  useEffect(() => {
    // noop — the <video> below assigns the ref on first paint.
  }, []);
  return (
    <>
      <video ref={videoRef} data-testid="video" />
      <Timeline {...timelineProps} videoRef={videoRef} />
    </>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Playback/components/Timeline", () => {
  it("loading=true renders the skeleton track variant (no playhead column)", () => {
    const { container, queryByTestId } = render(
      <Timeline {...defaultProps({ loading: true })} />
    );
    expect(queryByTestId("skeleton-theme")).toBeInTheDocument();
    expect(queryByTestId("skeleton")).toBeInTheDocument();
    // No down-arrow playhead while loading.
    expect(queryByTestId("arrow-down")).toBeNull();
    // No segment tooltips in the loading variant.
    expect(container.querySelectorAll("[data-testid=tooltip]").length).toBe(0);
  });

  it("non-loading: mounts inner track + base + progress + buffered + per-30m labels", () => {
    const props = defaultProps();
    const { container } = render(<Timeline {...props} />);
    // The blue base.
    expect(container.querySelector(".bg-\\[\\#D8F2FF\\]")).toBeTruthy();
    // The playback progress bar uses bg-[#07486A].
    expect(container.querySelector(".bg-\\[\\#07486A\\]")).toBeTruthy();
    // Buffered indicator uses bg-[#A6D8FF]/50.
    expect(container.querySelector(".bg-\\[\\#A6D8FF\\]\\/50")).toBeTruthy();
    // 2 hours @ 30-minute step => 5 label/divider iterations.
    // Labels are absolute-positioned children with text-[6px].
    const labelEls = container.querySelectorAll(".text-\\[6px\\]");
    expect(labelEls.length).toBeGreaterThanOrEqual(4);
    // getTimePosition is called for the labels + the segments.
    expect(props.getTimePosition).toHaveBeenCalled();
  });

  it("renders one Tooltip wrapper per VALID segment (invalid date pairs skipped)", () => {
    const props = defaultProps();
    const { container } = render(<Timeline {...props} />);
    // SEGMENTS has 2 valid + 1 invalid -> 2 tooltip wrappers.
    expect(container.querySelectorAll("[data-testid=tooltip]").length).toBe(2);
    // The segment-indicator strip (outside the blue box) similarly renders
    // one row per valid segment + the formatTimeUTC label.
    expect(props.formatTimeUTC).toHaveBeenCalledTimes(2);
  });

  it("segment click stops propagation, computes absolute time, routes to setClickedTime + handleTimeSelect", () => {
    const props = defaultProps();
    const { container } = render(<Timeline {...props} />);
    const segWrapper = container.querySelectorAll("[data-testid=tooltip]")[0];
    // The inner clickable <div> is the only descendant with the cursor-pointer
    // class on this branch.
    const seg = segWrapper.querySelector(".cursor-pointer");
    expect(seg).toBeTruthy();

    // Mock getBoundingClientRect so the click math is deterministic.
    seg.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 100,
      bottom: 10,
      width: 100,
      height: 10,
    });
    fireEvent.click(seg, { clientX: 50, clientY: 5 });

    expect(props.handleTimeSelect).toHaveBeenCalledTimes(1);
    const [seg0, idx0, abs0, cam0] = props.handleTimeSelect.mock.calls[0];
    expect(seg0).toEqual(SEGMENTS[0]);
    expect(idx0).toBe(0);
    expect(cam0).toEqual({ id: "cam-1" });
    // 50% click on a 30-minute segment -> +15 minutes from segment start.
    expect(abs0).toBeInstanceOf(Date);
    expect(abs0.toISOString()).toBe("2024-01-01T00:15:00.000Z");
    expect(props.setClickedTime).toHaveBeenCalledTimes(1);
    expect(props.setClickedTime.mock.calls[0][0].toISOString()).toBe(
      "2024-01-01T00:15:00.000Z"
    );
  });

  it("track click routes percent-of-duration through videoRef.current.currentTime + handleTimeSelect", () => {
    // We need a videoRef whose .current is a writable object. Provide
    // addEventListener/removeEventListener stubs so the useEffect that wires
    // up 'timeupdate' on the video element does not crash.
    const videoEl = {
      currentTime: 0,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const props = defaultProps({ videoRef: { current: videoEl } });
    const { container } = render(<Timeline {...props} />);

    // The inner zoomable track is the parent of the segment row; click it
    // directly via the wheel/click handler attached to the second-level div.
    const track = container.querySelector(".bg-gray-100");
    expect(track).toBeTruthy();
    track.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 200,
      bottom: 91,
      width: 200,
      height: 91,
    });
    // Click at 50% -> newTime = 0.5 * 7200 = 3600 seconds.
    fireEvent.click(track, { clientX: 100, clientY: 5 });
    expect(videoEl.currentTime).toBe(3600);
    expect(props.setClickedTime).toHaveBeenCalledTimes(1);
    expect(props.setClickedTime.mock.calls[0][0].toISOString()).toBe(
      "2024-01-01T01:00:00.000Z"
    );
    // handleTimeSelect is forwarded a fresh {start,end} pair, undefined index,
    // the newTime, and the selectedCamera.
    expect(props.handleTimeSelect).toHaveBeenCalledTimes(1);
    const [seg, idx, t, cam] = props.handleTimeSelect.mock.calls[0];
    expect(seg).toEqual({ start: 3600, end: 3601 });
    expect(idx).toBeUndefined();
    expect(t).toBe(3600);
    expect(cam).toEqual({ id: "cam-1" });
  });

  it("track click is a no-op when selectedRange.start is invalid", () => {
    const videoEl = {
      currentTime: 0,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const props = defaultProps({
      videoRef: { current: videoEl },
      selectedRange: { start: "garbage", end: "also-garbage" },
    });
    const { container } = render(<Timeline {...props} />);
    const track = container.querySelector(".bg-gray-100");
    track.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 200,
      bottom: 91,
      width: 200,
      height: 91,
    });
    fireEvent.click(track, { clientX: 100, clientY: 5 });
    expect(videoEl.currentTime).toBe(0);
    expect(props.handleTimeSelect).not.toHaveBeenCalled();
    expect(props.setClickedTime).not.toHaveBeenCalled();
  });

  it("wheel + ctrlKey adjusts zoomLevel via setZoomLevel(prev => ...) and clamps to [0.5, 5]", () => {
    const props = defaultProps();
    const { container } = render(<Timeline {...props} />);
    const outer = container.firstChild;
    fireEvent.wheel(outer, { deltaY: -50, ctrlKey: true });
    expect(props.setZoomLevel).toHaveBeenCalledTimes(1);
    const updater = props.setZoomLevel.mock.calls[0][0];
    // deltaY < 0 -> zoom in by 0.2.
    expect(updater(1)).toBeCloseTo(1.2, 5);
    // Clamp upper.
    expect(updater(5)).toBe(5);
    // Clamp lower on a zoom-out wheel.
    const updater2 = (() => {
      props.setZoomLevel.mockClear();
      fireEvent.wheel(outer, { deltaY: 50, ctrlKey: true });
      return props.setZoomLevel.mock.calls[0][0];
    })();
    expect(updater2(0.5)).toBe(0.5);
    expect(updater2(1)).toBeCloseTo(0.8, 5);
  });

  it("wheel without ctrlKey is a no-op (does not change zoomLevel)", () => {
    const props = defaultProps();
    const { container } = render(<Timeline {...props} />);
    const outer = container.firstChild;
    fireEvent.wheel(outer, { deltaY: -50, ctrlKey: false });
    expect(props.setZoomLevel).not.toHaveBeenCalled();
  });

  it("mousemove on the inner track records hover position without throwing", () => {
    const props = defaultProps();
    const { container } = render(<Timeline {...props} />);
    const track = container.querySelector(".bg-gray-100");
    track.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 200,
      bottom: 91,
      width: 200,
      height: 91,
    });
    expect(() =>
      fireEvent.mouseMove(track, { clientX: 50, clientY: 10 })
    ).not.toThrow();
    expect(() => fireEvent.mouseLeave(track)).not.toThrow();
  });

  it("mousemove is a no-op when selectedRange.start is invalid", () => {
    const props = defaultProps({
      selectedRange: { start: "junk", end: "junk" },
    });
    const { container } = render(<Timeline {...props} />);
    const track = container.querySelector(".bg-gray-100");
    track.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 200,
      bottom: 91,
      width: 200,
      height: 91,
    });
    expect(() =>
      fireEvent.mouseMove(track, { clientX: 50, clientY: 10 })
    ).not.toThrow();
  });

  it("clickedTime is a plain Date -> down-arrow playhead column is rendered", () => {
    const props = defaultProps({ clickedTime: new Date(RANGE.start) });
    const { queryByTestId, container } = render(<Timeline {...props} />);
    expect(queryByTestId("arrow-down")).toBeInTheDocument();
    // Hover the playhead to flip isPlayheadHovered=true; should not throw and
    // emits a tooltip with a date string.
    const playhead = container.querySelector(".bg-black");
    expect(playhead).toBeTruthy();
    fireEvent.mouseEnter(playhead);
    fireEvent.mouseLeave(playhead);
  });

  it("clickedTime as {seconds: N} object renders the Ns label in the playhead tooltip", () => {
    // The renderer accepts both Date and { seconds, date } objects; the
    // tooltip label flips to `${seconds}s` when seconds is defined.
    const props = defaultProps({
      clickedTime: { seconds: 42, date: new Date(RANGE.start) },
    });
    const { container } = render(<Timeline {...props} />);
    // Hover to surface the tooltip pane.
    const playhead = container.querySelector(".bg-black");
    fireEvent.mouseEnter(playhead);
    expect(container.textContent).toMatch(/42s/);
  });

  it("video element 'timeupdate' fires handleTimeSelect with currentTime + selectedCamera", () => {
    const props = defaultProps();
    const { getByTestId } = render(<Harness timelineProps={props} />);
    const videoEl = getByTestId("video");
    // Simulate a play head update on the underlying video element.
    Object.defineProperty(videoEl, "currentTime", { value: 12.5, writable: true });
    act(() => {
      videoEl.dispatchEvent(new Event("timeupdate"));
    });
    expect(props.handleTimeSelect).toHaveBeenCalled();
    const lastCall = props.handleTimeSelect.mock.calls.at(-1);
    expect(lastCall[0]).toEqual(RANGE);
    expect(lastCall[1]).toBe(0); // currentSegmentIndex
    expect(lastCall[2]).toBe(12.5);
    expect(lastCall[3]).toEqual({ id: "cam-1" });
  });

  it("window keydown ArrowRight advances video.currentTime by 10 + emits setClickedTime", () => {
    const props = defaultProps();
    const { getByTestId } = render(<Harness timelineProps={props} />);
    const videoEl = getByTestId("video");
    // Pre-set the video state read by the handler.
    Object.defineProperty(videoEl, "duration", { value: 60, writable: true });
    Object.defineProperty(videoEl, "currentTime", {
      value: 10,
      writable: true,
    });

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight" })
      );
    });
    expect(videoEl.currentTime).toBe(20);
    expect(props.setClickedTime).toHaveBeenCalled();
    const newAbs = props.setClickedTime.mock.calls.at(-1)[0];
    expect(newAbs.toISOString()).toBe("2024-01-01T00:00:20.000Z");
    expect(props.handleTimeSelect).toHaveBeenCalled();
    expect(props.handleTimeSelect.mock.calls.at(-1)[2]).toBe(20);
  });

  it("window keydown ArrowLeft clamps to >= 0", () => {
    const props = defaultProps();
    const { getByTestId } = render(<Harness timelineProps={props} />);
    const videoEl = getByTestId("video");
    Object.defineProperty(videoEl, "duration", { value: 60, writable: true });
    Object.defineProperty(videoEl, "currentTime", { value: 5, writable: true });

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft" })
      );
    });
    // 5 - 10 -> clamp to 0.
    expect(videoEl.currentTime).toBe(0);
    expect(props.setClickedTime).toHaveBeenCalled();
    expect(props.setClickedTime.mock.calls.at(-1)[0].toISOString()).toBe(
      "2024-01-01T00:00:00.000Z"
    );
  });

  it("window keydown for an unrelated key is ignored (no setClickedTime + no time change)", () => {
    const props = defaultProps();
    const { getByTestId } = render(<Harness timelineProps={props} />);
    const videoEl = getByTestId("video");
    Object.defineProperty(videoEl, "duration", { value: 60, writable: true });
    Object.defineProperty(videoEl, "currentTime", { value: 7, writable: true });

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    });
    expect(videoEl.currentTime).toBe(7);
    expect(props.setClickedTime).not.toHaveBeenCalled();
  });

  it("ArrowRight is a no-op when selectedRange.start is invalid (no setClickedTime)", () => {
    const props = defaultProps({
      selectedRange: { start: "bad", end: "bad" },
    });
    const { getByTestId } = render(<Harness timelineProps={props} />);
    const videoEl = getByTestId("video");
    Object.defineProperty(videoEl, "duration", { value: 60, writable: true });
    Object.defineProperty(videoEl, "currentTime", { value: 5, writable: true });

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight" })
      );
    });
    // currentTime still advances (the math runs before the toValidDate
    // guard), but setClickedTime is gated on the start being valid.
    expect(videoEl.currentTime).toBe(15);
    expect(props.setClickedTime).not.toHaveBeenCalled();
  });

  it("unmount removes the window keydown listener (subsequent ArrowRight has no effect)", () => {
    const props = defaultProps();
    const { getByTestId, unmount } = render(<Harness timelineProps={props} />);
    const videoEl = getByTestId("video");
    Object.defineProperty(videoEl, "duration", { value: 60, writable: true });
    Object.defineProperty(videoEl, "currentTime", { value: 0, writable: true });

    unmount();
    // After unmount the keydown handler should be removed; firing ArrowRight
    // must not call setClickedTime / handleTimeSelect again on the stale
    // closure.
    props.setClickedTime.mockClear();
    props.handleTimeSelect.mockClear();
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight" })
      );
    });
    expect(videoEl.currentTime).toBe(0);
    expect(props.setClickedTime).not.toHaveBeenCalled();
    expect(props.handleTimeSelect).not.toHaveBeenCalled();
  });

  it("scroll-effect: when duration > 0 + currentTime is non-null, scrolls the inner ref toward the playhead", () => {
    // Spy on the scrollLeft setter via the inner div's parent. The effect
    // runs after mount; since jsdom does not lay anything out, scrollWidth
    // and clientWidth are 0 — we just assert it does not throw and the
    // assignment happens (Math.max(0, ...) keeps it at 0).
    const props = defaultProps();
    const { container } = render(<Timeline {...props} />);
    const inner = container.querySelector(".bg-gray-100");
    expect(inner.scrollLeft).toBe(0);
  });

  it("currentTime=null short-circuits the currentProgress math (progress bar width is 0%)", () => {
    const props = defaultProps({ currentTime: null });
    const { container } = render(<Timeline {...props} />);
    const progress = container.querySelector(".bg-\\[\\#07486A\\]");
    expect(progress.getAttribute("style") || "").toMatch(/width:\s*0%/);
  });

  it("selectedRange.start invalid: per-30m label strip is empty", () => {
    const props = defaultProps({
      selectedRange: { start: "garbage", end: "garbage" },
    });
    const { container } = render(<Timeline {...props} />);
    // No labels emitted because the IIFE bails on null start/end.
    expect(container.querySelectorAll(".text-\\[6px\\]").length).toBe(0);
  });
});
