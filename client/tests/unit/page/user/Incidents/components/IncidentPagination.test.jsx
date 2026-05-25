// Round 35: cover Incidents/components/IncidentPagination — the small
// "first / prev / page X of Y / next / last + go-to" footer used by the
// incidents grid. The component is pure: it owns one piece of local state
// (goToPage input string, kept in sync with currentPage via useEffect),
// filters non-digit input, clamps the "Go" click to [1, totalPages], and
// disables the chevrons on the boundary pages. These tests pin those
// behaviors so future refactors keep the same contract.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import IncidentPagination from "../../../../../../src/page/user/Incidents/components/IncidentPagination.jsx";

// The four chevron buttons render before the "Go" Button, so the chevron
// buttons are the first four <button> elements in document order.
function chevrons() {
  return screen
    .getAllByRole("button")
    .filter((b) => b.textContent.trim() === "");
}

describe("IncidentPagination", () => {
  it("renders the entry-range summary and Page X of Y label", () => {
    render(
      <IncidentPagination
        totalEntries={25}
        currentPage={2}
        totalPages={3}
        pageSize={9}
        onPageChange={vi.fn()}
      />
    );

    // startEntry = (2-1)*9 + 1 = 10, endEntry = min(2*9, 25) = 18.
    expect(
      screen.getByText("Showing 10 To 18 Of 25 Entries")
    ).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
  });

  it("shows startEntry 0 when there are no entries", () => {
    render(
      <IncidentPagination
        totalEntries={0}
        currentPage={1}
        totalPages={0}
        onPageChange={vi.fn()}
      />
    );

    expect(
      screen.getByText("Showing 0 To 0 Of 0 Entries")
    ).toBeInTheDocument();
  });

  it("disables first+prev on page 1 and next+last on the last page", () => {
    const { rerender } = render(
      <IncidentPagination
        totalEntries={20}
        currentPage={1}
        totalPages={3}
        onPageChange={vi.fn()}
      />
    );
    const onFirst = chevrons();
    // [first, prev, next, last]
    expect(onFirst[0]).toBeDisabled();
    expect(onFirst[1]).toBeDisabled();
    expect(onFirst[2]).not.toBeDisabled();
    expect(onFirst[3]).not.toBeDisabled();

    rerender(
      <IncidentPagination
        totalEntries={20}
        currentPage={3}
        totalPages={3}
        onPageChange={vi.fn()}
      />
    );
    const onLast = chevrons();
    expect(onLast[0]).not.toBeDisabled();
    expect(onLast[1]).not.toBeDisabled();
    expect(onLast[2]).toBeDisabled();
    expect(onLast[3]).toBeDisabled();
  });

  it("disables next+last when there are zero pages", () => {
    render(
      <IncidentPagination
        totalEntries={0}
        currentPage={1}
        totalPages={0}
        onPageChange={vi.fn()}
      />
    );
    const [, , next, last] = chevrons();
    expect(next).toBeDisabled();
    expect(last).toBeDisabled();
  });

  it("chevron clicks fire onPageChange with the right page numbers", () => {
    const onPageChange = vi.fn();
    render(
      <IncidentPagination
        totalEntries={30}
        currentPage={2}
        totalPages={4}
        onPageChange={onPageChange}
      />
    );
    const [first, prev, next, last] = chevrons();

    fireEvent.click(first);
    expect(onPageChange).toHaveBeenNthCalledWith(1, 1);

    fireEvent.click(prev);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 1); // currentPage - 1

    fireEvent.click(next);
    expect(onPageChange).toHaveBeenNthCalledWith(3, 3); // currentPage + 1

    fireEvent.click(last);
    expect(onPageChange).toHaveBeenNthCalledWith(4, 4); // totalPages
  });

  it("Go-to input clamps out-of-range values into [1, totalPages] on Go/Enter", () => {
    const onPageChange = vi.fn();
    render(
      <IncidentPagination
        totalEntries={30}
        currentPage={1}
        totalPages={4}
        onPageChange={onPageChange}
      />
    );

    // The text input is the only number input rendered by the component.
    const input = screen.getByPlaceholderText("Page");
    // Initial value mirrors currentPage as a string.
    expect(input.value).toBe("1");

    // Above totalPages clamps down to totalPages on Go.
    fireEvent.change(input, { target: { value: "99" } });
    expect(input.value).toBe("99");
    fireEvent.click(screen.getByRole("button", { name: /go/i }));
    expect(onPageChange).toHaveBeenLastCalledWith(4);

    // Below 1 clamps up to 1 on Go (use Enter key path too).
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onPageChange).toHaveBeenLastCalledWith(1);

    // Exact in-range value passes through unmodified.
    fireEvent.change(input, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /go/i }));
    expect(onPageChange).toHaveBeenLastCalledWith(2);
  });

  it("syncs the Go-to input back to currentPage when the prop changes", () => {
    const { rerender } = render(
      <IncidentPagination
        totalEntries={30}
        currentPage={1}
        totalPages={4}
        onPageChange={vi.fn()}
      />
    );
    const input = screen.getByPlaceholderText("Page");
    fireEvent.change(input, { target: { value: "3" } });
    expect(input.value).toBe("3");

    // Simulate the parent advancing the page (e.g. via the Next chevron).
    rerender(
      <IncidentPagination
        totalEntries={30}
        currentPage={2}
        totalPages={4}
        onPageChange={vi.fn()}
      />
    );
    expect(screen.getByPlaceholderText("Page").value).toBe("2");
  });
});
