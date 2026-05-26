/**
 * src/layout/Sidebar/Sidebar.jsx — the main dashboard side rail. It is
 * heavily branched on permissions + pathname + a few UserContext flags:
 *
 *   1. !permissions.dashboard.view  -> returns null (nothing rendered).
 *   2. isSettingsPage (`/settings` or `/detection-settings`) -> null.
 *   3. isLoading -> renders <SidebarSkeleton />.
 *   4. !displayWidgets (pathname !== `/dashboard`) -> renders the empty
 *      Fragment wrapper (no side rail tile).
 *   5. displayWidgets (on `/dashboard`) + sidebarShow=false -> renders
 *      the collapsed icon list (one icon per detectionItem).
 *   6. displayWidgets + sidebarShow=true -> renders the expanded
 *      DetectionToggle list (one toggle per detectionItem).
 *
 * Behaviour we pin:
 *   - View gate: with permissions.dashboard.view falsy the component
 *     returns null (no skeleton even if isLoading is true).
 *   - SettingsPage gate: on `/settings` returns null.
 *   - Loading branch: on `/dashboard` with isLoading=true renders the
 *     skeleton (sentinel testid).
 *   - displayWidgets branch: on `/incidents` (a non-dashboard, non-
 *     settings page) renders nothing visible — the outer Fragment
 *     short-circuits the inner tile via the {displayWidgets && ...}
 *     guard.
 *   - Collapsed rail: on `/dashboard` with sidebarShow=false renders
 *     one collapsed icon per detectionItem (we count by alt-text); the
 *     expanded toggle list is hidden from the accessibility tree via
 *     pointer-events-none / opacity-0 but the icons are present.
 *   - Expanded rail: on `/dashboard` with sidebarShow=true renders one
 *     DetectionToggle per detectionItem (sentinel testid per item).
 *
 * Mocks (6 — within the 8 budget):
 *   - @/context/Permission/PermissionContext (usePermissions)
 *   - @/context/UserContext/Context (the default-export React context;
 *     we use a Provider in renderAt + the real React.useContext)
 *   - @/components/DetectionToggle (sentinel passthrough)
 *   - ./SidebarSkeleton (sentinel)
 *   - @/components/AccessDenied (sentinel — not actually rendered on
 *     any branch, but the import lives at module top so we keep it
 *     stubbed for safety)
 *   - react-router-dom is left REAL via MemoryRouter so the real
 *     useLocation hook drives pathname logic.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";

const permsRef = vi.hoisted(() => ({ permissions: {}, loading: false }));
vi.mock("@/context/Permission/PermissionContext", () => ({
  usePermissions: () => permsRef,
}));

vi.mock("@/components/DetectionToggle", () => ({
  default: ({ item }) => (
    <div data-testid={`detection-toggle-${item.id}`}>{item.label}</div>
  ),
}));

vi.mock("../../../../src/layout/Sidebar/SidebarSkeleton", () => ({
  default: () => <div data-testid="sidebar-skeleton" />,
}));

vi.mock("@/components/AccessDenied", () => ({
  default: () => <div data-testid="access-denied" />,
}));

const { default: Sidebar } = await import(
  "../../../../src/layout/Sidebar/Sidebar.jsx"
);
const { default: UserContext } = await import(
  "../../../../src/context/UserContext/Context.jsx"
);

function renderAt(pathname, { perms, loading = false, ctx } = {}) {
  permsRef.permissions = perms ?? { dashboard: { view: true, edit: true } };
  permsRef.loading = loading;
  const ctxValue = {
    sidebarShow: false,
    setSidebarShow: vi.fn(),
    detectionItems: [],
    detectionStates: {},
    handleDetectionToggle: vi.fn(),
    isLoading: false,
    ...ctx,
  };
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <UserContext.Provider value={ctxValue}>
        <Sidebar />
      </UserContext.Provider>
    </MemoryRouter>
  );
}

describe("layout/Sidebar/Sidebar", () => {
  it("renders nothing when dashboard.view is falsy (view gate)", () => {
    const { container } = renderAt("/dashboard", {
      perms: { dashboard: { view: false } },
    });
    // The whole component should short-circuit to `return null` — the
    // MemoryRouter still wraps an empty root, so the container is empty.
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing on the /settings page (isSettingsPage gate)", () => {
    const { container } = renderAt("/settings");
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing on /detection-settings (isSettingsPage gate)", () => {
    const { container } = renderAt("/detection-settings");
    expect(container.firstChild).toBeNull();
  });

  it("renders the SidebarSkeleton when isLoading is true on /dashboard", () => {
    renderAt("/dashboard", { ctx: { isLoading: true } });
    expect(screen.getByTestId("sidebar-skeleton")).toBeInTheDocument();
  });

  it("renders no inner tile on non-dashboard, non-settings pages (displayWidgets=false)", () => {
    // The component returns an outer Fragment with `{displayWidgets && <div>}`.
    // On /incidents displayWidgets is false, so no inner tile is mounted.
    // The expanded/collapsed toggle list never renders — assert by absence
    // of any detection-toggle-* sentinels and absence of the skeleton.
    renderAt("/incidents", {
      ctx: {
        detectionItems: [{ id: "x", label: "X-Detect", src: "x.png" }],
      },
    });
    expect(screen.queryByTestId("sidebar-skeleton")).not.toBeInTheDocument();
    expect(screen.queryByTestId("detection-toggle-x")).not.toBeInTheDocument();
  });

  it("renders the expanded DetectionToggle list on /dashboard when sidebarShow=true", () => {
    renderAt("/dashboard", {
      ctx: {
        sidebarShow: true,
        detectionItems: [
          { id: "person", label: "Person", src: "p.png" },
          { id: "vehicle", label: "Vehicle", src: "v.png" },
        ],
        detectionStates: { person: true, vehicle: false },
      },
    });
    expect(screen.getByTestId("detection-toggle-person")).toBeInTheDocument();
    expect(screen.getByTestId("detection-toggle-vehicle")).toBeInTheDocument();
  });

  it("renders the collapsed icon list on /dashboard when sidebarShow=false", () => {
    renderAt("/dashboard", {
      ctx: {
        sidebarShow: false,
        detectionItems: [
          { id: "person", label: "Person", src: "p.png" },
          { id: "vehicle", label: "Vehicle", src: "v.png" },
        ],
        detectionStates: { person: false, vehicle: false },
      },
    });
    // Both items are present in BOTH the (hidden) expanded list AND the
    // (visible) collapsed list — so each id sentinel appears once (in the
    // expanded list) and each icon's alt text also appears once (in the
    // collapsed list).
    expect(screen.getByTestId("detection-toggle-person")).toBeInTheDocument();
    expect(screen.getByTestId("detection-toggle-vehicle")).toBeInTheDocument();
    expect(screen.getByAltText("Person")).toBeInTheDocument();
    expect(screen.getByAltText("Vehicle")).toBeInTheDocument();
  });
});
