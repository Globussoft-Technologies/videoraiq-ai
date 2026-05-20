/**
 * CustomTimePicker — a self-contained time-range editor. Behaviours under test:
 *  - rendering gating on `open`
 *  - hour/minute increment / decrement (with wrap-around)
 *  - keyboard ArrowUp / ArrowDown
 *  - "End of Day" checkbox toggle (sets 24:00 / restores previous)
 *  - save validation: equal, end<start, >24h
 *  - delete + close handlers
 *  - blur-commit clamps out-of-range values
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CustomTimePicker from "../../../../src/components/Schedule/CustomTimePicker.jsx";

const baseProps = () => ({
  open: true,
  onClose: vi.fn(),
  onSave: vi.fn(),
  onDelete: vi.fn(),
  start: "09:00",
  end: "17:00",
});

describe("CustomTimePicker", () => {
  it("renders nothing when open=false", () => {
    const props = { ...baseProps(), open: false };
    const { container } = render(<CustomTimePicker {...props} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders header text and initial start/end values", () => {
    render(<CustomTimePicker {...baseProps()} />);
    expect(screen.getByText("Edit Time Range")).toBeInTheDocument();
    expect(screen.getByLabelText("Start hour").value).toBe("09");
    expect(screen.getByLabelText("Start minute").value).toBe("00");
    expect(screen.getByLabelText("End hour").value).toBe("17");
    expect(screen.getByLabelText("End minute").value).toBe("00");
  });

  it("displays 00:00 in the End fields when end='24:00' (and pre-checks End of Day)", () => {
    render(<CustomTimePicker {...baseProps()} end="24:00" />);
    expect(screen.getByLabelText("End hour").value).toBe("00");
    expect(screen.getByLabelText("End minute").value).toBe("00");
    // End-of-day inputs are disabled when the toggle is on
    expect(screen.getByLabelText("End hour")).toBeDisabled();
  });

  it("increments hour on Increase-hour click and wraps from 23 to 0", () => {
    render(<CustomTimePicker {...baseProps()} start="23:30" end="23:45" />);
    fireEvent.click(screen.getByLabelText("Increase start hour"));
    expect(screen.getByLabelText("Start hour").value).toBe("00");
  });

  it("decrements minute past 0 to 59", () => {
    render(<CustomTimePicker {...baseProps()} start="09:00" end="17:00" />);
    fireEvent.click(screen.getByLabelText("Decrease start minute"));
    expect(screen.getByLabelText("Start minute").value).toBe("59");
  });

  it("ArrowUp on a focused hour field increments it", () => {
    render(<CustomTimePicker {...baseProps()} />);
    const input = screen.getByLabelText("Start hour");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.value).toBe("10");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.value).toBe("09");
  });

  it("typing non-digits filters them out; blur clamps overflow", () => {
    render(<CustomTimePicker {...baseProps()} />);
    const hour = screen.getByLabelText("Start hour");
    fireEvent.change(hour, { target: { value: "9a9" } });
    expect(hour.value).toBe("99"); // only digits, capped at 2 chars
    fireEvent.blur(hour);
    expect(hour.value).toBe("23"); // clamped to max 23
  });

  it("blur clamps minute > 59 down to 59", () => {
    render(<CustomTimePicker {...baseProps()} />);
    const m = screen.getByLabelText("Start minute");
    fireEvent.change(m, { target: { value: "88" } });
    fireEvent.blur(m);
    expect(m.value).toBe("59");
  });

  it("save with end == start shows error and does not call onSave", () => {
    const onSave = vi.fn();
    render(<CustomTimePicker {...baseProps()} onSave={onSave} start="10:00" end="10:00" />);
    fireEvent.click(screen.getByText("Save Changes"));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/cannot be the same/i)).toBeInTheDocument();
  });

  it("save with end < start shows the cannot-cross-midnight error", () => {
    const onSave = vi.fn();
    render(<CustomTimePicker {...baseProps()} onSave={onSave} start="20:00" end="05:00" />);
    fireEvent.click(screen.getByText("Save Changes"));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/cannot cross midnight/i)).toBeInTheDocument();
  });

  it("save with valid range calls onSave(start, end) then onClose", () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <CustomTimePicker {...baseProps()} onSave={onSave} onClose={onClose} start="09:00" end="17:30" />
    );
    fireEvent.click(screen.getByText("Save Changes"));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith("09:00", "17:30");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("End-of-Day checkbox forces saved end to '24:00'", () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <CustomTimePicker
        {...baseProps()}
        onSave={onSave}
        onClose={onClose}
        start="09:00"
        end="17:00"
      />
    );
    // Click the End-of-Day checkbox
    const checkbox = screen.getByLabelText(/End of Day/i);
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByText("Save Changes"));
    expect(onSave).toHaveBeenCalledWith("09:00", "24:00");
  });

  it("Delete button invokes onDelete then onClose", () => {
    const onDelete = vi.fn();
    const onClose = vi.fn();
    render(<CustomTimePicker {...baseProps()} onDelete={onDelete} onClose={onClose} />);
    fireEvent.click(screen.getByText("Delete"));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Close (X) button calls onClose", () => {
    const onClose = vi.fn();
    const { container } = render(<CustomTimePicker {...baseProps()} onClose={onClose} />);
    // First close button in the header
    const closeBtn = container.querySelector("button.text-white\\/80");
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it("editing an input clears the previous error message", () => {
    render(<CustomTimePicker {...baseProps()} start="10:00" end="10:00" />);
    fireEvent.click(screen.getByText("Save Changes"));
    expect(screen.getByText(/cannot be the same/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Start hour"), { target: { value: "11" } });
    expect(screen.queryByText(/cannot be the same/i)).toBeNull();
  });

  it("toggling End-of-Day off restores the previous end value", () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <CustomTimePicker
        {...baseProps()}
        onSave={onSave}
        onClose={onClose}
        start="09:00"
        end="17:00"
      />
    );
    const checkbox = screen.getByLabelText(/End of Day/i);
    fireEvent.click(checkbox); // on -> end becomes 24:00 visually
    fireEvent.click(checkbox); // off -> restore previous 17:00
    fireEvent.click(screen.getByText("Save Changes"));
    expect(onSave).toHaveBeenCalledWith("09:00", "17:00");
  });

  it("handles a malformed time string by falling back to 00:00", () => {
    render(<CustomTimePicker {...baseProps()} start="" end="garbage" />);
    expect(screen.getByLabelText("Start hour").value).toBe("00");
    expect(screen.getByLabelText("End hour").value).toBe("00");
  });
});
