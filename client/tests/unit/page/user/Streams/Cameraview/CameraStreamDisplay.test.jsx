/**
 * src/page/user/Streams/Cameraview/CameraStreamDisplay.jsx — wraps a
 * VideoCanvasStream + overlays. Branches we exercise:
 *   - person / vehicle count aggregation from detection feed
 *   - genericObjectDetection vehicle counting via objectsDetected
 *   - !isMini -> renders camera.title and the click-to-open handler
 *   - isMini -> suppresses overlays + click handler
 *   - openModal short-circuit when modal is already showing for this cam
 *
 * Mocks: 5 (VideoCanvasStream, useDetection, useAllDetections,
 * UserContext value, DynamicDateTime) — within the 8 budget.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockSetSelectedVideo = vi.fn();
const mockSetStreamModalShow = vi.fn();
const allDetectionsMock = vi.hoisted(() => ({ value: [] }));

vi.mock("../../../../../../src/page/user/Dashboard/VideoCanvasStream.jsx", () => ({
  default: ({ label, cameraId }) => (
    <div data-testid="canvas-stream">{`${label}|${cameraId}`}</div>
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
    setStreamModalShow: mockSetStreamModalShow,
    ...ctxOverride,
  };
  return render(<UserContext.Provider value={value}>{ui}</UserContext.Provider>);
};

beforeEach(() => {
  mockSetSelectedVideo.mockReset();
  mockSetStreamModalShow.mockReset();
  allDetectionsMock.value = [];
});

const camera = {
  value: "cam-1",
  label: "Lobby",
  title: "Lobby Cam",
  config: { StreamingUrl: "http://x/s.m3u8" },
};

describe("Streams/Cameraview/CameraStreamDisplay", () => {
  it("renders VideoCanvasStream and the camera title (non-mini)", () => {
    renderWithCtx(
      <CameraStreamDisplay
        camera={camera}
        selectedVideo={null}
        setSelectedVideo={mockSetSelectedVideo}
        cameraChannels={[]}
      />
    );
    expect(screen.getByTestId("canvas-stream").textContent).toBe(
      "Lobby|cam-1"
    );
    expect(screen.getByText("Lobby Cam")).toBeInTheDocument();
  });

  it("does not render the title overlay when isMini is true", () => {
    renderWithCtx(
      <CameraStreamDisplay
        camera={camera}
        selectedVideo={null}
        setSelectedVideo={mockSetSelectedVideo}
        cameraChannels={[]}
        isMini
      />
    );
    expect(screen.queryByText("Lobby Cam")).not.toBeInTheDocument();
  });

  it("opens the modal on click (non-mini) — sets selectedVideo + modal=true", () => {
    const { container } = renderWithCtx(
      <CameraStreamDisplay
        camera={camera}
        selectedVideo={null}
        setSelectedVideo={mockSetSelectedVideo}
        cameraChannels={[]}
      />
    );
    fireEvent.click(container.firstChild);
    expect(mockSetSelectedVideo).toHaveBeenCalledWith({
      cameraId: "cam-1",
      config: { ...camera.config, cameraId: "cam-1" },
    });
    expect(mockSetStreamModalShow).toHaveBeenCalledWith(true);
  });

  it("does not re-open the modal when it is already open for this camera", () => {
    const { container } = renderWithCtx(
      <CameraStreamDisplay
        camera={camera}
        selectedVideo={{ cameraId: "cam-1" }}
        setSelectedVideo={mockSetSelectedVideo}
        cameraChannels={[]}
      />,
      { streamModalShow: true }
    );
    fireEvent.click(container.firstChild);
    expect(mockSetSelectedVideo).not.toHaveBeenCalled();
    expect(mockSetStreamModalShow).not.toHaveBeenCalled();
  });

  it("renders the person count badge when matching detections exist", () => {
    allDetectionsMock.value = [
      { cameraId: "cam-1", incidentType: "countPersons", count: 3 },
      { cameraId: "cam-1", incidentType: "countPersons", count: 2 },
      { cameraId: "cam-other", incidentType: "countPersons", count: 99 }, // filtered out
    ];
    renderWithCtx(
      <CameraStreamDisplay
        camera={camera}
        selectedVideo={null}
        setSelectedVideo={mockSetSelectedVideo}
        cameraChannels={[]}
      />
    );
    // 3 + 2 = 5
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("renders the vehicle count badge from countVehicles incidents", () => {
    allDetectionsMock.value = [
      { cameraId: "cam-1", incidentType: "countVehicles", count: 4 },
    ];
    renderWithCtx(
      <CameraStreamDisplay
        camera={camera}
        selectedVideo={null}
        setSelectedVideo={mockSetSelectedVideo}
        cameraChannels={[]}
      />
    );
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("sums vehicle counts inside genericObjectDetection.objectsDetected", () => {
    allDetectionsMock.value = [
      {
        cameraId: "cam-1",
        incidentType: "genericObjectDetection",
        objectsDetected: [{ car: 2, bike: 1 }, { truck: 3, bus: 1 }],
      },
    ];
    renderWithCtx(
      <CameraStreamDisplay
        camera={camera}
        selectedVideo={null}
        setSelectedVideo={mockSetSelectedVideo}
        cameraChannels={[]}
      />
    );
    // 2 + 3 = 5 (only the first truthy field per object is counted)
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("does not render count badges when isMini=true even with detections", () => {
    allDetectionsMock.value = [
      { cameraId: "cam-1", incidentType: "countPersons", count: 9 },
    ];
    const { container } = renderWithCtx(
      <CameraStreamDisplay
        camera={camera}
        selectedVideo={null}
        setSelectedVideo={mockSetSelectedVideo}
        cameraChannels={[]}
        isMini
      />
    );
    // Badge text "9" should not be present.
    expect(container.textContent).not.toMatch(/\b9\b/);
  });
});
