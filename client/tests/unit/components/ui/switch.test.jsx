/**
 * Switch is a Radix Switch.Root wrapper. We confirm role/state, that clicks
 * toggle and call onCheckedChange, and that disabled blocks interaction.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Switch } from "../../../../src/components/ui/switch.jsx";

describe("ui/Switch", () => {
  it("renders with role switch and unchecked state by default", () => {
    render(<Switch />);
    const sw = screen.getByRole("switch");
    expect(sw).toBeInTheDocument();
    expect(sw).toHaveAttribute("data-state", "unchecked");
    expect(sw).toHaveAttribute("aria-checked", "false");
  });

  it("renders in checked state when `checked` is true", () => {
    render(<Switch checked onCheckedChange={() => {}} />);
    expect(screen.getByRole("switch")).toHaveAttribute("data-state", "checked");
  });

  it("fires onCheckedChange when clicked", () => {
    const fn = vi.fn();
    render(<Switch onCheckedChange={fn} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(fn).toHaveBeenCalledWith(true);
  });

  it("does not fire onCheckedChange when disabled", () => {
    const fn = vi.fn();
    render(<Switch onCheckedChange={fn} disabled />);
    fireEvent.click(screen.getByRole("switch"));
    expect(fn).not.toHaveBeenCalled();
  });

  it("merges custom className", () => {
    render(<Switch className="my-switch" />);
    expect(screen.getByRole("switch")).toHaveClass("my-switch");
  });

  it("exposes id when provided", () => {
    render(<Switch id="alarm" />);
    expect(screen.getByRole("switch")).toHaveAttribute("id", "alarm");
  });
});
