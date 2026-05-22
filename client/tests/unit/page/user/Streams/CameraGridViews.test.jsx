/**
 * src/page/user/Streams/Cameraview/Camera{Three,Four,Five}.jsx —
 * grid layout wrappers that render a CameraStream per `cameraData`
 * entry. Pure render + click delegation; we just stub the CameraStream
 * child so it renders something predictable.
 *
 * Mocks per file: 1 (CameraStream stub).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock(
  "../../../../../src/page/user/Streams/CameraPlay/CameraStream.jsx",
  () => ({
    default: ({ label }) => <div data-testid="stream">{label}</div>,
  })
);
vi.mock("../../../../../src/page/user/Streams/CameraCanvas.jsx", () => ({
  default: () => null,
}));

import CameraThree from "../../../../../src/page/user/Streams/Cameraview/CameraThree.jsx";
import CameraFour from "../../../../../src/page/user/Streams/Cameraview/CameraFour.jsx";
import CameraFive from "../../../../../src/page/user/Streams/Cameraview/CameraFive.jsx";

const sampleCameras = (n) =>
  Array.from({ length: n }, (_, i) => ({
    config: { src: `cam${i}.mp4` },
    label: `Cam-${i}`,
    title: `Title-${i}`,
    datetime: `2025-01-0${i + 1} 10:00`,
  }));

describe("Cameraview grid wrappers", () => {
  describe("CameraThree", () => {
    it("renders one CameraStream per camera in cameraData", () => {
      render(
        <CameraThree
          cameraData={sampleCameras(3)}
          selectedVideo={null}
          setSelectedVideo={() => {}}
        />
      );
      expect(screen.getAllByTestId("stream").length).toBe(3);
    });

    it("renders the per-camera datetime and title overlays", () => {
      render(
        <CameraThree
          cameraData={sampleCameras(2)}
          selectedVideo={null}
          setSelectedVideo={() => {}}
        />
      );
      expect(screen.getByText("Title-0")).toBeInTheDocument();
      expect(screen.getByText("2025-01-01 10:00")).toBeInTheDocument();
    });

    it("renders an empty grid when cameraData defaults to []", () => {
      const { container } = render(<CameraThree />);
      // No CameraStream stubs should appear when there are zero cameras.
      expect(container.querySelectorAll("[data-testid='stream']").length).toBe(
        0
      );
    });
  });

  describe("CameraFour", () => {
    it("slices cameraData to the first 4 entries", () => {
      render(
        <CameraFour
          cameraData={sampleCameras(6)}
          selectedVideo={() => {}}
        />
      );
      expect(screen.getAllByTestId("stream").length).toBe(4);
    });

    it("invokes selectedVideo callback when a tile is clicked", () => {
      const selectedVideo = vi.fn();
      const cams = sampleCameras(2);
      const { container } = render(
        <CameraFour cameraData={cams} selectedVideo={selectedVideo} />
      );
      const tiles = container.querySelectorAll("div.relative");
      fireEvent.click(tiles[0]);
      expect(selectedVideo).toHaveBeenCalledWith(cams[0]);
    });
  });

  describe("CameraFive", () => {
    it("slices cameraData to the first 5 entries", () => {
      render(
        <CameraFive
          cameraData={sampleCameras(8)}
          selectedVideo={() => {}}
        />
      );
      expect(screen.getAllByTestId("stream").length).toBe(5);
    });

    it("invokes selectedVideo callback when a tile is clicked", () => {
      const selectedVideo = vi.fn();
      const cams = sampleCameras(3);
      const { container } = render(
        <CameraFive cameraData={cams} selectedVideo={selectedVideo} />
      );
      const tiles = container.querySelectorAll("div.relative");
      fireEvent.click(tiles[1]);
      expect(selectedVideo).toHaveBeenCalledWith(cams[1]);
    });
  });
});
