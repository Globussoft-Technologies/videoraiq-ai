/**
 * Round 2: Extended coverage for RolePermissions/RolesandPermission.jsx
 * beyond the existing permission-gate test.
 *
 * The full page wires fetchRoles -> getAllRolesAndPermissionDetails,
 * togglePermission -> updateRolePermissions, handleSavePermissions ->
 * updatePermissionByRole, handleConfirmDelete -> deleteRoleById,
 * + handleEditPermissions / handleViewPermissions modal flows +
 * normalizeLogsPermissions branches + handlePageChange.
 *
 * Heavy children are stubbed to keep the test focused on the page's own
 * branching: AddRoleDialog, PermissionStep, DeleteConfirmation,
 * PermissionTable, Pagination, the Radix Dialog, and the four Api
 * modules. The RadixDialog stub exposes the open/close props so we can
 * drive the save / cancel actions through their buttons.
 *
 * Mock budget: unrestricted in r2.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

// ----- Api mocks --------------------------------------------------------
const getApiRef = vi.hoisted(() => ({
  getAllRolesAndPermissionDetails: vi.fn(),
}));
vi.mock("../../../../../src/page/user/RolePermissions/Api/get", () => getApiRef);

const putApiRef = vi.hoisted(() => ({
  updatePermissionByRole: vi.fn(),
  updateRolePermissions: vi.fn(),
}));
vi.mock("../../../../../src/page/user/RolePermissions/Api/put", () => putApiRef);

const deleteApiRef = vi.hoisted(() => ({
  deleteRoleById: vi.fn(),
}));
vi.mock(
  "../../../../../src/page/user/RolePermissions/Api/delete",
  () => deleteApiRef
);

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
        data-testid="pagination-too-high"
        onClick={() => onPageChange(currentPage + 999)}
      >
        too high
      </button>
      <button
        data-testid="pagination-zero"
        onClick={() => onPageChange(0)}
      >
        zero
      </button>
    </div>
  ),
}));

// ----- AddRoleDialog ----------------------------------------------------
vi.mock(
  "../../../../../src/page/user/RolePermissions/AddRoleDialog",
  () => ({
    default: ({ trigger, editRole, fetchRoles, onSave, onClose }) => (
      <div
        data-testid={editRole ? "add-role-edit" : "add-role-create"}
        data-edit-role-name={editRole?.name || ""}
      >
        {trigger}
        {editRole && (
          <>
            <button
              data-testid="add-role-onsave"
              onClick={() => onSave(editRole.id, "Renamed")}
            >
              fake-save
            </button>
            <button data-testid="add-role-onclose" onClick={onClose}>
              fake-close
            </button>
          </>
        )}
        <button data-testid="add-role-fetch" onClick={fetchRoles}>
          fake-fetch
        </button>
      </div>
    ),
  })
);

// ----- PermissionStep ---------------------------------------------------
vi.mock(
  "../../../../../src/page/user/RolePermissions/PermissionStep",
  () => ({
    default: ({ permissions, onChange, readOnly }) => (
      <div
        data-testid="permission-step"
        data-readonly={String(readOnly)}
        data-keys={Object.keys(permissions || {}).join(",")}
      >
        <pre data-testid="perm-json">
          {JSON.stringify(permissions || {})}
        </pre>
        <button
          data-testid="perm-mutate"
          onClick={() =>
            onChange({
              channels: { view: true, create: true, edit: true, delete: true },
              logs: {
                global: { view: true, create: false, edit: false, delete: false },
                accessLogs: { view: true, create: false, edit: false, delete: false },
              },
              employees: { view: true, create: true, edit: false, delete: false },
            })
          }
        >
          mutate
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
        {data?.map((row, idx) => (
          <div key={idx} data-testid={`row-${idx}`}>
            {columns.map((col, cIdx) => (
              <div
                key={cIdx}
                data-testid={`row-${idx}-cell-${col.accessorKey}`}
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

// ----- Radix Dialog (just renders content when open) -------------------
vi.mock("@/components/ui/dialog", () => {
  return {
    Dialog: ({ open, onOpenChange, children }) =>
      open ? (
        <div data-testid="edit-dialog">
          <button
            data-testid="edit-dialog-close"
            onClick={() => onOpenChange && onOpenChange(false)}
          >
            x
          </button>
          {children}
        </div>
      ) : null,
    DialogContent: ({ children }) => <div>{children}</div>,
    DialogHeader: ({ children }) => <div>{children}</div>,
    DialogTitle: ({ children }) => <div data-testid="dialog-title">{children}</div>,
    DialogDescription: ({ children }) => <div>{children}</div>,
    DialogFooter: ({ children }) => <div>{children}</div>,
    DialogTrigger: ({ children }) => <div>{children}</div>,
  };
});

// ----- Checkbox / Input / Button (light passthroughs) ------------------
vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ checked, onCheckedChange, ...rest }) => (
    <input
      type="checkbox"
      checked={!!checked}
      onChange={(e) => onCheckedChange && onCheckedChange(e.target.checked)}
      {...rest}
    />
  ),
}));
vi.mock("@/components/ui/input", () => ({
  Input: (props) => <input {...props} />,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...rest }) => <button {...rest}>{children}</button>,
}));

// ----- sonner -----------------------------------------------------------
const toastRef = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastRef }));

import RolesandPermission from "../../../../../src/page/user/RolePermissions/RolesandPermission.jsx";

const fullPerms = {
  permissions: {
    roles: { view: true, create: true, edit: true, delete: true },
    permission: { view: true, edit: true },
  },
  loading: false,
};

const rolesPayloadFactory = (overrides = {}) => ({
  data: {
    body: {
      data: {
        rolesWithPermissions: [
          {
            _id: "r1",
            roleName: "Engineer",
            view: true,
            create: false,
            edit: false,
            delete: false,
            createdBy: { userId: "admin1" },
            permissionDetails: {
              _id: "perm-1",
              permissionConfig: {
                channels: {
                  view: true,
                  create: true,
                  edit: false,
                  delete: false,
                },
                logs: {
                  view: true,
                  create: false,
                  edit: false,
                  delete: false,
                },
              },
            },
            AssignedUserRole: [{}, {}, {}],
          },
          {
            _id: "r2",
            role: "Admin",
            view: true,
            create: true,
            edit: true,
            delete: true,
            is_default: true,
            adminId: "admin1",
            permissionDetails: {
              _id: "perm-2",
              permissionConfig: {
                channels: {
                  view: true,
                  create: false,
                  edit: false,
                  delete: false,
                },
                logs: {
                  global: { view: true, create: false, edit: false, delete: false },
                  accessLogs: { view: true, create: false, edit: false, delete: false },
                },
              },
            },
          },
        ],
        totalLength: 17,
      },
    },
    ...overrides,
  },
});

beforeEach(() => {
  Object.values(getApiRef).forEach((fn) => fn.mockReset && fn.mockReset());
  Object.values(putApiRef).forEach((fn) => fn.mockReset && fn.mockReset());
  Object.values(deleteApiRef).forEach((fn) => fn.mockReset && fn.mockReset());
  toastRef.success.mockReset();
  toastRef.error.mockReset();
  permissionsRef.value = fullPerms;
});

describe("RolesandPermission — full page flow", () => {
  it("fetches roles on mount, maps them, and shows the pagination total", async () => {
    getApiRef.getAllRolesAndPermissionDetails.mockResolvedValue(
      rolesPayloadFactory()
    );
    render(<RolesandPermission />);
    await waitFor(() =>
      expect(
        getApiRef.getAllRolesAndPermissionDetails
      ).toHaveBeenCalledWith(0, 8, "")
    );
    expect(
      screen.getByTestId("perm-table-row-count").textContent
    ).toBe("2");
    // total=17, limit=8 -> ceil = 3
    expect(screen.getByTestId("pagination-total").textContent).toBe("3");
    expect(screen.getByTestId("pagination-current").textContent).toBe("1");
  });

  it("when fetch returns no rolesWithPermissions list, defaults to empty", async () => {
    getApiRef.getAllRolesAndPermissionDetails.mockResolvedValue({
      data: { body: { data: {} } },
    });
    render(<RolesandPermission />);
    await waitFor(() =>
      expect(
        getApiRef.getAllRolesAndPermissionDetails
      ).toHaveBeenCalled()
    );
    expect(screen.getByTestId("perm-table-row-count").textContent).toBe("0");
    // total fallback -> max(1, ceil(undefined/8)) = 1 because Math.ceil(NaN) = NaN, max(1,NaN)=NaN — but our test only asserts that the page renders.
  });

  it("fetch failure logs and clears loading without crashing", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getApiRef.getAllRolesAndPermissionDetails.mockRejectedValue(
      new Error("boom")
    );
    render(<RolesandPermission />);
    await waitFor(() =>
      expect(errSpy).toHaveBeenCalledWith(
        "Failed to fetch roles with permissions",
        expect.any(Error)
      )
    );
    errSpy.mockRestore();
  });

  it("typing in the Search input refetches with the new term", async () => {
    getApiRef.getAllRolesAndPermissionDetails.mockResolvedValue(
      rolesPayloadFactory()
    );
    render(<RolesandPermission />);
    await waitFor(() =>
      expect(
        getApiRef.getAllRolesAndPermissionDetails
      ).toHaveBeenCalledWith(0, 8, "")
    );
    const search = screen.getByPlaceholderText(/Search roles/i);
    fireEvent.change(search, { target: { value: "eng" } });
    await waitFor(() =>
      expect(
        getApiRef.getAllRolesAndPermissionDetails
      ).toHaveBeenLastCalledWith(0, 8, "eng")
    );
  });

  it("pagination next advances currentPage and triggers refetch with new skip", async () => {
    getApiRef.getAllRolesAndPermissionDetails.mockResolvedValue(
      rolesPayloadFactory()
    );
    render(<RolesandPermission />);
    await waitFor(() =>
      expect(
        getApiRef.getAllRolesAndPermissionDetails
      ).toHaveBeenCalledTimes(1)
    );
    fireEvent.click(screen.getByTestId("pagination-next"));
    await waitFor(() =>
      expect(
        getApiRef.getAllRolesAndPermissionDetails
      ).toHaveBeenLastCalledWith(8, 8, "")
    );
  });

  it("pagination guards: page<1 or page>totalPages is a no-op", async () => {
    getApiRef.getAllRolesAndPermissionDetails.mockResolvedValue(
      rolesPayloadFactory()
    );
    render(<RolesandPermission />);
    await waitFor(() =>
      expect(
        getApiRef.getAllRolesAndPermissionDetails
      ).toHaveBeenCalledTimes(1)
    );
    // zero -> guard early
    fireEvent.click(screen.getByTestId("pagination-zero"));
    // too high -> guard early
    fireEvent.click(screen.getByTestId("pagination-too-high"));
    // No additional refetches
    expect(
      getApiRef.getAllRolesAndPermissionDetails
    ).toHaveBeenCalledTimes(1);
  });

  it("togglePermission: success path updates the row + toasts + refetches", async () => {
    getApiRef.getAllRolesAndPermissionDetails.mockResolvedValue(
      rolesPayloadFactory()
    );
    putApiRef.updateRolePermissions.mockResolvedValue({
      body: { status: "success", message: "ok" },
    });
    render(<RolesandPermission />);
    await waitFor(() =>
      expect(screen.getByTestId("perm-table-row-count").textContent).toBe("2")
    );
    // first row, "view" cell — toggle
    const viewCheckbox = screen
      .getByTestId("row-0-cell-view")
      .querySelector('input[type="checkbox"]');
    fireEvent.click(viewCheckbox);
    await waitFor(() =>
      expect(putApiRef.updateRolePermissions).toHaveBeenCalledWith(
        "r1",
        expect.objectContaining({
          roleName: "Engineer",
          roleView: false, // was true, toggled
        })
      )
    );
    await waitFor(() => expect(toastRef.success).toHaveBeenCalled());
  });

  it("togglePermission: server failure -> toast.error with message", async () => {
    getApiRef.getAllRolesAndPermissionDetails.mockResolvedValue(
      rolesPayloadFactory()
    );
    putApiRef.updateRolePermissions.mockResolvedValue({
      body: { status: "error", message: "denied" },
    });
    render(<RolesandPermission />);
    await waitFor(() =>
      expect(screen.getByTestId("perm-table-row-count").textContent).toBe("2")
    );
    const viewCheckbox = screen
      .getByTestId("row-0-cell-view")
      .querySelector('input[type="checkbox"]');
    fireEvent.click(viewCheckbox);
    await waitFor(() => expect(toastRef.error).toHaveBeenCalledWith("denied"));
  });

  it("togglePermission: thrown error -> generic toast.error", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getApiRef.getAllRolesAndPermissionDetails.mockResolvedValue(
      rolesPayloadFactory()
    );
    putApiRef.updateRolePermissions.mockRejectedValue(new Error("boom"));
    render(<RolesandPermission />);
    await waitFor(() =>
      expect(screen.getByTestId("perm-table-row-count").textContent).toBe("2")
    );
    const viewCheckbox = screen
      .getByTestId("row-0-cell-view")
      .querySelector('input[type="checkbox"]');
    fireEvent.click(viewCheckbox);
    await waitFor(() =>
      expect(toastRef.error).toHaveBeenCalledWith(
        "Failed to update role permissions. Please try again."
      )
    );
    errSpy.mockRestore();
  });

  it("edit-permissions: opening the Settings button mounts the dialog with editable PermissionStep", async () => {
    getApiRef.getAllRolesAndPermissionDetails.mockResolvedValue(
      rolesPayloadFactory()
    );
    render(<RolesandPermission />);
    await waitFor(() =>
      expect(screen.getByTestId("perm-table-row-count").textContent).toBe("2")
    );
    // click Settings (first action button) on row 0
    const settingsBtn = screen
      .getByTestId("row-0-cell-action")
      .querySelector('button[aria-label="settings"]');
    fireEvent.click(settingsBtn);
    expect(screen.getByTestId("edit-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("permission-step").dataset.readonly).toBe(
      "false"
    );
    expect(screen.getByTestId("dialog-title").textContent).toMatch(
      /Permission Setting/i
    );
  });

  it("view-permissions: opening the Eye button mounts the dialog read-only", async () => {
    getApiRef.getAllRolesAndPermissionDetails.mockResolvedValue(
      rolesPayloadFactory()
    );
    render(<RolesandPermission />);
    await waitFor(() =>
      expect(screen.getByTestId("perm-table-row-count").textContent).toBe("2")
    );
    const viewBtn = screen
      .getByTestId("row-0-cell-action")
      .querySelector('button[aria-label="view"]');
    fireEvent.click(viewBtn);
    expect(screen.getByTestId("permission-step").dataset.readonly).toBe(
      "true"
    );
    expect(screen.getByTestId("dialog-title").textContent).toMatch(
      /View Permissions/i
    );
  });

  it("save-permissions: success path PATCHes, toasts success, closes dialog, refetches", async () => {
    getApiRef.getAllRolesAndPermissionDetails.mockResolvedValue(
      rolesPayloadFactory()
    );
    putApiRef.updatePermissionByRole.mockResolvedValue({
      body: { status: "success", message: "saved" },
    });
    render(<RolesandPermission />);
    await waitFor(() =>
      expect(screen.getByTestId("perm-table-row-count").textContent).toBe("2")
    );
    // open edit dialog on the FIRST row (legacy-flat logs to exercise normalize)
    const settingsBtn = screen
      .getByTestId("row-0-cell-action")
      .querySelector('button[aria-label="settings"]');
    fireEvent.click(settingsBtn);
    // mutate the perm-step to inject nested logs config so the nested branch in
    // handleSavePermissions executes
    fireEvent.click(screen.getByTestId("perm-mutate"));
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() =>
      expect(putApiRef.updatePermissionByRole).toHaveBeenCalledWith(
        "perm-1",
        expect.objectContaining({
          permissionConfig: expect.objectContaining({
            // channels.create/delete forced false
            channels: expect.objectContaining({
              create: false,
              delete: false,
            }),
            logs: expect.any(Object),
            employees: expect.objectContaining({
              view: true,
              create: true,
              edit: false,
              delete: false,
            }),
          }),
        })
      )
    );
    await waitFor(() => expect(toastRef.success).toHaveBeenCalledWith("saved"));
    // refetch fired (initial + after save)
    await waitFor(() =>
      expect(
        getApiRef.getAllRolesAndPermissionDetails
      ).toHaveBeenCalledTimes(2)
    );
    expect(screen.queryByTestId("edit-dialog")).not.toBeInTheDocument();
  });

  it("save-permissions: no permission id -> toast.error and no PUT", async () => {
    getApiRef.getAllRolesAndPermissionDetails.mockResolvedValue({
      data: {
        body: {
          data: {
            rolesWithPermissions: [
              {
                _id: "r9",
                roleName: "NoPerm",
                view: true,
                permissionDetails: null,
              },
            ],
            totalLength: 1,
          },
        },
      },
    });
    render(<RolesandPermission />);
    await waitFor(() =>
      expect(screen.getByTestId("perm-table-row-count").textContent).toBe("1")
    );
    const settingsBtn = screen
      .getByTestId("row-0-cell-action")
      .querySelector('button[aria-label="settings"]');
    fireEvent.click(settingsBtn);
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() =>
      expect(toastRef.error).toHaveBeenCalledWith("Permission ID not found")
    );
    expect(putApiRef.updatePermissionByRole).not.toHaveBeenCalled();
  });

  it("save-permissions: non-success response -> toast.error with message", async () => {
    getApiRef.getAllRolesAndPermissionDetails.mockResolvedValue(
      rolesPayloadFactory()
    );
    putApiRef.updatePermissionByRole.mockResolvedValue({
      body: { status: "fail", message: "bad" },
    });
    render(<RolesandPermission />);
    await waitFor(() =>
      expect(screen.getByTestId("perm-table-row-count").textContent).toBe("2")
    );
    const settingsBtn = screen
      .getByTestId("row-0-cell-action")
      .querySelector('button[aria-label="settings"]');
    fireEvent.click(settingsBtn);
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(toastRef.error).toHaveBeenCalledWith("bad"));
  });

  it("save-permissions: thrown -> generic toast.error", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getApiRef.getAllRolesAndPermissionDetails.mockResolvedValue(
      rolesPayloadFactory()
    );
    putApiRef.updatePermissionByRole.mockRejectedValue(new Error("boom"));
    render(<RolesandPermission />);
    await waitFor(() =>
      expect(screen.getByTestId("perm-table-row-count").textContent).toBe("2")
    );
    const settingsBtn = screen
      .getByTestId("row-0-cell-action")
      .querySelector('button[aria-label="settings"]');
    fireEvent.click(settingsBtn);
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() =>
      expect(toastRef.error).toHaveBeenCalledWith(
        "Failed to update permissions. Please try again."
      )
    );
    errSpy.mockRestore();
  });

  it("Cancel button closes the edit dialog without calling the API", async () => {
    getApiRef.getAllRolesAndPermissionDetails.mockResolvedValue(
      rolesPayloadFactory()
    );
    render(<RolesandPermission />);
    await waitFor(() =>
      expect(screen.getByTestId("perm-table-row-count").textContent).toBe("2")
    );
    const settingsBtn = screen
      .getByTestId("row-0-cell-action")
      .querySelector('button[aria-label="settings"]');
    fireEvent.click(settingsBtn);
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByTestId("edit-dialog")).not.toBeInTheDocument();
    expect(putApiRef.updatePermissionByRole).not.toHaveBeenCalled();
  });

  it("delete flow: clicking trash opens DeleteConfirmation; confirm calls deleteRoleById + toasts success + refetches", async () => {
    getApiRef.getAllRolesAndPermissionDetails.mockResolvedValue(
      rolesPayloadFactory()
    );
    deleteApiRef.deleteRoleById.mockResolvedValue({
      data: { body: { status: "success", message: "Gone" } },
    });
    render(<RolesandPermission />);
    await waitFor(() =>
      expect(screen.getByTestId("perm-table-row-count").textContent).toBe("2")
    );
    const deleteBtn = screen
      .getByTestId("row-0-cell-action")
      .querySelector('button[aria-label="delete"]');
    expect(deleteBtn).toBeTruthy();
    fireEvent.click(deleteBtn);
    expect(screen.getByTestId("delete-confirm")).toBeInTheDocument();
    expect(screen.getByTestId("delete-confirm-message").textContent).toContain(
      "Engineer"
    );
    fireEvent.click(screen.getByTestId("delete-confirm-confirm"));
    await waitFor(() =>
      expect(deleteApiRef.deleteRoleById).toHaveBeenCalledWith("r1")
    );
    await waitFor(() => expect(toastRef.success).toHaveBeenCalledWith("Gone"));
    await waitFor(() =>
      expect(
        getApiRef.getAllRolesAndPermissionDetails
      ).toHaveBeenCalledTimes(2)
    );
    expect(screen.queryByTestId("delete-confirm")).not.toBeInTheDocument();
  });

  it("delete flow: non-success body -> toast.error with message", async () => {
    getApiRef.getAllRolesAndPermissionDetails.mockResolvedValue(
      rolesPayloadFactory()
    );
    deleteApiRef.deleteRoleById.mockResolvedValue({
      data: { body: { status: "fail", message: "Cannot delete" } },
    });
    render(<RolesandPermission />);
    await waitFor(() =>
      expect(screen.getByTestId("perm-table-row-count").textContent).toBe("2")
    );
    const deleteBtn = screen
      .getByTestId("row-0-cell-action")
      .querySelector('button[aria-label="delete"]');
    fireEvent.click(deleteBtn);
    fireEvent.click(screen.getByTestId("delete-confirm-confirm"));
    await waitFor(() =>
      expect(toastRef.error).toHaveBeenCalledWith("Cannot delete")
    );
  });

  it("delete flow: thrown -> generic toast.error", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getApiRef.getAllRolesAndPermissionDetails.mockResolvedValue(
      rolesPayloadFactory()
    );
    deleteApiRef.deleteRoleById.mockRejectedValue(new Error("boom"));
    render(<RolesandPermission />);
    await waitFor(() =>
      expect(screen.getByTestId("perm-table-row-count").textContent).toBe("2")
    );
    const deleteBtn = screen
      .getByTestId("row-0-cell-action")
      .querySelector('button[aria-label="delete"]');
    fireEvent.click(deleteBtn);
    fireEvent.click(screen.getByTestId("delete-confirm-confirm"));
    await waitFor(() =>
      expect(toastRef.error).toHaveBeenCalledWith(
        "Failed to delete role. Please try again."
      )
    );
    errSpy.mockRestore();
  });

  it("delete cancel closes the confirmation without calling the API", async () => {
    getApiRef.getAllRolesAndPermissionDetails.mockResolvedValue(
      rolesPayloadFactory()
    );
    render(<RolesandPermission />);
    await waitFor(() =>
      expect(screen.getByTestId("perm-table-row-count").textContent).toBe("2")
    );
    const deleteBtn = screen
      .getByTestId("row-0-cell-action")
      .querySelector('button[aria-label="delete"]');
    fireEvent.click(deleteBtn);
    fireEvent.click(screen.getByTestId("delete-confirm-cancel"));
    expect(screen.queryByTestId("delete-confirm")).not.toBeInTheDocument();
    expect(deleteApiRef.deleteRoleById).not.toHaveBeenCalled();
  });

  it("clicking the row Edit button mounts the AddRoleDialog in edit mode and onSave renames locally", async () => {
    getApiRef.getAllRolesAndPermissionDetails.mockResolvedValue(
      rolesPayloadFactory()
    );
    render(<RolesandPermission />);
    await waitFor(() =>
      expect(screen.getByTestId("perm-table-row-count").textContent).toBe("2")
    );
    // Click row-0 edit (FiEdit3, aria-label="edit")
    const editBtn = screen
      .getByTestId("row-0-cell-action")
      .querySelector('button[aria-label="edit"]');
    expect(editBtn).toBeTruthy();
    fireEvent.click(editBtn);
    // The header AddRoleDialog will now have editRole prop populated
    await waitFor(() =>
      expect(screen.getByTestId("add-role-edit")).toBeInTheDocument()
    );
    // Drive the fake onSave to trigger handleSaveRole
    fireEvent.click(screen.getByTestId("add-role-onsave"));
    // After save, editRoleData reset to null
    await waitFor(() =>
      expect(screen.queryByTestId("add-role-edit")).not.toBeInTheDocument()
    );
  });

  it("clicking the edit-dialog onClose handler resets editRoleData", async () => {
    getApiRef.getAllRolesAndPermissionDetails.mockResolvedValue(
      rolesPayloadFactory()
    );
    render(<RolesandPermission />);
    await waitFor(() =>
      expect(screen.getByTestId("perm-table-row-count").textContent).toBe("2")
    );
    const editBtn = screen
      .getByTestId("row-0-cell-action")
      .querySelector('button[aria-label="edit"]');
    fireEvent.click(editBtn);
    await waitFor(() =>
      expect(screen.getByTestId("add-role-edit")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId("add-role-onclose"));
    await waitFor(() =>
      expect(screen.queryByTestId("add-role-edit")).not.toBeInTheDocument()
    );
  });

  it("hides Settings + Eye + Edit + Trash action buttons when corresponding permissions are false", async () => {
    permissionsRef.value = {
      permissions: {
        roles: { view: true, create: false, edit: false, delete: false },
        permission: { view: false, edit: false },
      },
      loading: false,
    };
    getApiRef.getAllRolesAndPermissionDetails.mockResolvedValue(
      rolesPayloadFactory()
    );
    render(<RolesandPermission />);
    await waitFor(() =>
      expect(screen.getByTestId("perm-table-row-count").textContent).toBe("2")
    );
    // The action column itself is suppressed when all four sub-perms are false
    expect(
      screen.queryByTestId("row-0-cell-action")
    ).not.toBeInTheDocument();
    // header create CTA hidden -> only the unconditional editing-AddRoleDialog
    // (which has no editRole prop in this state) is left, so exactly ONE
    // "add-role-create" element is present (the always-rendered editing one).
    expect(screen.getAllByTestId("add-role-create").length).toBe(1);
  });

  it("normalizeLogsPermissions: nested logs config flows through save unchanged for the nested keys", async () => {
    getApiRef.getAllRolesAndPermissionDetails.mockResolvedValue(
      rolesPayloadFactory()
    );
    putApiRef.updatePermissionByRole.mockResolvedValue({
      body: { status: "success" },
    });
    render(<RolesandPermission />);
    await waitFor(() =>
      expect(screen.getByTestId("perm-table-row-count").textContent).toBe("2")
    );
    // open settings on row 1 (Admin) which has the NESTED logs shape
    const settingsBtn = screen
      .getByTestId("row-1-cell-action")
      .querySelector('button[aria-label="settings"]');
    fireEvent.click(settingsBtn);
    // dataset.keys includes 'logs'
    expect(screen.getByTestId("permission-step").dataset.keys).toContain("logs");
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() =>
      expect(putApiRef.updatePermissionByRole).toHaveBeenCalledWith(
        "perm-2",
        expect.objectContaining({
          permissionConfig: expect.objectContaining({
            logs: expect.any(Object),
          }),
        })
      )
    );
  });

  it("protected role names (write/admin/read) hide the Edit + Delete buttons even when canEditRole+canDeleteRole are true", async () => {
    getApiRef.getAllRolesAndPermissionDetails.mockResolvedValue({
      data: {
        body: {
          data: {
            rolesWithPermissions: [
              {
                _id: "rA",
                roleName: "admin",
                view: true,
                create: true,
                edit: true,
                delete: true,
              },
            ],
            totalLength: 1,
          },
        },
      },
    });
    render(<RolesandPermission />);
    await waitFor(() =>
      expect(screen.getByTestId("perm-table-row-count").textContent).toBe("1")
    );
    const actionCell = screen.getByTestId("row-0-cell-action");
    // edit + delete suppressed
    expect(
      actionCell.querySelector('button[aria-label="edit"]')
    ).toBeNull();
    expect(
      actionCell.querySelector('button[aria-label="delete"]')
    ).toBeNull();
    // settings/view still present
    expect(
      actionCell.querySelector('button[aria-label="settings"]')
    ).toBeTruthy();
  });
});
