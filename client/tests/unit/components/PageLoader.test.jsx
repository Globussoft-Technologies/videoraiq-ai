/**
 * PageLoader is a minimal full-screen spinner. Verify it renders a single
 * Lucide loader icon (the `lucide-loader-circle` svg) inside a flex
 * container and that the icon carries the `animate-spin` class.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import PageLoader from "../../../src/components/PageLoader/index.jsx";

describe("PageLoader", () => {
  it("renders without crashing", () => {
    const { container } = render(<PageLoader />);
    expect(container.firstChild).not.toBeNull();
  });

  it("renders a single lucide loader-circle svg", () => {
    const { container } = render(<PageLoader />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg.getAttribute("class")).toContain("lucide-loader-circle");
  });

  it("applies the animate-spin class to the spinner", () => {
    const { container } = render(<PageLoader />);
    const svg = container.querySelector("svg");
    expect(svg.getAttribute("class")).toContain("animate-spin");
  });

  it("centers the spinner using flex utility classes", () => {
    const { container } = render(<PageLoader />);
    const wrapper = container.firstChild;
    expect(wrapper.className).toContain("flex");
    expect(wrapper.className).toContain("items-center");
    expect(wrapper.className).toContain("justify-center");
    expect(wrapper.className).toContain("h-screen");
  });
});
