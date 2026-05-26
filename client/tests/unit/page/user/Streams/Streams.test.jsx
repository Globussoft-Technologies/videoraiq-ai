/**
 * Round 65: cover Streams/Streams.jsx — the top-level NVR Settings
 * listing page.
 *
 * The full page is heavy (StreamHeader + AddNVRForm + Nvrsettings /
 * NvrLocalsettings + a skeleton loader + getAllNvrDetails / deleteNVR
 * Api modules + sonner toasts + react-loading-skeleton), but the
 * permission gates at the top of the component short-circuit the render
 * long before any of those hooks execute:
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

import Streams from "../../../../../src/page/user/Streams/Streams.jsx";

beforeEach(() => {
  permissionsRef.value = null;
});

describe("Streams page — permission gates", () => {
  it("renders PageLoader while permissions are still loading", () => {
    permissionsRef.value = { permissions: null, loading: true };
    render(<Streams />);
    expect(screen.getByTestId("page-loader")).toBeInTheDocument();
    // Access-denied / page chrome must not be in the tree yet
    expect(screen.queryByTestId("access-denied")).not.toBeInTheDocument();
  });

  it("renders AccessDenied with the NVR-specific message when canView is false", () => {
    permissionsRef.value = {
      permissions: { NVR: { view: false, create: false } },
      loading: false,
    };
    render(<Streams />);
    const denied = screen.getByTestId("access-denied");
    expect(denied).toBeInTheDocument();
    expect(denied.textContent).toMatch(/permission to view NVR/i);
    expect(screen.queryByTestId("page-loader")).not.toBeInTheDocument();
  });
});
