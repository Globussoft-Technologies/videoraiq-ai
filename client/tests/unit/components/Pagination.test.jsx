import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Pagination from "../../../src/components/Pagination.jsx";

function pageButtons() {
  // Numbered page buttons only (exclude the prev/next chevron buttons,
  // which have no text content).
  return screen
    .getAllByRole("button")
    .filter((b) => /^\d+$/.test(b.textContent.trim()));
}

describe("Pagination", () => {
  it("renders every page when the total is small (<= 5)", () => {
    render(<Pagination currentPage={1} totalPages={4} onPageChange={vi.fn()} />);
    const labels = pageButtons().map((b) => b.textContent.trim());
    expect(labels).toEqual(["1", "2", "3", "4"]);
    expect(screen.queryByText("...")).not.toBeInTheDocument();
  });

  it("shows ellipsis for a large page count", () => {
    render(<Pagination currentPage={1} totalPages={20} onPageChange={vi.fn()} />);
    expect(screen.getAllByText("...").length).toBeGreaterThan(0);
  });

  it("calls onPageChange with the clicked page number", () => {
    const onPageChange = vi.fn();
    render(
      <Pagination currentPage={2} totalPages={5} onPageChange={onPageChange} />
    );
    fireEvent.click(screen.getByText("4"));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it("disables the Previous button on the first page", () => {
    render(<Pagination currentPage={1} totalPages={5} onPageChange={vi.fn()} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toBeDisabled(); // first = Previous chevron
  });

  it("disables the Next button on the last page", () => {
    render(<Pagination currentPage={5} totalPages={5} onPageChange={vi.fn()} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons[buttons.length - 1]).toBeDisabled(); // last = Next chevron
  });

  it("Previous moves one page back", () => {
    const onPageChange = vi.fn();
    render(
      <Pagination currentPage={3} totalPages={5} onPageChange={onPageChange} />
    );
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("Next moves one page forward", () => {
    const onPageChange = vi.fn();
    render(
      <Pagination currentPage={3} totalPages={5} onPageChange={onPageChange} />
    );
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[buttons.length - 1]);
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it("always shows the first and last page for a mid-range current page", () => {
    render(<Pagination currentPage={10} totalPages={20} onPageChange={vi.fn()} />);
    const labels = pageButtons().map((b) => b.textContent.trim());
    expect(labels).toContain("1");
    expect(labels).toContain("20");
    expect(labels).toContain("10");
  });

  // Round 13: cover the "currentPage >= totalPages - 2" branch (lines 37-41
  // of Pagination.jsx) — when the current page is in the last 3 of a long
  // list, render: first, ellipsis, last4.
  it("shows first + ellipsis + last 4 pages when current is near the end", () => {
    render(<Pagination currentPage={19} totalPages={20} onPageChange={vi.fn()} />);
    const labels = pageButtons().map((b) => b.textContent.trim());
    // first page always present
    expect(labels).toContain("1");
    // last 4 pages present (totalPages-3 .. totalPages)
    expect(labels).toContain("17");
    expect(labels).toContain("18");
    expect(labels).toContain("19");
    expect(labels).toContain("20");
    // the ellipsis between 1 and 17 renders
    expect(screen.getAllByText("...").length).toBeGreaterThan(0);
    // the middle pages should NOT be rendered in this branch
    expect(labels).not.toContain("10");
  });

  // The exact threshold case currentPage === totalPages - 2 (still in the
  // "last 3" branch).
  it("includes the last-3 branch boundary currentPage = totalPages - 2", () => {
    render(<Pagination currentPage={8} totalPages={10} onPageChange={vi.fn()} />);
    const labels = pageButtons().map((b) => b.textContent.trim());
    expect(labels).toContain("1");
    expect(labels).toContain("7");
    expect(labels).toContain("8");
    expect(labels).toContain("9");
    expect(labels).toContain("10");
  });
});
