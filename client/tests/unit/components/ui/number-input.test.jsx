/**
 * NumberInput wraps the Input with +/- buttons. Cover:
 *  - increment respects max
 *  - decrement respects min
 *  - input filter only accepts digits or empty string
 *  - showButtons=false hides the +/- buttons
 *  - disabled disables both buttons and the input
 *  - step is honored
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NumberInput } from "../../../../src/components/ui/number-input.jsx";

const setup = (props = {}) => {
  const onChange = vi.fn();
  const utils = render(
    <NumberInput value={props.value ?? "5"} onChange={onChange} {...props} />
  );
  return { ...utils, onChange };
};

describe("ui/NumberInput", () => {
  it("renders an input with type=number", () => {
    const { container } = setup();
    const input = container.querySelector("input");
    expect(input).toHaveAttribute("type", "number");
  });

  it("shows the +/- buttons by default", () => {
    const { container } = setup();
    expect(container.querySelectorAll("button").length).toBe(2);
  });

  it("hides buttons when showButtons=false", () => {
    const { container } = setup({ showButtons: false });
    expect(container.querySelectorAll("button").length).toBe(0);
  });

  it("clicking + calls onChange with value+step", () => {
    const { container, onChange } = setup({ value: "5", step: 2 });
    const buttons = container.querySelectorAll("button");
    fireEvent.click(buttons[1]);
    expect(onChange).toHaveBeenCalledWith({ target: { value: "7" } });
  });

  it("clicking - calls onChange with value-step", () => {
    const { container, onChange } = setup({ value: "5" });
    const buttons = container.querySelectorAll("button");
    fireEvent.click(buttons[0]);
    expect(onChange).toHaveBeenCalledWith({ target: { value: "4" } });
  });

  it("clicking + does not call onChange when at max", () => {
    const { container, onChange } = setup({ value: "10", max: 10 });
    const buttons = container.querySelectorAll("button");
    // The + button is also disabled when at max
    expect(buttons[1]).toBeDisabled();
    fireEvent.click(buttons[1]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clicking - does not call onChange when at min", () => {
    const { container, onChange } = setup({ value: "0", min: 0 });
    const buttons = container.querySelectorAll("button");
    expect(buttons[0]).toBeDisabled();
    fireEvent.click(buttons[0]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("handleChange forwards digit-only inputs", () => {
    const { container, onChange } = setup({ value: "5" });
    const input = container.querySelector("input");
    fireEvent.change(input, { target: { value: "42" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("handleChange forwards an empty string", () => {
    const { container, onChange } = setup({ value: "5" });
    const input = container.querySelector("input");
    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).toHaveBeenCalled();
  });

  // Note: jsdom's type=number coerces non-digit values to "" before the
  // change event reaches handleChange, so we cannot directly observe the
  // "abc -> reject" branch from a fireEvent.change. The regex still
  // protects against pasted/programmatic non-digit values in browsers.

  it("disables both buttons and input when disabled", () => {
    const { container } = setup({ disabled: true });
    const buttons = container.querySelectorAll("button");
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).toBeDisabled();
    expect(container.querySelector("input")).toBeDisabled();
  });

  it("treats non-numeric value as 0", () => {
    const { container, onChange } = setup({ value: "abc", min: -5 });
    const buttons = container.querySelectorAll("button");
    fireEvent.click(buttons[1]); // increment from 0
    expect(onChange).toHaveBeenCalledWith({ target: { value: "1" } });
  });
});
