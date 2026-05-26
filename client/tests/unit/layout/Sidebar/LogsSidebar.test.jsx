/**
 * src/layout/Sidebar/LogsSidebar.jsx — desktop side rail shown in the
 * /logs/* section. The base list (3 items: Attendance / Access / ANPR)
 * is gated by the `logs.<sectionKey>.view` sub-permission, with a few
 * notable behaviours we exercise here:
 *
 *   1. While permissions are still loading, ALL base items render
 *      regardless of permissions content (so the rail doesn't blank
 *      out on initial mount).
 *   2. Once loaded, only items whose `logs[sectionKey].view === true`
 *      survive the filter.
 *   3. With nested log sections present, the legacy flat `logs.view`
 *      fallback is intentionally NOT honoured for the missing sections
 *      (the component must not leak tabs the user wasn't granted).
 *   4. With a purely-flat permissions shape (`logs.view: true`, no
 *      nested sub-section objects), the flat fallback DOES apply, so
 *      every base item renders.
 *   5. When every item is filtered out, the entire rail returns null.
 *   6. The item matching the current pathname picks up the active
 *      background classes (`bg-[#E3F5FF]`).
 *   7. Clicking an item invokes navigate(route).
 *
 * Mocks (2 — plus an asset stub):
 *   - @/context/Permission/PermissionContext → usePermissions
 *   - react-router-dom → useNavigate (spy) + real useLocation/MemoryRouter
 *   - ../../assets/ANPR.png → stubbed string so vite-loader is bypassed
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Asset stub — react-loading-skeleton-style asset bundling is awkward in
// jsdom; we never need the real bytes, just a stable string.
vi.mock("../../../../src/assets/ANPR.png", () => ({ default: "ANPR.png" }));

const permsRef = vi.hoisted(() => ({ permissions: {}, loading: false }));
vi.mock("@/context/Permission/PermissionContext", () => ({
  usePermissions: () => permsRef,
}));

const navigateSpy = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigateSpy };
});

const { default: LogsSidebar } = await import(
  "../../../../src/layout/Sidebar/LogsSidebar.jsx"
);

function setPerms(permissions, loading = false) {
  permsRef.permissions = permissions;
  permsRef.loading = loading;
}

function renderAt(pathname) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <LogsSidebar />
    </MemoryRouter>
  );
}

describe("layout/Sidebar/LogsSidebar", () => {
  beforeEach(() => {
    navigateSpy.mockClear();
    setPerms({}, false);
  });

  it("renders every base item while permissions are still loading", () => {
    // permissionsLoading=true should bypass the per-item filter so the
    // sidebar isn't blank during the initial fetch.
    setPerms({}, true);
    renderAt("/logs/attendance");
    expect(screen.getByText("Attendance Logs")).toBeInTheDocument();
    expect(screen.getByText("Access Logs")).toBeInTheDocument();
    expect(screen.getByText("ANPR Logs")).toBeInTheDocument();
  });

  it("filters items by their per-section logs.<key>.view flag", () => {
    setPerms({
      logs: {
        attendanceLogs: { view: true },
        accessLogs: { view: false },
        ANPRLogs: { view: true },
      },
    });
    renderAt("/logs/attendance");
    expect(screen.getByText("Attendance Logs")).toBeInTheDocument();
    expect(screen.queryByText("Access Logs")).not.toBeInTheDocument();
    expect(screen.getByText("ANPR Logs")).toBeInTheDocument();
  });

  it("does NOT fall back to flat logs.view when nested sections exist", () => {
    // Mixed shape — one nested section is granted, no others. The flat
    // logs.view=true must NOT leak the missing sections.
    setPerms({
      logs: {
        view: true,
        attendanceLogs: { view: true },
      },
    });
    renderAt("/logs/attendance");
    expect(screen.getByText("Attendance Logs")).toBeInTheDocument();
    expect(screen.queryByText("Access Logs")).not.toBeInTheDocument();
    expect(screen.queryByText("ANPR Logs")).not.toBeInTheDocument();
  });

  it("honours the legacy flat logs.view=true when no nested sections exist", () => {
    setPerms({ logs: { view: true } });
    renderAt("/logs/attendance");
    expect(screen.getByText("Attendance Logs")).toBeInTheDocument();
    expect(screen.getByText("Access Logs")).toBeInTheDocument();
    expect(screen.getByText("ANPR Logs")).toBeInTheDocument();
  });

  it("returns null (no rail) when every item is filtered out", () => {
    setPerms({ logs: {} });
    const { container } = renderAt("/logs/attendance");
    // No items -> the entire outer <div> short-circuits, so there should
    // be no rendered text and no rail container.
    expect(screen.queryByText("Attendance Logs")).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it("applies the active-background class to the item matching the current pathname", () => {
    setPerms({ logs: { view: true } });
    renderAt("/logs/access");
    const access = screen.getByText("Access Logs");
    const accessRow = access.closest("div.flex.cursor-pointer");
    expect(accessRow.className).toContain("bg-[#E3F5FF]");
    const attendance = screen.getByText("Attendance Logs");
    const attendanceRow = attendance.closest("div.flex.cursor-pointer");
    expect(attendanceRow.className).not.toContain("bg-[#E3F5FF]");
  });

  it("navigates to the item's route when clicked", () => {
    setPerms({ logs: { view: true } });
    renderAt("/logs/attendance");
    fireEvent.click(screen.getByText("ANPR Logs"));
    expect(navigateSpy).toHaveBeenCalledWith("/logs/ANPR");
  });
});
