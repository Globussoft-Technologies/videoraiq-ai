/**
 * src/components/ui/radio-group.jsx — thin wrappers around
 * @radix-ui/react-radio-group. We mock the primitive so the wrappers render
 * inline and we can inspect their classes / data-slot attributes.
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render } from "@testing-library/react";

vi.mock("@radix-ui/react-radio-group", () => {
  const make = (name) => ({ children, ...rest }) =>
    React.createElement(
      "div",
      { "data-mock-name": name, ...rest },
      children,
    );
  return {
    Root: make("Root"),
    Item: make("Item"),
    Indicator: make("Indicator"),
  };
});

vi.mock("lucide-react", () => ({
  CircleIcon: ({ className, ...rest }) =>
    React.createElement("svg", {
      "data-mock-name": "CircleIcon",
      "data-classname": className,
      ...rest,
    }),
}));

const Rg = await import("../../../../src/components/ui/radio-group.jsx");
const { RadioGroup, RadioGroupItem } = Rg;

describe("ui/RadioGroup wrappers", () => {
  it("RadioGroup renders with data-slot=radio-group and merges class names", () => {
    const { container } = render(
      <RadioGroup className="my-extra">
        <span>kids</span>
      </RadioGroup>,
    );
    const root = container.querySelector('[data-slot="radio-group"]');
    expect(root).not.toBeNull();
    expect(root.getAttribute("class")).toContain("grid gap-3");
    expect(root.getAttribute("class")).toContain("my-extra");
    expect(root.textContent).toContain("kids");
  });

  it("RadioGroupItem renders Item + Indicator + CircleIcon with default iconSize", () => {
    const { container } = render(<RadioGroupItem value="a" />);
    const item = container.querySelector('[data-slot="radio-group-item"]');
    expect(item).not.toBeNull();
    expect(item.getAttribute("class")).toContain("aspect-square");
    const indicator = container.querySelector(
      '[data-slot="radio-group-indicator"]',
    );
    expect(indicator).not.toBeNull();
    const icon = container.querySelector('[data-mock-name="CircleIcon"]');
    expect(icon).not.toBeNull();
    // default iconSize "size-5" should be in the icon's merged className
    expect(icon.getAttribute("data-classname")).toContain("size-5");
  });

  it("RadioGroupItem forwards a custom iconSize into the CircleIcon className", () => {
    const { container } = render(
      <RadioGroupItem iconSize="size-10" value="b" />,
    );
    const icon = container.querySelector('[data-mock-name="CircleIcon"]');
    expect(icon.getAttribute("data-classname")).toContain("size-10");
    expect(icon.getAttribute("data-classname")).not.toContain("size-5");
  });

  it("RadioGroupItem merges a custom className with the defaults", () => {
    const { container } = render(
      <RadioGroupItem className="ring-red" value="c" />,
    );
    const item = container.querySelector('[data-slot="radio-group-item"]');
    expect(item.getAttribute("class")).toContain("ring-red");
    expect(item.getAttribute("class")).toContain("aspect-square");
  });

  it("RadioGroupItem forwards extra props (e.g. value) to the underlying Item", () => {
    const { container } = render(
      <RadioGroupItem value="opt-1" disabled />,
    );
    const item = container.querySelector('[data-slot="radio-group-item"]');
    expect(item.getAttribute("value")).toBe("opt-1");
    // disabled is reflected by React onto the mock div as an attribute
    expect(item.hasAttribute("disabled")).toBe(true);
  });
});
