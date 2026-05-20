/**
 * Checkbox is a Radix Checkbox.Root wrapper with a CheckIcon indicator.
 * Cover the default state, click-to-toggle, controlled mode, and disabled.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Checkbox } from "../../../../src/components/ui/checkbox.jsx";

describe("ui/Checkbox", () => {
  it("renders with role checkbox in unchecked state", () => {
    render(<Checkbox />);
    const cb = screen.getByRole("checkbox");
    expect(cb).toBeInTheDocument();
    expect(cb).toHaveAttribute("data-state", "unchecked");
    expect(cb).toHaveAttribute("aria-checked", "false");
  });

  it("renders in checked state when controlled with checked=true", () => {
    render(<Checkbox checked onCheckedChange={() => {}} />);
    expect(screen.getByRole("checkbox")).toHaveAttribute("data-state", "checked");
  });

  it("fires onCheckedChange on click", () => {
    const fn = vi.fn();
    render(<Checkbox onCheckedChange={fn} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(fn).toHaveBeenCalledWith(true);
  });

  it("does not fire onCheckedChange when disabled", () => {
    const fn = vi.fn();
    render(<Checkbox onCheckedChange={fn} disabled />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(fn).not.toHaveBeenCalled();
  });

  it("merges custom className", () => {
    render(<Checkbox className="custom-cb" />);
    expect(screen.getByRole("checkbox")).toHaveClass("custom-cb");
  });

  it("respects an id prop", () => {
    render(<Checkbox id="agree" />);
    expect(screen.getByRole("checkbox")).toHaveAttribute("id", "agree");
  });
});
