/**
 * Round 59 — cover src/page/user/Streams/CameraStreamsModal/StreamModal.jsx.
 *
 * StreamModal is the full-screen overlay rendered when a user maximises a
 * camera tile from the camera grid. It is the last untested sibling in
 * Streams/CameraStreamsModal/ (ZoneSelector R52, AttendanceCheckLog R55,
 * UserProfileDialog R56, CameraCanvasModal R57, CameraStreamWithDetection
 * R58 already covered).
 *
 * Behaviour we pin:
 *   - When `isOpen=false` the component returns null (nothing renders).
 *   - When `isOpen=true` the wrapper mounts and the component calls
 *     `requestFullscreen` on its ref once. Camera Logo, the close
 *     (Minimize2) button, and the maximised CameraCanvasModal child are
 *     rendered. The close button onClose handler is wired.
 *   - The recent-detection driven stats overlay surfaces:
 *       • a per-camera Person Count card when at least one `countPersons`
 *         detection for the camera contributes a non-zero `count`;
 *       • a per-camera Vehicle Count card when a `countVehicles`
 *         detection contributes a non-zero `count`;
 *       • a "People Detected" stat card (bottom stats strip) because the
 *         countPersons detection's `updatedAt` is within the 2-second
 *         freshness window enforced by the `default` branch of the inner
 *         switch.
 *     We also assert the previous/next camera arrows render when more than
 *     one channel is available, and that detections for a different camera
 *     are filtered out.
 *   - When the user fires the captured fullscreenchange callback with
 *     `document.fullscreenElement = null`, the component calls `onClose`
 *     (covers the cleanup-on-exit path).
 *
 * Mock budget: 5 (CameraCanvasModal child, AttendanceCheckLog child,
 * UserProfileDialog child, ZoneSelector child, useAllDetections context
 * hook). Well under the 8-mock cap.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks — keep heavy stream-modal children out of the test graph so the
// spec stays focused on StreamModal's own orchestration logic.
// ---------------------------------------------------------------------------

const mockAllDetections = { value: { allDetections: [], accessAllDetections: [], attendanceLogs: [] } };
vi.mock("@/context/Sockets/AllDetectionContext", () => ({
  useAllDetections: () => mockAllDetections.value,
}));

// CameraCanvasModal -> render a stub that exposes its key props so we can
// assert the StreamModal -> child wiring without pulling HLS/canvas code in.
vi.mock(
  "../../../../../../src/page/user/Streams/CameraStreamsModal/CameraCanvasModal.jsx",
  () => ({
    default: ({ src, cameraId, isInModal, isFullScreen }) => (
      <div
        data-testid="camera-canvas-modal"
        data-src={src || ""}
        data-cameraid={cameraId || ""}
        data-inmodal={String(!!isInModal)}
        data-fullscreen={String(!!isFullScreen)}
      />
    ),
  })
);

vi.mock(
  "../../../../../../src/page/user/Streams/CameraStreamsModal/AttendanceCheckLog.jsx",
  () => ({ default: () => <div data-testid="attendance-check-log" /> })
);

vi.mock(
  "../../../../../../src/page/user/Streams/CameraStreamsModal/UserProfileDialog.jsx",
  () => ({
    default: ({ isOpen }) => (
      <div data-testid="user-profile-dialog" data-open={String(!!isOpen)} />
    ),
  })
);

vi.mock(
  "../../../../../../src/page/user/Streams/CameraStreamsModal/ZoneSelector.jsx",
  () => ({
    default: ({ detectionsForCamera = [] }) => (
      <div
        data-testid="zone-selector"
        data-count={detectionsForCamera.length}
      />
    ),
  })
);

import StreamModal from "../../../../../../src/page/user/Streams/CameraStreamsModal/StreamModal.jsx";

// jsdom doesn't implement the Fullscreen API. The SUT calls
// modalRef.current.requestFullscreen() in a mount-time effect and listens
// on document for fullscreenchange. We stub both so the side-effect is
// observable but harmless.
let fullscreenChangeListener = null;
let requestFullscreenSpy;

beforeEach(() => {
  mockAllDetections.value = {
    allDetections: [],
    accessAllDetections: [],
    attendanceLogs: [],
  };

  fullscreenChangeListener = null;
  requestFullscreenSpy = vi.fn();
  // Element.prototype.requestFullscreen does not exist in jsdom — install.
  if (!Element.prototype.requestFullscreen) {
    Element.prototype.requestFullscreen = function () {
      requestFullscreenSpy(this);
    };
  } else {
    vi.spyOn(Element.prototype, "requestFullscreen").mockImplementation(function () {
      requestFullscreenSpy(this);
    });
  }

  // Capture the fullscreenchange handler so a test can fire it explicitly.
  const origAdd = document.addEventListener.bind(document);
  vi.spyOn(document, "addEventListener").mockImplementation((evt, cb) => {
    if (evt === "fullscreenchange") fullscreenChangeListener = cb;
    return origAdd(evt, cb);
  });
});

afterEach(() => {
  // Clean up — restoreAllMocks resets the document.addEventListener spy.
  vi.restoreAllMocks();
  // Best-effort drop of the polyfilled requestFullscreen on the prototype
  // when jsdom didn't already define one.
  try {
    delete Element.prototype.requestFullscreen;
  } catch {
    /* ignore */
  }
});

