/**
 * src/page/user/Streams/Cameraview/CameraEight.jsx — 8-tile camera grid
 * wrapper. Slices `cameraData` down to its first 8 entries, renders one
 * `CameraStream` per kept entry inside a responsive grid (1 col on
 * mobile, 2 cols on sm, 6 cols on lg — note the sparser md/lg ladder
 * vs CameraSeven), overlays `datetime` (top-right) and `title`
 * (bottom-left), and on tile click invokes `selectedVideo(camera)`
 * with the clicked entry.
 *
 * Mocks: 2 (CameraStream child + the imported-but-unused CameraCanvas
 * sibling). No asset stubs needed.
 *
 * R53 client-phase coverage round — extending the CameraView grid chain.
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

import CameraEight from "../../../../../../src/page/user/Streams/Cameraview/CameraEight.jsx";

const makeCams = (n) =>
  Array.from({ length: n }, (_, i) => ({
    config: { src: `cam${i}.mp4` },
    label: `Cam-${i}`,
    title: `Title-${i}`,
    datetime: `2025-04-0${i + 1} 09:30`,
  }));

describe("Streams/Cameraview/CameraEight", () => {
  it("renders only the first 8 cameras (slice(0,8)) with overlay text inside the responsive sm:grid-cols-2 lg:grid-cols-6 wrapper", () => {
    const cams = makeCams(10); // intentionally over 8 to prove the slice
    const { container } = render(
      <CameraEight cameraData={cams} selectedVideo={() => {}} />
    );

    const streams = screen.getAllByTestId("stream");
    expect(streams).toHaveLength(8);
    // first eight labels rendered, ninth/tenth dropped
    expect(screen.getByText("Cam-0")).toBeInTheDocument();
    expect(screen.getByText("Cam-7")).toBeInTheDocument();
    expect(screen.queryByText("Cam-8")).not.toBeInTheDocument();
    expect(screen.queryByText("Cam-9")).not.toBeInTheDocument();
    // overlays present for kept entries
    expect(screen.getByText("Title-0")).toBeInTheDocument();
    expect(screen.getByText("2025-04-01 09:30")).toBeInTheDocument();
    expect(screen.getByText("Title-7")).toBeInTheDocument();
    // config forwarded to the stream child
    expect(streams[5].getAttribute("data-src")).toBe("cam5.mp4");
    // wrapper carries the responsive grid classes specific to the 8-tile
    // layout (1/2/6-col, distinct from CameraSeven's 1/2/3/5 ladder)
    const wrapper = container.firstChild;
    expect(wrapper.className).toMatch(/grid/);
    expect(wrapper.className).toMatch(/sm:grid-cols-2/);
    expect(wrapper.className).toMatch(/lg:grid-cols-6/);
  });

  it("invokes selectedVideo with the clicked camera object and renders zero tiles when cameraData is omitted", () => {
    const selectedVideo = vi.fn();
    const cams = makeCams(8);
    const { container, rerender } = render(
      <CameraEight cameraData={cams} selectedVideo={selectedVideo} />
    );
    // tiles are the direct grid children — pick the 6th entry to prove
    // the exact camera object is forwarded (not the first or last).
    const tiles = container.querySelectorAll("div.relative");
    expect(tiles).toHaveLength(8);
    fireEvent.click(tiles[5]);
    expect(selectedVideo).toHaveBeenCalledTimes(1);
    expect(selectedVideo).toHaveBeenCalledWith(cams[5]);

    // cameraData defaults to [] when omitted -> no crash, zero tiles
    rerender(<CameraEight selectedVideo={selectedVideo} />);
    expect(
      container.querySelectorAll("[data-testid='stream']")
    ).toHaveLength(0);
  });
});
