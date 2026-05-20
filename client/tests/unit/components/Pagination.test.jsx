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
});
