/**
 * SidebarSkeleton renders five react-loading-skeleton blocks in a fixed
 * column. It's pure markup with no props — just lock the count and the
 * fixed positioning class.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import SidebarSkeleton from "../../../src/layout/Sidebar/SidebarSkeleton.jsx";

describe("layout/SidebarSkeleton", () => {
  it("renders without crashing", () => {
    const { container } = render(<SidebarSkeleton />);
    expect(container.firstChild).not.toBeNull();
  });

  it("applies the fixed sidebar positioning classes", () => {
    const { container } = render(<SidebarSkeleton />);
    const root = container.firstChild;
    expect(root.className).toContain("fixed");
    expect(root.className).toContain("bg-white");
    expect(root.className).toContain("rounded-xl");
  });

  it("renders exactly 5 skeleton placeholders for the nav icons", () => {
    const { container } = render(<SidebarSkeleton />);
    const placeholders = container.querySelectorAll(".react-loading-skeleton");
    expect(placeholders.length).toBe(5);
  });
});
