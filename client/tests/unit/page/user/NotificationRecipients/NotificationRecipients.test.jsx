/**
 * Round 66: cover NotificationRecipients/NotificationRecipients.jsx —
 * the top-level Notification Recipients listing page.
 *
 * The full page is heavy (RecipientList + AddRecipientModal + popover
 * filter chip + getRecipients / getDetectionTypes / resendMailOrSMS
 * Api modules + useDebounce + react-router useNavigate + AuthContext +
 * sonner toasts), but the permission gates at the top of the component
 * short-circuit the render long before any of those hooks execute:
 *
 *   if (permissionsLoading) return <PageLoader />;
 *   if (!canView)           return <AccessDenied message="…" />;
 *
 * We pin exactly those two branches so the entry-point of the page is
 * covered without needing to mock the downstream surface.
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

import NotificationRecipients from "../../../../../src/page/user/NotificationRecipients/NotificationRecipients.jsx";

beforeEach(() => {
  permissionsRef.value = null;
});

describe("NotificationRecipients page — permission gates", () => {
  it("renders PageLoader while permissions are still loading", () => {
    permissionsRef.value = { permissions: null, loading: true };
    render(<NotificationRecipients />);
    expect(screen.getByTestId("page-loader")).toBeInTheDocument();
    expect(screen.queryByTestId("access-denied")).not.toBeInTheDocument();
  });

  it("renders AccessDenied with the Recipients-specific message when canView is false", () => {
    permissionsRef.value = {
      permissions: {
        recipients: { view: false, create: false, edit: false, delete: false },
      },
      loading: false,
    };
    render(<NotificationRecipients />);
    const denied = screen.getByTestId("access-denied");
    expect(denied).toBeInTheDocument();
    expect(denied.textContent).toMatch(/permission to view Recipients/i);
    expect(screen.queryByTestId("page-loader")).not.toBeInTheDocument();
  });
});
