/**
 * src/page/user/Detection/components/StaticAreaMarking.jsx — the static-
 * image fallback variant of the zone-marker, used when the camera live
 * stream is unavailable. Mounts an `<img>` (bundled CounterImg2 asset)
 * plus an absolutely positioned `<canvas>` overlay and forwards an
 * imperative ref API: getPoints / setPoints / clearPoints /
 * captureScreenshot / getResolution / setDrawingMode / setMoveMode.
 *
 * The "Preview" button captures a screenshot via the internal adapterRef,
 * lifts the points + resolution through callMarkPointsApi, and on a 200
 * response routes the returned processed_image into the
 * DetectionPreviewModal → MiniCameraPreview pair. The canvas onClick
 * pushes a new point onto the local points array (scaled to the canvas
 * internal resolution) — but only while the useAreaMarking hook reports
 * `drawingMode === true`.
 *
 * Mocks (7 — under the 8-cap):
 *   1. @/hooks/useAreaMarking — return a controllable bag so we can flip
 *                                drawingMode + assert clear/min/max wiring.
 *   2. @/utils/callMarkPointsApi — hoisted spy for the preview round-trip.
 *   3. ./DetectionPreviewModal — stub that renders children when isOpen.
 *   4. ./MiniCameraPreview — stub exposing processedImage / loading flags.
 *   5. ./zonemarking/AreaMarkingControls — stub that exposes a button per
 *                                            handler so we can poke each.
 *   6. ./DeleteConfirmation — passthrough stub (component imports it
 *                              even though it's only mounted in a flow we
 *                              don't trigger here).
 *   7. asset imports (@/assets/CounterImg2.png, @/assets/Delete.svg) —
 *      vitest serves them as plain strings by default; no mock needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

// ---- hoisted spies -------------------------------------------------------

const areaMarkingRef = vi.hoisted(() => ({
  drawingMode: false,
  moveMode: false,
  handleToggleDrawing: vi.fn(),
  handleDeleteArea: vi.fn(),
  handleMinArea: vi.fn(),
  handleMaxArea: vi.fn(),
  handleSingleLinePlacement: vi.fn(),
  handleEnableEdit: vi.fn(),
}));
vi.mock("@/hooks/useAreaMarking", () => ({
  default: () => areaMarkingRef,
}));

const callMarkPointsApiSpy = vi.hoisted(() => vi.fn());
vi.mock("@/utils/callMarkPointsApi", () => ({
  callMarkPointsApi: callMarkPointsApiSpy,
}));

vi.mock(
  "@/page/user/Detection/components/DetectionPreviewModal",
  () => ({
    default: ({ isOpen, onClose, children }) =>
      isOpen ? (
        <div data-testid="preview-modal">
          <button data-testid="preview-modal-close" onClick={onClose}>x</button>
          {children}
        </div>
      ) : null,
  })
);

vi.mock(
  "@/page/user/Detection/components/MiniCameraPreview",
  () => ({
    default: ({ processedImage, loadingPreviewImg }) => (
      <div
        data-testid="mini-preview"
        data-loading={loadingPreviewImg ? "1" : "0"}
        data-image={processedImage || ""}
      >
        MiniCameraPreview
      </div>
    ),
  })
);

vi.mock(
  "@/page/user/Detection/components/zonemarking/AreaMarkingControls",
  () => ({
    default: (props) => (
      <div data-testid="area-controls">
        <button
          data-testid="ctrl-toggle-drawing"
          onClick={props.handleToggleDrawing}
        >
          toggle
        </button>
        <button
          data-testid="ctrl-delete-area"
          onClick={props.handleDeleteArea}
        >
          delete
        </button>
        <button
          data-testid="ctrl-min-area"
          onClick={props.handleMinArea}
        >
          min
        </button>
        <button
          data-testid="ctrl-max-area"
          onClick={props.handleMaxArea}
        >
          max
        </button>
        <button
          data-testid="ctrl-single-line"
          onClick={props.handleSingleLinePlacement}
        >
          single
        </button>
        <button
          data-testid="ctrl-enable-edit"
          onClick={props.handleEnableEdit}
        >
          edit
        </button>
        <div data-testid="ctrl-drawing-mode">
          {props.drawingMode ? "drawing" : "idle"}
        </div>
      </div>
    ),
  })
);

vi.mock(
  "@/page/user/Detection/components/DeleteConfirmation",
  () => ({
    default: () => <div data-testid="confirm">confirm</div>,
  })
);

// jsdom's canvas getContext is undefined by default — stub a minimal 2d
// context so the draw-on-points effect does not throw. Also stub
// toDataURL for captureScreenshot.
const ctxStub = {
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  stroke: vi.fn(),
  drawImage: vi.fn(),
  strokeStyle: "",
  lineWidth: 0,
};
beforeEach(() => {
  vi.clearAllMocks();
  // Reset hook flags between tests.
  areaMarkingRef.drawingMode = false;
  areaMarkingRef.moveMode = false;
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctxStub);
  HTMLCanvasElement.prototype.toDataURL = vi.fn(
    () => "data:image/jpeg;base64,AAA"
  );
});

const { default: StaticAreaMarking } = await import(
  "../../../../../../src/page/user/Detection/components/StaticAreaMarking.jsx"
);

describe("Detection/components/StaticAreaMarking", () => {
  it(
    "renders the static image + canvas overlay + AreaMarkingControls and does NOT pop the preview modal on first mount",
    () => {
      render(<StaticAreaMarking />);

      // The bundled image is rendered.
      const img = document.querySelector("img[alt='Static image for zone marking']");
      expect(img).toBeTruthy();

      // The canvas is mounted at the documented 1280x720 internal resolution.
      const canvas = document.querySelector("canvas");
      expect(canvas).toBeTruthy();
      expect(canvas.getAttribute("width")).toBe("1280");
      expect(canvas.getAttribute("height")).toBe("720");

      // Controls are wired in.
      expect(screen.getByTestId("area-controls")).toBeInTheDocument();

      // No preview modal until the Preview button is clicked.
      expect(screen.queryByTestId("preview-modal")).toBeNull();
      expect(screen.queryByTestId("mini-preview")).toBeNull();
    }
  );

  it(
    "exposes the AreaMarkingControls callback bag — clicking each forwarded button invokes the matching useAreaMarking handler",
    () => {
      render(<StaticAreaMarking />);

      fireEvent.click(screen.getByTestId("ctrl-toggle-drawing"));
      expect(areaMarkingRef.handleToggleDrawing).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTestId("ctrl-delete-area"));
      expect(areaMarkingRef.handleDeleteArea).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTestId("ctrl-min-area"));
      expect(areaMarkingRef.handleMinArea).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTestId("ctrl-max-area"));
      expect(areaMarkingRef.handleMaxArea).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTestId("ctrl-single-line"));
      expect(areaMarkingRef.handleSingleLinePlacement).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTestId("ctrl-enable-edit"));
      expect(areaMarkingRef.handleEnableEdit).toHaveBeenCalledTimes(1);
    }
  );

  it(
    "clicking the Preview button captures the canvas, calls callMarkPointsApi, and routes the returned processed_image into MiniCameraPreview through DetectionPreviewModal",
    async () => {
      callMarkPointsApiSpy.mockResolvedValue({
        status: 200,
        data: { processed_image: "data:image/jpeg;base64,RESULT" },
      });

      render(<StaticAreaMarking />);

      // The Preview button is the only visible button with that label.
      const previewBtn = screen.getByRole("button", { name: /Preview/i });
      await act(async () => {
        fireEvent.click(previewBtn);
      });

      // The mark-points API was called with the toDataURL-stripped base64
      // payload, the documented [1280, 720] fallback resolution, and the
      // initial empty points array.
      await waitFor(() =>
        expect(callMarkPointsApiSpy).toHaveBeenCalledTimes(1)
      );
      const [base64, resolution, pointsArg] = callMarkPointsApiSpy.mock.calls[0];
      expect(base64).toBe("AAA"); // stripped "data:image/jpeg;base64," prefix
      expect(resolution).toEqual([1280, 720]);
      expect(Array.isArray(pointsArg)).toBe(true);

      // The DetectionPreviewModal popped open and MiniCameraPreview now
      // receives the processed image from the API response.
      const preview = await screen.findByTestId("mini-preview");
      expect(preview).toHaveAttribute(
        "data-image",
        "data:image/jpeg;base64,RESULT"
      );
      // After the API resolves the loading flag is back to 0.
      expect(preview).toHaveAttribute("data-loading", "0");
    }
  );

  it(
    "canvas onClick is a no-op while useAreaMarking.drawingMode is false (no setPoints-driven re-render, so the draw-effect does not re-fire)",
    async () => {
      // useAreaMarking is consulted on the first (and only) render — keep
      // drawingMode=false so the click handler hits the no-op arm.
      render(<StaticAreaMarking />);
      const canvas = document.querySelector("canvas");
      expect(canvas).toBeTruthy();

      // jsdom returns 0-sized rects by default; stub a 100x100 bounding
      // box so the click coordinates have a defined scale ratio.
      canvas.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        right: 100,
        bottom: 100,
        x: 0,
        y: 0,
      });

      // Clear the draw-on-points effect counter from the mount render.
      ctxStub.clearRect.mockClear();

      // No-drawing click → setPoints is never invoked, so the points-
      // effect does not re-run and clearRect stays uncalled.
      fireEvent.click(canvas, { clientX: 10, clientY: 10 });
      expect(ctxStub.clearRect).not.toHaveBeenCalled();
    }
  );
});
