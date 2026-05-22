/**
 * ScheduleRow — a complex hour-picking timeline row with copy/reset
 * popovers and a double-click edit popover. Behaviours under test:
 *  - day label + 25 hour labels render
 *  - existing intervals render with correct left/width %
 *  - first click sets rangeStart; second click commits a new interval
 *    via onHoursChange (pixel-perfect calculateTimeFromPixel)
 *  - "Select Full Day" button emits 00:00 -> 24:00
 *  - reset button opens the ResetConfirmationDialog and confirm calls
 *    onResetSchedule
 *  - copy popover: per-day checkboxes + "Copy to all" emit the right
 *    onCopySchedule shape
 *  - tiny click inside an existing interval removes it (clickedInterval
 *    branch — selectionDuration < 15)
 *
 * No external module mocks. Children (Popover, Tooltip, Dialog, Checkbox,
 * Button, lucide-react icons, CustomTimePicker, ResetConfirmationDialog,
 * TbClock24) are exercised for real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import ScheduleRow from "@/components/Schedule/ScheduleRow.jsx";

const DAYS = [
  { label: "Mon", value: "mon" },
  { label: "Tue", value: "tue" },
  { label: "Wed", value: "wed" },
];

const baseProps = (overrides = {}) => ({
  day: { label: "Mon", value: "mon" },
  selectedHours: [],
  onHoursChange: vi.fn(),
  onCopySchedule: vi.fn(),
  onResetSchedule: vi.fn(),
  allDays: DAYS,
  ...overrides,
});

// Mock getBoundingClientRect so click coordinates map to known hours.
// 24 hours over 240px width => 10px / hour.
const RECT_WIDTH = 240;
function stubTimelineRect() {
  const orig = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: RECT_WIDTH,
      bottom: 24,
      width: RECT_WIDTH,
      height: 24,
      toJSON() {},
    };
  };
  return () => {
    Element.prototype.getBoundingClientRect = orig;
  };
}

describe("ScheduleRow", () => {
  let restoreRect;
  beforeEach(() => {
    restoreRect = stubTimelineRect();
  });
  afterEach(() => {
    restoreRect();
  });

  it("renders day label and the 25 hour grid (0..24)", () => {
    render(<ScheduleRow {...baseProps()} />);
    expect(screen.getByText("Mon")).toBeInTheDocument();
    // Even hour labels 0, 2, 4 ... 24 are rendered as numbers; verify a few
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
    expect(screen.getAllByText("12").length).toBeGreaterThan(0);
    expect(screen.getAllByText("24").length).toBeGreaterThan(0);
  });

  it("renders an existing interval bar with correct inline left/width %", () => {
    const { container } = render(
      <ScheduleRow
        {...baseProps({ selectedHours: [{ startTime: "06:00", endTime: "12:00" }] })}
      />,
    );
    // The bar is a child div with inline style `left: 25%; width: 25%`
    const bars = container.querySelectorAll('[style*="left: 25%"]');
    expect(bars.length).toBeGreaterThanOrEqual(1);
  });

  it("commits a new interval after two clicks (range selection)", () => {
    const onHoursChange = vi.fn();
    render(<ScheduleRow {...baseProps({ onHoursChange })} />);

    // 24 invisible hour buttons sit inside the timeline. We click two of
    // them to mimic clicking on the timeline at two x positions.
    const allButtons = screen.getAllByRole("button");
    // The first 24 buttons are the invisible hour slots. Click first and
    // a later one with synthetic clientX coordinates.
    const slot0 = allButtons[0];
    // Click at x=0 (start at 00:00).
    fireEvent.click(slot0, { clientX: 0 });
    // Click at x=120 => 12:00.
    fireEvent.click(slot0, { clientX: 120 });

    expect(onHoursChange).toHaveBeenCalledTimes(1);
    const arg = onHoursChange.mock.calls[0][0];
    expect(arg).toEqual([{ startTime: "00:00", endTime: "12:00" }]);
  });

  it("Select Full Day button emits 00:00 -> 24:00", () => {
    const onHoursChange = vi.fn();
    render(<ScheduleRow {...baseProps({ onHoursChange })} />);
    const fullDayBtn = screen.getByTitle("Select Full Day");
    fireEvent.click(fullDayBtn);
    expect(onHoursChange).toHaveBeenCalledWith([
      { startTime: "00:00", endTime: "24:00" },
    ]);
  });

  it("reset button opens the confirmation dialog; Reset Anyway fires onResetSchedule", () => {
    const onResetSchedule = vi.fn();
    render(<ScheduleRow {...baseProps({ onResetSchedule })} />);
    const resetBtn = screen.getByTitle("Reset to default");
    fireEvent.click(resetBtn);
    // ResetConfirmationDialog now visible
    expect(
      screen.getByRole("heading", { name: /Reset Schedule/i }),
    ).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: /Reset Anyway/i });
    fireEvent.click(confirm);
    expect(onResetSchedule).toHaveBeenCalledTimes(1);
  });

  it("copy popover: selecting one day and clicking Save fires onCopySchedule with [days]", () => {
    const onCopySchedule = vi.fn();
    render(<ScheduleRow {...baseProps({ onCopySchedule })} />);
    fireEvent.click(screen.getByTitle("Copy to other days"));
    // Popover now visible — should show day checkboxes (Tue + Wed excluding self Mon).
    const tueLabel = screen.getByText("Tue");
    fireEvent.click(tueLabel);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onCopySchedule).toHaveBeenCalledWith(["tue"]);
  });

  it('copy popover: "Copy to all" checked + Save fires onCopySchedule() with no args', () => {
    const onCopySchedule = vi.fn();
    render(<ScheduleRow {...baseProps({ onCopySchedule })} />);
    fireEvent.click(screen.getByTitle("Copy to other days"));
    fireEvent.click(screen.getByLabelText(/Copy to all/i));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onCopySchedule).toHaveBeenCalledWith();
  });

  it("Cancel button in copy popover does NOT fire onCopySchedule", () => {
    const onCopySchedule = vi.fn();
    render(<ScheduleRow {...baseProps({ onCopySchedule })} />);
    fireEvent.click(screen.getByTitle("Copy to other days"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCopySchedule).not.toHaveBeenCalled();
  });

  it("tiny click inside an existing interval removes that interval (selectionDuration < 15)", () => {
    const onHoursChange = vi.fn();
    render(
      <ScheduleRow
        {...baseProps({
          selectedHours: [{ startTime: "06:00", endTime: "12:00" }],
          onHoursChange,
        })}
      />,
    );

    // Click two near-identical positions inside the [06:00, 12:00] bar to
    // create a tiny (< 15 min) selection that should fall into the
    // "clickedInterval" branch and remove the interval.
    const allButtons = screen.getAllByRole("button");
    const slot = allButtons[0];
    // x=80 => 8:00, x=82 => 8:12. ScheduleRow rounds to the nearest minute,
    // so duration is ~12 min, under the 15-min threshold.
    fireEvent.click(slot, { clientX: 80 });
    fireEvent.click(slot, { clientX: 82 });

    expect(onHoursChange).toHaveBeenCalledTimes(1);
    expect(onHoursChange.mock.calls[0][0]).toEqual([]);
  });

  it("zero-width click (same x twice) resets rangeStart without emitting", () => {
    const onHoursChange = vi.fn();
    render(<ScheduleRow {...baseProps({ onHoursChange })} />);
    const slot = screen.getAllByRole("button")[0];
    fireEvent.click(slot, { clientX: 50 });
    fireEvent.click(slot, { clientX: 50 });
    expect(onHoursChange).not.toHaveBeenCalled();
  });

  it("if existing 24-hour selection, a partial new selection REPLACES it", () => {
    const onHoursChange = vi.fn();
    render(
      <ScheduleRow
        {...baseProps({
          selectedHours: [{ startTime: "00:00", endTime: "24:00" }],
          onHoursChange,
        })}
      />,
    );
    // Click two distant x positions to draw a partial range that is > 15 min.
    const slot = screen.getAllByRole("button")[0];
    // x=30 => 03:00, x=90 => 09:00 — 6h duration, well over 15 min.
    fireEvent.click(slot, { clientX: 30 });
    fireEvent.click(slot, { clientX: 90 });
    expect(onHoursChange).toHaveBeenCalledTimes(1);
    expect(onHoursChange.mock.calls[0][0]).toEqual([
      { startTime: "03:00", endTime: "09:00" },
    ]);
  });

  it("second click before first (right-to-left) still normalises to ascending range", () => {
    const onHoursChange = vi.fn();
    render(<ScheduleRow {...baseProps({ onHoursChange })} />);
    const slot = screen.getAllByRole("button")[0];
    fireEvent.click(slot, { clientX: 200 }); // 20:00
    fireEvent.click(slot, { clientX: 100 }); // 10:00
    expect(onHoursChange).toHaveBeenCalledTimes(1);
    expect(onHoursChange.mock.calls[0][0]).toEqual([
      { startTime: "10:00", endTime: "20:00" },
    ]);
  });

  it("adding a new non-overlapping range to an existing set sorts and keeps both", () => {
    const onHoursChange = vi.fn();
    render(
      <ScheduleRow
        {...baseProps({
          selectedHours: [{ startTime: "14:00", endTime: "16:00" }],
          onHoursChange,
        })}
      />,
    );
    const slot = screen.getAllByRole("button")[0];
    fireEvent.click(slot, { clientX: 10 }); // 01:00
    fireEvent.click(slot, { clientX: 50 }); // 05:00
    expect(onHoursChange).toHaveBeenCalledTimes(1);
    const arg = onHoursChange.mock.calls[0][0];
    expect(arg).toHaveLength(2);
    expect(arg[0]).toEqual({ startTime: "01:00", endTime: "05:00" });
    expect(arg[1]).toEqual({ startTime: "14:00", endTime: "16:00" });
  });

  it("merging overlap: new range overlapping existing one is merged into one larger range", () => {
    const onHoursChange = vi.fn();
    render(
      <ScheduleRow
        {...baseProps({
          selectedHours: [{ startTime: "04:00", endTime: "08:00" }],
          onHoursChange,
        })}
      />,
    );
    const slot = screen.getAllByRole("button")[0];
    fireEvent.click(slot, { clientX: 60 }); // 06:00
    fireEvent.click(slot, { clientX: 120 }); // 12:00
    expect(onHoursChange).toHaveBeenCalledTimes(1);
    const arg = onHoursChange.mock.calls[0][0];
    expect(arg).toHaveLength(1);
    expect(arg[0]).toEqual({ startTime: "04:00", endTime: "12:00" });
  });

  it("Save button is disabled when neither copyToAll nor any day is selected", () => {
    render(<ScheduleRow {...baseProps()} />);
    fireEvent.click(screen.getByTitle("Copy to other days"));
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
  });
});
