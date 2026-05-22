/**
 * src/page/user/EmployeeLogs/components/AutoRefreshComponent.jsx — auto
 * refresh button + popover with manual refresh, toggle switch, and
 * +/- stepper. Stepper rules:
 *  - increment: <60 -> +1 sec; >=60 -> +60 sec.
 *  - decrement: <=60 -> -1 sec; >60 -> -60 sec.
 *  - hitting 0 also flips active off.
 * Quick presets are 30s / 60s / 120s and toggle on when selected.
 *
 * Mocks (2):
 *  1. @/components/ui/popover  - render trigger + content inline.
 *  2. @/components/ui/switch  - render as a checkbox so we can toggle.
 *  Button and cn are pure presentational utilities — left intact.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }) => <div>{children}</div>,
  PopoverTrigger: ({ children }) => <div>{children}</div>,
  PopoverContent: ({ children }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({ checked, onCheckedChange, disabled }) => (
    <input
      type="checkbox"
      data-testid="auto-switch"
      checked={!!checked}
      disabled={!!disabled}
      onChange={(e) => onCheckedChange && onCheckedChange(e.target.checked)}
    />
  ),
}));

const { default: AutoRefreshComponent } = await import(
  "../../../../../../src/page/user/EmployeeLogs/components/AutoRefreshComponent.jsx"
);

const baseProps = (over = {}) => ({
  isActive: false,
  onActiveChange: vi.fn(),
  refreshInterval: 30,
  onIntervalChange: vi.fn(),
  onManualRefresh: vi.fn(),
  ...over,
});

describe("AutoRefreshComponent", () => {
  it("renders the manual refresh + chevron + switch + preset buttons", () => {
    render(<AutoRefreshComponent {...baseProps()} />);
    expect(screen.getByTitle("Refresh now")).toBeInTheDocument();
    expect(screen.getByTestId("auto-switch")).toBeInTheDocument();
    // 30s / 60s / 120s presets.
    expect(screen.getByText("30s")).toBeInTheDocument();
    expect(screen.getByText("1m")).toBeInTheDocument();
    expect(screen.getByText("2m")).toBeInTheDocument();
  });

  it("displays interval in seconds when below 60", () => {
    render(<AutoRefreshComponent {...baseProps({ refreshInterval: 45 })} />);
    expect(screen.getByText("45 sec")).toBeInTheDocument();
  });

  it("displays interval in minutes when >= 60", () => {
    render(<AutoRefreshComponent {...baseProps({ refreshInterval: 120 })} />);
    expect(screen.getByText("2 min")).toBeInTheDocument();
  });

  it("displays '0' when refreshInterval is 0", () => {
    render(<AutoRefreshComponent {...baseProps({ refreshInterval: 0 })} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("disables the switch and ties it to refreshInterval=0", () => {
    render(<AutoRefreshComponent {...baseProps({ refreshInterval: 0 })} />);
    expect(screen.getByTestId("auto-switch")).toBeDisabled();
  });

  it("clicking the manual-refresh button invokes onManualRefresh", () => {
    const p = baseProps();
    render(<AutoRefreshComponent {...p} />);
    fireEvent.click(screen.getByTitle("Refresh now"));
    expect(p.onManualRefresh).toHaveBeenCalledTimes(1);
  });

  it("toggling the switch invokes onActiveChange with the new boolean", () => {
    const p = baseProps({ isActive: false });
    render(<AutoRefreshComponent {...p} />);
    fireEvent.click(screen.getByTestId("auto-switch"));
    expect(p.onActiveChange).toHaveBeenCalledWith(true);
  });

  it("increment when interval < 60 adds 1 second", () => {
    const p = baseProps({ refreshInterval: 30 });
    const { container } = render(<AutoRefreshComponent {...p} />);
    // Plus button is the last button before the preset row.
    const plusBtn = container.querySelectorAll("button")[3]; // 0=refresh, 1=chevron, 2=minus, 3=plus
    fireEvent.click(plusBtn);
    expect(p.onIntervalChange).toHaveBeenCalledWith(31);
  });

  it("increment when interval >= 60 adds 60 seconds", () => {
    const p = baseProps({ refreshInterval: 60 });
    const { container } = render(<AutoRefreshComponent {...p} />);
    const plusBtn = container.querySelectorAll("button")[3];
    fireEvent.click(plusBtn);
    expect(p.onIntervalChange).toHaveBeenCalledWith(120);
  });

  it("decrement when interval <= 60 subtracts 1 second", () => {
    const p = baseProps({ refreshInterval: 30 });
    const { container } = render(<AutoRefreshComponent {...p} />);
    const minusBtn = container.querySelectorAll("button")[2];
    fireEvent.click(minusBtn);
    expect(p.onIntervalChange).toHaveBeenCalledWith(29);
  });

  it("decrement when interval > 60 subtracts 60 seconds", () => {
    const p = baseProps({ refreshInterval: 120 });
    const { container } = render(<AutoRefreshComponent {...p} />);
    const minusBtn = container.querySelectorAll("button")[2];
    fireEvent.click(minusBtn);
    expect(p.onIntervalChange).toHaveBeenCalledWith(60);
  });

  it("decrement is a no-op when interval is already 0", () => {
    const p = baseProps({ refreshInterval: 0 });
    const { container } = render(<AutoRefreshComponent {...p} />);
    const minusBtn = container.querySelectorAll("button")[2];
    fireEvent.click(minusBtn);
    expect(p.onIntervalChange).not.toHaveBeenCalled();
    expect(p.onActiveChange).not.toHaveBeenCalled();
  });

  it("decrement from 1 clamps to 0 and turns active OFF", () => {
    const p = baseProps({ refreshInterval: 1 });
    const { container } = render(<AutoRefreshComponent {...p} />);
    const minusBtn = container.querySelectorAll("button")[2];
    fireEvent.click(minusBtn);
    expect(p.onActiveChange).toHaveBeenCalledWith(false);
    expect(p.onIntervalChange).toHaveBeenCalledWith(0);
  });

  it("clicking a preset value calls onIntervalChange + onActiveChange(true)", () => {
    const p = baseProps();
    render(<AutoRefreshComponent {...p} />);
    fireEvent.click(screen.getByText("30s"));
    expect(p.onIntervalChange).toHaveBeenCalledWith(30);
    expect(p.onActiveChange).toHaveBeenCalledWith(true);
  });

  it("preset for 120 displays as '2m' and triggers proper change", () => {
    const p = baseProps();
    render(<AutoRefreshComponent {...p} />);
    fireEvent.click(screen.getByText("2m"));
    expect(p.onIntervalChange).toHaveBeenCalledWith(120);
    expect(p.onActiveChange).toHaveBeenCalledWith(true);
  });

  it("highlights the active preset matching refreshInterval", () => {
    render(<AutoRefreshComponent {...baseProps({ refreshInterval: 60 })} />);
    const btn = screen.getByText("1m");
    expect(btn.className).toMatch(/bg-\[#07486A\]/);
  });

  it("non-matching presets render with the default white background", () => {
    render(<AutoRefreshComponent {...baseProps({ refreshInterval: 60 })} />);
    expect(screen.getByText("30s").className).toMatch(/bg-white/);
    expect(screen.getByText("2m").className).toMatch(/bg-white/);
  });
});
