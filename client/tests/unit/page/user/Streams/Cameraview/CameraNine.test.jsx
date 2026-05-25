/**
 * src/page/user/Streams/Cameraview/CameraNine.jsx — 9-tile camera grid
 * wrapper. Slices `cameraData` down to its first 9 entries, renders one
 * `CameraStream` per kept entry inside a responsive grid (1 col on
 * mobile, 2 cols on sm, 3 cols on md, 4 cols on lg, 8 cols on xl —
 * the densest ladder in the chain), overlays `datetime` (top-right)
 * and `title` (bottom-left), and on tile click invokes
 * `selectedVideo(camera)` with the clicked entry.
 *
 * Mocks: 2 (CameraStream child + the imported-but-unused CameraCanvas
 * sibling). No asset stubs needed.
 *
 * R53 client-phase coverage round — closing the CameraView grid chain
 * (One/Two R17, Three R46, Four R48, Five R50, Six R51, Seven/Eight/Nine R53).
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

import CameraNine from "../../../../../../src/page/user/Streams/Cameraview/CameraNine.jsx";

const makeCams = (n) =>
  Array.from({ length: n }, (_, i) => ({
    config: { src: `cam${i}.mp4` },
    label: `Cam-${i}`,
    title: `Title-${i}`,
    datetime: `2025-04-0${i + 1} 09:30`,
  }));

describe("Streams/Cameraview/CameraNine", () => {
  it("renders only the first 9 cameras (slice(0,9)) with overlay text inside the responsive md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 wrapper", () => {
    const cams = makeCams(11); // intentionally over 9 to prove the slice
    const { container } = render(
      <CameraNine cameraData={cams} selectedVideo={() => {}} />
    );

    const streams = screen.getAllByTestId("stream");
    expect(streams).toHaveLength(9);
    // first nine labels rendered, tenth/eleventh dropped
    expect(screen.getByText("Cam-0")).toBeInTheDocument();
    expect(screen.getByText("Cam-8")).toBeInTheDocument();
    expect(screen.queryByText("Cam-9")).not.toBeInTheDocument();
    expect(screen.queryByText("Cam-10")).not.toBeInTheDocument();
    // overlays present for kept entries
    expect(screen.getByText("Title-0")).toBeInTheDocument();
    expect(screen.getByText("2025-04-01 09:30")).toBeInTheDocument();
    expect(screen.getByText("Title-8")).toBeInTheDocument();
    // config forwarded to the stream child
    expect(streams[6].getAttribute("data-src")).toBe("cam6.mp4");
    // wrapper carries the responsive grid classes specific to the 9-tile
    // layout (1/2/3/4/8-col — densest ladder of the entire chain)
    const wrapper = container.firstChild;
    expect(wrapper.className).toMatch(/grid/);
    expect(wrapper.className).toMatch(/sm:grid-cols-2/);
    expect(wrapper.className).toMatch(/md:grid-cols-3/);
    expect(wrapper.className).toMatch(/lg:grid-cols-4/);
    expect(wrapper.className).toMatch(/xl:grid-cols-8/);
  });

  it("invokes selectedVideo with the clicked camera object and renders zero tiles when cameraData is omitted", () => {
    const selectedVideo = vi.fn();
    const cams = makeCams(9);
    const { container, rerender } = render(
      <CameraNine cameraData={cams} selectedVideo={selectedVideo} />
    );
    // tiles are the direct grid children — pick the 7th entry to prove
    // the exact camera object is forwarded (not the first or last).
    const tiles = container.querySelectorAll("div.relative");
    expect(tiles).toHaveLength(9);
    fireEvent.click(tiles[6]);
    expect(selectedVideo).toHaveBeenCalledTimes(1);
    expect(selectedVideo).toHaveBeenCalledWith(cams[6]);

    // cameraData defaults to [] when omitted -> no crash, zero tiles
    rerender(<CameraNine selectedVideo={selectedVideo} />);
    expect(
      container.querySelectorAll("[data-testid='stream']")
    ).toHaveLength(0);
  });
});
