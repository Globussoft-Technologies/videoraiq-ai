/**
 * Round 80: cover Dashboard/Alertwidgets/CameraViewSection.jsx — the
 * presentational camera-view panel rendered on the right side of the
 * dashboard. It owns no API calls and no state of its own: every value
 * (nvrList, selectedNvrId, cameraChannels, selectedCamera, selectedConfig,
 * personCounts, objectDetections, emotionDetected, etc.) is driven through
 * props, and four side-effects are passed in as handlers
 * (handleNvrChange / handleCameraClick / setSelectedVideo / scrollChannels).
 *
 * This spec pins the documented branches:
 *   1. nvrNameLoading=true            -> a skeleton placeholder
 *   2. nvrList.length <= 1            -> a disabled <input> showing the
 *                                        only NVR's nvrName
 *   3. nvrList.length > 1             -> the multi-NVR <Select> with one
 *                                        SelectItem per nvr, selectedNvrId
 *                                        wired into value
 *   4. cameraChannels populated +
 *      selectedNvrDetails truthy      -> a horizontal channel tab strip
 *                                        with one button per channel that
 *                                        has at least one rtspChannel +
 *                                        a name, selected highlighted
 *   5. cameraChannels empty           -> the four skeleton placeholders
 *                                        between the disabled chevrons
 *   6. selectedConfig truthy          -> the CameraStream child mounts
 *      selectedConfig falsy           -> the Skeleton placeholder shows
 *   7. lineCrossing with atoB/btoA    -> renders the "Line Crossing
 *                                        Detected" tile with the A→B / B→A
 *                                        counts formatted in the label
 *      lineCrossing missing/-1        -> the tile is omitted
 *   8. handleCameraClick fires with
 *      the picked channel when a tab
 *      is clicked; scrollChannels is
 *      invoked with 'left' / 'right'
 *      when the side chevrons are
 *      pressed.
 *
 * Mocks (4):
 *   1. @/components/ui/select — Radix Portal makes content invisible in
 *      jsdom; passthrough shim that captures value + onValueChange.
 *   2. @/utils/DynamicDateTime — replaced by a marker div (the real impl
 *      pulls a live clock + moment + the user's region).
 *   3. ../../Streams/CameraPlay/CameraStream — replaced by a marker div
 *      that captures the config + maxmin button click side-effects.
 *   4. react-loading-skeleton — replaced by a marker div with the
 *      forwarded width / height attributes.
 *
 * Well under the 8-mock cap.
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";

vi.mock("@/components/ui/select", () => {
  const Select = ({ children, value, onValueChange }) =>
    React.createElement(
      "div",
      {
        "data-slot": "select",
        "data-value": value ?? "",
        onClick: (e) => {
          // Bubble select-item clicks into onValueChange so tests can
          // simulate picking an option by clicking the label.
          const target = e.target;
          if (target?.dataset?.selectItemValue && onValueChange) {
            onValueChange(target.dataset.selectItemValue);
          }
        },
      },
      children,
    );
  const SelectTrigger = ({ children, ...rest }) =>
    React.createElement("div", { "data-slot": "select-trigger", ...rest }, children);
  const SelectContent = ({ children, ...rest }) =>
    React.createElement("div", { "data-slot": "select-content", ...rest }, children);
  const SelectValue = ({ placeholder }) =>
    React.createElement("span", { "data-slot": "select-value" }, placeholder);
  const SelectItem = ({ value, children, ...rest }) =>
    React.createElement(
      "div",
      {
        "data-slot": "select-item",
        "data-select-item-value": value,
        ...rest,
      },
      children,
    );
  return { Select, SelectTrigger, SelectContent, SelectValue, SelectItem };
});

vi.mock("@/utils/DynamicDateTime", () => ({
  default: () => React.createElement("div", { "data-testid": "dyn-time" }, "now"),
}));

const cameraStreamCalls = vi.hoisted(() => []);
vi.mock(
  "../../../../../../src/page/user/Streams/CameraPlay/CameraStream.jsx",
  () => ({
    default: (props) => {
      cameraStreamCalls.push(props);
      return React.createElement("div", {
        "data-testid": "camera-stream",
        "data-config-ip": props.config?.IP ?? "",
      });
    },
  }),
);

vi.mock("react-loading-skeleton", () => ({
  default: ({ height }) =>
    React.createElement("div", {
      "data-testid": "skeleton",
      "data-height": String(height ?? ""),
    }),
}));

const { default: CameraViewSection } = await import(
  "../../../../../../src/page/user/Dashboard/Alertwidgets/CameraViewSection.jsx"
);

const baseProps = () => ({
  nvrList: [],
  selectedNvrId: "",
  handleNvrChange: vi.fn(),
  cameraChannels: [],
  selectedCamera: null,
  handleCameraClick: vi.fn(),
  selectedConfig: null,
  selectedVideo: null,
  setSelectedVideo: vi.fn(),
  personCounts: { count: 0 },
  // The component's destructure happens to shadow the named import:
  // `lineCrossing` arrives as a prop. When missing/null the LineCrossing
  // tile must be hidden; when present with atoB/btoA the tile renders.
  lineCrossing: null,
  objectDetections: { objectsDetected: [], phoneUsage: 0 },
  emotionDetected: "Neutral",
  nvrNameLoading: false,
  selectedNvrDetails: null,
  channelScrollRef: { current: null },
  scrollChannels: vi.fn(),
});

describe("Dashboard/Alertwidgets/CameraViewSection", () => {
  it("renders a Skeleton placeholder while nvrNameLoading is true", () => {
    render(<CameraViewSection {...baseProps()} nvrNameLoading={true} />);
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
    // The NVR input/select must NOT be there yet.
    expect(screen.queryByDisplayValue("My NVR")).toBeNull();
    expect(screen.queryByTestId("dyn-time")).toBeInTheDocument();
    cleanup();
  });

  it("renders a disabled NVR input when nvrList has exactly one entry", () => {
    const props = baseProps();
    props.nvrList = [{ _id: "n1", nvrName: "My NVR" }];
    render(<CameraViewSection {...props} />);
    const input = screen.getByDisplayValue("My NVR");
    expect(input).toBeInTheDocument();
    expect(input).toBeDisabled();
    // No multi-select element should be present in this branch.
    expect(screen.queryByText("Select an NVR")).toBeNull();
    cleanup();
  });

  it("renders the multi-NVR Select with one option per nvr and forwards onValueChange", () => {
    const props = baseProps();
    props.nvrList = [
      { _id: "n1", nvrName: "NVR-1" },
      { _id: "n2", nvrName: "NVR-2" },
    ];
    props.selectedNvrId = "n2";
    render(<CameraViewSection {...props} />);
    // The mocked SelectValue echoes its placeholder.
    expect(screen.getByText("Select an NVR")).toBeInTheDocument();
    const options = screen.getAllByText(/NVR-\d/);
    expect(options.length).toBe(2);
    // Selected value flows through the data-value on the wrapper div.
    const wrapper = document.querySelector("[data-slot='select']");
    expect(wrapper.getAttribute("data-value")).toBe("n2");

    // Click a SelectItem -> handleNvrChange should fire with that value.
    fireEvent.click(options[0]);
    expect(props.handleNvrChange).toHaveBeenCalledWith("n1");
    cleanup();
  });

  it("renders one channel tab per valid channel and highlights the selected one", () => {
    const props = baseProps();
    props.selectedNvrDetails = { ip: "1.2.3.4" };
    props.cameraChannels = [
      // Two rtspChannels -> use [1] substream
      {
        _id: "c1",
        name: "Cam A",
        rtspChannels: [{ id: "main" }, { id: "sub" }],
      },
      // One rtspChannel -> use [0]
      { _id: "c2", name: "Cam B", rtspChannels: [{ id: "only" }] },
      // No stream -> filtered out (returns null)
      { _id: "c3", name: "Cam C", rtspChannels: [] },
      // No name -> filtered out
      { _id: "c4", name: "", rtspChannels: [{ id: "x" }] },
    ];
    props.selectedCamera = "c2";
    render(<CameraViewSection {...props} />);

    const camA = screen.getByText("Cam A");
    const camB = screen.getByText("Cam B");
    expect(camA).toBeInTheDocument();
    expect(camB).toBeInTheDocument();
    // Cam C / Cam D are filtered out.
    expect(screen.queryByText("Cam C")).toBeNull();

    // selectedCamera === 'c2' -> the Cam B button has the selected class.
    expect(camB.className).toMatch(/bg-\[#0B1A6A\]/);
    expect(camA.className).not.toMatch(/bg-\[#0B1A6A\]/);

    // Click a tab -> handleCameraClick fires with the full channel object.
    fireEvent.click(camA);
    expect(props.handleCameraClick).toHaveBeenCalledTimes(1);
    expect(props.handleCameraClick.mock.calls[0][0]._id).toBe("c1");
    cleanup();
  });

  it("renders the four placeholder skeleton chips when there are no channels", () => {
    render(<CameraViewSection {...baseProps()} />);
    // The placeholder branch renders four animated tiles; ensure four such
    // elements are in the document.
    const placeholders = document.querySelectorAll(".animate-pulse");
    expect(placeholders.length).toBe(4);
    cleanup();
  });

  it("mounts CameraStream when selectedConfig is truthy and a placeholder Skeleton otherwise", () => {
    cameraStreamCalls.length = 0;
    const props = baseProps();
    const { rerender } = render(<CameraViewSection {...props} />);
    expect(screen.queryByTestId("camera-stream")).toBeNull();

    props.selectedConfig = { IP: "10.0.0.1" };
    props.selectedCamera = "c1";
    rerender(<CameraViewSection {...props} />);
    expect(screen.getByTestId("camera-stream")).toBeInTheDocument();
    // The stream child received the selectedConfig prop.
    const stream = cameraStreamCalls.at(-1);
    expect(stream.config.IP).toBe("10.0.0.1");
    expect(stream.selectedVideo).toBe(props.selectedVideo);
    cleanup();
  });

  it("invokes scrollChannels('left'|'right') when the chevron buttons are clicked", () => {
    const props = baseProps();
    props.selectedNvrDetails = { ip: "1.2.3.4" };
    props.cameraChannels = [
      { _id: "c1", name: "Cam A", rtspChannels: [{ id: "x" }] },
    ];
    render(<CameraViewSection {...props} />);
    // Two chevron buttons sit at the start/end of the channel strip; the
    // strip is the only place chevrons render in the populated branch.
    const buttons = document.querySelectorAll(
      "button.bg-white.border.cursor-pointer",
    );
    expect(buttons.length).toBe(2);
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    expect(props.scrollChannels).toHaveBeenNthCalledWith(1, "left");
    expect(props.scrollChannels).toHaveBeenNthCalledWith(2, "right");
    cleanup();
  });

  it("renders the LineCrossing detection tile when lineCrossing prop carries counts", () => {
    const props = baseProps();
    props.lineCrossing = { atoB: 5, btoA: 2 };
    render(<CameraViewSection {...props} />);
    expect(screen.getByText("Line Crossing Detected")).toBeInTheDocument();
    // The count formatter splices A → B / B → A into a single string.
    expect(screen.getByText("A → B: 5, B → A: 2")).toBeInTheDocument();
    cleanup();
  });

  it("hides the LineCrossing tile when lineCrossing is null/undefined", () => {
    render(<CameraViewSection {...baseProps()} />);
    expect(screen.queryByText("Line Crossing Detected")).toBeNull();
    cleanup();
  });

  it("renders the four base DetectionInfo tiles with prop-driven counts", () => {
    const props = baseProps();
    props.personCounts = { count: 9 };
    props.objectDetections = {
      objectsDetected: [{ knife: 1, gun: 2 }],
      phoneUsage: 3,
    };
    props.emotionDetected = "Happy";
    render(<CameraViewSection {...props} />);
    expect(screen.getByText("People Detected")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("Suspicious Activity")).toBeInTheDocument();
    expect(screen.getByText(/knife: 1/)).toBeInTheDocument();
    expect(screen.getByText("Phone Usage")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Emotion Detected")).toBeInTheDocument();
    expect(screen.getByText("Happy")).toBeInTheDocument();
    cleanup();
  });
});
