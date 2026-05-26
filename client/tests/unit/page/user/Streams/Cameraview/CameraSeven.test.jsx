/**
 * src/page/user/Streams/Cameraview/CameraSeven.jsx — 7-tile camera grid
 * wrapper. Slices `cameraData` down to its first 7 entries, renders one
 * `CameraStream` per kept entry inside a responsive grid (1 col on
 * mobile, 2 cols on sm, 3 cols on md, 5 cols on lg — distinct from the
 * 6-tile chain which caps at 4-col), overlays `datetime` (top-right)
 * and `title` (bottom-left), and on tile click invokes
 * `selectedVideo(camera)` with the clicked entry.
 *
 * Mocks: 2 (CameraStream child + the imported-but-unused CameraCanvas
 * sibling). No asset stubs needed.
 *
 * R53 client-phase coverage round — extending the CameraView grid chain
 * (One/Two R17, Three R46, Four R48, Five R50, Six R51, now Seven).
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

import CameraSeven from "../../../../../../src/page/user/Streams/Cameraview/CameraSeven.jsx";

const makeCams = (n) =>
  Array.from({ length: n }, (_, i) => ({
    config: { src: `cam${i}.mp4` },
    label: `Cam-${i}`,
    title: `Title-${i}`,
    datetime: `2025-04-0${i + 1} 09:30`,
  }));

describe("Streams/Cameraview/CameraSeven", () => {
  it("renders only the first 7 cameras (slice(0,7)) with overlay text inside the responsive md:grid-cols-3 lg:grid-cols-5 wrapper", () => {
    const cams = makeCams(9); // intentionally over 7 to prove the slice
    const { container } = render(
      <CameraSeven cameraData={cams} selectedVideo={() => {}} />
    );

    const streams = screen.getAllByTestId("stream");
    expect(streams).toHaveLength(7);
    // first seven labels rendered, eighth/ninth dropped
    expect(screen.getByText("Cam-0")).toBeInTheDocument();
    expect(screen.getByText("Cam-6")).toBeInTheDocument();
    expect(screen.queryByText("Cam-7")).not.toBeInTheDocument();
    expect(screen.queryByText("Cam-8")).not.toBeInTheDocument();
    // overlays present for kept entries
    expect(screen.getByText("Title-0")).toBeInTheDocument();
    expect(screen.getByText("2025-04-01 09:30")).toBeInTheDocument();
    expect(screen.getByText("Title-6")).toBeInTheDocument();
    // config forwarded to the stream child
    expect(streams[4].getAttribute("data-src")).toBe("cam4.mp4");
    // wrapper carries the responsive grid classes specific to the 7-tile
    // layout (1/2/3/5-col, distinct from CameraSix's 4-col cap)
    const wrapper = container.firstChild;
    expect(wrapper.className).toMatch(/grid/);
    expect(wrapper.className).toMatch(/sm:grid-cols-2/);
    expect(wrapper.className).toMatch(/md:grid-cols-3/);
    expect(wrapper.className).toMatch(/lg:grid-cols-5/);
  });

  it("invokes selectedVideo with the clicked camera object and renders zero tiles when cameraData is omitted", () => {
    const selectedVideo = vi.fn();
    const cams = makeCams(7);
    const { container, rerender } = render(
      <CameraSeven cameraData={cams} selectedVideo={selectedVideo} />
    );
    // tiles are the direct grid children — pick the 5th entry to prove
    // the exact camera object is forwarded (not the first or last).
    const tiles = container.querySelectorAll("div.relative");
    expect(tiles).toHaveLength(7);
    fireEvent.click(tiles[4]);
    expect(selectedVideo).toHaveBeenCalledTimes(1);
    expect(selectedVideo).toHaveBeenCalledWith(cams[4]);

    // cameraData defaults to [] when omitted -> no crash, zero tiles
    rerender(<CameraSeven selectedVideo={selectedVideo} />);
    expect(
      container.querySelectorAll("[data-testid='stream']")
    ).toHaveLength(0);
  });
});
