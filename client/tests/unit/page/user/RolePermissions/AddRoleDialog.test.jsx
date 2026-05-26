/**
 * src/page/user/RolePermissions/AddRoleDialog.jsx — Formik-driven Radix
 * Dialog for create vs edit role. Uses the yup `addRoleSchema`
 * (roles: required, 3-32 chars). Submits via createRole (POST) or
 * updateRole (PUT); toasts on success/failure. The dialog is opened
 * programmatically when `editRole` is supplied; otherwise it opens
 * via DialogTrigger (in the real Radix Dialog).
 *
 * Real bits kept: formik + yup + the actual schema, Radix Dialog itself
 * (the dialog auto-opens in edit mode via `setOpen(true)` so we don't
 * have to fight Radix portals).
 *
 * Mocks (3):
 *   1. sonner                          — capture toast.success/error.
 *   2. ../../../../../src/page/user/RolePermissions/Api/post
 *                                      — stub createRole.
 *   3. ../../../../../src/page/user/RolePermissions/Api/put
 *                                      — stub updateRole.
 *
 * Known product bug (R34): in edit mode the prefill from
 *   `useEffect([editRole, trigger])` (setValues({roles: editRole.name}))
 * is immediately wiped by the second `useEffect([open])`, which calls
 * `formik.resetForm()` because `open` is still `false` on the very
 * first mount. Net effect: the role-name input always opens empty in
 * edit mode. Recorded here rather than fixed (tests-only round; gh
 * issue creation blocked by HTTP 401 — see R34 summary). The tests
 * below set the value via `fireEvent.change` before submit to exercise
 * the submit branches.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

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

describe("RolePermissions/AddRoleDialog", () => {
  it("auto-opens in edit mode and shows 'Edit Role' title + 'Update Role' button", async () => {
    render(
      <AddRoleDialog
        editRole={{ _id: "r1", name: "Manager" }}
        fetchRoles={vi.fn()}
      />
    );
    // Radix Dialog renders into a portal once `open` becomes true.
    expect(await screen.findByText("Edit Role")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Update Role/i })
    ).toBeInTheDocument();
    // The role-name input exists inside the open dialog body.
    expect(screen.getByPlaceholderText(/Enter role name/i)).toBeInTheDocument();
  });

  it("submits in edit mode: calls updateRole with the roleId + payload, toasts success, and calls onSave", async () => {
    putRef.updateRole.mockResolvedValue({
      statusCode: 200,
      body: { message: "Role updated" },
    });
    const onSave = vi.fn();
    render(
      <AddRoleDialog
        editRole={{ _id: "r1", name: "Manager" }}
        onSave={onSave}
        fetchRoles={vi.fn()}
      />
    );
    const input = await screen.findByPlaceholderText(/Enter role name/i);
    fireEvent.change(input, { target: { value: "Senior Manager" } });
    fireEvent.click(screen.getByRole("button", { name: /Update Role/i }));

    await waitFor(() => expect(putRef.updateRole).toHaveBeenCalled());
    expect(putRef.updateRole.mock.calls[0][0]).toBe("r1");
    expect(putRef.updateRole.mock.calls[0][1]).toEqual({
      roleName: "Senior Manager",
    });
    expect(toastRef.success).toHaveBeenCalledWith("Role updated");
    expect(onSave).toHaveBeenCalledWith("r1", "Senior Manager");
    expect(postRef.createRole).not.toHaveBeenCalled();
  });

  it("falls back to the `id` field when `_id` is missing, and treats status===200 as success", async () => {
    putRef.updateRole.mockResolvedValue({
      status: 200,
      message: "Updated via status",
    });
    const onSave = vi.fn();
    render(
      <AddRoleDialog
        editRole={{ id: "r7", name: "Viewer" }}
        onSave={onSave}
        fetchRoles={vi.fn()}
      />
    );
    const input = await screen.findByPlaceholderText(/Enter role name/i);
    fireEvent.change(input, { target: { value: "Viewer" } });
    fireEvent.click(screen.getByRole("button", { name: /Update Role/i }));
    await waitFor(() => expect(putRef.updateRole).toHaveBeenCalled());
    expect(putRef.updateRole.mock.calls[0][0]).toBe("r7");
    expect(toastRef.success).toHaveBeenCalledWith("Updated via status");
    expect(onSave).toHaveBeenCalledWith("r7", "Viewer");
  });

  it("toasts an error when updateRole resolves with a non-success response", async () => {
    putRef.updateRole.mockResolvedValue({
      statusCode: 400,
      body: { message: "Bad role name" },
    });
    const onSave = vi.fn();
    render(
      <AddRoleDialog
        editRole={{ _id: "r1", name: "Manager" }}
        onSave={onSave}
        fetchRoles={vi.fn()}
      />
    );
    const input = await screen.findByPlaceholderText(/Enter role name/i);
    fireEvent.change(input, { target: { value: "Manager" } });
    fireEvent.click(screen.getByRole("button", { name: /Update Role/i }));
    await waitFor(() =>
      expect(toastRef.error).toHaveBeenCalledWith("Bad role name")
    );
    expect(toastRef.success).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("toasts 'Failed to update role' when the response has no message", async () => {
    putRef.updateRole.mockResolvedValue({ statusCode: 500 });
    render(
      <AddRoleDialog
        editRole={{ _id: "rX", name: "X" }}
        fetchRoles={vi.fn()}
      />
    );
    const input = await screen.findByPlaceholderText(/Enter role name/i);
    fireEvent.change(input, { target: { value: "NewRole" } });
    fireEvent.click(screen.getByRole("button", { name: /Update Role/i }));
    await waitFor(() =>
      expect(toastRef.error).toHaveBeenCalledWith("Failed to update role")
    );
  });

  it("on API rejection: toasts the response.data.message when present", async () => {
    putRef.updateRole.mockRejectedValue({
      response: { data: { message: "Conflict from server" } },
    });
    render(
      <AddRoleDialog
        editRole={{ _id: "r1", name: "Manager" }}
        fetchRoles={vi.fn()}
      />
    );
    const input = await screen.findByPlaceholderText(/Enter role name/i);
    fireEvent.change(input, { target: { value: "Manager" } });
    fireEvent.click(screen.getByRole("button", { name: /Update Role/i }));
    await waitFor(() =>
      expect(toastRef.error).toHaveBeenCalledWith("Conflict from server")
    );
  });

  it("on API rejection without a response: falls back to the Error message", async () => {
    putRef.updateRole.mockRejectedValue(new Error("network down"));
    render(
      <AddRoleDialog
        editRole={{ _id: "r1", name: "Manager" }}
        fetchRoles={vi.fn()}
      />
    );
    const input = await screen.findByPlaceholderText(/Enter role name/i);
    fireEvent.change(input, { target: { value: "Manager" } });
    fireEvent.click(screen.getByRole("button", { name: /Update Role/i }));
    await waitFor(() =>
      expect(toastRef.error).toHaveBeenCalledWith("network down")
    );
  });

  it("validates roles via the yup schema before submitting an edit (blocks updateRole when blank)", async () => {
    render(
      <AddRoleDialog
        editRole={{ _id: "r1", name: "Manager" }}
        fetchRoles={vi.fn()}
      />
    );
    const input = await screen.findByPlaceholderText(/Enter role name/i);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    fireEvent.click(screen.getByRole("button", { name: /Update Role/i }));
    await waitFor(() =>
      expect(screen.getByText(/Role Name is required/i)).toBeInTheDocument()
    );
    expect(putRef.updateRole).not.toHaveBeenCalled();
  });

  it("shows the yup min-length error when the role name is shorter than 3 chars", async () => {
    render(
      <AddRoleDialog
        editRole={{ _id: "r1", name: "Manager" }}
        fetchRoles={vi.fn()}
      />
    );
    const input = await screen.findByPlaceholderText(/Enter role name/i);
    fireEvent.change(input, { target: { value: "ab" } });
    fireEvent.blur(input);
    fireEvent.click(screen.getByRole("button", { name: /Update Role/i }));
    await waitFor(() =>
      expect(
        screen.getByText(/Role Name must be at least 3 characters/i)
      ).toBeInTheDocument()
    );
    expect(putRef.updateRole).not.toHaveBeenCalled();
  });
});
