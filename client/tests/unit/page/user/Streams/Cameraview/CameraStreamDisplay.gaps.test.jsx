/**
 * Gap-fills for src/page/user/Streams/Cameraview/CameraStreamDisplay.jsx
 * branch coverage (line cov is already 100%).
 *
 * Uncovered branches:
 *   - line 21: camera.config.StreamingUrl falsy -> null fallback
 *   - line 34: countPersons det.count missing -> +0 fallback
 *   - line 44: countVehicles det.count missing -> +0 fallback
 *   - line 48: genericObjectDetection with objectsDetected undefined -> [] fallback
 *   - line 50: obj.vehicle truthy (first short-circuit branch)
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const allDetectionsMock = vi.hoisted(() => ({ value: [] }));

vi.mock("../../../../../../src/page/user/Dashboard/VideoCanvasStream.jsx", () => ({
  default: ({ label, cameraId, hlsUrl }) => (
    <div data-testid="canvas-stream" data-hls={String(hlsUrl)}>
      {`${label}|${cameraId}`}
    </div>
  ),
}));
vi.mock("@/utils/DynamicDateTime", () => ({
  default: () => <span data-testid="datetime" />,
}));
vi.mock("@/context/Sockets/DetectionContext", () => ({
  useDetection: () => ({ detections: [] }),
}));
vi.mock("@/context/Sockets/AllDetectionContext", () => ({
  useAllDetections: () => ({ allDetections: allDetectionsMock.value }),
}));

import UserContext from "../../../../../../src/context/UserContext/Context.jsx";
import CameraStreamDisplay from "../../../../../../src/page/user/Streams/Cameraview/CameraStreamDisplay.jsx";

const renderWithCtx = (ui, ctxOverride = {}) => {
  const value = {
    streamModalShow: false,
    setStreamModalShow: vi.fn(),
    ...ctxOverride,
  };
  return render(<UserContext.Provider value={value}>{ui}</UserContext.Provider>);
};

beforeEach(() => {
  allDetectionsMock.value = [];
});

describe("CameraStreamDisplay branch gap-fills", () => {
  it("falls back to null hlsUrl when camera.config.StreamingUrl missing", () => {
    const camera = {
      value: "cam-x",
      label: "X",
      title: "X Cam",
      config: {}, // no StreamingUrl
    };
    renderWithCtx(
      <CameraStreamDisplay
        camera={camera}
        selectedVideo={null}
        setSelectedVideo={vi.fn()}
        cameraChannels={[]}
      />
    );
    expect(screen.getByTestId("canvas-stream").getAttribute("data-hls")).toBe(
      "null"
    );
  });

  it("countPersons with missing det.count uses 0 fallback (no badge)", () => {
    allDetectionsMock.value = [
      { cameraId: "cam-1", incidentType: "countPersons" }, // no count
    ];
    const camera = {
      value: "cam-1",
      label: "L",
      title: "T",
      config: { StreamingUrl: "url" },
    };
    const { container } = renderWithCtx(
      <CameraStreamDisplay
        camera={camera}
        selectedVideo={null}
        setSelectedVideo={vi.fn()}
        cameraChannels={[]}
      />
    );
    // total persons = 0 -> no badge with "0"
    expect(container.textContent).not.toMatch(/\b0\b/);
  });

  it("countVehicles with missing det.count uses 0 fallback (no badge)", () => {
    allDetectionsMock.value = [
      { cameraId: "cam-1", incidentType: "countVehicles" }, // no count
    ];
    const camera = {
      value: "cam-1",
      label: "L",
      title: "T",
      config: { StreamingUrl: "url" },
    };
    const { container } = renderWithCtx(
      <CameraStreamDisplay
        camera={camera}
        selectedVideo={null}
        setSelectedVideo={vi.fn()}
        cameraChannels={[]}
      />
    );
    expect(container.textContent).not.toMatch(/\b0\b/);
  });

  it("genericObjectDetection without objectsDetected uses [] fallback", () => {
    allDetectionsMock.value = [
      { cameraId: "cam-1", incidentType: "genericObjectDetection" }, // no objectsDetected
    ];
    const camera = {
      value: "cam-1",
      label: "L",
      title: "T",
      config: { StreamingUrl: "url" },
    };
    const { container } = renderWithCtx(
      <CameraStreamDisplay
        camera={camera}
        selectedVideo={null}
        setSelectedVideo={vi.fn()}
        cameraChannels={[]}
      />
    );
    // vehicleCount = 0 -> no badge.
    expect(container.textContent).not.toMatch(/\b0\b/);
  });

  it("genericObjectDetection counts obj.vehicle branch (line 50 first arm)", () => {
    allDetectionsMock.value = [
      {
        cameraId: "cam-1",
        incidentType: "genericObjectDetection",
        objectsDetected: [{ vehicle: 7 }],
      },
    ];
    const camera = {
      value: "cam-1",
      label: "L",
      title: "T",
      config: { StreamingUrl: "url" },
    };
    renderWithCtx(
      <CameraStreamDisplay
        camera={camera}
        selectedVideo={null}
        setSelectedVideo={vi.fn()}
        cameraChannels={[]}
      />
    );
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("genericObjectDetection counts obj.bus branch (last truthy arm)", () => {
    allDetectionsMock.value = [
      {
        cameraId: "cam-1",
        incidentType: "genericObjectDetection",
        objectsDetected: [
          { vehicle: 0, car: 0, bike: 0, truck: 0, bus: 9 },
        ],
      },
    ];
    const camera = {
      value: "cam-1",
      label: "L",
      title: "T",
      config: { StreamingUrl: "url" },
    };
    renderWithCtx(
      <CameraStreamDisplay
        camera={camera}
        selectedVideo={null}
        setSelectedVideo={vi.fn()}
        cameraChannels={[]}
      />
    );
    expect(screen.getByText("9")).toBeInTheDocument();
  });

  it("genericObjectDetection with all-zero object falls through to 0", () => {
    allDetectionsMock.value = [
      {
        cameraId: "cam-1",
        incidentType: "genericObjectDetection",
        objectsDetected: [{}], // empty obj
      },
    ];
    const camera = {
      value: "cam-1",
      label: "L",
      title: "T",
      config: { StreamingUrl: "url" },
    };
    const { container } = renderWithCtx(
      <CameraStreamDisplay
        camera={camera}
        selectedVideo={null}
        setSelectedVideo={vi.fn()}
        cameraChannels={[]}
      />
    );
    expect(container.textContent).not.toMatch(/\b0\b/);
  });
});
