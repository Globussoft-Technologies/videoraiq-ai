/**
 * Round 66: cover Locations/Locations.jsx — the top-level Locations
 * listing page.
 *
 * The full page is heavy (Pagination + PermissionTable + LocationForm +
 * DeleteConfirmation + fetchLocations / deleteLocation Api + Input +
 * sonner toasts + memo wrapping), but the permission gates at the top
 * of the component short-circuit the render long before any of those
 * hooks fire:
 *
 *   if (permissionsLoading) return <PageLoader />;
 *   if (!canView)           return <AccessDenied />;
 *
 * We pin exactly those two branches so the entry-point of the page is
 * covered without needing to mock the heavy downstream surface.
 *
 * Mock budget: 3 (PermissionContext, AccessDenied, PageLoader).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

const permissionsRef = vi.hoisted(() => ({ value: null }));
vi.mock("@/context/Permission/PermissionContext", () => ({
  usePermissions: () => permissionsRef.value,
}));

vi.mock("@/components/AccessDenied", () => ({
  default: ({ message }) => (
    <div data-testid="access-denied">{message ?? "denied"}</div>
  ),
}));

vi.mock("@/components/PageLoader", () => ({
  default: () => <div data-testid="page-loader">Loading…</div>,
}));

// The component declares its useEffect / useCallback hooks *before* the
// early-return permission gates, so the fetchLocations call still fires
// on mount even when we render the gate branches. Mock the Api module to
// keep the network closed and avoid an unhandled axios rejection during
// the test run.
vi.mock("../../../../../src/page/user/Locations/Api", () => ({
  fetchLocations: vi.fn().mockResolvedValue({
    data: { statusCode: 200, body: { data: { locations: [], totalCount: 0 } } },
  }),
  deleteLocation: vi.fn(),
}));

import Locations from "../../../../../src/page/user/Locations/Locations.jsx";

beforeEach(() => {
  permissionsRef.value = null;
});

describe("Locations page — permission gates", () => {
  it("renders PageLoader while permissions are still loading", async () => {
    permissionsRef.value = { permissions: null, loading: true };
    render(<Locations />);
    expect(screen.getByTestId("page-loader")).toBeInTheDocument();
    // Access-denied / page chrome must not be in the tree yet
    expect(screen.queryByTestId("access-denied")).not.toBeInTheDocument();
    // Hooks order in the source declares useEffect *before* the early
    // return, so the mocked fetchLocations resolves and updates state
    // after we've asserted. Flush the microtask queue inside act() to
    // satisfy React's act warning.
    await act(async () => {
      await Promise.resolve();
    });
  });

  it("renders AccessDenied (no message prop) when canView is false", async () => {
    permissionsRef.value = {
      permissions: { locations: { view: false, edit: false, delete: false } },
      loading: false,
    };
    render(<Locations />);
    const denied = screen.getByTestId("access-denied");
    expect(denied).toBeInTheDocument();
    // Locations.jsx passes <AccessDenied /> with no message prop, so the
    // fallback "denied" string from our mock should appear.
    expect(denied.textContent).toBe("denied");
    expect(screen.queryByTestId("page-loader")).not.toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
    });
  });
});
