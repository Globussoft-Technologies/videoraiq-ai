/**
 * src/page/user/Departments/Departments.jsx — paginated departments page.
 * Pulls departments from `fetchDepartments(skip, limit, search)`, paginates
 * (limit=8), exposes a header Search input (debounces back to page 1 after
 * 500ms), a DepartmentForm in create mode behind canCreate, a TanStack
 * PermissionTable with per-row Edit (DepartmentForm mode='edit') and Delete
 * (opens DeleteConfirmation) actions, and a Pagination footer. Permission
 * gating (permissions.departments.{view,edit,delete,create}) controls all
 * branches. permissionsLoading renders PageLoader; !canView renders
 * AccessDenied.
 *
 * Mocks (8):
 *   1. ./Api                        - fetchDepartments + deleteDepartment stubs.
 *   2. ./DepartmentForm             - passthrough that surfaces mode + a
 *                                     visible trigger so we can assert which
 *                                     mode renders per row + once for header.
 *   3. ../Detection/components/DeleteConfirmation
 *                                   - render confirm/cancel buttons when
 *                                     open so we can drive the delete flow.
 *   4. @/components/Pagination      - emit current/total + a "Go to 2" btn.
 *   5. ../RolePermissions/PermissionTable
 *                                   - flatten {data, columns} into a list of
 *                                     rendered rows so we can read each cell.
 *   6. @/context/Permission/PermissionContext - usePermissions stub.
 *   7. @/components/AccessDenied / @/components/PageLoader - inline markers.
 *   8. sonner                       - capture toast.success/error.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const apiRef = vi.hoisted(() => ({
  fetchDepartments: vi.fn(),
  deleteDepartment: vi.fn(),
}));
vi.mock("../../../../../src/page/user/Departments/Api", () => apiRef);

vi.mock(
  "../../../../../src/page/user/Departments/DepartmentForm",
  () => ({
    default: ({ mode, trigger, initialValues, onSave }) => (
      <div
        data-testid={`dept-form-${mode || "create"}`}
        data-initial-name={initialValues?.departmentName || ""}
      >
        <button
          data-testid={`dept-form-save-${mode || "create"}`}
          onClick={onSave}
        >
          fake-save
        </button>
        {trigger}
      </div>
    ),
  })
);

vi.mock(
  "../../../../../src/page/user/Detection/components/DeleteConfirmation",
  () => ({
    default: ({ open, onClose, onConfirm, message, confirmLabel }) =>
      open ? (
        <div data-testid="delete-confirm">
          <div data-testid="delete-confirm-message">{message}</div>
          <button data-testid="delete-confirm-confirm" onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button data-testid="delete-confirm-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      ) : null,
  })
);

vi.mock("../../../../../src/components/Pagination", () => ({
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
    </div>
  ),
}));

vi.mock(
  "../../../../../src/page/user/RolePermissions/PermissionTable",
  () => ({
    default: ({ data, columns, loading }) => (
      <div data-testid="perm-table" data-loading={String(!!loading)}>
        {data.map((row, idx) => (
          <div key={idx} data-testid={`row-${idx}`}>
            {columns.map((col, cIdx) => (
              <div key={cIdx} data-testid={`row-${idx}-cell-${col.accessorKey}`}>
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

const permissionsRef = vi.hoisted(() => ({ value: null }));
vi.mock("@/context/Permission/PermissionContext", () => ({
  usePermissions: () => permissionsRef.value,
}));

vi.mock("@/components/AccessDenied", () => ({
  default: () => <div data-testid="access-denied">Access Denied</div>,
}));
vi.mock("@/components/PageLoader", () => ({
  default: () => <div data-testid="page-loader">Loading</div>,
}));

const toastRef = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: toastRef }));

const { default: Departments } = await import(
  "../../../../../src/page/user/Departments/Departments.jsx"
);

const fullPerms = {
  departments: { view: true, edit: true, delete: true, create: true },
};

beforeEach(() => {
  apiRef.fetchDepartments.mockReset();
  apiRef.deleteDepartment.mockReset();
  toastRef.success.mockReset();
  toastRef.error.mockReset();
  permissionsRef.value = { permissions: fullPerms, loading: false };
});

describe("Departments page", () => {
  it("renders PageLoader while permissions are loading", () => {
    permissionsRef.value = { permissions: null, loading: true };
    render(<Departments />);
    expect(screen.getByTestId("page-loader")).toBeInTheDocument();
    expect(screen.queryByTestId("perm-table")).not.toBeInTheDocument();
  });

  it("renders AccessDenied when canView is false", () => {
    permissionsRef.value = {
      permissions: { departments: { view: false } },
      loading: false,
    };
    render(<Departments />);
    expect(screen.getByTestId("access-denied")).toBeInTheDocument();
    expect(screen.queryByTestId("perm-table")).not.toBeInTheDocument();
  });

  it("loads departments on mount and renders rows + create CTA", async () => {
    apiRef.fetchDepartments.mockResolvedValue({
      data: {
        statusCode: 200,
        body: {
          data: {
            data: [
              { _id: "d1", departmentName: "Engineering", description: "Eng" },
              { _id: "d2", departmentName: "Finance", description: "" },
            ],
            totalCount: 18,
          },
        },
      },
    });
    render(<Departments />);
    await waitFor(() =>
      expect(apiRef.fetchDepartments).toHaveBeenCalledWith(0, 8, "")
    );
    // header create form is rendered (canCreate=true)
    expect(screen.getAllByTestId("dept-form-create").length).toBeGreaterThan(0);
    // two rows
    expect(screen.getByTestId("row-0")).toBeInTheDocument();
    expect(screen.getByTestId("row-1")).toBeInTheDocument();
    expect(screen.getByText("Engineering")).toBeInTheDocument();
    expect(screen.getByText("Finance")).toBeInTheDocument();
    // missing description falls back to "-"
    expect(screen.getByText("-")).toBeInTheDocument();
    // pagination totals: ceil(18/8) = 3
    expect(screen.getByTestId("pagination-total").textContent).toBe("3");
    expect(screen.getByTestId("pagination-current").textContent).toBe("1");
  });

  it("on fetch failure, toasts a generic error and renders zero rows", async () => {
    apiRef.fetchDepartments.mockRejectedValue(new Error("boom"));
    // silence the console.error from the catch
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Departments />);
    await waitFor(() =>
      expect(toastRef.error).toHaveBeenCalledWith("Failed to fetch departments")
    );
    expect(screen.queryByTestId("row-0")).not.toBeInTheDocument();
    // pagination totals: max(1, ceil(0/8)) = 1
    expect(screen.getByTestId("pagination-total").textContent).toBe("1");
    errSpy.mockRestore();
  });

  it("delete flow: opening confirm does not call API; confirm calls deleteDepartment, toasts success, refetches", async () => {
    apiRef.fetchDepartments.mockResolvedValue({
      data: {
        statusCode: 200,
        body: {
          data: {
            data: [
              { _id: "d1", departmentName: "Engineering", description: "Eng" },
            ],
            totalCount: 1,
          },
        },
      },
    });
    apiRef.deleteDepartment.mockResolvedValue({
      data: { statusCode: 200, body: { message: "Gone" } },
    });
    const { container } = render(<Departments />);
    await waitFor(() =>
      expect(screen.getByText("Engineering")).toBeInTheDocument()
    );
    // delete confirm is not open initially
    expect(screen.queryByTestId("delete-confirm")).not.toBeInTheDocument();
    // find the trash button in the actions column (last button with the trash icon — match by lucide class isn't trivial, so we click the second action button in row 0). The Edit fake button has data-testid 'dept-form-edit', so the only other button in the action cell is the delete trigger.
    const actionCell = screen.getByTestId("row-0-cell-actions");
    // The cell has the edit DepartmentForm (which renders the trigger inside) plus the delete button.
    const buttons = actionCell.querySelectorAll("button");
    // The DepartmentForm mock renders 1 fake-save button + the trigger <button> from props. So 3 buttons total: fake-save, trigger (FiEdit3), delete. The DELETE button is the last raw <button> outside the DepartmentForm mock wrapper.
    const deleteBtn = buttons[buttons.length - 1];
    fireEvent.click(deleteBtn);
    expect(screen.getByTestId("delete-confirm")).toBeInTheDocument();
    expect(screen.getByTestId("delete-confirm-message").textContent).toContain(
      "Engineering"
    );
    expect(apiRef.deleteDepartment).not.toHaveBeenCalled();
    // confirm
    fireEvent.click(screen.getByTestId("delete-confirm-confirm"));
    await waitFor(() =>
      expect(apiRef.deleteDepartment).toHaveBeenCalledWith("d1")
    );
    expect(toastRef.success).toHaveBeenCalledWith("Gone");
    // refetches after a successful delete -> two calls now
    await waitFor(() =>
      expect(apiRef.fetchDepartments).toHaveBeenCalledTimes(2)
    );
    // confirmation closed
    expect(screen.queryByTestId("delete-confirm")).not.toBeInTheDocument();
  });

  it("delete failure toasts the server message", async () => {
    apiRef.fetchDepartments.mockResolvedValue({
      data: {
        statusCode: 200,
        body: {
          data: {
            data: [{ _id: "d1", departmentName: "X", description: "" }],
            totalCount: 1,
          },
        },
      },
    });
    apiRef.deleteDepartment.mockRejectedValue({
      response: { data: { body: { message: "Cannot delete" } } },
    });
    render(<Departments />);
    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    const actionCell = screen.getByTestId("row-0-cell-actions");
    const buttons = actionCell.querySelectorAll("button");
    fireEvent.click(buttons[buttons.length - 1]);
    fireEvent.click(screen.getByTestId("delete-confirm-confirm"));
    await waitFor(() =>
      expect(toastRef.error).toHaveBeenCalledWith("Cannot delete")
    );
    expect(toastRef.success).not.toHaveBeenCalled();
  });

  it("hides the header create CTA when canCreate is false", async () => {
    permissionsRef.value = {
      permissions: {
        departments: {
          view: true,
          edit: true,
          delete: true,
          create: false,
        },
      },
      loading: false,
    };
    apiRef.fetchDepartments.mockResolvedValue({
      data: {
        statusCode: 200,
        body: {
          data: {
            data: [{ _id: "d1", departmentName: "Y", description: "" }],
            totalCount: 1,
          },
        },
      },
    });
    render(<Departments />);
    await waitFor(() => expect(screen.getByText("Y")).toBeInTheDocument());
    // There's still an edit DepartmentForm rendered per row (canEdit=true),
    // but no create-mode DepartmentForm in the header.
    expect(screen.queryByTestId("dept-form-create")).not.toBeInTheDocument();
    // and the edit one is present once
    expect(screen.getAllByTestId("dept-form-edit").length).toBe(1);
  });

  it("typing in the search input triggers a reload that sends the new term", async () => {
    apiRef.fetchDepartments.mockResolvedValue({
      data: {
        statusCode: 200,
        body: { data: { data: [], totalCount: 0 } },
      },
    });
    render(<Departments />);
    // initial load with empty search
    await waitFor(() =>
      expect(apiRef.fetchDepartments).toHaveBeenCalledWith(0, 8, "")
    );
    const search = screen.getByPlaceholderText(/Search department/i);
    fireEvent.change(search, { target: { value: "hr" } });
    // loadDepartments is a useCallback that depends on searchInput; when
    // searchInput changes the callback identity changes, which triggers the
    // [currentPage, sortOrder, loadDepartments] effect to re-fetch with the
    // new search term.
    await waitFor(() =>
      expect(apiRef.fetchDepartments).toHaveBeenLastCalledWith(0, 8, "hr")
    );
  });
});
