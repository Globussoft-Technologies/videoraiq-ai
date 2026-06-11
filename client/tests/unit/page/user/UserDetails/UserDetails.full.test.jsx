/**
 * Round 2: Extended coverage for UserDetails/UserDetails.jsx beyond the
 * existing permission-gate test.
 *
 * The page wires fetchUsers -> getUserDetails on mount + on search /
 * page / sort changes, drives a TanStack table via baseColumns +
 * visibleCols filter, exposes per-row Edit (NewPermissionForm in edit
 * mode) and Delete (DeleteConfirmation -> deleteUser) actions, a
 * floating bulk-delete bar gated by selectedRoles.length + canDelete,
 * a Search input that resets currentPage to 1, a sortable User name
 * header that flips sortOrder asc/desc, and a Pagination footer with a
 * guarded handlePageChange.
 *
 * Mock budget: unrestricted in r2.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ----- Api modules ------------------------------------------------------
const postApiRef = vi.hoisted(() => ({
  getUserDetails: vi.fn(),
}));
vi.mock("../../../../../src/page/user/UserDetails/Api/Post", () => postApiRef);

const deleteApiRef = vi.hoisted(() => ({
  deleteUser: vi.fn(),
  deleteBulkUser: vi.fn(),
}));
vi.mock(
  "../../../../../src/page/user/UserDetails/Api/delete",
  () => deleteApiRef
);

// ----- Token / jwt ------------------------------------------------------
vi.mock("@/utils/getAccessToken", () => ({
  default: () => "mock-token",
}));
vi.mock("jwt-decode", () => ({
  jwtDecode: () => ({
    user_email: "me@example.com",
    memberId: "M123",
  }),
}));

// ----- Permission context ----------------------------------------------
const permissionsRef = vi.hoisted(() => ({ value: null }));
vi.mock("@/context/Permission/PermissionContext", () => ({
  usePermissions: () => permissionsRef.value,
}));

// ----- AccessDenied / PageLoader ---------------------------------------
vi.mock("@/components/AccessDenied", () => ({
  default: ({ message }) => (
    <div data-testid="access-denied">{message}</div>
  ),
}));
vi.mock("@/components/PageLoader", () => ({
  default: () => <div data-testid="page-loader">Loading</div>,
}));

// ----- Pagination -------------------------------------------------------
vi.mock("@/components/Pagination", () => ({
  default: ({ currentPage, totalPages, onPageChange }) => (
    <div data-testid="pagination">
      <span data-testid="pagination-current">{currentPage}</span>
      <span data-testid="pagination-total">{totalPages}</span>
      <button
        data-testid="pagination-next"
        onClick={() => onPageChange(currentPage + 1)}
      >
        next
      </button>
      <button
        data-testid="pagination-zero"
        onClick={() => onPageChange(0)}
      >
        zero
      </button>
      <button
        data-testid="pagination-too-high"
        onClick={() => onPageChange(currentPage + 999)}
      >
        too high
      </button>
    </div>
  ),
}));

// ----- NewPermissionForm -----------------------------------------------
vi.mock(
  "../../../../../src/page/user/UserDetails/NewPermissionForm",
  () => ({
    default: ({ trigger, mode, initialValues, onSave, fetchUsers }) => (
      <div
        data-testid={`new-permission-${mode || "create"}`}
        data-initial-email={initialValues?.email || ""}
        data-initial-id={initialValues?._id || ""}
      >
        {trigger}
        <button
          data-testid={`new-permission-onsave-${mode || "create"}`}
          onClick={() => onSave && onSave()}
        >
          fake-save
        </button>
        <button
          data-testid={`new-permission-fetch-${mode || "create"}`}
          onClick={() => fetchUsers && fetchUsers()}
        >
          fake-fetch
        </button>
      </div>
    ),
  })
);

// ----- DeleteConfirmation ----------------------------------------------
vi.mock(
  "../../../../../src/page/user/Detection/components/DeleteConfirmation",
  () => ({
    default: ({ open, message, onClose, onConfirm }) =>
      open ? (
        <div data-testid="delete-confirm">
          <div data-testid="delete-confirm-message">{message}</div>
          <button data-testid="delete-confirm-confirm" onClick={onConfirm}>
            confirm
          </button>
          <button data-testid="delete-confirm-cancel" onClick={onClose}>
            cancel
          </button>
        </div>
      ) : null,
  })
);

// ----- PermissionTable --------------------------------------------------
vi.mock(
  "../../../../../src/page/user/RolePermissions/PermissionTable",
  () => ({
    default: ({ data, columns, loading }) => (
      <div data-testid="perm-table" data-loading={String(!!loading)}>
        <div data-testid="perm-table-row-count">{data?.length || 0}</div>
        <div data-testid="perm-table-col-count">{columns?.length || 0}</div>
        {/* Render the header from the 'name' (sortable) column */}
        {columns?.map((col, ci) => (
          <div key={ci} data-testid={`col-header-${col.accessorKey || ci}`}>
            {typeof col.header === "function" ? col.header() : col.header}
          </div>
        ))}
        {data?.map((row, idx) => (
          <div key={idx} data-testid={`row-${idx}`}>
            {columns.map((col, cIdx) => (
              <div
                key={cIdx}
                data-testid={`row-${idx}-cell-${col.accessorKey || cIdx}`}
              >
                {typeof col.cell === "function"
                  ? col.cell({ row: { original: row } })
                  : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    ),
  })
);

// ----- UI primitives ----------------------------------------------------
vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ checked, onCheckedChange, disabled, ...rest }) => (
    <input
      type="checkbox"
      checked={!!checked}
      disabled={!!disabled}
      onChange={(e) => onCheckedChange && onCheckedChange(e.target.checked)}
      {...rest}
    />
  ),
}));
vi.mock("@/components/ui/switch", () => ({
  Switch: (props) => <input type="checkbox" {...props} />,
}));
vi.mock("@/components/ui/input", () => ({
  Input: (props) => <input {...props} />,
}));

