/**
 * src/page/user/EmployeeLogs/ProductivityLog.jsx — wires a hard-coded
 * `sampleLogs` array + a 7-column TanStack column spec into ReusableTablePage,
 * with two NVR / Camera Select filters rendered as children. We stub
 * ReusableTablePage and the Select primitives to surface the wiring without
 * pulling in the full table machinery.
 *
 * Mocks (2):
 *   1. ./ReusableTablePage — capture title/data/columns/searchKeys and
 *      render the column header/cell renderers against a single sample row.
 *   2. @/components/ui/select — inline native <select> so onValueChange
 *      flows through synchronously.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const reusableProps = vi.hoisted(() => ({ value: null }));

vi.mock(
  "../../../../../src/page/user/EmployeeLogs/ReusableTablePage",
  () => ({
    default: ({ title, data, columns, searchKeys, children }) => {
      reusableProps.value = { title, data, columns, searchKeys };
      const row0 = { original: data[0] };
      return (
        <div data-testid="rtp" data-title={title}>
          <div data-testid="search-keys">{(searchKeys || []).join(",")}</div>
          <div data-testid="row-count">{data.length}</div>
          <div data-testid="columns">
            {columns.map((col, i) => (
              <div key={i} data-testid={`col-${i}`} data-key={col.accessorKey}>
                <div data-testid={`hdr-${i}`}>
                  {typeof col.header === "function" ? col.header() : col.header}
                </div>
                <div data-testid={`cell-${i}`}>
                  {col.cell ? col.cell({ row: row0 }) : null}
                </div>
              </div>
            ))}
          </div>
          <div data-testid="children-slot">{children}</div>
        </div>
      );
    },
  })
);

vi.mock("@/components/ui/select", () => {
  // Inline the Select so trigger + items render together (no portal).
  // Each SelectItem registers a clickable button bound to the parent's
  // onValueChange via context.
  const Ctx = require("react").createContext(null);
  const Select = ({ value, onValueChange, children }) => (
    <Ctx.Provider value={{ value, onValueChange }}>
      <div data-mock="select" data-value={value || ""}>
        {children}
      </div>
    </Ctx.Provider>
  );
  const SelectTrigger = ({ children }) => <div>{children}</div>;
  const SelectValue = ({ placeholder }) => <span>{placeholder}</span>;
  const SelectContent = ({ children }) => <div>{children}</div>;
  const SelectItem = ({ value, children }) => {
    const ctx = require("react").useContext(Ctx);
    return (
      <button
        type="button"
        data-mock="item"
        data-value={value}
        onClick={() => ctx?.onValueChange?.(value)}
      >
        {children}
      </button>
    );
  };
  return { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
});

const { default: ProductivityLog } = await import(
  "../../../../../src/page/user/EmployeeLogs/ProductivityLog.jsx"
);

describe("ProductivityLog", () => {
  it("forwards 'Productivity Logs' title to ReusableTablePage", () => {
    render(<ProductivityLog />);
    expect(screen.getByTestId("rtp").getAttribute("data-title")).toBe(
      "Productivity Logs"
    );
  });

  it("forwards a 5-row sampleLogs dataset", () => {
    render(<ProductivityLog />);
    expect(screen.getByTestId("row-count").textContent).toBe("5");
  });

  it("forwards searchKeys=['name','department']", () => {
    render(<ProductivityLog />);
    expect(screen.getByTestId("search-keys").textContent).toBe(
      "name,department"
    );
  });

  it("defines 7 columns in the expected order", () => {
    render(<ProductivityLog />);
    const expected = [
      "image",
      "name",
      "department",
      "date",
      "productiveHours",
      "nonProductiveHours",
      "totalHours",
    ];
    expected.forEach((key, i) => {
      expect(
        screen.getByTestId(`col-${i}`).getAttribute("data-key")
      ).toBe(key);
    });
  });

  it("the 'name' column header is a renderable element with the Name label", () => {
    render(<ProductivityLog />);
    expect(screen.getByTestId("hdr-1").textContent).toMatch(/Name/);
  });

  it("image column cell renders an <img> with src/alt from row.original", () => {
    render(<ProductivityLog />);
    const img = screen.getByTestId("cell-0").querySelector("img");
    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toMatch(/picsum/);
    expect(img.getAttribute("alt")).toBe("Eleanor Pena");
  });

  it("renders two filter Selects with NVR / Camera placeholders", () => {
    render(<ProductivityLog />);
    expect(screen.getByText("Select NVR")).toBeInTheDocument();
    expect(screen.getByText("Select Camera")).toBeInTheDocument();
  });

  it("changing an NVR select option updates state without crashing", () => {
    render(<ProductivityLog />);
    const selects = document.querySelectorAll('[data-mock="select"]');
    expect(selects.length).toBe(2);
    fireEvent.click(screen.getByText("NVR 1"));
    expect(selects[0].getAttribute("data-value")).toBe("nvr1");
  });

  it("changing a Camera select option updates state without crashing", () => {
    render(<ProductivityLog />);
    fireEvent.click(screen.getByText("Camera 2"));
    const selects = document.querySelectorAll('[data-mock="select"]');
    expect(selects[1].getAttribute("data-value")).toBe("cam2");
  });
});
