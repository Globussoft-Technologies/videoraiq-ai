/**
 * src/page/user/Detection/components/TimeSlotsPopover.jsx — popover that
 * shows "+N More" slots beyond the first two. The handler ignores slots
 * 0 and 1 and surfaces the rest in the popover panel. Supports slots as
 * strings, objects with `label`, or objects with `startTime/endTime`.
 *
 * Mocks (1):
 *   1. @/components/ui/popover — Radix portal makes content invisible in
 *      jsdom; inline shim so trigger+content render together.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }) => <div data-mock="popover">{children}</div>,
  PopoverTrigger: ({ children }) => <div data-mock="trigger">{children}</div>,
  PopoverContent: ({ children }) => <div data-mock="content">{children}</div>,
}));

const { default: TimeSlotsPopover } = await import(
  "../../../../../../src/page/user/Detection/components/TimeSlotsPopover.jsx"
);

describe("TimeSlotsPopover", () => {
  it("returns null when slots length <= 2 (no remaining)", () => {
    const { container } = render(
      <TimeSlotsPopover day="Mon" slots={["8-9", "10-11"]} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("returns null when slots is empty (default)", () => {
    const { container } = render(<TimeSlotsPopover day="Tue" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders trigger with '+N More' count for remaining slots", () => {
    render(
      <TimeSlotsPopover
        day="Wed"
        slots={["a", "b", "c", "d", "e"]}
      />
    );
    expect(screen.getByText("+3 More")).toBeInTheDocument();
  });

  it("expands the full day name in the panel heading", () => {
    render(
      <TimeSlotsPopover day="Thu" slots={["x", "y", "z"]} />
    );
    expect(screen.getByText("Thursday")).toBeInTheDocument();
  });

  it("falls back to the raw day key when not in the map", () => {
    render(
      <TimeSlotsPopover day="Holiday" slots={["a", "b", "c", "d"]} />
    );
    expect(screen.getByText("Holiday")).toBeInTheDocument();
  });

  it("renders string slot labels verbatim", () => {
    render(
      <TimeSlotsPopover
        day="Fri"
        slots={["s0", "s1", "9am-10am", "11am-12pm"]}
      />
    );
    expect(screen.getByText("9am-10am")).toBeInTheDocument();
    expect(screen.getByText("11am-12pm")).toBeInTheDocument();
  });

  it("renders slot.label when slot is an object with label", () => {
    render(
      <TimeSlotsPopover
        day="Sat"
        slots={[{}, {}, { label: "Morning Shift" }]}
      />
    );
    expect(screen.getByText("Morning Shift")).toBeInTheDocument();
  });

  it("renders 'startTime - endTime' when slot has time fields", () => {
    render(
      <TimeSlotsPopover
        day="Sun"
        slots={[{}, {}, { startTime: "09:00", endTime: "10:30" }]}
      />
    );
    expect(screen.getByText("09:00 - 10:30")).toBeInTheDocument();
  });

  it("renders empty string for null / weird slots without crashing", () => {
    render(
      <TimeSlotsPopover
        day="Mon"
        slots={["a", "b", null, undefined, { foo: "bar" }]}
      />
    );
    // The buttons should still exist (3 remaining) even if their labels are empty
    const buttons = screen.getAllByRole("button");
    // 1 trigger + 3 panel buttons (one per remaining slot)
    expect(buttons.length).toBe(4);
  });

  it("invokes onSelect with the original slot when an item is clicked", () => {
    const onSelect = vi.fn();
    const slot = { label: "Evening" };
    render(
      <TimeSlotsPopover
        day="Mon"
        slots={["a", "b", slot]}
        onSelect={onSelect}
      />
    );
    fireEvent.click(screen.getByText("Evening"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(slot);
  });

  it("does not crash when onSelect is missing", () => {
    render(
      <TimeSlotsPopover day="Mon" slots={["a", "b", "c"]} />
    );
    expect(() => fireEvent.click(screen.getByText("c"))).not.toThrow();
  });

  it("uses default trigger className when none is provided", () => {
    render(<TimeSlotsPopover day="Mon" slots={["a", "b", "c"]} />);
    const trigger = screen.getByText("+1 More");
    expect(trigger.className).toMatch(/cursor-pointer/);
  });

  it("respects a custom triggerClassName", () => {
    render(
      <TimeSlotsPopover
        day="Mon"
        slots={["a", "b", "c"]}
        triggerClassName="my-custom"
      />
    );
    expect(screen.getByText("+1 More").className).toBe("my-custom");
  });

  it("sets an accessible label on the trigger including the day", () => {
    render(<TimeSlotsPopover day="Mon" slots={["a", "b", "c"]} />);
    expect(
      screen.getByLabelText("Show more time slots for Mon")
    ).toBeInTheDocument();
  });
});
