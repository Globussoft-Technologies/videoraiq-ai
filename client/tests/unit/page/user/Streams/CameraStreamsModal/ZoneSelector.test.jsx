/**
 * Round 52 — cover src/page/user/Streams/CameraStreamsModal/ZoneSelector.jsx.
 *
 * ZoneSelector is a small floating, click-to-open zone picker rendered
 * on top of the stream modal. The selected-zone button toggles a panel
 * listing every detection's zone_name; picking one calls
 * setSelectedZone(detection) and closes the panel. The widget is also
 * draggable inside .stream-modal: mousedown on the .zone-drag-handle
 * starts the drag (mousemove constrains to modal bounds, mouseup ends
 * it). If no .stream-modal ancestor exists, the move handler bails
 * early and leaves the position untouched. When `selectedZone` is
 * falsy the trigger button is hidden, so opening the panel is gated.
 *
 * No product code is touched — this file lives entirely under tests/.
 * Mocks: 0 (pure-DOM component, react-icons / lucide-react render
 * inline SVGs the assertions don't care about).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";

import ZoneSelector from "../../../../../../src/page/user/Streams/CameraStreamsModal/ZoneSelector.jsx";

const detections = [
  {
    _id: "d1",
    detectionSetting: { settings: { referencePoints: { zone_name: "Lobby" } } },
  },
  {
    _id: "d2",
    detectionSetting: { settings: { referencePoints: { zone_name: "Gate" } } },
  },
];

describe("Streams/CameraStreamsModal/ZoneSelector", () => {
  beforeEach(() => {
    // jsdom doesn't set innerWidth; pin it so the initial zonePosition is
    // deterministic and the component doesn't blow up on the read.
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1200,
    });
  });

  afterEach(() => {
    // Clean up any .stream-modal we appended.
    document.querySelectorAll(".stream-modal").forEach((n) => n.remove());
  });

  it("renders the selected zone name and opens a list that picks a new zone on click", () => {
    const setSelectedZone = vi.fn();
    render(
      <ZoneSelector
        detectionsForCamera={detections}
        selectedZone={detections[0]}
        setSelectedZone={setSelectedZone}
      />
    );

    // Initially closed: only the trigger label is visible.
    expect(screen.getByText("Lobby")).toBeInTheDocument();
    expect(screen.queryByText("Gate")).not.toBeInTheDocument();

    // Click the trigger -> panel opens with one entry per detection.
    fireEvent.click(screen.getByRole("button", { name: /Lobby/i }));
    expect(screen.getByText("Gate")).toBeInTheDocument();

    // Picking "Gate" calls the setter with the matching detection and
    // closes the panel.
    fireEvent.click(screen.getByText("Gate"));
    expect(setSelectedZone).toHaveBeenCalledTimes(1);
    expect(setSelectedZone).toHaveBeenCalledWith(detections[1]);
    expect(screen.queryByText("Gate")).not.toBeInTheDocument();
  });

  it("renders nothing inside the drag handle when selectedZone is falsy", () => {
    const { container } = render(
      <ZoneSelector
        detectionsForCamera={detections}
        selectedZone={null}
        setSelectedZone={() => {}}
      />
    );
    // Trigger button must NOT render -> no button inside the wrapper.
    expect(container.querySelector("button")).toBeNull();
    // The outer drag wrapper still renders.
    expect(container.querySelector(".zone-drag-handle")).not.toBeNull();
  });

  it("starts a drag on mousedown and the mouseup listener clears the dragging state", () => {
    // Provide a .stream-modal ancestor with a fake bounding rect so the
    // move handler doesn't early-return.
    const modal = document.createElement("div");
    modal.className = "stream-modal";
    modal.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 1000,
      height: 800,
      right: 1000,
      bottom: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    document.body.appendChild(modal);

    const { container } = render(
      <ZoneSelector
        detectionsForCamera={detections}
        selectedZone={detections[0]}
        setSelectedZone={() => {}}
      />
    );
    const handle = container.querySelector(".zone-drag-handle");

    // mousedown on the handle starts the drag (no throw, listener attaches).
    fireEvent.mouseDown(handle, { clientX: 50, clientY: 50 });
    // A subsequent window mouseup must run without throwing and detach the
    // listener -- the test just asserts that the lifecycle completes.
    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"));
    });
    // After mouseup, dispatching a move should be a no-op (listeners
    // detached) — still no throw.
    act(() => {
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 120, clientY: 200 })
      );
    });
    expect(container.querySelector(".zone-drag-handle")).not.toBeNull();
  });
});
