/**
 * Round 57 — cover src/page/user/Streams/CameraStreamsModal/CameraCanvasModal.jsx.
 *
 * CameraCanvasModal is the inner video-canvas the StreamModal renders when
 * a user maximises a camera tile. Behaviour we pin here:
 *
 *   - Initial render shows the loading overlay (the spinner div). When the
 *     video fires `onCanPlay`, the spinner is removed and `onPlaying`
 *     reinforces that. If the useHlsPlayer hook calls its `onError`
 *     callback, the loader is replaced by an "Unable to load stream"
 *     error pane that surfaces the message and the spinner is gone.
 *   - The Minimize close button only appears when `!isInModal` and clicking
 *     it invokes `onClose`. The "Reset" button is gated on `scale > 1`;
 *     it is not present on the initial scale=1 render.
 *   - The wheel handler bumps the inline scale transform on the video
 *     element (zoom in) and the Reset button appears post-zoom; clicking
 *     it restores translate(0px, 0px) scale(1).
 *   - The zoom-hint chip is on the screen for the first three seconds
 *     then disappears (covered via fake timers).
 *
 * No product code touched. Mocks: 2 (the useHlsPlayer hook so we can drive
 * its onError callback synchronously, and the CameraStreamWithDetection
 * child so we don't pull in canvas-2d drawing into the test graph).
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

// --- Mocks ----------------------------------------------------------------

// Capture the most recent onError handler so a test can fire the hook's
// error path on demand. The hook itself is a no-op for the component
// under test (it would otherwise try to instantiate Hls.js against a
// jsdom <video>).
let lastHlsOnError = null;
vi.mock("@/hooks/useHlsPlayer", () => ({
  default: (_videoRef, _src, opts = {}) => {
    lastHlsOnError = opts.onError || null;
    return { current: null };
  },
}));

// Replace the detection-overlay child with a tiny marker so we don't have
// to mock canvas getContext('2d').
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

describe("Streams/CameraStreamsModal/CameraCanvasModal", () => {
  it("renders the loading overlay initially, hides it on video onCanPlay, and surfaces the hook's onError pane on error", () => {
    const onClose = vi.fn();
    const { container } = render(
      <CameraCanvasModal
        selectedVideo={{ cameraId: "cam-1" }}
        cameraId="cam-1"
        src="https://example.test/stream.m3u8"
        detections={[]}
        onClose={onClose}
      />
    );

    // Loading spinner is in the DOM on first render.
    expect(container.querySelector(".loader")).not.toBeNull();
    // Error pane is not.
    expect(screen.queryByText(/Unable to load stream/i)).not.toBeInTheDocument();

    // Detection overlay child rendered with detections=[].
    const overlay = screen.getByTestId("detection-overlay");
    expect(overlay.getAttribute("data-count")).toBe("0");

    // Fire the <video onCanPlay> handler -> loader removed, no error.
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    fireEvent.canPlay(video);
    expect(container.querySelector(".loader")).toBeNull();
    expect(screen.queryByText(/Unable to load stream/i)).not.toBeInTheDocument();

    // The hook captured an onError callback we can drive directly.
    expect(typeof lastHlsOnError).toBe("function");
    act(() => {
      lastHlsOnError("Stream not found (404)");
    });
    // Loader is gone, error pane present, custom message surfaced.
    expect(container.querySelector(".loader")).toBeNull();
    expect(screen.getByText(/Unable to load stream/i)).toBeInTheDocument();
    expect(screen.getByText("Stream not found (404)")).toBeInTheDocument();

    // Reset button is NOT in the DOM at scale=1.
    expect(screen.queryByRole("button", { name: /Reset/ })).not.toBeInTheDocument();

    // Close button (Minimize2) is rendered because isInModal defaults to
    // false; clicking it invokes onClose.
    const closeBtn = container.querySelector("button");
    expect(closeBtn).not.toBeNull();
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("wheel-zoom raises scale (and reveals a Reset button that restores scale=1); hides zoom hint after 3s", async () => {
    vi.useFakeTimers();
    try {
      const { container } = render(
        <CameraCanvasModal
          selectedVideo={{ cameraId: "cam-1" }}
          cameraId="cam-1"
          src="https://example.test/stream.m3u8"
          detections={[]}
          onClose={vi.fn()}
          isInModal={true}
        />
      );

      // isInModal=true -> no Minimize close button rendered.
      // Initial scale = 1: video transform reflects translate(0,0) scale(1).
      const video = container.querySelector("video");
      expect(video).not.toBeNull();
      expect(video.getAttribute("style") || "").toMatch(
        /translate\(0px,\s*0px\)\s*scale\(1\)/
      );

      // Zoom-hint chip is initially visible.
      expect(screen.getByText(/zoom & drag/i)).toBeInTheDocument();

      // Fire a wheel zoom-in event on the outer container. deltaY<0 means
      // wheel-up -> zoom in by 0.15 -> scale becomes ~1.15.
      const wrapper = container.firstChild; // the outer ref=containerRef div
      fireEvent.wheel(wrapper, { deltaY: -100 });
      // Style transform now uses scale(1.15).
      expect(video.getAttribute("style") || "").toMatch(/scale\(1\.15\)/);

      // Reset button appears once scale > 1.
      const resetBtn = screen.getByRole("button", { name: /Reset/ });
      expect(resetBtn).toBeInTheDocument();

      // Clicking Reset puts us back to scale(1) and removes the Reset btn.
      fireEvent.click(resetBtn);
      expect(video.getAttribute("style") || "").toMatch(
        /translate\(0px,\s*0px\)\s*scale\(1\)/
      );
      expect(screen.queryByRole("button", { name: /Reset/ })).not.toBeInTheDocument();

      // Advance fake timers past 3s -> the zoom hint setTimeout fires and
      // showZoomHint becomes false.
      act(() => {
        vi.advanceTimersByTime(3100);
      });
      expect(screen.queryByText(/zoom & drag/i)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
