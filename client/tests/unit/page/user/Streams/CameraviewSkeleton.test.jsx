/**
 * src/page/user/Streams/Cameraview/CameraviewSkeleton.jsx — pure leaf
 * that renders N skeleton cards based on selectedGrid + itemsPerPage.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

// react-loading-skeleton imports a .css side-effect — stub it.
vi.mock("react-loading-skeleton/dist/skeleton.css", () => ({}));

import CameraviewSkeleton from "../../../../../src/page/user/Streams/Cameraview/CameraviewSkeleton.jsx";

describe("CameraviewSkeleton", () => {
  it("renders the requested number of skeleton cards (itemsPerPage)", () => {
    const { container } = render(
      <CameraviewSkeleton selectedGrid={1} itemsPerPage={4} />
    );
    // Each card is the only direct child of the wrapper grid div.
    const grid = container.querySelector(".grid");
    expect(grid).not.toBeNull();
    expect(grid.children.length).toBe(4);
  });

  it("applies grid-cols-1 for selectedGrid=1", () => {
    const { container } = render(
      <CameraviewSkeleton selectedGrid={1} itemsPerPage={2} />
    );
    const grid = container.querySelector(".grid");
    expect(grid.className).toContain("grid-cols-1");
  });

  it("applies grid-cols-1 sm:grid-cols-2 for selectedGrid=2", () => {
    const { container } = render(
      <CameraviewSkeleton selectedGrid={2} itemsPerPage={1} />
    );
    const grid = container.querySelector(".grid");
    expect(grid.className).toContain("sm:grid-cols-2");
  });

  it("applies the md:grid-cols-3 class for selectedGrid=3", () => {
    const { container } = render(
      <CameraviewSkeleton selectedGrid={3} itemsPerPage={1} />
    );
    const grid = container.querySelector(".grid");
    expect(grid.className).toContain("md:grid-cols-3");
  });

  it("applies grid-cols-4 for selectedGrid=4", () => {
    const { container } = render(
      <CameraviewSkeleton selectedGrid={4} itemsPerPage={1} />
    );
    const grid = container.querySelector(".grid");
    expect(grid.className).toContain("grid-cols-4");
  });

  it("applies grid-cols-3 for selectedGrid=5", () => {
    const { container } = render(
      <CameraviewSkeleton selectedGrid={5} itemsPerPage={1} />
    );
    const grid = container.querySelector(".grid");
    expect(grid.className).toContain("grid-cols-3");
  });

  it("falls back to the default grid when selectedGrid is unknown", () => {
    const { container } = render(
      <CameraviewSkeleton selectedGrid={99} itemsPerPage={1} />
    );
    const grid = container.querySelector(".grid");
    expect(grid.className).toContain("2xl:grid-cols-3");
  });

  it("renders zero cards when itemsPerPage=0", () => {
    const { container } = render(
      <CameraviewSkeleton selectedGrid={1} itemsPerPage={0} />
    );
    const grid = container.querySelector(".grid");
    expect(grid.children.length).toBe(0);
  });
});
