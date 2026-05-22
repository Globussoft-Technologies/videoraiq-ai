/**
 * src/page/user/Streams/Cameraview/Camera{Six,Seven,Eight,Nine}.jsx —
 * fixed-size grid wrappers (slice the first 6/7/8/9 cameras and render
 * one CameraStream per entry). Same shape as CameraThree/Four/Five
 * (already covered in CameraGridViews.test.jsx). We stub the
 * CameraStream + CameraCanvas children and assert slicing + click
 * delegation.
 *
 * Mocks: 2 (CameraStream + CameraCanvas stubs).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock(
  "../../../../../../src/page/user/Streams/CameraPlay/CameraStream.jsx",
  () => ({
    default: ({ label }) => <div data-testid="stream">{label}</div>,
  })
);
vi.mock("../../../../../../src/page/user/Streams/CameraCanvas.jsx", () => ({
  default: () => null,
}));

import CameraSix from "../../../../../../src/page/user/Streams/Cameraview/CameraSix.jsx";
import CameraSeven from "../../../../../../src/page/user/Streams/Cameraview/CameraSeven.jsx";
import CameraEight from "../../../../../../src/page/user/Streams/Cameraview/CameraEight.jsx";
import CameraNine from "../../../../../../src/page/user/Streams/Cameraview/CameraNine.jsx";

const sampleCameras = (n) =>
  Array.from({ length: n }, (_, i) => ({
    config: { src: `cam${i}.mp4` },
    label: `Cam-${i}`,
    title: `Title-${i}`,
    datetime: `2025-01-0${(i % 9) + 1} 10:00`,
  }));

describe("Cameraview large grid wrappers", () => {
  describe("CameraSix", () => {
    it("slices to the first 6 cameras", () => {
      render(
        <CameraSix cameraData={sampleCameras(10)} selectedVideo={() => {}} />
      );
      expect(screen.getAllByTestId("stream")).toHaveLength(6);
    });

    it("renders fewer tiles when cameraData has < 6 entries", () => {
      render(
        <CameraSix cameraData={sampleCameras(4)} selectedVideo={() => {}} />
      );
      expect(screen.getAllByTestId("stream")).toHaveLength(4);
    });

    it("fires selectedVideo on tile click", () => {
      const selectedVideo = vi.fn();
      const cams = sampleCameras(2);
      const { container } = render(
        <CameraSix cameraData={cams} selectedVideo={selectedVideo} />
      );
      fireEvent.click(container.querySelectorAll("div.relative")[1]);
      expect(selectedVideo).toHaveBeenCalledWith(cams[1]);
    });

    it("defaults cameraData=[] when prop omitted", () => {
      const { container } = render(<CameraSix selectedVideo={() => {}} />);
      expect(
        container.querySelectorAll("[data-testid='stream']")
      ).toHaveLength(0);
    });
  });

  describe("CameraSeven", () => {
    it("slices to the first 7 cameras", () => {
      render(
        <CameraSeven cameraData={sampleCameras(10)} selectedVideo={() => {}} />
      );
      expect(screen.getAllByTestId("stream")).toHaveLength(7);
    });

    it("fires selectedVideo on tile click", () => {
      const selectedVideo = vi.fn();
      const cams = sampleCameras(3);
      const { container } = render(
        <CameraSeven cameraData={cams} selectedVideo={selectedVideo} />
      );
      fireEvent.click(container.querySelectorAll("div.relative")[0]);
      expect(selectedVideo).toHaveBeenCalledWith(cams[0]);
    });
  });

  describe("CameraEight", () => {
    it("slices to the first 8 cameras", () => {
      render(
        <CameraEight cameraData={sampleCameras(12)} selectedVideo={() => {}} />
      );
      expect(screen.getAllByTestId("stream")).toHaveLength(8);
    });

    it("fires selectedVideo on tile click", () => {
      const selectedVideo = vi.fn();
      const cams = sampleCameras(2);
      const { container } = render(
        <CameraEight cameraData={cams} selectedVideo={selectedVideo} />
      );
      fireEvent.click(container.querySelectorAll("div.relative")[1]);
      expect(selectedVideo).toHaveBeenCalledWith(cams[1]);
    });
  });

  describe("CameraNine", () => {
    it("slices to the first 9 cameras", () => {
      render(
        <CameraNine cameraData={sampleCameras(15)} selectedVideo={() => {}} />
      );
      expect(screen.getAllByTestId("stream")).toHaveLength(9);
    });

    it("renders title and datetime overlays", () => {
      render(
        <CameraNine cameraData={sampleCameras(2)} selectedVideo={() => {}} />
      );
      expect(screen.getByText("Title-0")).toBeInTheDocument();
      expect(screen.getByText("2025-01-01 10:00")).toBeInTheDocument();
    });

    it("fires selectedVideo on tile click", () => {
      const selectedVideo = vi.fn();
      const cams = sampleCameras(2);
      const { container } = render(
        <CameraNine cameraData={cams} selectedVideo={selectedVideo} />
      );
      fireEvent.click(container.querySelectorAll("div.relative")[0]);
      expect(selectedVideo).toHaveBeenCalledWith(cams[0]);
    });
  });
});
