/**
 * Monitorcog is a pure presentational SVG icon. Verify it renders as an svg,
 * applies the lucide base class, merges custom className, and forwards extra
 * props onto the root element.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import Monitorcog from "../../../../src/components/ui/Monitorcog.jsx";

describe("ui/Monitorcog", () => {
  it("renders an svg element", () => {
    const { container } = render(<Monitorcog data-testid="cog" />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg.tagName.toLowerCase()).toBe("svg");
  });

  it("applies the lucide base class", () => {
    const { container } = render(<Monitorcog />);
    const svg = container.querySelector("svg");
    expect(svg.getAttribute("class")).toContain("lucide-monitor-cog");
  });

  it("merges a custom className", () => {
    const { container } = render(<Monitorcog className="my-custom" />);
    const svg = container.querySelector("svg");
    expect(svg.getAttribute("class")).toContain("my-custom");
    // Default class is preserved
    expect(svg.getAttribute("class")).toContain("lucide-monitor-cog");
  });

  it("forwards arbitrary props to the root svg", () => {
    const { container } = render(<Monitorcog data-testid="cog" aria-label="cog-icon" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("data-testid", "cog");
    expect(svg).toHaveAttribute("aria-label", "cog-icon");
  });

  it("includes a linearGradient definition", () => {
    const { container } = render(<Monitorcog />);
    expect(container.querySelector("linearGradient#blue_gradient")).not.toBeNull();
  });

  it("renders the cog circle and frame paths", () => {
    const { container } = render(<Monitorcog />);
    expect(container.querySelector("circle")).not.toBeNull();
    // At least one path should be rendered
    expect(container.querySelectorAll("path").length).toBeGreaterThan(0);
  });
});
