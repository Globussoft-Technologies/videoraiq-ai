/**
 * src/page/user/Streams/Cameraview/CameraOne.jsx — single-tile camera
 * wrapper. Renders one CameraStream per entry in `cameraData`, plus
 * datetime + title overlays, and fires `selectedVideo(camera)` on tile
 * click. Pure render + click delegation.
 *
 * Mocks: 2 (CameraStream + CameraCanvas siblings, plus the asset PNGs
 * which we just ignore via the vitest jsdom default import behavior —
 * each PNG ends up as an empty string).
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
// PNG asset imports - stub to empty default exports.
vi.mock("../../../../../../src/assets/CounterImg1.png", () => ({ default: "" }));
vi.mock("../../../../../../src/assets/CounterImg2.png", () => ({ default: "" }));
vi.mock("../../../../../../src/assets/CounterImg3.png", () => ({ default: "" }));
vi.mock("../../../../../../src/assets/CounterImg4.png", () => ({ default: "" }));

import CameraOne from "../../../../../../src/page/user/Streams/Cameraview/CameraOne.jsx";

const sampleCameras = (n) =>
  Array.from({ length: n }, (_, i) => ({
    config: { src: `cam${i}.mp4` },
    label: `Cam-${i}`,
    title: `Title-${i}`,
    datetime: `2025-01-0${i + 1} 10:00`,
  }));

describe("Streams/Cameraview/CameraOne", () => {
  it("renders one CameraStream per camera entry", () => {
    render(
      <CameraOne cameraData={sampleCameras(2)} selectedVideo={() => {}} />
    );
    expect(screen.getAllByTestId("stream")).toHaveLength(2);
    expect(screen.getByText("Cam-0")).toBeInTheDocument();
    expect(screen.getByText("Title-0")).toBeInTheDocument();
    expect(screen.getByText("2025-01-01 10:00")).toBeInTheDocument();
  });

  it("invokes selectedVideo when a tile is clicked", () => {
    const selectedVideo = vi.fn();
    const cams = sampleCameras(3);
    const { container } = render(
      <CameraOne cameraData={cams} selectedVideo={selectedVideo} />
    );
    const tiles = container.querySelectorAll("div.relative");
    fireEvent.click(tiles[1]);
    expect(selectedVideo).toHaveBeenCalledWith(cams[1]);
  });

  it("renders no tiles for an empty cameraData array", () => {
    const { container } = render(
      <CameraOne cameraData={[]} selectedVideo={() => {}} />
    );
    expect(container.querySelectorAll("[data-testid='stream']")).toHaveLength(
      0
    );
  });
});
