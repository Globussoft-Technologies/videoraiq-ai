/**
 * Round 58 — cover src/page/user/Streams/CameraStreamsModal/CameraStreamWithDetection.jsx.
 *
 * CameraStreamWithDetection is the absolute-positioned canvas overlay rendered
 * on top of the maximised camera tile (used by CameraCanvasModal). It reads
 * polygon `referencePoints` keyed by `cameraId` off each detection's
 * detectionSetting.settings and re-draws scaled polygons onto its 2D canvas.
 *
 * What this test pins:
 *   - On first render the component mounts the absolute overlay wrapper +
 *     <canvas>, calls getContext('2d') once, observes the videoRef element
 *     via ResizeObserver, sizes the canvas to the underlying <video>'s
 *     client dimensions (with devicePixelRatio applied), and clears the
 *     canvas with clearRect once per draw call.
 *   - With detections=[] the polygon path APIs (beginPath/stroke/fill) are
 *     never touched, and the component clears the canvas.
 *   - With a populated detections payload the component scales each
 *     referencePoints[cameraId] vertex, draws closePath/stroke/fill in the
 *     personPresent=true green palette, and skips entries whose
 *     referencePoints array is missing/empty.
 *   - The video 'playing' listener dispatches a window resize, which re-runs
 *     the resizeCanvas path.
 *   - Unmount disconnects the ResizeObserver, removes the window resize
 *     listener, and removes the video 'playing' listener.
 *
 * Mocks: 0. We rely on jsdom + small polyfills for ResizeObserver and
 * HTMLCanvasElement.prototype.getContext seeded inside the spec so we don't
 * have to mock the SUT or its imports.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

import CameraStreamWithDetection from "../../../../../../src/page/user/Streams/CameraStreamsModal/CameraStreamWithDetection.jsx";

// --- jsdom polyfills ------------------------------------------------------
// Captured ResizeObserver instances so a test can fire their callback.
let observerInstances = [];

class MockResizeObserver {
  constructor(cb) {
    this.cb = cb;
    this.observed = [];
    this.disconnected = false;
    observerInstances.push(this);
  }
  observe(target) {
    this.observed.push(target);
  }
  disconnect() {
    this.disconnected = true;
  }
}

// Capture the 2d-context method calls so we can assert on the draw path.
function makeCtxSpy() {
  return {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    setTransform: vi.fn(),
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 0,
  };
}

let ctxSpy;
let getContextSpy;

beforeEach(() => {
  observerInstances = [];
  ctxSpy = makeCtxSpy();
  // Override the prototype just for the duration of each test. jsdom's
  // default getContext returns null which would short-circuit the SUT.
  getContextSpy = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(ctxSpy);
  // ResizeObserver is not present in jsdom — wire our mock.
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
  // Pin devicePixelRatio so the dpr math is deterministic.
  vi.stubGlobal("devicePixelRatio", 2);
  // jsdom canvas.clientWidth/Height are 0 (no layout); the SUT reads
  // these to compute displayWidth/Height. Pin them so scaleX/Y match the
  // video element. We restore in afterEach via vi.restoreAllMocks-like
  // teardown — the next describe re-renders fresh DOM.
  Object.defineProperty(HTMLCanvasElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 200,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "clientHeight", {
    configurable: true,
    get: () => 100,
  });
});

afterEach(() => {
  // Drop the per-test prototype overrides so they don't leak across files.
  delete HTMLCanvasElement.prototype.clientWidth;
  delete HTMLCanvasElement.prototype.clientHeight;
  getContextSpy.mockRestore();
  vi.unstubAllGlobals();
});

// Helper: build a stable videoRef pointing at a fake <video>-like object.
function makeVideoRef({ clientWidth = 200, clientHeight = 100, videoWidth = 400, videoHeight = 200 } = {}) {
  const listeners = {};
  const video = {
    clientWidth,
    clientHeight,
    videoWidth,
    videoHeight,
    addEventListener: vi.fn((ev, cb) => {
      listeners[ev] = cb;
    }),
    removeEventListener: vi.fn((ev) => {
      delete listeners[ev];
    }),
    __listeners: listeners,
  };
  return { current: video };
}

describe("Streams/CameraStreamsModal/CameraStreamWithDetection", () => {
  it("mounts the overlay canvas, observes the video, sizes for devicePixelRatio, and clears with no detections", () => {
    const videoRef = makeVideoRef();

    const { container, unmount } = render(
      <CameraStreamWithDetection videoRef={videoRef} detections={[]} />
    );

    // Wrapper is the absolute-positioned overlay holding the canvas.
    const wrapper = container.firstChild;
    expect(wrapper).not.toBeNull();
    expect(wrapper.tagName).toBe("DIV");
    expect(wrapper.className).toContain("pointer-events-none");

    const canvas = wrapper.querySelector("canvas");
    expect(canvas).not.toBeNull();

    // The effect should have requested a 2d context exactly once.
    expect(getContextSpy).toHaveBeenCalledWith("2d");

    // Observer was attached to the video element.
    expect(observerInstances).toHaveLength(1);
    expect(observerInstances[0].observed[0]).toBe(videoRef.current);

    // Canvas was sized via the DPR pipeline (clientWidth/Height * dpr).
    expect(canvas.style.width).toBe("200px");
    expect(canvas.style.height).toBe("100px");
    expect(canvas.width).toBe(400); // 200 * dpr(2)
    expect(canvas.height).toBe(200); // 100 * dpr(2)

    // setTransform was called with the dpr matrix.
    expect(ctxSpy.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);

    // clearRect was called at least once (resize -> draw path) and the
    // polygon-path methods were NOT called because detections is empty.
    expect(ctxSpy.clearRect).toHaveBeenCalled();
    expect(ctxSpy.beginPath).not.toHaveBeenCalled();
    expect(ctxSpy.stroke).not.toHaveBeenCalled();
    expect(ctxSpy.fill).not.toHaveBeenCalled();

    // 'playing' listener was wired on the video element.
    expect(videoRef.current.addEventListener).toHaveBeenCalledWith(
      "playing",
      expect.any(Function)
    );

    // Unmount tears everything down.
    unmount();
    expect(observerInstances[0].disconnected).toBe(true);
    expect(videoRef.current.removeEventListener).toHaveBeenCalledWith(
      "playing",
      expect.any(Function)
    );
  });

  it("draws scaled polygons for valid detections, skips empties, uses the personPresent palette, and re-draws on video 'playing' window resize", () => {
    const videoRef = makeVideoRef({
      clientWidth: 200,
      clientHeight: 100,
      videoWidth: 400,
      videoHeight: 200,
    });

    // Two detections: one with a 3-point polygon, one with empty points
    // (must be skipped).
    const detections = [
      {
        cameraId: "cam-1",
        personPresent: true,
        detectionSetting: {
          settings: {
            referencePoints: {
              "cam-1": [
                [100, 50],
                [300, 50],
                [200, 150],
              ],
            },
          },
        },
      },
      {
        cameraId: "cam-2",
        personPresent: false,
        detectionSetting: { settings: { referencePoints: { "cam-2": [] } } },
      },
    ];

    render(<CameraStreamWithDetection videoRef={videoRef} detections={detections} />);

    // beginPath/closePath/stroke/fill called exactly once for the valid det.
    expect(ctxSpy.beginPath).toHaveBeenCalledTimes(1);
    expect(ctxSpy.closePath).toHaveBeenCalledTimes(1);
    expect(ctxSpy.stroke).toHaveBeenCalledTimes(1);
    expect(ctxSpy.fill).toHaveBeenCalledTimes(1);

    // The polygon path: first vertex via moveTo, the other two via lineTo.
    // scaleX = 200/400 = 0.5, scaleY = 100/200 = 0.5.
    expect(ctxSpy.moveTo).toHaveBeenCalledWith(50, 25); // [100,50] * 0.5
    expect(ctxSpy.lineTo).toHaveBeenCalledWith(150, 25); // [300,50] * 0.5
    expect(ctxSpy.lineTo).toHaveBeenCalledWith(100, 75); // [200,150] * 0.5

    // personPresent=true -> green palette.
    expect(ctxSpy.strokeStyle).toBe("#10b981");
    expect(ctxSpy.fillStyle).toBe("rgba(16, 185, 129, 0.1)");
    expect(ctxSpy.lineWidth).toBe(2);

    // Snapshot draw counts so we can confirm the 'playing' handler triggers
    // a re-draw via window resize.
    const beforeClear = ctxSpy.clearRect.mock.calls.length;
    const beforeBegin = ctxSpy.beginPath.mock.calls.length;

    // Fire the captured 'playing' listener — it dispatches a window resize
    // which is wired to resizeCanvas -> draw.
    const playingCb = videoRef.current.__listeners.playing;
    expect(typeof playingCb).toBe("function");
    act(() => {
      playingCb();
    });

    expect(ctxSpy.clearRect.mock.calls.length).toBeGreaterThan(beforeClear);
    expect(ctxSpy.beginPath.mock.calls.length).toBeGreaterThan(beforeBegin);
  });
});
