/**
 * src/page/user/Streams/Cameraview/CameraTwo.jsx — grid wrapper with
 * branchy layout logic. Renders one CameraStreamDisplay per camera and
 * picks grid cols/rows based on `selectedGrid` (1-4) and `cameraData.length`.
 *
 * The interesting code is the `getGridClasses` switch covering
 * itemCount 1/2/3/4 plus the standard 5+ branch. We assert via the
 * rendered grid container's className.
 *
 * Mocks: 1 (CameraStreamDisplay stub).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock(
  "../../../../../../src/page/user/Streams/Cameraview/CameraStreamDisplay.jsx",
  () => ({
    default: ({ camera }) => (
      <div data-testid="display">{camera?.label || "no-label"}</div>
    ),
  })
);

import CameraTwo from "../../../../../../src/page/user/Streams/Cameraview/CameraTwo.jsx";

const makeCams = (n) =>
  Array.from({ length: n }, (_, i) => ({
    value: `v${i}`,
    label: `Cam-${i}`,
    config: { src: `cam${i}.mp4` },
  }));

describe("Streams/Cameraview/CameraTwo", () => {
  it("only renders the grid matching selectedGrid (1)", () => {
    const cams = makeCams(2);
    render(
      <CameraTwo
        cameraData={cams}
        selectedVideo={null}
        setSelectedVideo={() => {}}
        selectedGrid={1}
        cameraChannels={[]}
      />
    );
    expect(screen.getAllByTestId("display")).toHaveLength(2);
  });

  it("renders one tile per camera for selectedGrid=2", () => {
    const cams = makeCams(4);
    render(
      <CameraTwo
        cameraData={cams}
        selectedVideo={null}
        setSelectedVideo={() => {}}
        selectedGrid={2}
        cameraChannels={[]}
      />
    );
    expect(screen.getAllByTestId("display")).toHaveLength(4);
  });

  it("uses full-width class (no grid-cols) when itemCount===1", () => {
    const cams = makeCams(1);
    const { container } = render(
      <CameraTwo
        cameraData={cams}
        selectedVideo={null}
        setSelectedVideo={() => {}}
        selectedGrid={1}
        cameraChannels={[]}
      />
    );
    // The wrapper div for itemCount===1 uses w-full but no grid-cols-*.
    const wrapper = container.firstChild;
    expect(wrapper.className).toMatch(/w-full/);
    expect(wrapper.className).not.toMatch(/grid-cols-/);
  });

  it("uses grid-cols-2 / grid-rows-1 when itemCount===2", () => {
    const cams = makeCams(2);
    const { container } = render(
      <CameraTwo
        cameraData={cams}
        selectedVideo={null}
        setSelectedVideo={() => {}}
        selectedGrid={2}
        cameraChannels={[]}
      />
    );
    const wrapper = container.firstChild;
    expect(wrapper.className).toMatch(/grid-cols-2/);
    expect(wrapper.className).toMatch(/grid-rows-1/);
  });

  it("uses grid-cols-3 / grid-rows-1 when itemCount===3", () => {
    const cams = makeCams(3);
    const { container } = render(
      <CameraTwo
        cameraData={cams}
        selectedVideo={null}
        setSelectedVideo={() => {}}
        selectedGrid={3}
        cameraChannels={[]}
      />
    );
    const wrapper = container.firstChild;
    expect(wrapper.className).toMatch(/grid-cols-3/);
    expect(wrapper.className).toMatch(/grid-rows-1/);
  });

  it("uses grid-cols-2 / grid-rows-2 (2x2) when itemCount===4", () => {
    const cams = makeCams(4);
    const { container } = render(
      <CameraTwo
        cameraData={cams}
        selectedVideo={null}
        setSelectedVideo={() => {}}
        selectedGrid={4}
        cameraChannels={[]}
      />
    );
    const wrapper = container.firstChild;
    expect(wrapper.className).toMatch(/grid-cols-2/);
    expect(wrapper.className).toMatch(/grid-rows-2/);
  });

  it("falls into the standard 5+ branch when itemCount>4 (selectedGrid=4)", () => {
    const cams = makeCams(6);
    const { container } = render(
      <CameraTwo
        cameraData={cams}
        selectedVideo={null}
        setSelectedVideo={() => {}}
        selectedGrid={4}
        cameraChannels={[]}
      />
    );
    const wrapper = container.firstChild;
    // 5+ cameras with selectedGrid=4 -> Math.min(itemCount, gridId)=4 cols,
    // gridRows=gridId=4 rows.
    expect(wrapper.className).toMatch(/grid-cols-4/);
    expect(wrapper.className).toMatch(/grid-rows-4/);
  });

  it("renders nothing when selectedGrid does not match 1-4", () => {
    const cams = makeCams(2);
    const { container } = render(
      <CameraTwo
        cameraData={cams}
        selectedVideo={null}
        setSelectedVideo={() => {}}
        selectedGrid={5}
        cameraChannels={[]}
      />
    );
    expect(container.querySelectorAll("[data-testid='display']")).toHaveLength(
      0
    );
  });
});
