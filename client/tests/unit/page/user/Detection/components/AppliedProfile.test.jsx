/**
 * src/page/user/Detection/components/AppliedProfile.jsx — small card that
 * either:
 *   - shows a CTA "Apply a Profile" button when no profile is applied yet, OR
 *   - shows the applied profile summary (name / createdBy / createdAt /
 *     status / updatedAt) plus an optional "Apply New" button gated on
 *     `permissions?.detectionSettings?.edit === true`.
 *
 * Mocks (2):
 *   1. @/page/user/Detection/components/InnerSettingsContext → useInnerSettings
 *   2. @/context/Permission/PermissionContext → usePermissions
 *
 * We exercise both render branches plus the edit-permission branch and the
 * date formatting path (moment.format('L') uses the real library).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const innerRef = vi.hoisted(() => ({
  appliedProfileData: null,
  onOpenProfileDialog: vi.fn(),
}));
vi.mock(
  "@/page/user/Detection/components/InnerSettingsContext",
  () => ({
    useInnerSettings: () => innerRef,
    InnerSettingsProvider: ({ children }) => children,
  })
);

const permsRef = vi.hoisted(() => ({ permissions: {} }));
vi.mock("@/context/Permission/PermissionContext", () => ({
  usePermissions: () => permsRef,
}));

const { default: AppliedProfile } = await import(
  "../../../../../../src/page/user/Detection/components/AppliedProfile.jsx"
);

function setInner(data, openSpy = vi.fn()) {
  innerRef.appliedProfileData = data;
  innerRef.onOpenProfileDialog = openSpy;
  return openSpy;
}

function setPerms(p) {
  permsRef.permissions = p;
}

describe("AppliedProfile", () => {
  it("renders the empty-state CTA when there is no appliedProfileData at all", () => {
    setInner(null);
    setPerms({});
    render(<AppliedProfile />);
    expect(
      screen.getByText(/The detection profile applied to this setting/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Apply a Profile/i })
    ).toBeInTheDocument();
  });

  it("renders the empty-state CTA when appliedProfileData.profile is undefined", () => {
    setInner({ profile: undefined });
    setPerms({});
    render(<AppliedProfile />);
    expect(
      screen.getByRole("button", { name: /Apply a Profile/i })
    ).toBeInTheDocument();
    // The 'Applied Profile' heading must NOT appear in empty state.
    expect(screen.queryByText(/^Applied Profile$/)).not.toBeInTheDocument();
  });

  it("clicking the empty-state CTA calls onOpenProfileDialog", () => {
    const open = vi.fn();
    setInner(null, open);
    setPerms({});
    render(<AppliedProfile />);
    fireEvent.click(screen.getByRole("button", { name: /Apply a Profile/i }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("populated state: renders Name, Created by, Status, and formatted dates", () => {
    setInner({
      profile: {
        basics: { profileName: "Lobby-default" },
        createdBy: { email: "ops@chingari.io" },
        createdAt: "2025-01-15T10:00:00.000Z",
        updatedAt: "2025-04-02T13:45:00.000Z",
        status: "Active",
      },
    });
    setPerms({ detectionSettings: { edit: false } });
    render(<AppliedProfile />);
    expect(screen.getByText("Applied Profile")).toBeInTheDocument();
    expect(screen.getByText("Lobby-default")).toBeInTheDocument();
    expect(screen.getByText("ops@chingari.io")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    // moment.format('L') => MM/DD/YYYY in the default locale. Avoid hard-
    // coding the timezone-shifted day; just assert both dates appear as a
    // slash-format string for their year.
    expect(screen.getAllByText(/\d{2}\/\d{2}\/2025/).length).toBeGreaterThanOrEqual(2);
  });

  it("populated state without edit permission: hides the 'Apply New' button", () => {
    setInner({ profile: { basics: { profileName: "P" } } });
    setPerms({ detectionSettings: { edit: false } });
    render(<AppliedProfile />);
    expect(
      screen.queryByRole("button", { name: /Apply New/i })
    ).not.toBeInTheDocument();
  });

  it("populated state WITH edit permission: shows 'Apply New' and wires it to onOpenProfileDialog", () => {
    const open = vi.fn();
    setInner({ profile: { basics: { profileName: "P" } } }, open);
    setPerms({ detectionSettings: { edit: true } });
    render(<AppliedProfile />);
    const btn = screen.getByRole("button", { name: /Apply New/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("populated state with missing optional fields renders without crashing", () => {
    setInner({
      profile: {
        // no basics / createdBy / status — pure optional-chaining fallback.
      },
    });
    setPerms({ detectionSettings: { edit: true } });
    expect(() => render(<AppliedProfile />)).not.toThrow();
    // The heading still renders.
    expect(screen.getByText("Applied Profile")).toBeInTheDocument();
    // moment(undefined) returns "now" — both date cells render today's date.
    // We don't assert the exact value (timezone-flaky); just confirm the
    // structure (the labels are present).
    expect(screen.getByText("Created At")).toBeInTheDocument();
    expect(screen.getByText("Last Modified")).toBeInTheDocument();
  });

  it("permissions can be entirely absent (undefined) without crashing", () => {
    setInner({ profile: { basics: { profileName: "P" } } });
    permsRef.permissions = undefined;
    expect(() => render(<AppliedProfile />)).not.toThrow();
    // Without permissions, the edit button is gated off.
    expect(
      screen.queryByRole("button", { name: /Apply New/i })
    ).not.toBeInTheDocument();
  });
});
