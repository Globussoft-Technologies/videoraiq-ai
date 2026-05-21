/**
 * src/page/user/Profile/ProfilesTable.jsx — a thin tanstack-react-table view.
 * Two branches:
 *   - loading=true  → render header skeletons + 8 placeholder rows
 *   - loading=false → render header text + body cells from row.getVisibleCells()
 *
 * It builds its own table instance internally (we just pass data + columns).
 *
 * Mocks: 0. Real @tanstack/react-table + react-loading-skeleton. The
 * skeleton package pulls in a CSS file via the JSX import — Vitest's
 * `css: false` config means that import resolves to a no-op stylesheet,
 * so no manual CSS mock is required.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import ProfilesTable from "../../../../../src/page/user/Profile/ProfilesTable.jsx";

const columns = [
  {
    id: "name",
    accessorKey: "name",
    header: () => <span>Name</span>,
    cell: ({ row }) => <span data-testid="cell-name">{row.original.name}</span>,
  },
  {
    id: "createdBy",
    accessorKey: "createdBy",
    header: () => <span>Created By</span>,
    cell: ({ row }) => <span>{row.original.createdBy}</span>,
  },
  {
    id: "status",
    accessorKey: "status",
    header: () => <span>Status</span>,
    cell: ({ row }) => <span>{row.original.status}</span>,
  },
];

const data = [
  { name: "Profile-1", createdBy: "a@b.com", status: "Active" },
  { name: "Profile-2", createdBy: "c@d.com", status: "Inactive" },
];

describe("ProfilesTable", () => {
  describe("loaded mode", () => {
    it("renders one header per column with the configured text", () => {
      render(<ProfilesTable data={data} columns={columns} loading={false} />);
      // No 'select' column in this config — exactly three headers.
      const ths = screen.getAllByRole("columnheader");
      expect(ths).toHaveLength(3);
      expect(screen.getByText("Name")).toBeInTheDocument();
      expect(screen.getByText("Created By")).toBeInTheDocument();
      expect(screen.getByText("Status")).toBeInTheDocument();
    });

    it("renders one body row per data entry with cells from the cell renderer", () => {
      const { container } = render(
        <ProfilesTable data={data} columns={columns} loading={false} />
      );
      const bodyRows = container.querySelectorAll("tbody tr");
      expect(bodyRows).toHaveLength(2);
      const names = screen
        .getAllByTestId("cell-name")
        .map((n) => n.textContent);
      expect(names).toEqual(["Profile-1", "Profile-2"]);
      expect(screen.getByText("a@b.com")).toBeInTheDocument();
      expect(screen.getByText("Inactive")).toBeInTheDocument();
    });

    it("renders zero body rows when data is empty (header still shows)", () => {
      const { container } = render(
        <ProfilesTable data={[]} columns={columns} loading={false} />
      );
      expect(container.querySelectorAll("tbody tr")).toHaveLength(0);
      expect(container.querySelectorAll("thead tr")).toHaveLength(1);
    });
  });

  describe("loading mode", () => {
    it("renders exactly 8 placeholder rows regardless of data length", () => {
      const { container } = render(
        <ProfilesTable data={data} columns={columns} loading={true} />
      );
      const bodyRows = container.querySelectorAll("tbody tr");
      expect(bodyRows).toHaveLength(8);
    });

    it("renders one <th> per column even while loading (no header text from columnDef)", () => {
      const { container } = render(
        <ProfilesTable data={[]} columns={columns} loading={true} />
      );
      // Each th in loading mode just contains a <Skeleton> placeholder, not
      // the real header text — so 'Name' should not be visible.
      const ths = container.querySelectorAll("thead th");
      expect(ths).toHaveLength(3);
      expect(screen.queryByText("Name")).not.toBeInTheDocument();
    });

    it("each placeholder row has one <td> per column", () => {
      const { container } = render(
        <ProfilesTable data={[]} columns={columns} loading={true} />
      );
      const firstRowCells = container.querySelectorAll(
        "tbody tr:first-child td"
      );
      expect(firstRowCells).toHaveLength(3);
    });
  });
});
