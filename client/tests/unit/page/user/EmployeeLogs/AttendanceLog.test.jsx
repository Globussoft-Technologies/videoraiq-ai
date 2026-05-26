/**
 * Round 95: cover EmployeeLogs/AttendanceLog.jsx — the top-level
 * "Attendance Logs" page mounted under /logs/attendance. The full page is
 * heavy (TanStack-table via ReusableTablePage, LogEmployeeProfileDialog +
 * ActionCameraPreview + BreakLogsDialog, LogsFilterPopover +
 * AutoRefreshComponent, four Api/post endpoints + Api/get +
 * Dashboard/Api/get, jsPDF + autotable + xlsx export, sonner toasts,
 * react-router-dom navigate, multiple useEffects firing at mount + on
 * every filter change), but the permission gates near the bottom of the
 * component short-circuit before the downstream JSX (the heavy
 * ReusableTablePage tree) mounts:
 *
 *   const { permissions, loading: permissionsLoading } = usePermissions();
 *   const resolveLogPerm = (action) => {
 *     const logs = permissions?.logs;
 *     if (!logs) return false;
 *     if (typeof logs.attendanceLogs?.[action] === 'boolean') return logs.attendanceLogs[action];
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
 * Mirrors the AccessLog (R94) approach: mock the API + heavy children so
 * the gates can be observed in isolation, no real DOM mount of the
 * downstream tree.
 *
 * Mocks (8 — at the cap):
 *   1. @/context/Permission/PermissionContext       (drives the gates)
 *   2. @/components/AccessDenied                    (deny branch sentinel)
 *   3. react-router-dom                             (useNavigate)
 *   4. ./Api/post                                   (4 funcs)
 *   5. ./Api/get                                    (getAttendanceLogs)
 *   6. ../Dashboard/Api/get                         (getNvrNames, getCamerasBasedOnNvr)
 *   7. ./ReusableTablePage                          (don't mount heavy table)
 *   8. ./ActionCameraPreview                        (don't mount preview)
 *
 * Test count: 4 (loading, deny, missing-perm, loading-wins-over-deny).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, act } from "@testing-library/react";
// AttendanceLog.jsx imports `moment-timezone` directly so this defensive
// pre-import (matching the AccessLog spec) is technically not required,
// but keeping it ensures `moment.tz.guess()` resolves even if the import
// graph regresses.
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
  getchannels: vi.fn().mockResolvedValue({ data: { body: { data: [] } } }),
  getNVRs: vi.fn().mockResolvedValue({ data: { body: { data: [] } } }),
  getEmployeeLocations: vi.fn().mockResolvedValue({ data: { body: { data: { locations: [] } } } }),
}));

vi.mock("../../../../../src/page/user/EmployeeLogs/Api/get", () => ({
  getAttendanceLogs: vi.fn().mockResolvedValue({ data: { body: { data: {} } } }),
}));

vi.mock("../../../../../src/page/user/Dashboard/Api/get", () => ({
  getNvrNames: vi.fn().mockResolvedValue({ data: { body: { data: [] } } }),
  getCamerasBasedOnNvr: vi.fn().mockResolvedValue({ data: { body: { data: [] } } }),
}));

// Children that AttendanceLog only mounts on the canView=true branch — stub
// so they never accidentally hit a real DOM mount if the gate logic
// regresses.
vi.mock("../../../../../src/page/user/EmployeeLogs/ReusableTablePage", () => ({
  default: () => <div data-testid="rtp">rtp</div>,
}));

vi.mock("../../../../../src/page/user/EmployeeLogs/ActionCameraPreview", () => ({
  default: () => <div data-testid="action-preview" />,
}));

const { default: AttendanceLog } = await import(
  "../../../../../src/page/user/EmployeeLogs/AttendanceLog.jsx"
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

describe("AttendanceLog page — Round 95 permission gates", () => {
  it("returns null while permissions are still loading (no AccessDenied, no table)", async () => {
    permissionsRef.value = { permissions: null, loading: true };

    const { container } = render(<AttendanceLog />);
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
          attendanceLogs: { view: false },
        },
      },
      loading: false,
    };

    render(<AttendanceLog />);
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

    render(<AttendanceLog />);
    await flush();

    const denied = screen.getByTestId("access-denied");
    expect(denied).toBeInTheDocument();
    expect(denied.textContent).toMatch(/permission to view Logs/i);
  });

  it("prefers the null-render loading branch over AccessDenied when both gates could match", async () => {
    // permissionsLoading=true short-circuits BEFORE the !canView check —
    // even when attendanceLogs.view is explicitly false, the loading-branch
    // `return null` must take precedence and AccessDenied must stay out
    // of the tree.
    permissionsRef.value = {
      permissions: { logs: { attendanceLogs: { view: false } } },
      loading: true,
    };

    const { container } = render(<AttendanceLog />);
    await flush();

    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("access-denied")).not.toBeInTheDocument();
  });
});
