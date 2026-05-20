/**
 * The Input is a thin forwardRef wrapper around <input>. We pin down the
 * contract: ref is wired, type is honored, classes are merged, disabled
 * passes through, and onChange fires.
 */
import { describe, it, expect, vi } from "vitest";
import { createRef } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { Input } from "../../../../src/components/ui/input.jsx";

describe("ui/Input", () => {
  it("renders an input element", () => {
    render(<Input data-testid="x" />);
    expect(screen.getByTestId("x").tagName).toBe("INPUT");
  });

  it("forwards ref to the underlying input", () => {
    const ref = createRef();
    render(<Input ref={ref} data-testid="x" />);
    expect(ref.current).toBe(screen.getByTestId("x"));
  });

  it("honors the type prop", () => {
    render(<Input type="email" data-testid="x" />);
    expect(screen.getByTestId("x")).toHaveAttribute("type", "email");
  });

  it("merges custom className with built-in classes", () => {
    render(<Input className="custom-x" data-testid="x" />);
    const el = screen.getByTestId("x");
    expect(el).toHaveClass("custom-x");
    // built-in class still applied
    expect(el.className).toMatch(/rounded-\[12px\]/);
  });

  it("respects the disabled attribute", () => {
    render(<Input disabled data-testid="x" />);
    expect(screen.getByTestId("x")).toBeDisabled();
  });

  it("fires onChange when the user types", () => {
    const onChange = vi.fn();
    render(<Input onChange={onChange} data-testid="x" />);
    fireEvent.change(screen.getByTestId("x"), { target: { value: "hi" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("respects the placeholder prop", () => {
    render(<Input placeholder="enter value" />);
    expect(screen.getByPlaceholderText("enter value")).toBeInTheDocument();
  });
});
