/**
 * src/components/ui/calendar.jsx — DateRangePickerComponent and
 * DatePickerComponent. Both wrap react-aria-components and translate
 * between native Date objects and CalendarDate. We mock the aria-components
 * primitives so each renders inline as a plain div, capturing the
 * `value`/`onChange`/`minValue`/`maxValue`/`onPress` props for assertions.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

// react-aria-components — capture value/onChange via data-attrs and a
// global click bridge. CalendarGrid invokes its child render fn with a
// synthetic date so the CalendarCell className function gets exercised.
const lastProps = { range: null, date: null, rangeReset: null, dateReset: null };

vi.mock("react-aria-components", () => {
  const wrap = (name) => ({ children, ...rest }) => {
    if (name === "DateRangePicker") lastProps.range = rest;
    if (name === "DatePicker") lastProps.date = rest;
    return React.createElement(
      "div",
      { "data-mock-name": name },
      children,
    );
  };
  return {
    DateRangePicker: wrap("DateRangePicker"),
    DatePicker: wrap("DatePicker"),
    Group: ({ children }) =>
      React.createElement("div", { "data-mock-name": "Group" }, children),
    Button: ({ children, onPress, slot, ...rest }) =>
      React.createElement(
        "button",
        {
          "data-mock-name": "Button",
          "data-slot-attr": slot,
          onClick: onPress,
          ...rest,
        },
        children,
      ),
    Popover: ({ children, placement }) =>
      React.createElement(
        "div",
        { "data-mock-name": "Popover", "data-placement": placement },
        children,
      ),
    Dialog: ({ children }) =>
      React.createElement("div", { "data-mock-name": "Dialog" }, children),
    RangeCalendar: ({ children, minValue, maxValue }) =>
      React.createElement(
        "div",
        {
          "data-mock-name": "RangeCalendar",
          "data-has-min": String(!!minValue),
          "data-has-max": String(!!maxValue),
        },
        children,
      ),
    Calendar: ({ children, minValue, maxValue }) =>
      React.createElement(
        "div",
        {
          "data-mock-name": "Calendar",
          "data-has-min": String(!!minValue),
          "data-has-max": String(!!maxValue),
        },
        children,
      ),
    CalendarCell: ({ className }) => {
      // Exercise the className function with every flag combination so
      // each branch in the template string runs.
      const flagSets = [
        { isSelected: true, isSelectionStart: true, isSelectionEnd: false, isWithinRange: false, isDisabled: false },
        { isSelected: true, isSelectionStart: false, isSelectionEnd: true, isWithinRange: false, isDisabled: false },
        { isSelected: true, isSelectionStart: false, isSelectionEnd: false, isWithinRange: true, isDisabled: true },
        { isSelected: false, isSelectionStart: false, isSelectionEnd: false, isWithinRange: false, isDisabled: false },
        { isSelected: true, isSelectionStart: false, isSelectionEnd: false, isWithinRange: false, isDisabled: false },
      ];
      const cls =
        typeof className === "function"
          ? flagSets.map((f) => className(f)).join(" ")
          : className;
      return React.createElement("div", {
        "data-mock-name": "CalendarCell",
        "data-class": cls,
      });
    },
    CalendarGrid: ({ children }) => {
      // children is a function; invoke it with a fake "date" object so the
      // CalendarCell render runs through its className fn.
      const child =
        typeof children === "function" ? children({ year: 2026, month: 5, day: 21 }) : children;
      return React.createElement(
        "div",
        { "data-mock-name": "CalendarGrid" },
        child,
      );
    },
    Heading: () =>
      React.createElement("div", { "data-mock-name": "Heading" }),
  };
});

// @internationalized/date — a minimal stub that simply records the args.
vi.mock("@internationalized/date", () => ({
  CalendarDate: class CalendarDateStub {
    constructor(year, month, day) {
      this.year = year;
      this.month = month;
      this.day = day;
    }
  },
}));

// Placement — return a deterministic value so we can assert popover placement.
vi.mock("@/components/ui/Placement", () => ({
  useResponsivePlacement: () => "left",
}));

// lucide-react — chevron icons are not the focus.
vi.mock("lucide-react", () => ({
  ChevronLeft: (props) =>
    React.createElement("svg", { "data-mock-name": "ChevronLeft", ...props }),
  ChevronRight: (props) =>
    React.createElement("svg", { "data-mock-name": "ChevronRight", ...props }),
}));

const Cal = await import("../../../../src/components/ui/calendar.jsx");
const { DateRangePickerComponent, DatePickerComponent } = Cal;

beforeEach(() => {
  lastProps.range = null;
  lastProps.date = null;
});

describe("DateRangePickerComponent", () => {
  it("renders with no value when startDate/endDate are missing and forwards placement to Popover", () => {
    const { container } = render(
      <DateRangePickerComponent onRangeChange={vi.fn()} />,
    );
    expect(lastProps.range).not.toBeNull();
    expect(lastProps.range.value).toBeNull();
    const popover = container.querySelector('[data-mock-name="Popover"]');
    expect(popover.getAttribute("data-placement")).toBe("left");
  });

  it("converts start/end Date props into CalendarDate stubs", () => {
    render(
      <DateRangePickerComponent
        startDate={new Date(2026, 0, 10)}
        endDate={new Date(2026, 0, 20)}
        onRangeChange={vi.fn()}
      />,
    );
    expect(lastProps.range.value).toMatchObject({
      start: { year: 2026, month: 1, day: 10 },
      end: { year: 2026, month: 1, day: 20 },
    });
  });

  it("invokes onRangeChange with native Dates when the onChange handler fires", () => {
    const cb = vi.fn();
    render(
      <DateRangePickerComponent
        startDate={new Date(2026, 0, 1)}
        endDate={new Date(2026, 0, 2)}
        onRangeChange={cb}
      />,
    );
    lastProps.range.onChange({
      start: { year: 2026, month: 5, day: 1 },
      end: { year: 2026, month: 5, day: 5 },
    });
    expect(cb).toHaveBeenCalledTimes(1);
    const arg = cb.mock.calls[0][0];
    expect(arg.start).toBeInstanceOf(Date);
    expect(arg.end).toBeInstanceOf(Date);
    expect(arg.start.getFullYear()).toBe(2026);
    expect(arg.start.getMonth()).toBe(4); // May = index 4
    expect(arg.end.getDate()).toBe(5);
  });

  it("onChange is a no-op when range is incomplete or onRangeChange is not provided", () => {
    const cb = vi.fn();
    render(<DateRangePickerComponent onRangeChange={cb} />);
    lastProps.range.onChange(null);
    lastProps.range.onChange({ start: null, end: null });
    lastProps.range.onChange({ start: { year: 2026, month: 1, day: 1 } });
    expect(cb).not.toHaveBeenCalled();

    // Now without onRangeChange — should not throw.
    render(<DateRangePickerComponent />);
    expect(() =>
      lastProps.range.onChange({
        start: { year: 2026, month: 1, day: 1 },
        end: { year: 2026, month: 1, day: 2 },
      }),
    ).not.toThrow();
  });

  it("clicking the Reset button fires onRangeChange with start/end of today", () => {
    const cb = vi.fn();
    render(<DateRangePickerComponent onRangeChange={cb} />);
    fireEvent.click(screen.getByText("Reset"));
    expect(cb).toHaveBeenCalledTimes(1);
    const arg = cb.mock.calls[0][0];
    expect(arg.start.getHours()).toBe(0);
    expect(arg.start.getMinutes()).toBe(0);
    expect(arg.end.getHours()).toBe(23);
    expect(arg.end.getMinutes()).toBe(59);
  });

  it("propagates minDate/maxDate as CalendarDates onto the RangeCalendar", () => {
    const { container } = render(
      <DateRangePickerComponent
        minDate={new Date(2025, 0, 1)}
        maxDate={new Date(2027, 11, 31)}
        onRangeChange={vi.fn()}
      />,
    );
    const cal = container.querySelector('[data-mock-name="RangeCalendar"]');
    expect(cal.getAttribute("data-has-min")).toBe("true");
    expect(cal.getAttribute("data-has-max")).toBe("true");
  });

  it("coerces non-Date min/max props by passing them through new Date()", () => {
    const { container } = render(
      <DateRangePickerComponent
        minDate="2025-01-01T00:00:00Z"
        maxDate="2027-12-31T00:00:00Z"
        onRangeChange={vi.fn()}
      />,
    );
    const cal = container.querySelector('[data-mock-name="RangeCalendar"]');
    expect(cal.getAttribute("data-has-min")).toBe("true");
    expect(cal.getAttribute("data-has-max")).toBe("true");
  });

  it("applies the hideInstructionText opacity utility when requested", () => {
    render(
      <DateRangePickerComponent
        onRangeChange={vi.fn()}
        hideInstructionText
      />,
    );
    expect(
      screen.getByText(/Double-tap to pick one date or select a range/i)
        .className,
    ).toContain("opacity-0");
  });
});

describe("DatePickerComponent", () => {
  it("renders with null value when no selectedDate is provided", () => {
    render(<DatePickerComponent onDateChange={vi.fn()} />);
    expect(lastProps.date).not.toBeNull();
    expect(lastProps.date.value).toBeNull();
  });

  it("converts a selectedDate prop into a CalendarDate stub", () => {
    render(
      <DatePickerComponent
        selectedDate={new Date(2026, 4, 21)}
        onDateChange={vi.fn()}
      />,
    );
    expect(lastProps.date.value).toMatchObject({
      year: 2026,
      month: 5,
      day: 21,
    });
  });

  it("invokes onDateChange with a native Date when onChange fires", () => {
    const cb = vi.fn();
    render(<DatePickerComponent onDateChange={cb} />);
    lastProps.date.onChange({ year: 2026, month: 6, day: 15 });
    expect(cb).toHaveBeenCalledTimes(1);
    const arg = cb.mock.calls[0][0];
    expect(arg).toBeInstanceOf(Date);
    expect(arg.getFullYear()).toBe(2026);
    expect(arg.getMonth()).toBe(5);
    expect(arg.getDate()).toBe(15);
  });

  it("onChange is a no-op for null and works without onDateChange", () => {
    const cb = vi.fn();
    render(<DatePickerComponent onDateChange={cb} />);
    lastProps.date.onChange(null);
    expect(cb).not.toHaveBeenCalled();

    render(<DatePickerComponent />);
    expect(() =>
      lastProps.date.onChange({ year: 2026, month: 1, day: 1 }),
    ).not.toThrow();
  });

  it("clicking the Reset button fires onDateChange with today's date", () => {
    const cb = vi.fn();
    render(<DatePickerComponent onDateChange={cb} />);
    fireEvent.click(screen.getByText("Reset"));
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toBeInstanceOf(Date);
  });

  it("propagates min/max props as CalendarDates onto the Calendar", () => {
    const { container } = render(
      <DatePickerComponent
        selectedDate={new Date(2026, 0, 1)}
        minDate={new Date(2025, 0, 1)}
        maxDate={new Date(2027, 0, 1)}
        onDateChange={vi.fn()}
      />,
    );
    const cal = container.querySelector('[data-mock-name="Calendar"]');
    expect(cal.getAttribute("data-has-min")).toBe("true");
    expect(cal.getAttribute("data-has-max")).toBe("true");
  });

  it("coerces non-Date min/max into Dates internally", () => {
    const { container } = render(
      <DatePickerComponent
        minDate="2025-01-01T00:00:00Z"
        maxDate="2027-01-01T00:00:00Z"
        onDateChange={vi.fn()}
      />,
    );
    const cal = container.querySelector('[data-mock-name="Calendar"]');
    expect(cal.getAttribute("data-has-min")).toBe("true");
    expect(cal.getAttribute("data-has-max")).toBe("true");
  });

  it("applies hideInstructionText to the helper hint", () => {
    render(
      <DatePickerComponent onDateChange={vi.fn()} hideInstructionText />,
    );
    expect(
      screen.getByText(/Double-tap to pick one date or select a range/i)
        .className,
    ).toContain("opacity-0");
  });
});
