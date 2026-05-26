/**
 * Round 100: cover Dashboard/Dashboard.jsx — the top-level user dashboard
 * page mounted under /dashboard.
 *
 * The full page is heavy (StatCards / RecentAlerts / AccessLog /
 * EmployeesOnDuty / AlertGauge / ActivityChart / CameraStream /
 * VideoCanvasStream / AttendanceLogsLive children, four Api/get calls
 * via three useEffects above the gate, five contexts pulled at the top
 * of the body), but the permission gate near the bottom of the component
 * short-circuits the heavy downstream tree:
 *
 *   if (permissionsLoading) return <PageLoader />;
 *   if (!canView) {
 *     return showDenied
 *       ? <AccessDenied message="…" />
 *       : <div></div>;   // 2s placeholder before AccessDenied is shown
 *   }
 *
 * This spec pins exactly the three early-return branches so the page
 * entry point is exercised without standing up the heavy downstream
 * surface:
 *   1. permissionsLoading=true → <PageLoader />
 *   2. !canView, showDenied=false (immediate) → empty <div> placeholder
 *   3. !canView, showDenied=true (after 2s setTimeout) → <AccessDenied>
 *
 * Six of the eight mocks are pure import-time no-ops needed so the file
 * loads cleanly in jsdom (the useEffects above the gate would otherwise
 * dispatch real axios calls + read from real contexts that are not
 * wrapped by a Provider in this isolated render).
 *
 * Mock budget: 8 — at cap.
 *   1. @/context/Permission/PermissionContext (usePermissions)
 *   2. @/components/AccessDenied
 *   3. @/components/PageLoader
 *   4. @/context/AuthContext (useAuth)
 *   5. @/context/Sockets/AllDetectionContext (useAllDetections)
 *   6. @/context/UserContext/DashboardFiltersContext
 *      (useDashboardFiltersContext)
 *   7. @/context/UserContext/Context (default UserContext)
 *   8. ./Api/get (getFiltersNvrNames / getCamerasBasedOnNvr /
 *      getDepartments / getLocations) — all stubbed to resolved no-ops
 *      so the three pre-gate useEffects don't reach the network.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, act } from "@testing-library/react";

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

const authValue = vi.hoisted(() => ({
  user: null,
  triggerFlag: false,
  triggerUpdate: () => {},
}));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => authValue,
}));

const allDetectionsValue = vi.hoisted(() => ({ allDetections: [] }));
vi.mock("@/context/Sockets/AllDetectionContext", () => ({
  useAllDetections: () => allDetectionsValue,
}));

// Stable singletons so every render returns the SAME reference — the
// useDashboardFiltersContext value is consumed in a useEffect dep array
// (`[selectedLocation]`) inside Dashboard.jsx; returning a fresh object/
// array on each render would otherwise spin the effect → setState →
// re-render loop into an OOM.
const dashboardFiltersValue = vi.hoisted(() => ({
  selectedDepartment: [],
  setSelectedDepartment: () => {},
  departments: [],
  setDepartments: () => {},
  selectedLocation: [],
  setSelectedLocation: () => {},
  locations: [],
  setLocations: () => {},
  fetchLocations: () => Promise.resolve(),
  fetchDepartments: () => Promise.resolve(),
}));
vi.mock("@/context/UserContext/DashboardFiltersContext", () => ({
  useDashboardFiltersContext: () => dashboardFiltersValue,
}));

// The default UserContext export is a bare React.createContext() with no
// Provider in the test render — without a mock, the destructuring assignment
// of useContext(UserContext) would throw on undefined.
vi.mock("@/context/UserContext/Context", () => {
  const Ctx = React.createContext({
    sidebarShow: false,
    setSidebarShow: () => {},
    switchOn: [],
    setSwitchOn: () => {},
    streamModalShow: false,
    setStreamModalShow: () => {},
    setStreamModalContentSrc: () => {},
  });
  return { default: Ctx };
});

// The four named exports of ./Api/get are imported at module load and
// invoked from three pre-gate useEffects; stub each to a resolved no-op.
vi.mock("../../../../../src/page/user/Dashboard/Api/get", () => ({
  getFiltersNvrNames: vi
    .fn()
    .mockResolvedValue({ statusCode: 200, body: { data: [] } }),
  getCamerasBasedOnNvr: vi
    .fn()
    .mockResolvedValue({ statusCode: 200, body: { data: [] } }),
  getDepartments: vi
    .fn()
    .mockResolvedValue({ statusCode: 200, body: { data: [] } }),
  getLocations: vi
    .fn()
    .mockResolvedValue({ statusCode: 200, body: { data: [] } }),
}));

import Dashboard from "../../../../../src/page/user/Dashboard/Dashboard.jsx";

beforeEach(() => {
  permissionsRef.value = null;
  vi.useFakeTimers();
});

afterEach(() => {
  // Drain any still-pending Dashboard timers (the 2s showDenied setTimeout
  // and the cleanup callbacks fired during unmount) inside act() so
  // stray "not wrapped in act" warnings from late state updates do not
  // pollute the test output.
  act(() => {
    vi.runOnlyPendingTimers();
  });
  vi.useRealTimers();
});

describe("Dashboard page — Round 100 permission gates", () => {
  it("renders PageLoader while permissions are still loading", () => {
    permissionsRef.value = { permissions: null, loading: true };
    render(<Dashboard />);
    expect(screen.getByTestId("page-loader")).toBeInTheDocument();
    // Access-denied branch must not be in the tree yet.
    expect(screen.queryByTestId("access-denied")).not.toBeInTheDocument();
  });

  it("renders the empty placeholder div when canView is false and the 2s delay has not elapsed", () => {
    permissionsRef.value = {
      permissions: { dashboard: { view: false, edit: false } },
      loading: false,
    };
    let container;
    act(() => {
      ({ container } = render(<Dashboard />));
    });

    // Before the 2s setTimeout fires, the branch returns <div></div>.
    // The test ID for the AccessDenied mock must be absent and the page-
    // loader must also be absent (loading is false).
    expect(screen.queryByTestId("access-denied")).not.toBeInTheDocument();
    expect(screen.queryByTestId("page-loader")).not.toBeInTheDocument();
    // The bare-div placeholder is the only render the component yields
    // at this point; assert the rendered root has no children.
    expect(container.firstChild).toBeTruthy();
    expect(container.firstChild.tagName.toLowerCase()).toBe("div");
    expect(container.firstChild.childNodes.length).toBe(0);
  });

  it("renders AccessDenied with the Dashboard-specific message after the 2s delay elapses", () => {
    permissionsRef.value = {
      permissions: { dashboard: { view: false, edit: false } },
      loading: false,
    };
    act(() => {
      render(<Dashboard />);
    });

    // Advance the showDenied 2-second setTimeout inside act() so the state
    // update + re-render are flushed before we query the DOM.
    act(() => {
      vi.advanceTimersByTime(2100);
    });

    const denied = screen.getByTestId("access-denied");
    expect(denied).toBeInTheDocument();
    expect(denied.textContent).toMatch(/permission to view Dashboard/i);
    expect(screen.queryByTestId("page-loader")).not.toBeInTheDocument();
  });

  it("renders the empty placeholder when permissions object is missing dashboard entirely", () => {
    // permissions?.dashboard?.view -> undefined -> !canView truthy ->
    // empty <div> placeholder before the showDenied timer fires.
    permissionsRef.value = { permissions: {}, loading: false };
    let container;
    act(() => {
      ({ container } = render(<Dashboard />));
    });
    expect(screen.queryByTestId("access-denied")).not.toBeInTheDocument();
    expect(screen.queryByTestId("page-loader")).not.toBeInTheDocument();
    expect(container.firstChild.tagName.toLowerCase()).toBe("div");
    expect(container.firstChild.childNodes.length).toBe(0);
  });
});
