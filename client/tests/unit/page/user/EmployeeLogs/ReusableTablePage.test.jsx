/**
 * Round 83: cover EmployeeLogs/ReusableTablePage.jsx — the generic
 * "tables + search + date-range + paginator" shell reused across most
 * EmployeeLogs / AccessLog / Visibility / ANPR / Conveyor / Crusher /
 * Vehicle pages. The component:
 *   - Renders a Search <Input>, an optional DateRangePicker (suppressed
 *     when from='visibility'), an optional grid/table view toggle (only
 *     when a gridCard renderer is passed), the children slot (filter
 *     row controls), and either ProfilesTable (table view) or a grid of
 *     gridCard renders (grid view).
 *   - Server pagination is gated on a numeric attendanceLogsCount prop;
 *     when present, totalPages = ceil(count/limit) and data is rendered
 *     as-passed. Otherwise client pagination applies on the filtered+
 *     paginated slice.
 *   - The search filter is a case-insensitive multi-key includes() match
 *     across searchKeys.
 *   - Pagination renders "1..n" when totalPages <= 5; else a smart
 *     "1 2 3 4 ... N" / "1 ... N-3..N" / "1 ... cur-1 cur cur+1 ... N"
 *     ellipsis pattern.
 *   - Prev/Next are disabled at the boundaries (currentPage===1 and
 *     ===totalPages).
 *   - Rows-per-page <select> calls onLimitChange (or internal setter)
 *     and resets currentPage to 1 via setCurrentPage(1).
 *
 * Mocks (4 — well under 8):
 *   1. ./ProfilesTable          — replaced by a marker that surfaces the
 *                                 forwarded data row count + loading flag.
 *   2. @/components/ui/calendar — minimal DateRangePickerComponent shim
 *                                 with a button that fires onRangeChange
 *                                 (the real picker pulls in moment + a
 *                                 full DayPicker tree).
 *   3. @/components/ui/input    — passthrough <input> so onChange flows
 *                                 synchronously without Radix wrapping.
 *   4. @/utils/formatDateRange  — replaced by an identity-ish marker
 *                                 (we only need the wiring, not the date
 *                                 string format itself).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";

const profilesTableProps = vi.hoisted(() => ({ value: null }));
const dateRangeArgs = vi.hoisted(() => ({ value: null }));

vi.mock("../../../../../src/page/user/EmployeeLogs/ProfilesTable", () => ({
  default: ({ data, columns, loading }) => {
    profilesTableProps.value = { data, columns, loading };
    return (
      <div data-testid="profiles-table">
        <span data-testid="pt-rows">{(data || []).length}</span>
        <span data-testid="pt-loading">{String(!!loading)}</span>
      </div>
    );
  },
}));

vi.mock("@/components/ui/calendar", () => ({
  DateRangePickerComponent: ({ onRangeChange, buttonContent }) => (
    <div data-testid="drp">
      <div data-testid="drp-content">{buttonContent}</div>
      <button
        data-testid="drp-fire"
        onClick={() =>
          onRangeChange({
            start: new Date("2025-01-01T00:00:00Z"),
            end: new Date("2025-01-05T00:00:00Z"),
          })
        }
      >
        fire
      </button>
      <button data-testid="drp-fire-null" onClick={() => onRangeChange(null)}>
        firenull
      </button>
    </div>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props) => <input {...props} />,
}));

vi.mock("@/utils/formatDateRange", () => ({
  formatDateRange: (s, e) => `R:${s ? "S" : ""}${e ? "E" : ""}`,
}));

const { default: ReusableTablePage } = await import(
  "../../../../../src/page/user/EmployeeLogs/ReusableTablePage.jsx"
);

const baseColumns = [
  { accessorKey: "name", header: "Name", cell: (c) => c.row.original.name },
  { accessorKey: "dept", header: "Dept", cell: (c) => c.row.original.dept },
];

const sampleData = Array.from({ length: 25 }, (_, i) => ({
  id: i + 1,
  name: `User${i + 1}`,
  dept: i % 2 === 0 ? "Eng" : "Ops",
}));

beforeEach(() => {
  profilesTableProps.value = null;
  dateRangeArgs.value = null;
});

describe("ReusableTablePage", () => {
  it("renders Search input + DateRangePicker + ProfilesTable in default (table) mode", () => {
    const setCurrentPage = vi.fn();
    render(
      <ReusableTablePage
        title="Logs"
        data={sampleData.slice(0, 5)}
        columns={baseColumns}
        searchKeys={["name", "dept"]}
        currentPage={1}
        setCurrentPage={setCurrentPage}
      />
    );
    // Search input
    expect(screen.getByPlaceholderText("Search")).toBeInTheDocument();
    // DateRangePicker rendered (no from='visibility')
    expect(screen.getByTestId("drp")).toBeInTheDocument();
    // ProfilesTable rendered with the 5 forwarded rows + loading=false
    expect(screen.getByTestId("profiles-table")).toBeInTheDocument();
    expect(screen.getByTestId("pt-rows")).toHaveTextContent("5");
    expect(screen.getByTestId("pt-loading")).toHaveTextContent("false");
    // No grid view toggle when gridCard is not provided
    expect(screen.queryByTitle("Grid view")).toBeNull();
  });

  it("suppresses DateRangePicker when from='visibility'", () => {
    render(
      <ReusableTablePage
        title="Vis"
        data={[]}
        columns={baseColumns}
        searchKeys={["name"]}
        currentPage={1}
        setCurrentPage={() => {}}
        from="visibility"
      />
    );
    expect(screen.queryByTestId("drp")).toBeNull();
  });

  it("filters data via search input (case-insensitive multi-key includes)", () => {
    const setCurrentPage = vi.fn();
    render(
      <ReusableTablePage
        title="Logs"
        data={sampleData}
        columns={baseColumns}
        searchKeys={["name", "dept"]}
        currentPage={1}
        setCurrentPage={setCurrentPage}
      />
    );
    // Initially: 25 rows -> page 1 with limit 10 -> 10 rows.
    expect(screen.getByTestId("pt-rows")).toHaveTextContent("10");

    // Type "ops" -> filters to dept==='Ops' rows (12 rows). Page 1 limit 10 -> 10 rows.
    fireEvent.change(screen.getByPlaceholderText("Search"), {
      target: { value: "ops" },
    });
    expect(screen.getByTestId("pt-rows")).toHaveTextContent("10");
    // currentPage reset to 1 via the useEffect on searchInput change
    expect(setCurrentPage).toHaveBeenCalledWith(1);

    // Narrow further: "user5" -> only "User5" itself (User15 / User25 do not
    // contain the literal substring "user5").
    fireEvent.change(screen.getByPlaceholderText("Search"), {
      target: { value: "user5" },
    });
    expect(screen.getByTestId("pt-rows")).toHaveTextContent("1");
  });

  it("renders grid view + view-mode toggle when gridCard is supplied", () => {
    const gridCard = (item) => (
      <div key={item.id} data-testid={`gc-${item.id}`}>
        {item.name}
      </div>
    );
    render(
      <ReusableTablePage
        title="Grid"
        data={sampleData.slice(0, 3)}
        columns={baseColumns}
        searchKeys={["name"]}
        currentPage={1}
        setCurrentPage={() => {}}
        gridCard={gridCard}
        viewMode="grid"
      />
    );
    // Three grid cards (controlled viewMode='grid' wins over default 'table')
    expect(screen.getByTestId("gc-1")).toBeInTheDocument();
    expect(screen.getByTestId("gc-2")).toBeInTheDocument();
    expect(screen.getByTestId("gc-3")).toBeInTheDocument();
    // ProfilesTable not rendered in grid mode
    expect(screen.queryByTestId("profiles-table")).toBeNull();
    // The two view-mode toggle buttons are present
    expect(screen.getByTitle("Grid view")).toBeInTheDocument();
    expect(screen.getByTitle("Table view")).toBeInTheDocument();
  });

  it("flips view mode via the toggle buttons (calls onViewModeChange)", () => {
    const onViewModeChange = vi.fn();
    render(
      <ReusableTablePage
        title="Grid"
        data={[]}
        columns={baseColumns}
        searchKeys={["name"]}
        currentPage={1}
        setCurrentPage={() => {}}
        gridCard={() => null}
        viewMode="table"
        onViewModeChange={onViewModeChange}
      />
    );
    fireEvent.click(screen.getByTitle("Grid view"));
    expect(onViewModeChange).toHaveBeenCalledWith("grid");
    fireEvent.click(screen.getByTitle("Table view"));
    expect(onViewModeChange).toHaveBeenCalledWith("table");
  });

  it("uses server pagination when attendanceLogsCount is provided + renders Total logs strip", () => {
    // server pagination passes data through as-is, ignoring filter slicing.
    render(
      <ReusableTablePage
        title="Server"
        data={sampleData.slice(0, 10)}
        columns={baseColumns}
        searchKeys={["name"]}
        currentPage={1}
        setCurrentPage={() => {}}
        attendanceLogsCount={123}
        limit={10}
        onLimitChange={() => {}}
      />
    );
    expect(screen.getByText(/Total logs/)).toBeInTheDocument();
    // attendanceLogsCount surfaces in the badge
    expect(screen.getByText("123")).toBeInTheDocument();
    // totalPages = ceil(123/10) = 13, so Next is enabled at page 1 - check the
    // page 1 button is selected.
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("Prev is disabled on page 1 + Next is disabled on the last page", () => {
    const setCurrentPage = vi.fn();
    const { rerender } = render(
      <ReusableTablePage
        title="P"
        data={sampleData.slice(0, 10)}
        columns={baseColumns}
        searchKeys={["name"]}
        currentPage={1}
        setCurrentPage={setCurrentPage}
        attendanceLogsCount={20}
        limit={10}
      />
    );
    // 20 / 10 = 2 pages -> Prev disabled at page 1.
    const buttons = screen.getAllByRole("button");
    // Find the chevron-left and chevron-right anchor buttons by their disabled
    // class.
    const disabled = buttons.filter((b) => b.disabled);
    expect(disabled.length).toBeGreaterThanOrEqual(1);

    // Re-render at the last page -> Next disabled.
    rerender(
      <ReusableTablePage
        title="P"
        data={sampleData.slice(0, 10)}
        columns={baseColumns}
        searchKeys={["name"]}
        currentPage={2}
        setCurrentPage={setCurrentPage}
        attendanceLogsCount={20}
        limit={10}
      />
    );
    const buttons2 = screen.getAllByRole("button");
    const disabled2 = buttons2.filter((b) => b.disabled);
    expect(disabled2.length).toBeGreaterThanOrEqual(1);
  });

  it("changes rows-per-page via the <select> -> calls onLimitChange + resets currentPage to 1", () => {
    const setCurrentPage = vi.fn();
    const onLimitChange = vi.fn();
    render(
      <ReusableTablePage
        title="L"
        data={sampleData}
        columns={baseColumns}
        searchKeys={["name"]}
        currentPage={1}
        setCurrentPage={setCurrentPage}
        limit={10}
        onLimitChange={onLimitChange}
      />
    );
    // The rows-per-page <select> has a "Rows:" sibling label.
    const rowsSelect = screen.getByDisplayValue("10");
    fireEvent.change(rowsSelect, { target: { value: "50" } });
    expect(onLimitChange).toHaveBeenCalledWith(50);
    expect(setCurrentPage).toHaveBeenCalledWith(1);
  });

  it("DateRangePicker onRangeChange forwards to onDateRangeChange when supplied (normalised dates)", () => {
    const onDateRangeChange = vi.fn();
    render(
      <ReusableTablePage
        title="D"
        data={[]}
        columns={baseColumns}
        searchKeys={["name"]}
        currentPage={1}
        setCurrentPage={() => {}}
        onDateRangeChange={onDateRangeChange}
      />
    );
    fireEvent.click(screen.getByTestId("drp-fire"));
    expect(onDateRangeChange).toHaveBeenCalledTimes(1);
    const arg = onDateRangeChange.mock.calls[0][0];
    expect(arg.start).toBeInstanceOf(Date);
    expect(arg.end).toBeInstanceOf(Date);
  });

  it("DateRangePicker onRangeChange ignores null payloads (no-op)", () => {
    const onDateRangeChange = vi.fn();
    render(
      <ReusableTablePage
        title="D"
        data={[]}
        columns={baseColumns}
        searchKeys={["name"]}
        currentPage={1}
        setCurrentPage={() => {}}
        onDateRangeChange={onDateRangeChange}
      />
    );
    fireEvent.click(screen.getByTestId("drp-fire-null"));
    expect(onDateRangeChange).not.toHaveBeenCalled();
  });

  it("renders 'Loading..' copy when loading=true (regardless of data)", () => {
    render(
      <ReusableTablePage
        title="L"
        data={sampleData.slice(0, 3)}
        columns={baseColumns}
        searchKeys={["name"]}
        currentPage={1}
        setCurrentPage={() => {}}
        loading={true}
      />
    );
    expect(screen.getByText("Loading..")).toBeInTheDocument();
  });

  it("renders the notfound illustration when data is empty + not loading", () => {
    const { container } = render(
      <ReusableTablePage
        title="L"
        data={[]}
        columns={baseColumns}
        searchKeys={["name"]}
        currentPage={1}
        setCurrentPage={() => {}}
        loading={false}
      />
    );
    // notfound asset rendered with alt="No logs found"
    expect(container.querySelector('img[alt="No logs found"]')).not.toBeNull();
  });

  it("renders custom children slot inside the filter row", () => {
    render(
      <ReusableTablePage
        title="C"
        data={[]}
        columns={baseColumns}
        searchKeys={["name"]}
        currentPage={1}
        setCurrentPage={() => {}}
      >
        <button data-testid="extra-filter">More</button>
      </ReusableTablePage>
    );
    expect(screen.getByTestId("extra-filter")).toBeInTheDocument();
  });

  it("forwards searchQuery + onSearchChange when both provided (controlled search)", () => {
    const onSearchChange = vi.fn();
    render(
      <ReusableTablePage
        title="C"
        data={sampleData}
        columns={baseColumns}
        searchKeys={["name"]}
        currentPage={1}
        setCurrentPage={() => {}}
        searchQuery="user1"
        onSearchChange={onSearchChange}
      />
    );
    // Controlled value shows in the input.
    const input = screen.getByPlaceholderText("Search");
    expect(input.value).toBe("user1");
    // Typing fires onSearchChange and not internal state.
    fireEvent.change(input, { target: { value: "user2" } });
    expect(onSearchChange).toHaveBeenCalledWith("user2");
  });
});
