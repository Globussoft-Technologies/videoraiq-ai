/**
 * Gap-fills for src/page/user/Streams/CameraStreamsModal/CameraStreamWithDetection.jsx
 *
 * Branch coverage gaps:
 *   - line 33: detectionSetting / settings / referencePoints all missing -> [] fallback
 *   - lines 51-52: personPresent !== true -> red palette branch
 *   - line 63: window.devicePixelRatio undefined -> 1 fallback
 *   - line 92: useEffect early-return when videoRef.current is null
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";

import CameraStreamWithDetection from "../../../../../../src/page/user/Streams/CameraStreamsModal/CameraStreamWithDetection.jsx";

let observerInstances = [];

class MockResizeObserver {
  constructor(cb) {
    this.cb = cb;
    this.observed = [];
    this.disconnected = false;
    observerInstances.push(this);
  }
  observe(t) {
    this.observed.push(t);
  }
  disconnect() {
    this.disconnected = true;
  }
}

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
  getContextSpy = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(ctxSpy);
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
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
  delete HTMLCanvasElement.prototype.clientWidth;
  delete HTMLCanvasElement.prototype.clientHeight;
  getContextSpy.mockRestore();
  vi.unstubAllGlobals();
});

function makeVideoRef(opts = {}) {
  const listeners = {};
  return {
    current: {
      clientWidth: opts.clientWidth ?? 200,
      clientHeight: opts.clientHeight ?? 100,
      videoWidth: opts.videoWidth ?? 400,
      videoHeight: opts.videoHeight ?? 200,
      addEventListener: vi.fn((ev, cb) => {
        listeners[ev] = cb;
      }),
      removeEventListener: vi.fn((ev) => {
        delete listeners[ev];
      }),
      __listeners: listeners,
    },
  };
}

describe("CameraStreamWithDetection branch gap-fills", () => {
  it("skips detection when referencePoints map missing for cameraId (line 33 fallback)", () => {
    const videoRef = makeVideoRef();
    // detection has no detectionSetting -> referencePoints?.[id] returns
    // undefined, falls back to [], length 0 -> skip.
    const detections = [{ cameraId: "cam-3", personPresent: true }];

    render(<CameraStreamWithDetection videoRef={videoRef} detections={detections} />);

    // No polygon path methods called.
    expect(ctxSpy.beginPath).not.toHaveBeenCalled();
    expect(ctxSpy.stroke).not.toHaveBeenCalled();
    expect(ctxSpy.fill).not.toHaveBeenCalled();
  });

  it("uses the red palette when personPresent is not true (lines 51-52)", () => {
    const videoRef = makeVideoRef();
    const detections = [
      {
        cameraId: "cam-1",
        personPresent: false, // -> red palette
        detectionSetting: {
          settings: {
            referencePoints: {
              "cam-1": [[0, 0], [10, 0], [10, 10]],
            },
          },
        },
      },
    ];

    render(<CameraStreamWithDetection videoRef={videoRef} detections={detections} />);

    expect(ctxSpy.strokeStyle).toBe("#ef4444");
    expect(ctxSpy.fillStyle).toBe("rgba(239, 68, 68, 0.1)");
    expect(ctxSpy.beginPath).toHaveBeenCalled();
    expect(ctxSpy.stroke).toHaveBeenCalled();
    expect(ctxSpy.fill).toHaveBeenCalled();
  });

  it("falls back to dpr=1 when window.devicePixelRatio is unset (line 63)", () => {
    // Force devicePixelRatio to undefined for this test.
    vi.stubGlobal("devicePixelRatio", undefined);
    const videoRef = makeVideoRef();

    const { container } = render(
      <CameraStreamWithDetection videoRef={videoRef} detections={[]} />
    );

    const canvas = container.querySelector("canvas");
    // dpr falls back to 1 -> canvas.width = clientWidth * 1 = 200.
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(100);
    expect(ctxSpy.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
  });

  it("second useEffect early-returns when videoRef.current is null (line 92)", () => {
    // We need the FIRST effect to also bail (it does — line 9 returns when
    // !video). Then the playing-listener effect should not register any
    // listener. Use a ref with current=null.
    const videoRef = { current: null };

    // Spy on addEventListener at the window level — we expect the playing
    // listener wiring to NOT occur on the video element (it's null).
    const { container, unmount } = render(
      <CameraStreamWithDetection videoRef={videoRef} detections={[]} />
    );

    // Canvas still renders (the JSX is unconditional).
    expect(container.querySelector("canvas")).not.toBeNull();

    // Unmount must not throw even though no listeners were registered.
    expect(() => unmount()).not.toThrow();
  });

  it("non-array detections (singular object) is wrapped into an array and drawn (line 22 else branch)", () => {
    const videoRef = makeVideoRef();
    const detection = {
      cameraId: "cam-1",
      personPresent: true,
      detectionSetting: {
        settings: {
          referencePoints: {
            "cam-1": [[0, 0], [10, 0], [10, 10]],
          },
        },
      },
    };

    render(<CameraStreamWithDetection videoRef={videoRef} detections={detection} />);

    // The Array.isArray check fails -> wrap in [detection]. Draw should
    // proceed for the singular detection.
    expect(ctxSpy.beginPath).toHaveBeenCalledTimes(1);
    expect(ctxSpy.stroke).toHaveBeenCalledTimes(1);
  });

  it("falsy videoWidth -> falls back to clientWidth (line 23-24 || branch)", () => {
    // videoWidth = 0 -> scaleX = displayWidth / clientWidth.
    const videoRef = makeVideoRef({
      videoWidth: 0,
      videoHeight: 0,
      clientWidth: 100,
      clientHeight: 50,
    });
    const detections = [
      {
        cameraId: "cam-1",
        personPresent: true,
        detectionSetting: {
          settings: {
            referencePoints: { "cam-1": [[50, 25]] },
          },
        },
      },
    ];

    render(<CameraStreamWithDetection videoRef={videoRef} detections={detections} />);

    // scaleX = 200/100 = 2, scaleY = 100/50 = 2 -> [50*2, 25*2] = [100, 50]
    expect(ctxSpy.moveTo).toHaveBeenCalledWith(100, 50);
  });
});
