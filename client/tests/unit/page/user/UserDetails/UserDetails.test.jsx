/**
 * Round 85: cover UserDetails/UserDetails.jsx — the top-level Users listing
 * page mounted under /user-details.
 *
 * The full page is heavy (TanStack PermissionTable + Pagination +
 * NewPermissionForm dialog + DeleteConfirmation + getUserDetails /
 * deleteUser / deleteBulkUser Api modules + Formik-driven role assignment +
 * column-toggle popover + jwt-decode of the access token), but the
 * permission gates at the very top of the component short-circuit the
 * render long before any of those hooks execute:
 *
 *   if (permissionsLoading) return <PageLoader />;
 *   if (!canView)           return <AccessDenied message="…" />;
 *
 * We pin both early-return arms — that's the entire reachable surface for
 * a non-Users user. Above the gate the function body only calls
 * getAccessToken() + jwtDecode() + usePermissions(); the first two are
 * mocked at the module boundary because they otherwise reach into
 * js-cookie / atob and would throw inside jsdom.
 *
 * Mock budget: 5 (getAccessToken, jwt-decode, PermissionContext,
 * AccessDenied, PageLoader).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/utils/getAccessToken", () => ({
  default: () => "mock-token",
}));

vi.mock("jwt-decode", () => ({
  jwtDecode: () => ({ sub: "mock-user" }),
}));

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

import UserDetails from "../../../../../src/page/user/UserDetails/UserDetails.jsx";

beforeEach(() => {
  permissionsRef.value = null;
});

describe("UserDetails page — Round 85 permission gates", () => {
  it("renders PageLoader while permissions are still loading", () => {
    permissionsRef.value = { permissions: null, loading: true };

    render(<UserDetails />);

    expect(screen.getByTestId("page-loader")).toBeInTheDocument();
    // The access-denied / heavy table chrome must not be in the tree yet.
    expect(screen.queryByTestId("access-denied")).not.toBeInTheDocument();
  });

  it("renders AccessDenied with the Users-specific message when canView is false", () => {
    permissionsRef.value = {
      permissions: {
        Users: { view: false, create: false, edit: false, delete: false },
      },
      loading: false,
    };

    render(<UserDetails />);

    const denied = screen.getByTestId("access-denied");
    expect(denied).toBeInTheDocument();
    expect(denied.textContent).toMatch(/permission to view Users/i);
    expect(screen.queryByTestId("page-loader")).not.toBeInTheDocument();
  });

  it("renders AccessDenied when the permissions object is missing the Users entry entirely", () => {
    permissionsRef.value = {
      permissions: {},
      loading: false,
    };

    render(<UserDetails />);

    // permissions?.Users?.view -> undefined -> !canView truthy ->
    // AccessDenied branch.
    const denied = screen.getByTestId("access-denied");
    expect(denied).toBeInTheDocument();
    expect(denied.textContent).toMatch(/permission to view Users/i);
  });
});
