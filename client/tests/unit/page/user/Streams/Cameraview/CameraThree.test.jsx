/**
 * src/page/user/Streams/Cameraview/CameraThree.jsx — 3-column grid wrapper
 * that renders one CameraStream per entry in `cameraData`, plus overlays
 * for `datetime` (top-right) and `title` (bottom-left). Forwards
 * `selectedVideo` and `setSelectedVideo` down to the child CameraStream.
 *
 * Unlike CameraOne/CameraFour, CameraThree does NOT call selectedVideo on
 * tile click — it just passes it through. So the interesting assertions
 * are: tile count matches cameraData.length, overlays render the right
 * fields, the grid wrapper carries the responsive grid-cols classes, and
 * empty cameraData renders no tiles.
 *
 * Mocks: 1 (CameraStream stub that surfaces label + selectedVideo via
 * props so we can assert pass-through).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock(
  "../../../../../../src/page/user/Streams/CameraPlay/CameraStream.jsx",
  () => ({
    default: ({ label, selectedVideo, setSelectedVideo }) => (
      <div
        data-testid="stream"
        data-selected={selectedVideo ? "yes" : "no"}
        data-has-setter={typeof setSelectedVideo === "function" ? "yes" : "no"}
      >
        {label}
      </div>
    ),
  })
);

import CameraThree from "../../../../../../src/page/user/Streams/Cameraview/CameraThree.jsx";

const makeCams = (n) =>
  Array.from({ length: n }, (_, i) => ({
    config: { src: `cam${i}.mp4` },
    label: `Cam-${i}`,
    title: `Title-${i}`,
    datetime: `2025-02-0${i + 1} 09:30`,
  }));

describe("Streams/Cameraview/CameraThree", () => {
  it("renders one CameraStream per cameraData entry with title/datetime overlays and passes through selectedVideo/setSelectedVideo", () => {
    const cams = makeCams(3);
    const setSelectedVideo = vi.fn();
    render(
      <CameraThree
        cameraData={cams}
        selectedVideo={{ label: "current" }}
        setSelectedVideo={setSelectedVideo}
      />
    );
    const streams = screen.getAllByTestId("stream");
    expect(streams).toHaveLength(3);
    // pass-through: every child receives the selectedVideo + setter
    streams.forEach((s) => {
      expect(s.getAttribute("data-selected")).toBe("yes");
      expect(s.getAttribute("data-has-setter")).toBe("yes");
    });
    // overlay text
    expect(screen.getByText("Title-0")).toBeInTheDocument();
    expect(screen.getByText("2025-02-01 09:30")).toBeInTheDocument();
    expect(screen.getByText("Title-2")).toBeInTheDocument();
  });

  it("renders the 3-column responsive grid wrapper and no tiles for empty cameraData", () => {
    const { container } = render(
      <CameraThree
        cameraData={[]}
        selectedVideo={null}
        setSelectedVideo={() => {}}
      />
    );
    const wrapper = container.firstChild;
    // grid wrapper present with the responsive class set
    expect(wrapper.className).toMatch(/grid/);
    expect(wrapper.className).toMatch(/lg:grid-cols-3/);
    expect(wrapper.className).toMatch(/sm:grid-cols-2/);
    // but no children rendered
    expect(container.querySelectorAll("[data-testid='stream']")).toHaveLength(0);
  });

  it("defaults cameraData to [] when prop is omitted (no crash, zero tiles)", () => {
    const { container } = render(<CameraThree />);
    expect(container.querySelectorAll("[data-testid='stream']")).toHaveLength(0);
  });
});
