/**
 * Round 64: cover RolePermissions/RolesandPermission.jsx — the top-level
 * Roles & Permission management page.
 *
 * The full page is heavy (search + bulk-select + AddRoleDialog +
 * PermissionStep + DeleteConfirmation + PermissionTable + Pagination +
 * four Api modules), but the permission gates at the top of the
 * component short-circuit the render long before any of those hooks
 * execute:
 *
 *   if (permissionsLoading) return <PageLoader />;
 *   if (!canViewRole)       return <AccessDenied message="…" />;
 *
 * We test exactly those two branches so the entry-point of the page is
 * covered without needing to mock the heavy downstream surface. The
 * PermissionContext / AccessDenied / PageLoader mocks are the only ones
 * strictly required because no other code path runs.
 *
 * Mock budget: 3 (PermissionContext, AccessDenied, PageLoader).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const permissionsRef = vi.hoisted(() => ({ value: null }));
vi.mock("@/context/Permission/PermissionContext", () => ({
  usePermissions: () => permissionsRef.value,
}));

vi.mock("@/components/AccessDenied", () => ({
  default: ({ message }) => (
    <div data-testid="access-denied">{message}</div>
  ),
}));

vi.mock("@/components/PageLoader", () => ({
  default: () => <div data-testid="page-loader">Loading…</div>,
}));

import RolesandPermission from "../../../../../src/page/user/RolePermissions/RolesandPermission.jsx";

beforeEach(() => {
  permissionsRef.value = null;
});

describe("RolesandPermission page — permission gates", () => {
  it("renders PageLoader while permissions are still loading", () => {
    permissionsRef.value = { permissions: null, loading: true };
    render(<RolesandPermission />);
    expect(screen.getByTestId("page-loader")).toBeInTheDocument();
    // Access-denied / page chrome must not be in the tree yet
    expect(screen.queryByTestId("access-denied")).not.toBeInTheDocument();
  });

  it("renders AccessDenied with the Roles-specific message when canViewRole is false", () => {
    permissionsRef.value = {
      permissions: {
        roles: { view: false, create: false, edit: false, delete: false },
        permission: { view: false, edit: false },
      },
      loading: false,
    };
    render(<RolesandPermission />);
    const denied = screen.getByTestId("access-denied");
    expect(denied).toBeInTheDocument();
    expect(denied.textContent).toMatch(/permission to view Roles/i);
    expect(screen.queryByTestId("page-loader")).not.toBeInTheDocument();
  });
});
