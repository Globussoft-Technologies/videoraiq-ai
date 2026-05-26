/**
 * Round 94: cover EmployeeLogs/AccessLog.jsx — the top-level "Access Logs"
 * page mounted under /logs/access. The full page is heavy (TanStack-table
 * via ReusableTablePage, LogEmployeeProfileDialog + ActionCameraPreview,
 * LogsFilterPopover + AutoRefreshComponent, six Api/post endpoints +
 * Api/get under the same dir, jsPDF + autotable + xlsx export, sonner
 * toasts, react-router-dom navigate, multiple useEffects firing at
 * mount + on every filter change), but the permission gates at the
 * bottom of the component short-circuit the render before any of the
 * downstream JSX (the heavy ReusableTablePage tree) mounts:
 *
 *   const { permissions, loading: permissionsLoading } = usePermissions();
 *   const resolveLogPerm = (action) => {
 *     const logs = permissions?.logs;
 *     if (!logs) return false;
 *     if (typeof logs.accessLogs?.[action] === 'boolean') return logs.accessLogs[action];
 *     if (typeof logs.global?.[action] === 'boolean') return logs.global[action];
 *     if (typeof logs[action] === 'boolean') return logs[action];
 *     return false;
 *   };
 *   const canView = resolveLogPerm('view');
 *   ...
 *   if (permissionsLoading) return null;
 *   if (!canView) {
 *     return <AccessDenied message="You don't have permission to view Logs." />;
 *   }
 *
 * The component declares several useEffects above the gate that DO fire
 * on the first render (filterByDepartment / getNVRs / getEmployeeLocations
 * / getchannels / fetchLogs / autoRefresh interval). We mock all of those
 * API entry points to no-op promises so the gates can be observed in
 * isolation; same approach as VisibilityLog / TrackLog / GuardLog specs.
 *
 * Mocks (8 — at the cap, all required to suppress import-time / first-
 *   render side effects):
 *   1. @/context/Permission/PermissionContext       (drives the gates)
 *   2. @/components/AccessDenied                    (deny branch sentinel)
 *   3. react-router-dom                             (useNavigate)
 *   4. ./Api/post                                   (5 funcs incl. getNVRs)
 *   5. ./Api/get                                    (kept defensive)
 *   6. ./ReusableTablePage                          (don't mount heavy table)
 *   7. ./ActionCameraPreview                        (don't mount preview)
 *   8. ./LogEmployeeProfileDialog                   (don't mount Radix dialog)
 *
 * Test count: 4 (loading, deny, missing-perm, loading-wins-over-deny).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, act } from "@testing-library/react";
// AccessLog.jsx imports plain `moment`, but inside the component body
// uses `moment.tz.guess()`. In production the `tz` plug-in lands on the
// moment singleton via a sibling import (ActionCameraPreview /
// LogEmployeeProfileDialog both `import moment from "moment-timezone"`).
// Under this spec we stub both siblings, so the timezone augmentation
// never happens — pull it in here so `moment.tz.guess()` resolves.
import "moment-timezone";

const permissionsRef = vi.hoisted(() => ({ value: null }));

vi.mock("@/context/Permission/PermissionContext", () => ({
  usePermissions: () => permissionsRef.value,
}));

vi.mock("@/components/AccessDenied", () => ({
  default: ({ message }) => (
    <div data-testid="access-denied">{message}</div>
  ),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

// Stub the API modules invoked by the page's useEffects so they don't
// trigger real axios calls when the loading branch renders.
vi.mock("../../../../../src/page/user/EmployeeLogs/Api/post", () => ({
  filterByDepartment: vi.fn().mockResolvedValue({ data: { body: { data: { data: [] } } } }),
  getAllAccessLogsDetails: vi.fn().mockResolvedValue({ data: { body: { data: {} } } }),
  getchannels: vi.fn().mockResolvedValue({ data: { body: { data: [] } } }),
  getEmployeeLocations: vi.fn().mockResolvedValue({ data: { body: { data: { locations: [] } } } }),
  getNVRs: vi.fn().mockResolvedValue({ data: { body: { data: [] } } }),
}));

vi.mock("../../../../../src/page/user/EmployeeLogs/Api/get", () => ({
  getAttendanceLogs: vi.fn().mockResolvedValue({ data: { body: { data: {} } } }),
}));

// Children that AccessLog only mounts on the canView=true branch — stub
// so they never accidentally hit a real DOM mount if the gate logic
// regresses.
vi.mock("../../../../../src/page/user/EmployeeLogs/ReusableTablePage", () => ({
  default: () => <div data-testid="rtp">rtp</div>,
}));

vi.mock("../../../../../src/page/user/EmployeeLogs/ActionCameraPreview", () => ({
  default: () => <div data-testid="action-preview" />,
}));

vi.mock("../../../../../src/page/user/EmployeeLogs/LogEmployeeProfileDialog", () => ({
  default: () => <div data-testid="log-profile-dialog" />,
}));

const { default: AccessLog } = await import(
  "../../../../../src/page/user/EmployeeLogs/AccessLog.jsx"
);

beforeEach(() => {
  permissionsRef.value = null;
});

// Effects declared above the permission gate (fetchDepartments / fetchNvrs
// / fetchLocations / fetchChannels / fetchLogs / autoRefresh interval)
// still fire on the initial render even when the gate short-circuits the
// return value — flush their resolved setState calls inside act() so the
// React-DOM act-warning stays quiet and the test cleanup is deterministic.
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe("AccessLog page — Round 94 permission gates", () => {
  it("returns null while permissions are still loading (no AccessDenied, no table)", async () => {
    permissionsRef.value = { permissions: null, loading: true };

    const { container } = render(<AccessLog />);
    await flush();

    // permissionsLoading === true short-circuits with `return null` — the
    // page renders nothing, neither AccessDenied nor the ReusableTablePage
    // child. `container.firstChild === null` is the load-bearing invariant.
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("access-denied")).not.toBeInTheDocument();
    expect(screen.queryByTestId("rtp")).not.toBeInTheDocument();
  });

  it("renders AccessDenied with the logs-specific message when canView is false", async () => {
    permissionsRef.value = {
      permissions: {
        logs: {
          accessLogs: { view: false },
        },
      },
      loading: false,
    };

    render(<AccessLog />);
    await flush();

    const denied = screen.getByTestId("access-denied");
    expect(denied).toBeInTheDocument();
    expect(denied.textContent).toMatch(/permission to view Logs/i);
    // ReusableTablePage must stay out of the tree when canView is false.
    expect(screen.queryByTestId("rtp")).not.toBeInTheDocument();
  });

  it("renders AccessDenied when the permissions object is missing the logs entry entirely", async () => {
    // `permissions?.logs` is undefined -> resolveLogPerm short-circuits
    // with `return false` -> canView falsy -> AccessDenied branch. This
    // covers the `if (!logs) return false;` arm of resolveLogPerm.
    permissionsRef.value = {
      permissions: {},
      loading: false,
    };

    render(<AccessLog />);
    await flush();

    const denied = screen.getByTestId("access-denied");
    expect(denied).toBeInTheDocument();
    expect(denied.textContent).toMatch(/permission to view Logs/i);
  });

  it("prefers the null-render loading branch over AccessDenied when both gates could match", async () => {
    // permissionsLoading=true short-circuits BEFORE the !canView check —
    // even when accessLogs.view is explicitly false, the loading-branch
    // `return null` must take precedence and AccessDenied must stay out
    // of the tree.
    permissionsRef.value = {
      permissions: { logs: { accessLogs: { view: false } } },
      loading: true,
    };

    const { container } = render(<AccessLog />);
    await flush();

    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("access-denied")).not.toBeInTheDocument();
  });
});
