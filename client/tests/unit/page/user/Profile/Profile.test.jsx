/**
 * Round 63: cover Profile/Profile.jsx — the top-level Profile listing page.
 *
 * The full page is heavy (search + column-toggle popover + Pagination +
 * ProfilesTable + MultiStepForm dialog + bulk delete/export + four Api
 * modules + usePermissions + useDebounce), but — like the R62 Incidents
 * page — the permission gates at the top of the component short-circuit
 * the render long before any of those hooks execute:
 *
 *   if (permissionsLoading) return <PageLoader />;
 *   if (!canView)           return <AccessDenied message="…" />;
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

import Profile from "../../../../../src/page/user/Profile/Profile.jsx";

beforeEach(() => {
  permissionsRef.value = null;
});

describe("Profile page — permission gates", () => {
  it("renders PageLoader while permissions are still loading", () => {
    permissionsRef.value = { permissions: null, loading: true };
    render(<Profile />);
    expect(screen.getByTestId("page-loader")).toBeInTheDocument();
    // Access-denied / page chrome must not be in the tree yet
    expect(screen.queryByTestId("access-denied")).not.toBeInTheDocument();
  });

  it("renders AccessDenied with the Profile-specific message when canView is false", () => {
    permissionsRef.value = {
      permissions: {
        profiles: { view: false, create: false, edit: false, delete: false },
      },
      loading: false,
    };
    render(<Profile />);
    const denied = screen.getByTestId("access-denied");
    expect(denied).toBeInTheDocument();
    // The Profile.jsx source uses the spelling "view Profile's." — match
    // loosely so wording tweaks don't break the test.
    expect(denied.textContent).toMatch(/permission to view Profile/i);
    expect(screen.queryByTestId("page-loader")).not.toBeInTheDocument();
  });
});
