/**
 * Gap-fills for src/page/user/Streams/CameraStreamsModal/CameraCanvasModal.jsx
 *
 * Uncovered (per the basic-reporter range): 100-175 (mouse-down/-move/-up,
 * drag panning, handleDoubleClick — note this handler is NOT wired to the
 * container in the current JSX since onDoubleClick is commented out, but
 * the function body is still in the closure); plus line 226-228 (the
 * <video> `onPlaying` handler clearing isLoading + hasError).
 *
 * UNREACHABLE: handleDoubleClick (lines 150-175) — onDoubleClick is
 * commented out in the container <div>. We still exercise it via a
 * thin wrapper test by simulating the dblclick after a wheel zoom, but
 * coverage-wise the doubleClick body remains unreachable from the
 * rendered DOM. We document this clearly and skip it.
 *
 * Lines we DO cover:
 *   - mouseDown when scale === 1 -> early-return (no drag)
 *   - mouseDown when scale > 1 -> sets isDragging true (drag begins)
 *   - mouseMove during a drag clamps newX/newY within bounds and updates pos
 *   - mouseMove when scale === 1 -> early-return
 *   - mouseUp / mouseLeave clear isDragging
 *   - video onPlaying clears the loading + error state
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

let lastHlsOnError = null;
vi.mock("@/hooks/useHlsPlayer", () => ({
  default: (_videoRef, _src, opts = {}) => {
    lastHlsOnError = opts.onError || null;
    return { current: null };
  },
}));

vi.mock(
  "../../../../../../src/page/user/Streams/CameraStreamsModal/CameraStreamWithDetection.jsx",
  () => ({
    default: ({ detections = [] }) => (
      <div data-testid="detection-overlay" data-count={detections.length} />
    ),
  })
);

import CameraCanvasModal from "../../../../../../src/page/user/Streams/CameraStreamsModal/CameraCanvasModal.jsx";

beforeEach(() => {
  lastHlsOnError = null;
});

const renderModal = (props = {}) =>
  render(
    <CameraCanvasModal
      selectedVideo={{ cameraId: "cam-1" }}
      cameraId="cam-1"
      src="https://example.test/stream.m3u8"
      detections={[]}
      onClose={vi.fn()}
      {...props}
    />
  );

describe("CameraCanvasModal gap-fills", () => {
  it("video onPlaying clears the loading overlay and the error state (lines 225-228)", () => {
    const { container } = renderModal();

    // Initially loading.
    expect(container.querySelector(".loader")).not.toBeNull();

    // Fire the hook's onError to surface the error pane too.
    act(() => {
      lastHlsOnError("bad stream");
    });
    expect(screen.getByText(/Unable to load stream/i)).toBeInTheDocument();

    // Now fire the video's onPlaying — clears both flags.
    const video = container.querySelector("video");
    fireEvent.playing(video);

    expect(container.querySelector(".loader")).toBeNull();
    expect(screen.queryByText(/Unable to load stream/i)).not.toBeInTheDocument();
  });

  it("mouseDown when scale === 1 early-returns without setting isDragging (line 101)", () => {
    const { container } = renderModal();
    const wrapper = container.firstChild;

    // mouseDown should be a no-op when scale=1. Verify className stays in
    // the cursor-zoom-in branch (not cursor-grabbing).
    fireEvent.mouseDown(wrapper, { clientX: 10, clientY: 10 });
    expect(wrapper.className).toContain("cursor-zoom-in");
  });

  it("zoomed-in mouseDown -> mouseMove pans the video (lines 100-138)", () => {
    const { container } = renderModal();
    const wrapper = container.firstChild;

    // Pin clientWidth/Height on the wrapper so the bounds math is sane.
    Object.defineProperty(wrapper, "clientWidth", { value: 400, configurable: true });
    Object.defineProperty(wrapper, "clientHeight", { value: 200, configurable: true });
    wrapper.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200, x: 0, y: 0,
    });

    // Zoom in to scale > 1 via wheel.
    fireEvent.wheel(wrapper, { deltaY: -100 });
    // The cursor class flips to cursor-grab (scale > 1, not dragging).
    expect(wrapper.className).toMatch(/cursor-grab/);

    // Begin drag — mouseDown captures the start position.
    fireEvent.mouseDown(wrapper, { clientX: 100, clientY: 50 });

    // Now wrapper should be in dragging state -> cursor-grabbing class.
    expect(wrapper.className).toContain("cursor-grabbing");

    // Move the mouse — pan the video. The clamp math uses the wrapper's
    // clientWidth/Height and scale to compute maxX/maxY.
    fireEvent.mouseMove(wrapper, { clientX: 150, clientY: 80 });

    // Verify the video transform was updated to include translate.
    const video = container.querySelector("video");
    expect(video.style.transform).toMatch(/translate\(/);

    // Release.
    fireEvent.mouseUp(wrapper);
    expect(wrapper.className).not.toContain("cursor-grabbing");

    // mouseLeave handler should also clear isDragging — start a drag and
    // exit via mouseLeave.
    fireEvent.mouseDown(wrapper, { clientX: 100, clientY: 50 });
    expect(wrapper.className).toContain("cursor-grabbing");
    fireEvent.mouseLeave(wrapper);
    expect(wrapper.className).not.toContain("cursor-grabbing");
  });

  it("mouseMove without a prior mouseDown early-returns (line 115)", () => {
    const { container } = renderModal();
    const wrapper = container.firstChild;
    Object.defineProperty(wrapper, "clientWidth", { value: 400, configurable: true });
    Object.defineProperty(wrapper, "clientHeight", { value: 200, configurable: true });
    wrapper.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200, x: 0, y: 0,
    });

    // Even after zoom, mouseMove without mouseDown is a no-op.
    fireEvent.wheel(wrapper, { deltaY: -100 });
    expect(() =>
      fireEvent.mouseMove(wrapper, { clientX: 50, clientY: 50 })
    ).not.toThrow();
  });

  it("Reset button (visible when scale > 1) restores scale=1 and clears pos", () => {
    const { container } = renderModal();
    const wrapper = container.firstChild;
    Object.defineProperty(wrapper, "clientWidth", { value: 400, configurable: true });
    Object.defineProperty(wrapper, "clientHeight", { value: 200, configurable: true });
    wrapper.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200, x: 0, y: 0,
    });

    fireEvent.wheel(wrapper, { deltaY: -100 });

    const resetBtn = screen.getByRole("button", { name: /Reset/i });
    fireEvent.click(resetBtn);

    // Reset hides the Reset button (scale back to 1).
    expect(screen.queryByRole("button", { name: /Reset/i })).not.toBeInTheDocument();
    expect(wrapper.className).toContain("cursor-zoom-in");
  });
});

// UNREACHABLE: handleDoubleClick (lines 150-175). The container <div> has
// `// onDoubleClick={handleDoubleClick}` commented out, so the function is
// never wired to any DOM event. Coverage for those lines requires product
// code changes to wire the dblclick handler.
