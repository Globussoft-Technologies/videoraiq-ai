/**
 * Round 95: cover EmployeeLogs/ANPRLogs.jsx — the top-level
 * "ANPR Logs" (Automatic Number Plate Recognition) page mounted under
 * /logs/ANPR. The full page is heavy (ReusableTablePage tree,
 * AutoRefreshComponent, axios direct call to
 * /api/v1/incidents/logs/vehicle-detection, Api/post getNVRs / getchannels,
 * jsPDF + autotable + xlsx export, sonner toasts, DateRangePicker, several
 * useEffects firing at mount + on every filter change), but the
 * permission gates near the bottom of the component short-circuit before
 * the downstream JSX (the heavy ReusableTablePage tree) mounts:
 *
 *   const { permissions, loading: permissionsLoading } = usePermissions();
 *   const resolveLogPerm = (action) => {
 *     const logs = permissions?.logs;
 *     if (!logs) return false;
 *     if (typeof logs.ANPRLogs?.[action] === 'boolean') return logs.ANPRLogs[action];
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
 * Mirrors the AccessLog (R94) and AttendanceLog (R95) approach: mock the
 * API + heavy children so the gates can be observed in isolation.
 *
 * Mocks (7 — under the 8-cap):
 *   1. @/context/Permission/PermissionContext       (drives the gates)
 *   2. @/components/AccessDenied                    (deny branch sentinel)
 *   3. react-router-dom                             (useNavigate)
 *   4. ./Api/post                                   (getNVRs, getchannels)
 *   5. axios                                        (direct vehicle-detection GET)
 *   6. @/utils/getAccessToken                       (returns a stub token)
 *   7. ./ReusableTablePage                          (don't mount heavy table)
 *
 * Test count: 4 (loading, deny, missing-perm, loading-wins-over-deny).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, act } from "@testing-library/react";
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
  getNVRs: vi.fn().mockResolvedValue({ data: { body: { data: [] } } }),
  getchannels: vi.fn().mockResolvedValue({ data: { body: { data: [] } } }),
}));

vi.mock("axios", () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { body: { data: { data: [] } } } }),
    post: vi.fn().mockResolvedValue({ data: { body: { data: {} } } }),
  },
}));

vi.mock("@/utils/getAccessToken", () => ({
  default: () => "test-token",
}));

// ReusableTablePage only mounts on the canView=true branch — stub so it
// never accidentally hits a real DOM mount if the gate logic regresses.
vi.mock("../../../../../src/page/user/EmployeeLogs/ReusableTablePage", () => ({
  default: () => <div data-testid="rtp">rtp</div>,
}));

const { default: ANPRLogs } = await import(
  "../../../../../src/page/user/EmployeeLogs/ANPRLogs.jsx"
);

beforeEach(() => {
  permissionsRef.value = null;
});

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe("ANPRLogs page — Round 95 permission gates", () => {
  it("returns null while permissions are still loading (no AccessDenied, no table)", async () => {
    permissionsRef.value = { permissions: null, loading: true };

    const { container } = render(<ANPRLogs />);
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
          ANPRLogs: { view: false },
        },
      },
      loading: false,
    };

    render(<ANPRLogs />);
    await flush();

    const denied = screen.getByTestId("access-denied");
    expect(denied).toBeInTheDocument();
    expect(denied.textContent).toMatch(/permission to view Logs/i);
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

    render(<ANPRLogs />);
    await flush();

    const denied = screen.getByTestId("access-denied");
    expect(denied).toBeInTheDocument();
    expect(denied.textContent).toMatch(/permission to view Logs/i);
  });

  it("prefers the null-render loading branch over AccessDenied when both gates could match", async () => {
    // permissionsLoading=true short-circuits BEFORE the !canView check —
    // even when ANPRLogs.view is explicitly false, the loading-branch
    // `return null` must take precedence and AccessDenied must stay out
    // of the tree.
    permissionsRef.value = {
      permissions: { logs: { ANPRLogs: { view: false } } },
      loading: true,
    };

    const { container } = render(<ANPRLogs />);
    await flush();

    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("access-denied")).not.toBeInTheDocument();
  });
});
