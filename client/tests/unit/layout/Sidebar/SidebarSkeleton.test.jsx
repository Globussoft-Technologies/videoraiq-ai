/**
 * src/layout/Sidebar/SidebarSkeleton.jsx — the placeholder rail rendered by
 * Sidebar while `usePermissions` is still loading (the `isLoading` arm of
 * the Sidebar). Pure presentational: a wrapping fixed-position card with
 * five circular Skeleton tiles laid out in a vertical column.
 *
 * Behaviour under test:
 *   1. renders a single wrapping div with the documented fixed-position
 *      + rounded-card classes (`fixed`, `bg-white`, `rounded-xl`, `shadow-sm`)
 *   2. renders exactly five Skeleton tile placeholders inside the inner
 *      column (the [...Array(5)] loop — pinned as a layout-stability guard)
 *   3. each tile sits inside its own justify-center wrapper so the column
 *      layout is preserved
 *   4. has no interactive elements — purely structural
 *
 * Mocks (0 vi.mock calls): the only import is `react-loading-skeleton`,
 * shipped as a real dependency that renders fine in jsdom.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import SidebarSkeleton from "../../../../src/layout/Sidebar/SidebarSkeleton.jsx";

describe("layout/Sidebar/SidebarSkeleton", () => {
  it("renders a single fixed-position card with the documented classes", () => {
    const { container } = render(<SidebarSkeleton />);
    const outer = container.firstChild;
    expect(outer).not.toBeNull();
    expect(outer.tagName).toBe("DIV");
    expect(outer.className).toContain("fixed");
    expect(outer.className).toContain("bg-white");
    expect(outer.className).toContain("rounded-xl");
    expect(outer.className).toContain("shadow-sm");
  });

  it("renders exactly five circular tile placeholders in a column", () => {
    const { container } = render(<SidebarSkeleton />);
    // react-loading-skeleton renders <span class="react-loading-skeleton">
    const tiles = container.querySelectorAll(".react-loading-skeleton");
    expect(tiles.length).toBe(5);
  });

  it("wraps each tile in its own justify-center column row", () => {
    const { container } = render(<SidebarSkeleton />);
    // The map produces one inner flex row per tile. We pin the count of
    // direct children of the inner column to match the tile count.
    const innerColumn = container.querySelector(".flex.flex-col");
    expect(innerColumn).not.toBeNull();
    // The five [...Array(5)] children are the row wrappers around each
    // Skeleton tile.
    expect(innerColumn.children.length).toBe(5);
    // Each row carries the `justify-center` class (pins the visual layout).
    Array.from(innerColumn.children).forEach((row) => {
      expect(row.className).toContain("justify-center");
    });
  });

  it("renders no interactive controls — pure presentation only", () => {
    const { container } = render(<SidebarSkeleton />);
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(container.querySelectorAll("input")).toHaveLength(0);
  });
});