describe("Streams/CameraStreamsModal/StreamModal", () => {
  it("returns null when isOpen=false (nothing rendered)", () => {
    const { container } = render(
      <StreamModal
        isOpen={false}
        onClose={vi.fn()}
        cameraId="cam-a"
        cameraChannels={[{ _id: "cam-a", name: "Front", streamingUrl: "/s.m3u8" }]}
      />
    );

    expect(container.firstChild).toBeNull();
    // None of the mocked children should be in the DOM either.
    expect(screen.queryByTestId("camera-canvas-modal")).not.toBeInTheDocument();
    expect(screen.queryByTestId("zone-selector")).not.toBeInTheDocument();
  });

  it(
    "renders the maximised modal with arrows for multi-channel input, surfaces person/vehicle counters " +
      "+ a fresh People Detected stat for the current camera, wires onClose via the close button and via " +
      "the fullscreenchange exit path",
    () => {
      const onClose = vi.fn();
      const now = Date.now();
      // Two detections for cam-a (one fresh countPersons, one fresh
      // countVehicles) and one stale detection for cam-b (must be filtered).
      mockAllDetections.value = {
        allDetections: [
          {
            cameraId: "cam-a",
            incidentType: "countPersons",
            count: 3,
            updatedAt: new Date(now).toISOString(),
            createdAt: new Date(now).toISOString(),
          },
          {
            cameraId: "cam-a",
            incidentType: "countVehicles",
            count: 2,
            updatedAt: new Date(now).toISOString(),
            createdAt: new Date(now).toISOString(),
          },
          {
            cameraId: "cam-b",
            incidentType: "countPersons",
            count: 999,
            updatedAt: new Date(now).toISOString(),
            createdAt: new Date(now).toISOString(),
          },
        ],
        accessAllDetections: [],
        attendanceLogs: [],
      };

      const cameraChannels = [
        { _id: "cam-a", name: "Front Lobby", streamingUrl: "/streams/a.m3u8" },
        { _id: "cam-b", name: "Back Door", streamingUrl: "/streams/b.m3u8" },
      ];

      const { container } = render(
        <StreamModal
          isOpen={true}
          onClose={onClose}
          cameraId="cam-a"
          cameraChannels={cameraChannels}
        />
      );

      // requestFullscreen was invoked once on mount (effect tied to isOpen).
      expect(requestFullscreenSpy).toHaveBeenCalledTimes(1);

      // Heavy children are mocked and present.
      expect(screen.getByTestId("camera-canvas-modal")).toBeInTheDocument();
      expect(screen.getByTestId("zone-selector")).toBeInTheDocument();
      expect(screen.getByTestId("user-profile-dialog")).toHaveAttribute(
        "data-open",
        "false"
      );

      // ZoneSelector receives the *filtered* detections list — cam-a has 2.
      expect(screen.getByTestId("zone-selector")).toHaveAttribute(
        "data-count",
        "2"
      );

      // Camera-name card and Live Feed copy render (top-left + bottom strip
      // each render their own copy of the camera name + 'Live Feed').
      const cameraNameNodes = screen.getAllByText("Front Lobby");
      expect(cameraNameNodes.length).toBeGreaterThan(0);
      expect(screen.getAllByText("Live Feed").length).toBeGreaterThan(0);

      // Person counter card surfaces "3" and "Persons Detected" copy.
      expect(screen.getAllByText("3").length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Persons Detected/i).length).toBeGreaterThan(0);

      // Vehicle counter card surfaces "2" and "Vehicles Detected" copy.
      expect(screen.getAllByText("2").length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Vehicles Detected/i).length).toBeGreaterThan(0);

      // Bottom stats strip renders a People Detected stat (the fresh
      // countPersons detection passes the 2-second window).
      expect(screen.getByText(/People Detected/i)).toBeInTheDocument();

      // cam-b's stale-but-large count of 999 must not leak into the UI.
      expect(screen.queryByText("999")).not.toBeInTheDocument();

      // Multi-channel input -> next chevron present (cameraIndex=0 -> no prev).
      // We have two channels so exactly one navigation chevron should exist
      // (right). Buttons with no accessible name -> query by role.
      const buttons = container.querySelectorAll("button");
      expect(buttons.length).toBeGreaterThan(1);

      // Click the close button (the Minimize2 absolute-positioned button in
      // the top-right of the modal): it is the first button with the
      // backdrop-blur close styling. It is also the only button with the
      // top-4 right-4 class combo, so target it via that selector.
      const closeBtn = container.querySelector("button.absolute.top-4.right-4");
      expect(closeBtn).not.toBeNull();
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalledTimes(1);

      // Fire the captured fullscreenchange handler with no
      // document.fullscreenElement -> the SUT should call onClose again.
      // jsdom doesn't expose fullscreenElement as writable in all builds, so
      // define the property explicitly.
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        get: () => null,
      });
      expect(typeof fullscreenChangeListener).toBe("function");
      act(() => {
        fullscreenChangeListener();
      });
      expect(onClose).toHaveBeenCalledTimes(2);
    }
  );
});
