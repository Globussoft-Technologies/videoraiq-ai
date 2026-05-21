/**
 * src/page/user/Streams/DesktopTableView.jsx — renders a fully-controlled
 * tanstack-react-table instance into a wide desktop table. It owns no state;
 * the parent passes the table instance and the component just flexRenders
 * headers + cells.
 *
 * We use the real `@tanstack/react-table` (it's already a hot dependency in
 * the suite — see ProfilesTable etc.), so the only thing under test is the
 * DesktopTableView wiring: header cells, body rows, and the sticky `select`
 * column className branch.
 *
 * Mocks: 0.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  useReactTable,
  getCoreRowModel,
} from "@tanstack/react-table";

import { DesktopTableView } from "../../../../../src/page/user/Streams/DesktopTableView.jsx";

const rows = [
  { id: 1, camera: "Cam-A", status: "Approved" },
  { id: 2, camera: "Cam-B", status: "Pending" },
];

const columns = [
  {
    id: "select",
    header: () => <span data-testid="hdr-select">SEL</span>,
    cell: () => <input type="checkbox" data-testid="row-select" />,
  },
  {
    id: "camera",
    accessorKey: "camera",
    header: () => <span>Camera</span>,
    cell: ({ row }) => <span data-testid="cell-camera">{row.original.camera}</span>,
  },
  {
    id: "status",
    accessorKey: "status",
    header: () => <span>Status</span>,
    cell: ({ row }) => <span>{row.original.status}</span>,
  },
];

function Harness({ data }) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  return <DesktopTableView table={table} />;
}

describe("DesktopTableView", () => {
  it("renders one <thead> row with one <th> per column", () => {
    render(<Harness data={rows} />);
    const ths = screen.getAllByRole("columnheader");
    expect(ths).toHaveLength(3);
    expect(screen.getByTestId("hdr-select")).toBeInTheDocument();
    expect(screen.getByText("Camera")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
  });

  it("renders one <tr> per data row inside the <tbody>", () => {
    const { container } = render(<Harness data={rows} />);
    const bodyRows = container.querySelectorAll("tbody tr");
    expect(bodyRows).toHaveLength(2);
    expect(screen.getAllByTestId("cell-camera").map((n) => n.textContent)).toEqual([
      "Cam-A",
      "Cam-B",
    ]);
  });

  it("renders an empty <tbody> when data is empty (no rows)", () => {
    const { container } = render(<Harness data={[]} />);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(0);
    // Header row still present.
    expect(container.querySelectorAll("thead tr")).toHaveLength(1);
  });

  it("the `select` header gets the sticky/bg-gray-100 className branch", () => {
    const { container } = render(<Harness data={rows} />);
    const headers = container.querySelectorAll("thead th");
    // First header column id is 'select' per our columns config.
    expect(headers[0].className).toContain("sticky");
    expect(headers[0].className).toContain("bg-gray-100");
    // Non-select header should NOT carry the sticky class.
    expect(headers[1].className).not.toContain("sticky");
  });

  it("the `select` body cell gets the sticky/bg-[#F5F5F5] className branch", () => {
    const { container } = render(<Harness data={rows} />);
    const firstRowCells = container.querySelectorAll("tbody tr:first-child td");
    expect(firstRowCells[0].className).toContain("sticky");
    expect(firstRowCells[0].className).toContain("bg-[#F5F5F5]");
    expect(firstRowCells[1].className).not.toContain("sticky");
  });
});
