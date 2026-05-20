/**
 * HeaderSkeleton renders the loading state for the main top-nav header.
 * It's a static structural component using react-loading-skeleton blocks.
 * Verify the <header> element, its layout classes, and the count of
 * skeleton placeholders for nav items / icons.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import HeaderSkeleton from "../../../src/layout/Header/HeaderSkeleton.jsx";

describe("layout/HeaderSkeleton", () => {
  it("renders a single <header> root element", () => {
    const { container } = render(<HeaderSkeleton />);
    const headers = container.querySelectorAll("header");
    expect(headers.length).toBe(1);
  });

  it("applies the rounded-2xl/bordered header layout classes", () => {
    const { container } = render(<HeaderSkeleton />);
    const header = container.querySelector("header");
    expect(header.className).toContain("bg-white");
    expect(header.className).toContain("rounded-2xl");
    expect(header.className).toContain("border-b");
  });

  it("renders a <nav> container for the desktop links", () => {
    const { container } = render(<HeaderSkeleton />);
    const nav = container.querySelector("nav");
    expect(nav).not.toBeNull();
  });

  it("renders several skeleton placeholders for the nav links and actions", () => {
    const { container } = render(<HeaderSkeleton />);
    // react-loading-skeleton renders elements with className containing
    // "react-loading-skeleton". Use this to count the placeholders.
    const placeholders = container.querySelectorAll(".react-loading-skeleton");
    // Logo + 7 nav links + 1 button + welcome text + avatar = 11 minimum
    expect(placeholders.length).toBeGreaterThanOrEqual(10);
  });
});
