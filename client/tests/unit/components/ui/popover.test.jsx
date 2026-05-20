/**
 * src/components/ui/popover.jsx — thin wrappers around @radix-ui/react-popover.
 * Mock the primitive so PopoverContent renders inline (no Portal).
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";

vi.mock("@radix-ui/react-popover", () => {
  const make = (name) => ({ children, ...rest }) =>
    React.createElement("div", { "data-mock-name": name, ...rest }, children);
  return {
    Root: make("Root"),
    Trigger: make("Trigger"),
    Anchor: make("Anchor"),
    Portal: ({ children }) => <>{children}</>,
    Content: make("Content"),
  };
});

const Pop = await import("../../../../src/components/ui/popover.jsx");

const { Popover, PopoverTrigger, PopoverContent, PopoverAnchor } = Pop;

describe("ui/popover wrappers", () => {
  it("Popover.Root accepts children", () => {
    render(
      <Popover>
        <span>inside</span>
      </Popover>
    );
    expect(screen.getByText("inside")).toBeInTheDocument();
  });

  it("PopoverTrigger renders with data-slot attribute", () => {
    const { container } = render(<PopoverTrigger>trig</PopoverTrigger>);
    expect(container.querySelector('[data-slot="popover-trigger"]').textContent).toBe(
      "trig"
    );
  });

  it("PopoverContent applies default align/sideOffset and renders children", () => {
    const { container } = render(<PopoverContent>body</PopoverContent>);
    const node = container.querySelector('[data-slot="popover-content"]');
    expect(node).not.toBeNull();
    expect(node.getAttribute("align")).toBe("center");
    expect(node.getAttribute("sideOffset")).toBe("4");
    expect(node.textContent).toContain("body");
  });

  it("PopoverContent forwards a custom align prop", () => {
    const { container } = render(
      <PopoverContent align="start">x</PopoverContent>
    );
    expect(
      container.querySelector('[data-slot="popover-content"]').getAttribute("align")
    ).toBe("start");
  });

  it("PopoverAnchor renders with data-slot", () => {
    const { container } = render(<PopoverAnchor>a</PopoverAnchor>);
    expect(container.querySelector('[data-slot="popover-anchor"]').textContent).toBe(
      "a"
    );
  });
});
