/**
 * src/page/user/Streams/Cameraview/CameraFour.jsx — 4-tile camera grid
 * wrapper. Slices `cameraData` down to its first 4 entries, renders one
 * `CameraStream` per kept entry inside a responsive 1/2/4-column grid,
 * overlays the entry's `datetime` (top-right) and `title` (bottom-left),
 * and on tile click invokes `selectedVideo(camera)` with the clicked
 * entry. Unlike CameraThree, click delegation IS active here.
 *
 * Mocks: 2 (CameraStream child + the imported-but-unused CameraCanvas
 * sibling). The component does not import any asset PNGs, so no asset
 * stubs are needed.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock(
  "../../../../../../src/page/user/Streams/CameraPlay/CameraStream.jsx",
  () => ({
    default: ({ label, config }) => (
      <div data-testid="stream" data-src={config?.src ?? ""}>
        {label}
      </div>
    ),
  })
);
vi.mock("../../../../../../src/page/user/Streams/CameraCanvas.jsx", () => ({
  default: () => null,
}));

import CameraFour from "../../../../../../src/page/user/Streams/Cameraview/CameraFour.jsx";

const makeCams = (n) =>
  Array.from({ length: n }, (_, i) => ({
    config: { src: `cam${i}.mp4` },
    label: `Cam-${i}`,
    title: `Title-${i}`,
    datetime: `2025-03-0${i + 1} 11:15`,
  }));

describe("Streams/Cameraview/CameraFour", () => {
  it("renders only the first 4 cameras (slice(0,4)), with their overlay text, inside the responsive 4-col grid wrapper", () => {
    const cams = makeCams(6); // intentionally over 4 to prove the slice
    const { container } = render(
      <CameraFour cameraData={cams} selectedVideo={() => {}} />
    );

    const streams = screen.getAllByTestId("stream");
    expect(streams).toHaveLength(4);
    // first four labels rendered, fifth/sixth dropped
    expect(screen.getByText("Cam-0")).toBeInTheDocument();
    expect(screen.getByText("Cam-3")).toBeInTheDocument();
    expect(screen.queryByText("Cam-4")).not.toBeInTheDocument();
    expect(screen.queryByText("Cam-5")).not.toBeInTheDocument();
    // overlays present for kept entries
    expect(screen.getByText("Title-0")).toBeInTheDocument();
    expect(screen.getByText("2025-03-01 11:15")).toBeInTheDocument();
    expect(screen.getByText("Title-3")).toBeInTheDocument();
    // config forwarded to the stream child
    expect(streams[2].getAttribute("data-src")).toBe("cam2.mp4");
    // wrapper carries the responsive grid classes
    const wrapper = container.firstChild;
    expect(wrapper.className).toMatch(/grid/);
    expect(wrapper.className).toMatch(/md:grid-cols-2/);
    expect(wrapper.className).toMatch(/lg:grid-cols-4/);
  });

  it("invokes selectedVideo with the clicked camera and renders zero tiles when cameraData is omitted", () => {
    const selectedVideo = vi.fn();
    const cams = makeCams(4);
    const { container, rerender } = render(
      <CameraFour cameraData={cams} selectedVideo={selectedVideo} />
    );
    // tiles are the direct grid children — pick the 2nd to prove the
    // exact camera object is forwarded (not the index/last).
    const tiles = container.querySelectorAll("div.relative");
    expect(tiles).toHaveLength(4);
    fireEvent.click(tiles[1]);
    expect(selectedVideo).toHaveBeenCalledTimes(1);
    expect(selectedVideo).toHaveBeenCalledWith(cams[1]);

    // cameraData defaults to [] when omitted -> no crash, zero tiles
    rerender(<CameraFour selectedVideo={selectedVideo} />);
    expect(
      container.querySelectorAll("[data-testid='stream']")
    ).toHaveLength(0);
  });
});
