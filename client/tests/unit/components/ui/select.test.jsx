/**
 * src/components/ui/select.jsx is a thin wrapper around @radix-ui/react-select.
 * Mock the primitive so each component renders inline (no Portal, no pointer
 * machinery) and we can assert classes and props are forwarded correctly.
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";

vi.mock("@radix-ui/react-select", () => {
  const make = (name) => ({ children, ...rest }) =>
    React.createElement("div", { "data-mock-name": name, ...rest }, children);
  return {
    Root: make("Root"),
    Group: make("Group"),
    Value: make("Value"),
    Trigger: make("Trigger"),
    Icon: ({ asChild, children }) => <>{children}</>,
    Portal: ({ children }) => <>{children}</>,
    Content: make("Content"),
    Viewport: make("Viewport"),
    Label: make("Label"),
    Item: make("Item"),
    ItemIndicator: make("ItemIndicator"),
    ItemText: make("ItemText"),
    Separator: make("Separator"),
  };
});

const SelectMod = await import("../../../../src/components/ui/select.jsx");

const {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
} = SelectMod;

describe("ui/select wrappers", () => {
  it("Select renders children inside the Root mock", () => {
    render(
      <Select>
        <span>inner</span>
      </Select>
    );
    expect(screen.getByText("inner")).toBeInTheDocument();
  });

  it("SelectTrigger emits data-slot + data-size and includes a chevron child", () => {
    const { container } = render(<SelectTrigger>label-text</SelectTrigger>);
    const trig = container.querySelector('[data-slot="select-trigger"]');
    expect(trig).not.toBeNull();
    expect(trig.getAttribute("data-size")).toBe("default");
    // ChevronDownIcon is rendered as an svg
    expect(container.querySelector("svg")).not.toBeNull();
    expect(trig.textContent).toContain("label-text");
  });

  it("SelectTrigger accepts a custom size", () => {
    const { container } = render(<SelectTrigger size="sm">x</SelectTrigger>);
    expect(
      container.querySelector('[data-slot="select-trigger"]').getAttribute("data-size")
    ).toBe("sm");
  });

  it("SelectContent renders its viewport children", () => {
    const { container } = render(
      <SelectContent>
        <span>item-1</span>
      </SelectContent>
    );
    expect(container.querySelector('[data-slot="select-content"]')).not.toBeNull();
    expect(container.textContent).toContain("item-1");
  });

  it("SelectContent supports non-popper position without crashing", () => {
    const { container } = render(
      <SelectContent position="other">x</SelectContent>
    );
    expect(container.querySelector('[data-slot="select-content"]')).not.toBeNull();
  });

  it("SelectItem renders text inside the ItemText slot", () => {
    const { container } = render(<SelectItem value="x">Hello</SelectItem>);
    expect(container.textContent).toContain("Hello");
    expect(container.querySelector('[data-slot="select-item"]')).not.toBeNull();
  });

  it("SelectLabel, SelectGroup, SelectSeparator, SelectValue all render", () => {
    const { container } = render(
      <>
        <SelectGroup>
          <SelectLabel>L</SelectLabel>
          <SelectValue placeholder="P" />
          <SelectSeparator />
        </SelectGroup>
      </>
    );
    expect(container.querySelector('[data-slot="select-label"]').textContent).toBe(
      "L"
    );
    expect(container.querySelector('[data-slot="select-group"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="select-value"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="select-separator"]')).not.toBeNull();
  });
});
