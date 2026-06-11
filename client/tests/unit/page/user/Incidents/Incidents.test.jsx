// Round 62: cover Incidents/Incidents.jsx — the top-level Incidents page.
// The full page is heavy (StatCards + VideoModal + IncidentCard grid +
// MultiSelect + DateRangePicker + AutoRefresh + four Api modules + three
// contexts), but the permission gates at the top of the component short-
// circuit the render long before any of those hooks execute:
//
//   if (permissionsLoading) return <PageLoader />;
//   if (!canView)           return <AccessDenied message="…" />;
//
// We test exactly those two branches so the entry-point of the page is
// covered without needing to mock the heavy downstream surface. The
// PermissionContext / AccessDenied / PageLoader mocks are the only ones
// strictly required because no other code path runs.
//
// Mock budget: 3 (PermissionContext, AccessDenied, PageLoader).

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

// Round 4 fix-up: product code now calls useLocation() +
// useDashboardFiltersContext + useAuth BEFORE the permission gate
// runs, so the bare import-time mocks have to provide stand-ins for
// each of those so the gate JSX can mount.
vi.mock("react-router-dom", () => ({
  useLocation: () => ({ search: "" }),
}));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { name_f: "alice" } }),
}));
vi.mock("@/context/UserContext/DashboardFiltersContext", () => ({
  useDashboardFiltersContext: () => ({
    selectedDepartment: [],
    setSelectedDepartment: () => {},
    departments: [],
    setDepartments: () => {},
    selectedLocation: [],
    setSelectedLocation: () => {},
    locations: [],
    setLocations: () => {},
  }),
}));

import Incidents from "../../../../../src/page/user/Incidents/Incidents.jsx";

beforeEach(() => {
  permissionsRef.value = null;
});

describe("Incidents page — permission gates", () => {
  it("renders PageLoader while permissions are still loading", () => {
    permissionsRef.value = { permissions: null, loading: true };
    render(<Incidents />);
    expect(screen.getByTestId("page-loader")).toBeInTheDocument();
    // Access-denied / page chrome must not be in the tree yet
    expect(screen.queryByTestId("access-denied")).not.toBeInTheDocument();
  });

  it("renders AccessDenied with the Incidents-specific message when canView is false", () => {
    permissionsRef.value = {
      permissions: { incidents: { view: false, edit: false } },
      loading: false,
    };
    render(<Incidents />);
    const denied = screen.getByTestId("access-denied");
    expect(denied).toBeInTheDocument();
    expect(denied.textContent).toMatch(/permission to view Incidents/i);
    expect(screen.queryByTestId("page-loader")).not.toBeInTheDocument();
  });
});
