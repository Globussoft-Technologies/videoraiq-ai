/**
 * src/page/user/EmployeeLogs/components/TimePickerComponents.jsx — the
 * 12-hour time picker bits used by the logs filter popover. Exports:
 *  - HourCombobox    (1-12 hour input + filterable dropdown)
 *  - MinuteCombobox  (00-59 minute input + filterable dropdown)
 *  - PeriodSelect    (AM/PM select via @/components/ui/select)
 *  - UnifiedTimePicker (Popover composed of hour/minute/period columns
 *    + Clear / Done buttons)
 *
 * Mocks (2):
 *  1. @/components/ui/popover — render Popover/Trigger/Content inline so
 *     the UnifiedTimePicker body is always visible (Radix portals don't
 *     render under jsdom out of the box).
 *  2. @/components/ui/select  — replace with native <select> + <option>
 *     so onValueChange can be driven by fireEvent.change.
 *
 * The Input ui primitive is left intact (it's a forwardRef'd <input>).
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }) => <div data-testid="popover">{children}</div>,
  PopoverTrigger: ({ children }) => <div>{children}</div>,
  PopoverContent: ({ children }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/select", () => {
  const Select = ({ value, onValueChange, children }) => (
    <select
      data-testid="period-select"
      value={value || ""}
      onChange={(e) => onValueChange?.(e.target.value)}
    >
      <option value="">__placeholder__</option>
      {children}
    </select>
  );
  const SelectTrigger = ({ children }) => <>{children}</>;
  const SelectValue = ({ placeholder }) => <span>{placeholder}</span>;
  const SelectContent = ({ children }) => <>{children}</>;
  const SelectItem = ({ value, children }) => (
    <option value={value}>{children}</option>
  );
  return { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
});

const {
  HourCombobox,
  MinuteCombobox,
  PeriodSelect,
  UnifiedTimePicker,
} = await import(
  "../../../../../../src/page/user/EmployeeLogs/components/TimePickerComponents.jsx"
);

describe("EmployeeLogs/components/TimePickerComponents HourCombobox", () => {
  it("renders label and shows the current value in the input", () => {
    const onChange = vi.fn();
    render(<HourCombobox value="09" onChange={onChange} label="From hour" />);
    expect(screen.getByText("From hour")).toBeInTheDocument();
    const input = screen.getByPlaceholderText("--");
    expect(input.value).toBe("09");
  });

  it("opens dropdown on focus and lists all 12 hour options", () => {
    render(<HourCombobox value="" onChange={vi.fn()} label="Hour" />);
    const input = screen.getByPlaceholderText("--");
    fireEvent.focus(input);
    // Should show 01..12 buttons (full list since input is empty).
    for (const h of ["01", "02", "09", "10", "11", "12"]) {
      expect(screen.getByRole("button", { name: h })).toBeInTheDocument();
    }
  });

  it("typing fires onChange and filters the displayed options", () => {
    const onChange = vi.fn();
    render(<HourCombobox value="" onChange={onChange} label="Hour" />);
    const input = screen.getByPlaceholderText("--");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "1" } });
    expect(onChange).toHaveBeenLastCalledWith("1");
    // After typing "1", visible options should be those that include "1":
    // 01, 10, 11, 12.
    expect(screen.getByRole("button", { name: "01" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "10" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "11" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "12" })).toBeInTheDocument();
    // 02 should be filtered out.
    expect(screen.queryByRole("button", { name: "02" })).toBeNull();
  });

  it("clicking a dropdown option fires onChange and closes the dropdown", () => {
    const onChange = vi.fn();
    render(<HourCombobox value="" onChange={onChange} label="Hour" />);
    const input = screen.getByPlaceholderText("--");
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("button", { name: "07" }));
    expect(onChange).toHaveBeenLastCalledWith("07");
    // Dropdown closed -> 07 button gone.
    expect(screen.queryByRole("button", { name: "07" })).toBeNull();
    // Input now reflects the selected value.
    expect(input.value).toBe("07");
  });

  it("shows the 'No hours match' empty state when filter has no hits", () => {
    render(<HourCombobox value="" onChange={vi.fn()} label="Hour" />);
    const input = screen.getByPlaceholderText("--");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "9" } });
    // Wait — "09" contains "9", so we need a value with no matches.
    fireEvent.change(input, { target: { value: "x" } });
    expect(screen.getByText("No hours match")).toBeInTheDocument();
  });

  it("syncs internal state when the external value prop changes", () => {
    const { rerender } = render(
      <HourCombobox value="03" onChange={vi.fn()} label="Hour" />
    );
    expect(screen.getByPlaceholderText("--").value).toBe("03");
    rerender(<HourCombobox value="08" onChange={vi.fn()} label="Hour" />);
    expect(screen.getByPlaceholderText("--").value).toBe("08");
  });
});

describe("EmployeeLogs/components/TimePickerComponents MinuteCombobox", () => {
  it("renders label and current minute value", () => {
    render(<MinuteCombobox value="45" onChange={vi.fn()} label="Minute" />);
    expect(screen.getByText("Minute")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("--").value).toBe("45");
  });

  it("opens dropdown on focus and clicking a minute calls onChange", () => {
    const onChange = vi.fn();
    render(<MinuteCombobox value="" onChange={onChange} label="Minute" />);
    fireEvent.focus(screen.getByPlaceholderText("--"));
    // "30" should be one of the 60 options.
    fireEvent.click(screen.getByRole("button", { name: "30" }));
    expect(onChange).toHaveBeenLastCalledWith("30");
    expect(screen.getByPlaceholderText("--").value).toBe("30");
  });

  it("shows 'No minutes match' when filter matches nothing", () => {
    render(<MinuteCombobox value="" onChange={vi.fn()} label="Minute" />);
    const input = screen.getByPlaceholderText("--");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "z" } });
    expect(screen.getByText("No minutes match")).toBeInTheDocument();
  });
});

describe("EmployeeLogs/components/TimePickerComponents PeriodSelect", () => {
  it("renders the label and AM/PM options via the (mocked) Select", () => {
    const onChange = vi.fn();
    render(<PeriodSelect value="AM" onChange={onChange} label="AM-PM" />);
    expect(screen.getByText("AM-PM")).toBeInTheDocument();
    const select = screen.getByTestId("period-select");
    expect(select.value).toBe("AM");
    // AM + PM <option>s plus the placeholder one rendered by the mock.
    const options = select.querySelectorAll("option");
    const values = Array.from(options).map((o) => o.value);
    expect(values).toContain("AM");
    expect(values).toContain("PM");
  });

  it("forwards selected value through onValueChange -> onChange", () => {
    const onChange = vi.fn();
    render(<PeriodSelect value="AM" onChange={onChange} label="Period" />);
    fireEvent.change(screen.getByTestId("period-select"), {
      target: { value: "PM" },
    });
    expect(onChange).toHaveBeenCalledWith("PM");
  });
});

describe("EmployeeLogs/components/TimePickerComponents UnifiedTimePicker", () => {
  it("renders an empty trigger and placeholder when no time is set", () => {
    render(
      <UnifiedTimePicker
        hour=""
        minute=""
        period=""
        onChange={vi.fn()}
        placeholder="HH:MM AA"
      />
    );
    // Input value is empty -> placeholder visible via the readOnly <input>.
    const input = screen.getByPlaceholderText("HH:MM AA");
    expect(input.value).toBe("");
    // Header tiles fall back to HH / MM / AM labels.
    expect(screen.getByText("HH")).toBeInTheDocument();
    expect(screen.getByText("MM")).toBeInTheDocument();
    // "AM" header tile + the AM column button (so 2 nodes).
    expect(screen.getAllByText("AM")).toHaveLength(2);
  });

  it("renders the formatted 'HH:MM P' string when all three parts are set", () => {
    render(
      <UnifiedTimePicker
        hour="09"
        minute="30"
        period="AM"
        onChange={vi.fn()}
      />
    );
    const input = screen.getByDisplayValue("09:30 AM");
    expect(input).toBeInTheDocument();
  });

  it("clicking an hour column option invokes onChange('hour', value)", () => {
    const onChange = vi.fn();
    render(
      <UnifiedTimePicker
        hour=""
        minute=""
        period=""
        onChange={onChange}
      />
    );
    // Both hour and minute columns include numbers like "05" / "12". The
    // hour column renders first in DOM order, so the first button match is
    // always the hour entry. Use "05" and pick the first occurrence.
    const matches = screen.getAllByRole("button", { name: "05" });
    expect(matches.length).toBeGreaterThan(0);
    fireEvent.click(matches[0]);
    expect(onChange).toHaveBeenCalledWith("hour", "05");
  });

  it("clicking a minute column option invokes onChange('minute', value)", () => {
    const onChange = vi.fn();
    render(
      <UnifiedTimePicker
        hour=""
        minute=""
        period=""
        onChange={onChange}
      />
    );
    // Minute column has 00..59. "59" is unique to the minute column.
    fireEvent.click(screen.getByRole("button", { name: "59" }));
    expect(onChange).toHaveBeenCalledWith("minute", "59");
  });

  it("clicking AM/PM column option invokes onChange('period', value)", () => {
    const onChange = vi.fn();
    render(
      <UnifiedTimePicker
        hour="01"
        minute="00"
        period="AM"
        onChange={onChange}
      />
    );
    // PM is the second period column button. Use exact match to skip the
    // "AM" header tile (which is a plain div, not a button).
    fireEvent.click(screen.getByRole("button", { name: "PM" }));
    expect(onChange).toHaveBeenCalledWith("period", "PM");
  });

  it("Clear button fires three onChange calls with empty values", () => {
    const onChange = vi.fn();
    render(
      <UnifiedTimePicker
        hour="09"
        minute="30"
        period="AM"
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenCalledWith("hour", "");
    expect(onChange).toHaveBeenCalledWith("minute", "");
    expect(onChange).toHaveBeenCalledWith("period", "");
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("Done button does not invoke onChange (it only closes the popover)", () => {
    const onChange = vi.fn();
    render(
      <UnifiedTimePicker
        hour="09"
        minute="30"
        period="AM"
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
