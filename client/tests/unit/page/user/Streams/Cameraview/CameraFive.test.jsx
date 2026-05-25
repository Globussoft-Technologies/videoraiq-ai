/**
 * src/page/user/Streams/Cameraview/CameraFive.jsx — 5-tile camera grid
 * wrapper. Slices `cameraData` down to its first 5 entries, renders one
 * `CameraStream` per kept entry inside a responsive grid (1 col on
 * mobile, 2 cols on sm, 3 cols on lg) capped at a viewport-relative
 * height, overlays `datetime` (top-right) and `title` (bottom-left), and
 * on tile click invokes `selectedVideo(camera)` with the clicked entry.
 *
 * Mocks: 2 (CameraStream child + the imported-but-unused CameraCanvas
 * sibling). No asset stubs needed — the component does not import any
 * PNGs.
 *
 * R50 client-phase coverage round.
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

import CameraFive from "../../../../../../src/page/user/Streams/Cameraview/CameraFive.jsx";

const makeCams = (n) =>
  Array.from({ length: n }, (_, i) => ({
    config: { src: `cam${i}.mp4` },
    label: `Cam-${i}`,
    title: `Title-${i}`,
    datetime: `2025-04-0${i + 1} 09:30`,
  }));

describe("Streams/Cameraview/CameraFive", () => {
  it("renders only the first 5 cameras (slice(0,5)) with overlay text inside the responsive lg:grid-cols-3 wrapper", () => {
    const cams = makeCams(7); // intentionally over 5 to prove the slice
    const { container } = render(
      <CameraFive cameraData={cams} selectedVideo={() => {}} />
    );

    const streams = screen.getAllByTestId("stream");
    expect(streams).toHaveLength(5);
    // first five labels rendered, sixth/seventh dropped
    expect(screen.getByText("Cam-0")).toBeInTheDocument();
    expect(screen.getByText("Cam-4")).toBeInTheDocument();
    expect(screen.queryByText("Cam-5")).not.toBeInTheDocument();
    expect(screen.queryByText("Cam-6")).not.toBeInTheDocument();
    // overlays present for kept entries
    expect(screen.getByText("Title-0")).toBeInTheDocument();
    expect(screen.getByText("2025-04-01 09:30")).toBeInTheDocument();
    expect(screen.getByText("Title-4")).toBeInTheDocument();
    // config forwarded to the stream child
    expect(streams[2].getAttribute("data-src")).toBe("cam2.mp4");
    // wrapper carries the responsive grid classes specific to the 5-tile
    // layout (1/2/3-col, not 4-col like CameraFour)
    const wrapper = container.firstChild;
    expect(wrapper.className).toMatch(/grid/);
    expect(wrapper.className).toMatch(/sm:grid-cols-2/);
    expect(wrapper.className).toMatch(/lg:grid-cols-3/);
    expect(wrapper.className).not.toMatch(/lg:grid-cols-4/);
  });

  it("invokes selectedVideo with the clicked camera object and renders zero tiles when cameraData is omitted", () => {
    const selectedVideo = vi.fn();
    const cams = makeCams(5);
    const { container, rerender } = render(
      <CameraFive cameraData={cams} selectedVideo={selectedVideo} />
    );
    // tiles are the direct grid children — pick the 3rd entry to prove
    // the exact camera object is forwarded (not the first or last).
    const tiles = container.querySelectorAll("div.relative");
    expect(tiles).toHaveLength(5);
    fireEvent.click(tiles[2]);
    expect(selectedVideo).toHaveBeenCalledTimes(1);
    expect(selectedVideo).toHaveBeenCalledWith(cams[2]);

    // cameraData defaults to [] when omitted -> no crash, zero tiles
    rerender(<CameraFive selectedVideo={selectedVideo} />);
    expect(
      container.querySelectorAll("[data-testid='stream']")
    ).toHaveLength(0);
  });
});
