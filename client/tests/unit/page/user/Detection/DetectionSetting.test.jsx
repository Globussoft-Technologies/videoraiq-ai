/**
 * Round 92: cover Detection/DetectionSetting.jsx — the top-level Detection
 * Settings listing page (distinct from DetectionSettingsModal R45,
 * Innersettings R78, and SavedConfiguration R79). Mounted under
 * /detection-settings as the parent of the per-channel detection-management
 * table.
 *
 * The full page is heavy (TanStack-table channels, AddNVRForm popover,
 * NVR/Camera Selects, three Detection/Api modules + a Streams/Api/patch
 * call, Pagination, DeleteConfirmation, Monitorcog popover, Tooltip
 * tooltips for every action, six setIsXxxLoading flags, etc.), but the
 * permission gates at the very top of the component short-circuit the
 * render long before any of those hooks execute:
 *
 *   const { permissions, loading: permissionsLoading } = usePermissions();
 *   const canView = permissions?.detectionSettings?.view;
 *   if (permissionsLoading) return <PageLoader />;
 *   if (!canView) {
 *     return (
 *       <AccessDenied message="You don't have permission to view Detections." />
 *     );
 *   }
 *
 * We pin both early-return arms — that's the entire reachable surface for
 * a non-detection-settings user. The arms run before any useState /
 * useEffect calls, so no fetch / no chart / no react-router consumer is
 * exercised. Following the R64 / R65 / R66 / R85 pattern.
 *
 * Mock budget: 4 (PermissionContext, AccessDenied, PageLoader, react-router-dom).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
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

// useNavigate is only invoked inside the component body, after the gates
// short-circuit; the import-time react-router pull still needs a passthrough
// so DetectionSetting.jsx's `import { useNavigate } from 'react-router-dom'`
// resolves under jsdom without dragging the full Router context in.
vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

import DetectionSetting from "../../../../../src/page/user/Detection/DetectionSetting.jsx";

beforeEach(() => {
  permissionsRef.value = null;
});

describe("DetectionSetting page — Round 92 permission gates", () => {
  it("renders PageLoader while permissions are still loading", () => {
    permissionsRef.value = { permissions: null, loading: true };

    render(<DetectionSetting />);

    expect(screen.getByTestId("page-loader")).toBeInTheDocument();
    // The access-denied / heavy table chrome must not be in the tree yet.
    expect(screen.queryByTestId("access-denied")).not.toBeInTheDocument();
  });

  it("renders AccessDenied with the detections-specific message when canView is false", () => {
    permissionsRef.value = {
      permissions: {
        detectionSettings: {
          view: false,
          create: false,
          edit: false,
          delete: false,
        },
      },
      loading: false,
    };

    render(<DetectionSetting />);

    const denied = screen.getByTestId("access-denied");
    expect(denied).toBeInTheDocument();
    expect(denied.textContent).toMatch(/permission to view Detections/i);
    expect(screen.queryByTestId("page-loader")).not.toBeInTheDocument();
  });

  it("renders AccessDenied when the permissions object is missing the detectionSettings entry entirely", () => {
    permissionsRef.value = {
      permissions: {},
      loading: false,
    };

    render(<DetectionSetting />);

    // permissions?.detectionSettings?.view -> undefined -> !canView truthy
    // -> AccessDenied branch.
    const denied = screen.getByTestId("access-denied");
    expect(denied).toBeInTheDocument();
    expect(denied.textContent).toMatch(/permission to view Detections/i);
  });

  it("prefers PageLoader over AccessDenied when both gates could match (loading wins)", () => {
    // permissionsLoading=true short-circuits BEFORE !canView. So even when
    // canView is explicitly false, the loader must render and AccessDenied
    // must stay out of the tree.
    permissionsRef.value = {
      permissions: { detectionSettings: { view: false } },
      loading: true,
    };

    render(<DetectionSetting />);

    expect(screen.getByTestId("page-loader")).toBeInTheDocument();
    expect(screen.queryByTestId("access-denied")).not.toBeInTheDocument();
  });
});
