/**
 * src/page/user/RolePermissions/PermissionTable.jsx — TanStack-table table
 * renderer with three branches:
 *   1. `loading` -> 8 skeleton rows (cols pulled from the table instance).
 *   2. !data || data.length === 0 -> single "No data available" row,
 *      colSpan === columns.length, but headers still rendered from the
 *      raw columns array (supporting both string headers and header
 *      functions).
 *   3. Normal -> headers from columnDef + a row per data entry, using
 *      supplied cell function or `renderValue()` fallback.
 *
 * Mocks: 0 — real @tanstack/react-table + react-loading-skeleton.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import PermissionTable from "@/page/user/RolePermissions/PermissionTable.jsx";

const columns = [
  {
    accessorKey: "role",
    header: "Role",
    cell: (cell) => <span data-testid="role-cell">{cell.row.original.role}</span>,
  },
  {
    accessorKey: "users",
    header: () => <span data-testid="users-header">Users</span>,
    cell: (cell) => cell.row.original.users,
  },
];

const data = [
  { role: "Admin", users: 5 },
  { role: "Viewer", users: 12 },
];

describe("RolePermissions/PermissionTable", () => {
  it("renders string and function headers when data is present", () => {
    render(<PermissionTable data={data} columns={columns} loading={false} />);
    expect(screen.getByText("Role")).toBeInTheDocument();
    expect(screen.getByTestId("users-header")).toBeInTheDocument();
  });

  it("renders one body row per data entry, using the supplied cell renderers", () => {
    render(<PermissionTable data={data} columns={columns} loading={false} />);
    const roleCells = screen.getAllByTestId("role-cell");
    expect(roleCells).toHaveLength(2);
    expect(roleCells[0]).toHaveTextContent("Admin");
    expect(roleCells[1]).toHaveTextContent("Viewer");
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("falls back to renderValue when a cell renderer is not a function", () => {
    const cols = [{ accessorKey: "role", header: "Role" }];
    render(
      <PermissionTable
        data={[{ role: "Operator" }]}
        columns={cols}
        loading={false}
      />
    );
    expect(screen.getByText("Operator")).toBeInTheDocument();
  });

  it("renders the 'No data available' empty state with the correct colSpan", () => {
    const { container } = render(
      <PermissionTable data={[]} columns={columns} loading={false} />
    );
    const empty = screen.getByText("No data available");
    expect(empty).toBeInTheDocument();
    // colSpan should equal number of columns supplied (string + function header
    // are both rendered in the empty-state thead).
    expect(empty.getAttribute("colspan")).toBe(String(columns.length));
    // Headers are still rendered.
    expect(screen.getByText("Role")).toBeInTheDocument();
    expect(screen.getByTestId("users-header")).toBeInTheDocument();
    // No body data rows (just the single "No data" row).
    const bodyRows = container.querySelectorAll("tbody tr");
    expect(bodyRows.length).toBe(1);
  });

  it("treats a missing `data` prop as the empty state", () => {
    render(<PermissionTable data={undefined} columns={columns} loading={false} />);
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("renders 8 skeleton rows when loading=true", () => {
    const { container } = render(
      <PermissionTable data={[]} columns={columns} loading />
    );
    const bodyRows = container.querySelectorAll("tbody tr");
    expect(bodyRows.length).toBe(8);
    // Each row has one td per column.
    expect(bodyRows[0].querySelectorAll("td").length).toBe(columns.length);
    // No "No data" message and no actual data while loading.
    expect(screen.queryByText("No data available")).not.toBeInTheDocument();
  });

  it("emits header + body skeletons (react-loading-skeleton spans) when loading", () => {
    const { container } = render(
      <PermissionTable data={[]} columns={columns} loading />
    );
    const skeletons = container.querySelectorAll(".react-loading-skeleton");
    // 2 header skeletons + (8 rows * 2 cols) body skeletons = 18.
    expect(skeletons.length).toBeGreaterThanOrEqual(18);
  });
});