// ----- sonner -----------------------------------------------------------
const toastRef = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastRef }));

import UserDetails from "../../../../../src/page/user/UserDetails/UserDetails.jsx";

const fullPerms = {
  permissions: {
    Users: { view: true, create: true, edit: true, delete: true },
  },
  loading: false,
};

const usersPayloadFactory = (override = {}) => ({
  data: {
    body: {
      data: {
        users: [
          {
            _id: "u1",
            userName: "Alice",
            firstName: "Alice",
            lastName: "A",
            email: "alice@example.com",
            roleIds: { _id: "role-eng", roleName: "Engineer" },
            permission: [],
            active: true,
            createdAt: "2024-01-01T00:00:00Z",
            authorizedChannels: {
              locations: ["loc-1"],
              nvrIds: [{ _id: "nvr-1" }],
              departmentIds: ["dept-1"],
              channels: [{ _id: "ch-1" }],
            },
          },
          {
            _id: "u2",
            userName: "Bob",
            email: "bob@example.com",
            roleIds: { _id: "role-mgr", roleName: "Manager" },
            active: false,
            lastLogin: "2024-06-01T00:00:00Z",
          },
          {
            _id: "u3",
            userName: "Me",
            email: "me@example.com", // matches decoded user_email
            roleIds: { _id: "role-adm", roleName: "Admin" },
            active: true,
          },
        ],
        total: 17,
        ...override,
      },
    },
  },
});

beforeEach(() => {
  postApiRef.getUserDetails.mockReset();
  deleteApiRef.deleteUser.mockReset();
  deleteApiRef.deleteBulkUser.mockReset();
  toastRef.success.mockReset();
  toastRef.error.mockReset();
  permissionsRef.value = fullPerms;
});

