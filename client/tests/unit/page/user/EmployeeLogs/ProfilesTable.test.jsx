/**
 * src/page/user/EmployeeLogs/ProfilesTable.jsx — TanStack-table table that
 * renders supplied columns/data, with an alternate skeleton rendering when
 * `loading` is true.
 *
 * Mocks: 0
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import ProfilesTable from "@/page/user/EmployeeLogs/ProfilesTable.jsx";

const columns = [
  {
    accessorKey: "name",
    header: "Name",
    cell: (cell) => <span data-testid="name-cell">{cell.row.original.name}</span>,
  },
  {
    accessorKey: "dept",
    header: () => <span data-testid="header-fn">Department</span>,
    cell: (cell) => cell.row.original.dept,
  },
];

const data = [
  { name: "Alpha", dept: "Eng" },
  { name: "Bravo", dept: "Ops" },
];

describe("ProfilesTable", () => {
  it("renders headers (string and function) when data is loaded", () => {
    render(<ProfilesTable data={data} columns={columns} loading={false} />);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByTestId("header-fn")).toBeInTheDocument();
  });

  it("renders one row per data entry using the supplied cell renderers", () => {
    render(<ProfilesTable data={data} columns={columns} loading={false} />);
    const nameCells = screen.getAllByTestId("name-cell");
    expect(nameCells).toHaveLength(2);
    expect(nameCells[0]).toHaveTextContent("Alpha");
    expect(nameCells[1]).toHaveTextContent("Bravo");
    expect(screen.getByText("Eng")).toBeInTheDocument();
    expect(screen.getByText("Ops")).toBeInTheDocument();
  });

  it("renders 8 skeleton rows when loading=true", () => {
    const { container } = render(
      <ProfilesTable data={[]} columns={columns} loading />
    );
    const bodyRows = container.querySelectorAll("tbody tr");
    expect(bodyRows.length).toBe(8);
    // Each row has one td per column (2).
    expect(bodyRows[0].querySelectorAll("td").length).toBe(2);
  });

  it("renders skeletons in headers and bodies when loading", () => {
    const { container } = render(
      <ProfilesTable data={[]} columns={columns} loading />
    );
    // react-loading-skeleton outputs span.react-loading-skeleton.
    const skeletons = container.querySelectorAll(".react-loading-skeleton");
    // 2 header skeletons + (8 rows * 2 cols) body skeletons = 18.
    expect(skeletons.length).toBeGreaterThanOrEqual(18);
  });

  it("renders an empty body when data is empty and not loading", () => {
    const { container } = render(
      <ProfilesTable data={[]} columns={columns} loading={false} />
    );
    expect(container.querySelectorAll("tbody tr").length).toBe(0);
    // Headers still rendered.
    expect(screen.getByText("Name")).toBeInTheDocument();
  });

  it("falls back to renderValue when cell is not a function", () => {
    const cols = [
      { accessorKey: "name", header: "Name" },
    ];
    render(<ProfilesTable data={[{ name: "Charlie" }]} columns={cols} loading={false} />);
    expect(screen.getByText("Charlie")).toBeInTheDocument();
  });
});
