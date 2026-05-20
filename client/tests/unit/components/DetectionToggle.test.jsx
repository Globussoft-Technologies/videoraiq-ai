/**
 * DetectionToggle wraps a Radix Switch with image/label decoration. We focus
 * on the contract: clicking the switch calls onChange with the item id +
 * new checked state, and `disabled` blocks both the underlying widget and
 * the onChange call.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DetectionToggle from "../../../src/components/DetectionToggle.jsx";

const baseItem = {
  id: "countPersons",
  label: "Persons Count",
  enabled: false,
  src: "/img/persons.svg",
};

describe("DetectionToggle", () => {
  it("renders the label when expanded", () => {
    render(
      <DetectionToggle item={baseItem} onChange={() => {}} isExpanded={true} />
    );
    expect(screen.getByText("Persons Count")).toBeInTheDocument();
  });

  it("renders the icon image with the label as alt text", () => {
    render(
      <DetectionToggle item={baseItem} onChange={() => {}} isExpanded={true} />
    );
    const img = screen.getByAltText("Persons Count");
    expect(img.getAttribute("src")).toBe("/img/persons.svg");
  });

  it("reflects the checked state on the underlying switch", () => {
    render(
      <DetectionToggle
        item={{ ...baseItem, enabled: true }}
        onChange={() => {}}
        isExpanded={true}
      />
    );
    expect(screen.getByRole("switch")).toHaveAttribute("data-state", "checked");
  });

  it("calls onChange with (id, true) when toggled from off", () => {
    const onChange = vi.fn();
    render(
      <DetectionToggle item={baseItem} onChange={onChange} isExpanded={true} />
    );
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith("countPersons", true);
  });

  it("does not fire onChange when disabled", () => {
    const onChange = vi.fn();
    render(
      <DetectionToggle
        item={baseItem}
        onChange={onChange}
        isExpanded={true}
        disabled
      />
    );
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
