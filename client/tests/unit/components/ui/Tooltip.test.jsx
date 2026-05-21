/**
 * src/components/ui/Tooltip.jsx — thin wrappers around
 * @radix-ui/react-tooltip. We mock the primitive so TooltipContent renders
 * inline without a Portal, and so each wrapper emits a stable data-mock-name
 * we can assert against.
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";

vi.mock("@radix-ui/react-tooltip", () => {
  const make = (name) => ({ children, ...rest }) =>
    React.createElement(
      "div",
      { "data-mock-name": name, ...rest },
      children,
    );
  return {
    Provider: make("Provider"),
    Root: make("Root"),
    Trigger: make("Trigger"),
    Portal: ({ children }) => <>{children}</>,
    Content: make("Content"),
    Arrow: (props) =>
      React.createElement("span", { "data-mock-name": "Arrow", ...props }),
  };
});

const T = await import("../../../../src/components/ui/Tooltip.jsx");
const { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } = T;

describe("ui/Tooltip wrappers", () => {
  it("TooltipProvider renders children and forwards delayDuration", () => {
    const { container } = render(
      <TooltipProvider delayDuration={200}>
        <span>kids</span>
      </TooltipProvider>,
    );
    const provider = container.querySelector(
      '[data-slot="tooltip-provider"]',
    );
    expect(provider).not.toBeNull();
    expect(provider.getAttribute("delayDuration")).toBe("200");
    expect(screen.getByText("kids")).toBeInTheDocument();
  });

  it("TooltipProvider defaults delayDuration to 0", () => {
    const { container } = render(<TooltipProvider>x</TooltipProvider>);
    const provider = container.querySelector(
      '[data-slot="tooltip-provider"]',
    );
    expect(provider.getAttribute("delayDuration")).toBe("0");
  });

  it("Tooltip wraps Root in a Provider and renders children", () => {
    const { container } = render(
      <Tooltip>
        <span>inside</span>
      </Tooltip>,
    );
    // outer Provider + inner Root both present
    expect(
      container.querySelector('[data-slot="tooltip-provider"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-slot="tooltip"]'),
    ).not.toBeNull();
    expect(screen.getByText("inside")).toBeInTheDocument();
  });

  it("TooltipTrigger emits data-slot=tooltip-trigger and renders children", () => {
    const { container } = render(<TooltipTrigger>tip</TooltipTrigger>);
    const node = container.querySelector('[data-slot="tooltip-trigger"]');
    expect(node).not.toBeNull();
    expect(node.textContent).toBe("tip");
  });

  it("TooltipContent renders children, default sideOffset=5, and an Arrow", () => {
    const { container } = render(<TooltipContent>body</TooltipContent>);
    const node = container.querySelector('[data-slot="tooltip-content"]');
    expect(node).not.toBeNull();
    expect(node.getAttribute("sideOffset")).toBe("5");
    expect(node.textContent).toContain("body");
    // The Arrow mock renders as a span with data-mock-name="Arrow"
    expect(
      container.querySelector('[data-mock-name="Arrow"]'),
    ).not.toBeNull();
  });

  it("TooltipContent honors a custom sideOffset and arrowClassName", () => {
    const { container } = render(
      <TooltipContent sideOffset={12} arrowClassName="arrow-x">
        x
      </TooltipContent>,
    );
    const node = container.querySelector('[data-slot="tooltip-content"]');
    expect(node.getAttribute("sideOffset")).toBe("12");
    const arrow = container.querySelector('[data-mock-name="Arrow"]');
    expect(arrow.getAttribute("class")).toContain("arrow-x");
  });

  it("TooltipContent merges a custom className with the defaults", () => {
    const { container } = render(
      <TooltipContent className="my-extra">x</TooltipContent>,
    );
    const node = container.querySelector('[data-slot="tooltip-content"]');
    expect(node.getAttribute("class")).toContain("my-extra");
  });
});
