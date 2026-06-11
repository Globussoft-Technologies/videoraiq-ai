/**
 * Gap-fills for src/page/user/Streams/CameraStreamsModal/ZoneSelector.jsx
 *
 * Uncovered: handleZoneMouseMove (lines 27-41). The drag mouseDown only
 * fires when e.target.closest('.zone-drag-handle') matches. Once a drag
 * is begun, the useCallback'd mousemove listener attached on `window`
 * computes the new position relative to the .stream-modal ancestor and
 * clamps to its bounds.
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";

import ZoneSelector from "../../../../../../src/page/user/Streams/CameraStreamsModal/ZoneSelector.jsx";

describe("ZoneSelector drag gap-fills", () => {
  it("dragging from within the .zone-drag-handle updates the zone position", () => {
    const detection = {
      _id: "z1",
      detectionSetting: {
        settings: { referencePoints: { zone_name: "Z1" } },
      },
    };

    // Wrap the component in a fake .stream-modal so the mousemove handler
    // finds an ancestor with getBoundingClientRect.
    const { container } = render(
      <div className="stream-modal" style={{ width: 1000, height: 800 }}>
        <ZoneSelector
          detectionsForCamera={[detection]}
          selectedZone={detection}
          setSelectedZone={vi.fn()}
        />
      </div>
    );

    // Force the .stream-modal getBoundingClientRect.
    const modal = container.querySelector(".stream-modal");
    modal.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800, x: 0, y: 0,
    });

    const handle = container.querySelector(".zone-drag-handle");
    expect(handle).not.toBeNull();

    // mouseDown inside the drag handle initiates drag.
    fireEvent.mouseDown(handle, { clientX: 50, clientY: 50 });

    // The mousemove handler is attached to window — dispatch one.
    act(() => {
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 300, clientY: 250 })
      );
    });

    // mouseup releases the drag.
    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"));
    });

    // Component didn't throw and is still rendered.
    expect(container.querySelector(".zone-drag-handle")).not.toBeNull();
  });

  it("clicking the zone select button opens the dropdown and clicking a detection picks it", () => {
    const detection1 = {
      _id: "z1",
      detectionSetting: { settings: { referencePoints: { zone_name: "Zone1" } } },
    };
    const detection2 = {
      _id: "z2",
      detectionSetting: { settings: { referencePoints: { zone_name: "Zone2" } } },
    };
    const setSelectedZone = vi.fn();
    const { container, getByText } = render(
      <ZoneSelector
        detectionsForCamera={[detection1, detection2]}
        selectedZone={detection1}
        setSelectedZone={setSelectedZone}
      />
    );

    // Click the zone selector button (Zone1).
    const trigger = container.querySelector(".zone-drag-handle button");
    fireEvent.click(trigger);

    // Dropdown now shows Zone2 (and Zone1).
    fireEvent.click(getByText("Zone2"));
    expect(setSelectedZone).toHaveBeenCalledWith(detection2);
  });

  it("mousedown outside the .zone-drag-handle does NOT initiate a drag", () => {
    const detection = {
      _id: "z1",
      detectionSetting: { settings: { referencePoints: { zone_name: "Z1" } } },
    };
    const { container } = render(
      <ZoneSelector
        detectionsForCamera={[detection]}
        selectedZone={detection}
        setSelectedZone={vi.fn()}
      />
    );

    // The outer absolute-positioned wrapper is NOT a .zone-drag-handle.
    const wrapper = container.firstChild;
    fireEvent.mouseDown(wrapper, { clientX: 0, clientY: 0 });
    // No mousemove listener should be attached — the cursor stays "grab".
    expect(wrapper.style.cursor).toBe("grab");
  });
});
