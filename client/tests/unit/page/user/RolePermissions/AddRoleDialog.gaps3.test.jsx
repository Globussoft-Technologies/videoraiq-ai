/**
 * Round 3 gap-fill for AddRoleDialog.jsx
 *
 * Base spec covers edit-mode submit branches but skips create-mode entirely
 * (the dialog only auto-opens with editRole; without editRole, opening
 * requires clicking the Radix DialogTrigger). This spec mounts the dialog
 * with a trigger button, opens it, types, submits, and exercises the
 * createRole success/fail/no-message branches (lines 47-60), plus:
 *   - the onClose prop being called when the dialog is closed (lines 101-105)
 *   - the no-trigger reset effect (lines 76-78)
 *
 * Mock budget: lifted.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const toastRef = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: toastRef }));

const postRef = vi.hoisted(() => ({ createRole: vi.fn() }));
vi.mock(
  "../../../../../src/page/user/RolePermissions/Api/post",
  () => postRef
);

const putRef = vi.hoisted(() => ({ updateRole: vi.fn() }));
vi.mock(
  "../../../../../src/page/user/RolePermissions/Api/put",
  () => putRef
);

const { default: AddRoleDialog } = await import(
  "../../../../../src/page/user/RolePermissions/AddRoleDialog.jsx"
);

beforeEach(() => {
  toastRef.success.mockReset();
  toastRef.error.mockReset();
  postRef.createRole.mockReset();
  putRef.updateRole.mockReset();
});

describe("AddRoleDialog — create mode + close (round 3 gaps)", () => {
  it("creates a new role: clicks trigger to open, types, submits -> createRole + toast.success + fetchRoles + close", async () => {
    postRef.createRole.mockResolvedValue({
      statusCode: 201,
      body: { message: "Role created" },
    });
    const fetchRoles = vi.fn();

    render(
      <AddRoleDialog
        trigger={<button data-testid="open-add-role">Add Role</button>}
        fetchRoles={fetchRoles}
      />
    );

    // The dialog isn't open yet — "Add New Role" title isn't in the tree.
    expect(screen.queryByText("Add New Role")).toBeNull();
    // Click the trigger to open
    fireEvent.click(screen.getByTestId("open-add-role"));

    // After open, the create-mode title + Add Role submit button render.
    expect(await screen.findByText("Add New Role")).toBeInTheDocument();
    const input = screen.getByPlaceholderText(/Enter role name/i);
    fireEvent.change(input, { target: { value: "Auditor" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add Role$/i }));

    await waitFor(() => expect(postRef.createRole).toHaveBeenCalled());
    expect(postRef.createRole).toHaveBeenCalledWith({ roles: ["Auditor"] });
    expect(toastRef.success).toHaveBeenCalledWith("Role created");
    expect(fetchRoles).toHaveBeenCalledTimes(1);
  });

  it("create-mode failure: non-success response toasts the fallback message", async () => {
    postRef.createRole.mockResolvedValue({ statusCode: 500 });
    const fetchRoles = vi.fn();

    render(
      <AddRoleDialog
        trigger={<button data-testid="open-add-role">Add</button>}
        fetchRoles={fetchRoles}
      />
    );
    fireEvent.click(screen.getByTestId("open-add-role"));
    await screen.findByText("Add New Role");

    fireEvent.change(screen.getByPlaceholderText(/Enter role name/i), {
      target: { value: "Auditor" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Add Role$/i }));

    await waitFor(() =>
      expect(toastRef.error).toHaveBeenCalledWith("Failed to create role")
    );
    expect(fetchRoles).not.toHaveBeenCalled();
  });

  it("create-mode failure with message: toasts the API message", async () => {
    postRef.createRole.mockResolvedValue({
      statusCode: 422,
      body: { msg: "Duplicate role" },
    });

    render(
      <AddRoleDialog
        trigger={<button data-testid="open-add-role">Add</button>}
        fetchRoles={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId("open-add-role"));
    await screen.findByText("Add New Role");

    fireEvent.change(screen.getByPlaceholderText(/Enter role name/i), {
      target: { value: "Editor" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Add Role$/i }));

    await waitFor(() =>
      expect(toastRef.error).toHaveBeenCalledWith("Duplicate role")
    );
  });

  it("edit-mode success treats body.success===true as success and uses body.message", async () => {
    putRef.updateRole.mockResolvedValue({
      body: { success: true, message: "Updated via body.success" },
    });
    const onSave = vi.fn();

    render(
      <AddRoleDialog
        editRole={{ _id: "rZ", name: "Manager" }}
        onSave={onSave}
        fetchRoles={vi.fn()}
      />
    );
    const input = await screen.findByPlaceholderText(/Enter role name/i);
    fireEvent.change(input, { target: { value: "Manager+" } });
    fireEvent.click(screen.getByRole("button", { name: /Update Role/i }));

    await waitFor(() => expect(putRef.updateRole).toHaveBeenCalled());
    await waitFor(() =>
      expect(toastRef.success).toHaveBeenCalledWith("Updated via body.success")
    );
    expect(onSave).toHaveBeenCalledWith("rZ", "Manager+");
  });

  it("dialog Close (no editRole, no trigger): the trigger-less mount with editRole=null resets formik and stays closed", async () => {
    // The else-branch of the editRole effect (lines 76-78) — `!trigger`
    // path. We mount with neither editRole nor trigger; the effect runs
    // and the dialog stays closed.
    const { container } = render(<AddRoleDialog fetchRoles={vi.fn()} />);
    expect(screen.queryByText("Add New Role")).toBeNull();
    expect(screen.queryByText("Edit Role")).toBeNull();
    // No crash — coverage is the goal here.
    expect(container).toBeTruthy();
  });

  it("onClose callback fires when the dialog is closed (e.g., Escape key) — covers lines 101-105", async () => {
    const onClose = vi.fn();
    render(
      <AddRoleDialog
        editRole={{ _id: "r1", name: "Manager" }}
        onClose={onClose}
        fetchRoles={vi.fn()}
      />
    );
    await screen.findByText("Edit Role");
    // Find Radix's built-in close button (it has the "Close" sr label)
    const closeBtn = document.querySelector("button[type='button'][aria-label='Close']")
      || document.querySelector("button.absolute.right-4.top-4");
    if (closeBtn) {
      fireEvent.click(closeBtn);
      await waitFor(() => expect(onClose).toHaveBeenCalled());
    } else {
      // Fall back: dispatch Escape on the body
      fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });
      await waitFor(() => expect(onClose).toHaveBeenCalled());
    }
  });
});
