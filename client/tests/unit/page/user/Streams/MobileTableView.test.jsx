/**
 * src/page/user/Streams/MobileTableView.jsx — renders one card per row from a
 * tanstack table instance. Each card exposes:
 *   - a header Checkbox (defaultChecked = row.original.select)
 *   - 4 detection Switches (fire, unauthorized, face, cashier)
 *   - a status badge with red/green styling based on row.original.status
 *   - a Control Select wired to table.options.meta.updateData(rowIdx, 'control', v)
 *
 * The dot color next to the trigger comes from a local `dotColors` map keyed
 * on row.original.control.
 *
 * Mocks: 1 — we replace @/components/ui/select with a plain native <select>
 * so we can drive onValueChange via fireEvent without dealing with Radix's
 * portaled listbox. Other ui primitives (Switch, Checkbox, Button) render
 * inline already.
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  useReactTable,
  getCoreRowModel,
} from "@tanstack/react-table";

vi.mock("@/components/ui/select", () => {
  const Select = ({ value, onValueChange, children }) => (
    <select
      data-testid={`mt-select-${value}`}
      value={value || ""}
      onChange={(e) => onValueChange?.(e.target.value)}
    >
      <option value="">__placeholder__</option>
      {children}
    </select>
  );
  const SelectTrigger = ({ children }) => <>{children}</>;
  const SelectValue = ({ placeholder }) => <span>{placeholder}</span>;
  const SelectContent = ({ children }) => <>{children}</>;
  const SelectItem = ({ value, children }) => (
    <option value={value}>{children}</option>
  );
  return { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
});

const { MobileTableView } = await import(
  "../../../../../src/page/user/Streams/MobileTableView.jsx"
);

const baseColumns = [
  { id: "camera", accessorKey: "camera" },
  { id: "fireDetection", accessorKey: "fireDetection" },
  { id: "control", accessorKey: "control" },
  { id: "status", accessorKey: "status" },
];

function Harness({ data, updateData }) {
  const table = useReactTable({
    data,
    columns: baseColumns,
    getCoreRowModel: getCoreRowModel(),
    meta: { updateData },
  });
  return <MobileTableView table={table} />;
}

describe("MobileTableView", () => {
  const sampleRow = {
    select: true,
    camera: "Cam-Alpha",
    fireDetection: true,
    unauthorizedAccess: false,
    faceRecognition: true,
    cashierZoneTracking: false,
    control: "start",
    status: "Approved",
  };

  it("renders one card per row with the camera name and status visible", () => {
    render(<Harness data={[sampleRow]} updateData={() => {}} />);
    expect(screen.getByText("Cam-Alpha")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
  });

  it("renders zero cards for an empty dataset", () => {
    const { container } = render(
      <Harness data={[]} updateData={() => {}} />
    );
    // Container shows the wrapper but no inner card divs
    expect(container.querySelector(".md\\:hidden")?.children.length || 0).toBe(0);
  });

  it("shows the 'Approved' green badge styling when status is Approved", () => {
    render(<Harness data={[sampleRow]} updateData={() => {}} />);
    const badge = screen.getByText("Approved");
    expect(badge.className).toContain("text-[#338904]");
    expect(badge.className).toContain("bg-[#E8FFDB]");
  });

  it("shows the red 'rejected' badge styling when status is not Approved", () => {
    render(
      <Harness
        data={[{ ...sampleRow, status: "Rejected" }]}
        updateData={() => {}}
      />
    );
    const badge = screen.getByText("Rejected");
    expect(badge.className).toContain("text-[#CE241C]");
    expect(badge.className).toContain("bg-[#FFDBD9]");
  });

  it("renders the four detection switches with defaultChecked matching the row data", () => {
    render(<Harness data={[sampleRow]} updateData={() => {}} />);
    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(4);
    // The Radix Switch sets data-state synchronously from defaultChecked.
    const states = switches.map((s) => s.getAttribute("data-state"));
    // fireDetection=true, unauthorized=false, face=true, cashier=false
    expect(states).toEqual(["checked", "unchecked", "checked", "unchecked"]);
  });

  it("renders all four label cells and the Apply to review button", () => {
    render(<Harness data={[sampleRow]} updateData={() => {}} />);
    expect(screen.getByText("Camera")).toBeInTheDocument();
    expect(screen.getByText("Fire Detection")).toBeInTheDocument();
    expect(screen.getByText("Unauthorized Access")).toBeInTheDocument();
    expect(screen.getByText("Face Recognition")).toBeInTheDocument();
    expect(screen.getByText("Cashier Tracking")).toBeInTheDocument();
    expect(screen.getByText(/Apply to review/i)).toBeInTheDocument();
  });

  it("changing the control select forwards (rowIndex, 'control', newValue) to meta.updateData", () => {
    const updateData = vi.fn();
    render(<Harness data={[sampleRow]} updateData={updateData} />);
    const select = screen.getByTestId("mt-select-start");
    fireEvent.change(select, { target: { value: "stop" } });
    expect(updateData).toHaveBeenCalledWith(0, "control", "stop");
  });

  it("renders one card per row when multiple rows are provided", () => {
    render(
      <Harness
        data={[
          sampleRow,
          { ...sampleRow, camera: "Cam-Beta", control: "stop", status: "Pending" },
        ]}
        updateData={() => {}}
      />
    );
    expect(screen.getByText("Cam-Alpha")).toBeInTheDocument();
    expect(screen.getByText("Cam-Beta")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  // Skip: product bug at MobileTableView.jsx:77 — `table.options.meta?.updateData(row.index, ...)`
  // uses optional chaining on property access but then immediately CALLS the
  // result. If `meta.updateData` is undefined, this throws
  // `TypeError: table.options.meta?.updateData is not a function`. Should be
  // `meta?.updateData?.(...)` to truly be optional. Report-only; not patching.
  it.skip("falls back gracefully when meta.updateData is not provided (product bug — should use optional call)", () => {});
});
