/**
 * src/layout/Header/HeaderSkeleton.jsx — the pure presentational placeholder
 * rendered by the Header while permissions / context are still loading. The
 * markup mirrors the real Header layout one-for-one:
 *   - a wrapping <header> with the dashboard background + rounded card
 *     classes and the responsive h-16 / sm:h-20 height
 *   - a left cluster with a single circular logo placeholder and a nav row of
 *     seven pill placeholders (Dashboard / Incidents / NVR / Live / Playback
 *     / Alert Recipients / Detection Settings — the actual nav has 7 items,
 *     pinned here as a regression guard)
 *   - a right cluster with three placeholders: an action button, a welcome
 *     text strip (hidden on mobile via the `hidden md:flex` class), and a
 *     circular profile avatar
 *
 * Behaviour under test:
 *   1. renders a single <header> element with the documented background +
 *      border-radius + responsive-height classes
 *   2. renders exactly seven nav-pill skeletons inside the inner <nav>
 *   3. the welcome-text strip carries `hidden md:flex` so it is desktop-only
 *   4. has no interactive elements — purely structural
 *
 * Mocks (0 vi.mock calls): the only import is `react-loading-skeleton`,
 * which is shipped as a real dependency and renders fine in jsdom.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import HeaderSkeleton from "../../../../src/layout/Header/HeaderSkeleton.jsx";

describe("layout/Header/HeaderSkeleton", () => {
  it("renders a single header element with the documented layout classes", () => {
    const { container } = render(<HeaderSkeleton />);
    const headers = container.querySelectorAll("header");
    expect(headers).toHaveLength(1);
    const header = headers[0];
    expect(header.className).toContain("bg-white");
    expect(header.className).toContain("rounded-2xl");
    // Responsive header height — pinned as a layout-stability regression guard
    expect(header.className).toContain("h-16");
    expect(header.className).toContain("sm:h-20");
  });

  it("renders the desktop nav with exactly seven pill skeletons", () => {
    const { container } = render(<HeaderSkeleton />);
    const nav = container.querySelector("nav");
    expect(nav).not.toBeNull();
    // react-loading-skeleton renders each Skeleton as <span class="react-loading-skeleton">
    const pills = nav.querySelectorAll(".react-loading-skeleton");
    expect(pills.length).toBe(7);
  });

  it("includes a welcome-text placeholder marked as desktop-only", () => {
    const { container } = render(<HeaderSkeleton />);
    // The 100×20 welcome strip has a `hidden md:flex` wrapper-class on its
    // own element. Pin the presence of an element carrying both classes.
    const desktopOnly = container.querySelectorAll(".hidden.md\\:flex");
    expect(desktopOnly.length).toBeGreaterThanOrEqual(1);
  });

  it("renders no interactive controls — pure presentation only", () => {
    const { container } = render(<HeaderSkeleton />);
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(container.querySelectorAll("input")).toHaveLength(0);
  });
});
