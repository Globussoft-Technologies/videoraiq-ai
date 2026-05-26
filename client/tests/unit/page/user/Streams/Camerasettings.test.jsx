/**
 * Round 84: cover Streams/Camerasettings.jsx — the top-level Camera
 * Settings page mounted from the NVR row "manage cameras" action.
 *
 * The full page is heavy (TanStack-table render of cameras, AddNVRForm,
 * DeleteConfirmation, alias popover with department multi-select,
 * getCameraDetailsById / getHeaderCamersList / requestCameraRefresh /
 * getDepartmentList / createCameraAliasName Api modules, decrypt helper,
 * LiveViewModal with the useHlsPlayer chain), but the permission gates
 * at the top of the component short-circuit the render long before any
 * of those hooks execute:
 *
 *   if (permissionsLoading) return <PageLoader />;
 *   if (!canViewNVR)        return <AccessDenied message="…" />;
 *
 * This spec pins exactly those two branches so the page entry point is
 * exercised without standing up the heavy downstream surface. Only the
 * PermissionContext / AccessDenied / PageLoader mocks are strictly
 * required because no further code path runs. react-router-dom and the
 * Streams Api/get module are also stubbed at the import boundary so the
 * file loads cleanly in jsdom.
 *
 * Mock budget: 5 (PermissionContext, AccessDenied, PageLoader,
 * react-router-dom, Streams Api/get).
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

// react-router-dom hooks are read inside the component body (after the
// gates), but the call sites are still bound at module-import time so we
// keep them as no-op stubs to avoid jsdom Router setup.
vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ state: null, pathname: "/" }),
}));

// The Streams Api/get module is imported at module-load and includes
// axios + getAccessToken; stub the three named exports to vi.fn so
// nothing real fires.
vi.mock("@/page/user/Streams/Api/get", () => ({
  getCameraDetailsById: vi.fn(),
  getHeaderCamersList: vi.fn(),
  requestCameraRefresh: vi.fn(),
}));

import CameraSettings from "../../../../../src/page/user/Streams/Camerasettings.jsx";

beforeEach(() => {
  permissionsRef.value = null;
});

describe("Camerasettings page — Round 84 permission gates", () => {
  it("renders PageLoader while permissions are still loading", () => {
    permissionsRef.value = {
      permissions: null,
      loading: true,
    };
    render(<CameraSettings />);

    expect(screen.getByTestId("page-loader")).toBeInTheDocument();
    expect(screen.queryByTestId("access-denied")).not.toBeInTheDocument();
  });

  it("renders AccessDenied with the NVR-specific message when canViewNVR is false", () => {
    permissionsRef.value = {
      permissions: {
        NVR: { view: false, create: false },
        channels: { view: false, create: false, edit: false, delete: false },
      },
      loading: false,
    };
    render(<CameraSettings />);

    const denied = screen.getByTestId("access-denied");
    expect(denied).toBeInTheDocument();
    expect(denied.textContent).toMatch(/permission to view NVR/i);
    expect(screen.queryByTestId("page-loader")).not.toBeInTheDocument();
  });

  it("renders AccessDenied with the NVR-specific message when permissions object is missing NVR entirely", () => {
    permissionsRef.value = {
      permissions: {},
      loading: false,
    };
    render(<CameraSettings />);

    // permissions?.NVR?.view -> undefined -> !canViewNVR truthy ->
    // AccessDenied branch.
    const denied = screen.getByTestId("access-denied");
    expect(denied).toBeInTheDocument();
    expect(denied.textContent).toMatch(/permission to view NVR/i);
  });
});