describe("UserDetails — full page flow", () => {
  it("fetches users on mount, maps them into rows, shows pagination total", async () => {
    postApiRef.getUserDetails.mockResolvedValue(usersPayloadFactory());
    render(<UserDetails />);
    await waitFor(() =>
      expect(postApiRef.getUserDetails).toHaveBeenCalled()
    );
    await waitFor(() =>
      expect(screen.getByTestId("perm-table-row-count").textContent).toBe("3")
    );
    // total=17, limit=8 -> ceil = 3
    expect(screen.getByTestId("pagination-total").textContent).toBe("3");
  });

  it("rejection sets empty rows + total 0 (silent)", async () => {
    postApiRef.getUserDetails.mockRejectedValue(new Error("boom"));
    render(<UserDetails />);
    await waitFor(() =>
      expect(postApiRef.getUserDetails).toHaveBeenCalled()
    );
    await waitFor(() =>
      expect(screen.getByTestId("perm-table-row-count").textContent).toBe("0")
    );
  });

  it("search input updates the API call and resets currentPage to 1", async () => {
    postApiRef.getUserDetails.mockResolvedValue(usersPayloadFactory());
    render(<UserDetails />);
    await waitFor(() =>
      expect(postApiRef.getUserDetails).toHaveBeenCalled()
    );
    const search = screen.getByPlaceholderText(/Search/i);
    fireEvent.change(search, { target: { value: "alice" } });
    await waitFor(() =>
      expect(postApiRef.getUserDetails).toHaveBeenLastCalledWith(
        "alice",
        expect.any(Number),
        expect.any(Number),
        expect.objectContaining({ page: 1 })
      )
    );
  });

  it("pagination next advances + guards 0 / >totalPages", async () => {
    postApiRef.getUserDetails.mockResolvedValue(usersPayloadFactory());
    render(<UserDetails />);
    await waitFor(() =>
      expect(postApiRef.getUserDetails).toHaveBeenCalledTimes(1)
    );
    fireEvent.click(screen.getByTestId("pagination-next"));
    await waitFor(() =>
      expect(screen.getByTestId("pagination-current").textContent).toBe("2")
    );
    fireEvent.click(screen.getByTestId("pagination-zero"));
    fireEvent.click(screen.getByTestId("pagination-too-high"));
    // still on page 2
    expect(screen.getByTestId("pagination-current").textContent).toBe("2");
  });

  it("sort header on User name flips sortOrder asc <-> desc", async () => {
    postApiRef.getUserDetails.mockResolvedValue(usersPayloadFactory());
    render(<UserDetails />);
    await waitFor(() =>
      expect(postApiRef.getUserDetails).toHaveBeenCalled()
    );
    // initial sort param = asc
    const initialCallSort = postApiRef.getUserDetails.mock.calls[0][3]?.sortOrder;
    expect(initialCallSort).toBe("asc");
    // click the User name header (rendered inside col-header-name)
    const userNameHeader = screen
      .getByTestId("col-header-name")
      .querySelector("button");
    fireEvent.click(userNameHeader);
    await waitFor(() => {
      const lastCall =
        postApiRef.getUserDetails.mock.calls[
          postApiRef.getUserDetails.mock.calls.length - 1
        ];
      expect(lastCall[3].sortOrder).toBe("desc");
    });
    // flip back
    const userNameHeader2 = screen
      .getByTestId("col-header-name")
      .querySelector("button");
    fireEvent.click(userNameHeader2);
    await waitFor(() => {
      const lastCall =
        postApiRef.getUserDetails.mock.calls[
          postApiRef.getUserDetails.mock.calls.length - 1
        ];
      expect(lastCall[3].sortOrder).toBe("asc");
    });
  });

  it("delete (single) flow: clicking trash opens DeleteConfirmation; confirm calls deleteUser + toasts success + refetches", async () => {
    postApiRef.getUserDetails.mockResolvedValue(usersPayloadFactory());
    deleteApiRef.deleteUser.mockResolvedValue({
      data: { statusCode: 200, body: { message: "User deleted" } },
    });
    render(<UserDetails />);
    await waitFor(() =>
      expect(screen.getByTestId("perm-table-row-count").textContent).toBe("3")
    );
    // row 0 (Alice) -> action delete button
    const deleteBtn = screen
      .getByTestId("row-0-cell-actions")
      .querySelector('button[aria-label="Delete"]');
    expect(deleteBtn).toBeTruthy();
    fireEvent.click(deleteBtn);
    expect(screen.getByTestId("delete-confirm")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("delete-confirm-confirm"));
    await waitFor(() =>
      expect(deleteApiRef.deleteUser).toHaveBeenCalledWith("u1")
    );
    await waitFor(() =>
      expect(toastRef.success).toHaveBeenCalledWith("User deleted")
    );
    // refetch (initial + after delete)
    await waitFor(() =>
      expect(postApiRef.getUserDetails).toHaveBeenCalledTimes(2)
    );
  });

  it("delete failure surfaces error toast", async () => {
    postApiRef.getUserDetails.mockResolvedValue(usersPayloadFactory());
    deleteApiRef.deleteUser.mockRejectedValue({
      response: { data: { body: { message: "Cannot" } } },
    });
    render(<UserDetails />);
    await waitFor(() =>
      expect(screen.getByTestId("perm-table-row-count").textContent).toBe("3")
    );
    const deleteBtn = screen
      .getByTestId("row-0-cell-actions")
      .querySelector('button[aria-label="Delete"]');
    fireEvent.click(deleteBtn);
    fireEvent.click(screen.getByTestId("delete-confirm-confirm"));
    await waitFor(() =>
      expect(toastRef.error).toHaveBeenCalledWith("Cannot")
    );
  });

  it("delete cancel closes the confirmation without calling the API", async () => {
    postApiRef.getUserDetails.mockResolvedValue(usersPayloadFactory());
    render(<UserDetails />);
    await waitFor(() =>
      expect(screen.getByTestId("perm-table-row-count").textContent).toBe("3")
    );
    const deleteBtn = screen
      .getByTestId("row-0-cell-actions")
      .querySelector('button[aria-label="Delete"]');
    fireEvent.click(deleteBtn);
    fireEvent.click(screen.getByTestId("delete-confirm-cancel"));
    expect(screen.queryByTestId("delete-confirm")).not.toBeInTheDocument();
    expect(deleteApiRef.deleteUser).not.toHaveBeenCalled();
  });

  it("current-user row hides Delete + Edit buttons + disables select checkbox", async () => {
    postApiRef.getUserDetails.mockResolvedValue(usersPayloadFactory());
    render(<UserDetails />);
    await waitFor(() =>
      expect(screen.getByTestId("perm-table-row-count").textContent).toBe("3")
    );
    // row-2 is "Me" with matching email
    const meDelete = screen
      .getByTestId("row-2-cell-actions")
      .querySelector('button[aria-label="Delete"]');
    expect(meDelete).toBeNull();
    const meEdit = screen
      .getByTestId("row-2-cell-actions")
      .querySelector('button[aria-label="Edit"]');
    expect(meEdit).toBeNull();
    // select checkbox disabled
    const meSelect = screen
      .getByTestId("row-2-cell-select")
      .querySelector('input[type="checkbox"]');
    expect(meSelect.disabled).toBe(true);
  });

  it("select-row checkbox adds id to selectedRoles + floating bulk-delete bar appears", async () => {
    postApiRef.getUserDetails.mockResolvedValue(usersPayloadFactory());
    render(<UserDetails />);
    await waitFor(() =>
      expect(screen.getByTestId("perm-table-row-count").textContent).toBe("3")
    );
    const selectBox = screen
      .getByTestId("row-0-cell-select")
      .querySelector('input[type="checkbox"]');
    fireEvent.click(selectBox);
    expect(screen.getByText(/1 user selected/i)).toBeInTheDocument();
    // toggle off
    fireEvent.click(selectBox);
    expect(screen.queryByText(/user selected/i)).not.toBeInTheDocument();
  });

  it("bulk delete: floating Delete button calls deleteBulkUser + clears selection on success", async () => {
    postApiRef.getUserDetails.mockResolvedValue(usersPayloadFactory());
    deleteApiRef.deleteBulkUser.mockResolvedValue({
      data: { statusCode: 200, body: { message: "Bulk gone" } },
    });
    render(<UserDetails />);
    await waitFor(() =>
      expect(screen.getByTestId("perm-table-row-count").textContent).toBe("3")
    );
    // select two rows (skip the current-user one)
    fireEvent.click(
      screen
        .getByTestId("row-0-cell-select")
        .querySelector('input[type="checkbox"]')
    );
    fireEvent.click(
      screen
        .getByTestId("row-1-cell-select")
        .querySelector('input[type="checkbox"]')
    );
    expect(screen.getByText(/2 users selected/i)).toBeInTheDocument();
    // click bulk delete trigger
    const bulkDeleteBtn = screen.getByText("Delete").closest("button");
    fireEvent.click(bulkDeleteBtn);
    await waitFor(() =>
      expect(deleteApiRef.deleteBulkUser).toHaveBeenCalledWith(["u1", "u2"])
    );
    await waitFor(() =>
      expect(toastRef.success).toHaveBeenCalledWith("Bulk gone")
    );
  });

  it("'Clear selection' button (×) resets selectedRoles", async () => {
    postApiRef.getUserDetails.mockResolvedValue(usersPayloadFactory());
    render(<UserDetails />);
    await waitFor(() =>
      expect(screen.getByTestId("perm-table-row-count").textContent).toBe("3")
    );
    fireEvent.click(
      screen
        .getByTestId("row-0-cell-select")
        .querySelector('input[type="checkbox"]')
    );
    expect(screen.getByText(/1 user selected/i)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Clear selection/i));
    expect(screen.queryByText(/user selected/i)).not.toBeInTheDocument();
  });

  it("select-all header checkbox: selects ALL except current-user; un-check clears those ids", async () => {
    postApiRef.getUserDetails.mockResolvedValue(usersPayloadFactory());
    render(<UserDetails />);
    await waitFor(() =>
      expect(screen.getByTestId("perm-table-row-count").textContent).toBe("3")
    );
    // The 'select' column header is at col-header-select
    const headerCheckbox = screen
      .getByTestId("col-header-select")
      .querySelector('input[type="checkbox"]');
    fireEvent.click(headerCheckbox);
    expect(screen.getByText(/2 users selected/i)).toBeInTheDocument(); // u1+u2, not the current-user u3
    // uncheck
    fireEvent.click(headerCheckbox);
    expect(screen.queryByText(/user selected/i)).not.toBeInTheDocument();
  });

  it("canCreate=false hides the header Add New User CTA", async () => {
    permissionsRef.value = {
      permissions: {
        Users: { view: true, create: false, edit: true, delete: true },
      },
      loading: false,
    };
    postApiRef.getUserDetails.mockResolvedValue(usersPayloadFactory());
    render(<UserDetails />);
    await waitFor(() =>
      expect(screen.getByTestId("perm-table-row-count").textContent).toBe("3")
    );
    expect(
      screen.queryByTestId("new-permission-create")
    ).not.toBeInTheDocument();
  });

  it("canEdit=false + canDelete=false suppresses the entire actions column", async () => {
    permissionsRef.value = {
      permissions: {
        Users: { view: true, create: true, edit: false, delete: false },
      },
      loading: false,
    };
    postApiRef.getUserDetails.mockResolvedValue(usersPayloadFactory());
    render(<UserDetails />);
    await waitFor(() =>
      expect(screen.getByTestId("perm-table-row-count").textContent).toBe("3")
    );
    expect(
      screen.queryByTestId("row-0-cell-actions")
    ).not.toBeInTheDocument();
  });

  it("fetches with empty users array when API returns no body data", async () => {
    postApiRef.getUserDetails.mockResolvedValue({ data: { body: {} } });
    render(<UserDetails />);
    await waitFor(() =>
      expect(postApiRef.getUserDetails).toHaveBeenCalled()
    );
    expect(screen.getByTestId("perm-table-row-count").textContent).toBe("0");
    expect(screen.getByTestId("pagination-total").textContent).toBe("1");
  });

  it("counts users when payload provides them as a top-level array (no users key)", async () => {
    postApiRef.getUserDetails.mockResolvedValue({
      data: {
        body: {
          data: [
            { _id: "x1", userName: "X1", email: "x1@x.com" },
            { _id: "x2", userName: "X2", email: "x2@x.com" },
          ],
        },
      },
    });
    render(<UserDetails />);
    await waitFor(() =>
      expect(screen.getByTestId("perm-table-row-count").textContent).toBe("2")
    );
  });
});
