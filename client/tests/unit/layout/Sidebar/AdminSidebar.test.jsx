/**
 * src/layout/Sidebar/AdminSidebar.jsx — desktop side rail shown in the
 * admin/users section. Renders a fixed four-item list:
 *
 *   - User Details  (parent with two children: User Role Detail,
 *     Register your User; expanded by default)
 *   - Role & Permission  (leaf -> /roles-permissions)
 *   - Locations          (leaf -> /locations)
 *   - Departments        (leaf -> /departments)
 *
 * Behaviour we pin:
 *   1. All four parent labels render on mount; the User Details branch
 *      auto-expands so its two child labels are visible too.
 *   2. Clicking a leaf item calls navigate(item.route).
 *   3. Clicking the User Details parent does NOT navigate; it just
 *      toggles the expansion state (children disappear after the click).
 *      Clicking again brings them back.
 *   4. The item matching the current pathname picks up the active
 *      background class (`bg-[#E3F5FF]`).
 *   5. When the pathname matches one of a parent's child routes, the
 *      parent ALSO picks up the active class (isChildActive lift).
 *   6. Clicking a child item navigates to the child's route (and not
 *      the parent's).
 *   7. The hidden AddNVRForm import is mocked out — it never renders
 *      because showNVRForm starts false and there's no trigger inside
 *      this component that flips it. Pinning that keeps the giant
 *      Nvrform import chain (Formik + Yup + Streams Api) out of the
 *      test graph.
 *
 * Mocks (2):
 *   - ../../page/user/Streams/Nvrform → stubbed default export so the
 *     module never pulls in the real Formik + Yup + Streams Api graph
 *     even on import.
 *   - react-router-dom → useNavigate spy + real useLocation/MemoryRouter
 *     so pathname-driven assertions stay realistic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Stub the giant Nvrform module — AdminSidebar imports it eagerly even
// though it's only rendered when showNVRForm is true. Without this stub
// the test would have to resolve Formik + Yup + Streams Api wrappers.
vi.mock("../../../../src/page/user/Streams/Nvrform", () => ({
  default: () => null,
}));

const navigateSpy = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigateSpy };
});

const { default: AdminSidebar } = await import(
  "../../../../src/layout/Sidebar/AdminSidebar.jsx"
);

function renderAt(pathname) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <AdminSidebar />
    </MemoryRouter>
  );
}

describe("layout/Sidebar/AdminSidebar", () => {
  beforeEach(() => {
    navigateSpy.mockClear();
  });

  it("renders all four parent labels and the User Details children on mount", () => {
    // Default expandedItems state pre-opens the User Details branch.
    renderAt("/roles-permissions");
    expect(screen.getByText("User Details")).toBeInTheDocument();
    expect(screen.getByText("Role & Permission")).toBeInTheDocument();
    expect(screen.getByText("Locations")).toBeInTheDocument();
    expect(screen.getByText("Departments")).toBeInTheDocument();
    // Auto-expanded children:
    expect(screen.getByText("User Role Detail")).toBeInTheDocument();
    expect(screen.getByText("Register your User")).toBeInTheDocument();
  });

  it("clicking a leaf item navigates to its route", () => {
    renderAt("/roles-permissions");
    fireEvent.click(screen.getByText("Locations"));
    expect(navigateSpy).toHaveBeenCalledWith("/locations");
    fireEvent.click(screen.getByText("Departments"));
    expect(navigateSpy).toHaveBeenCalledWith("/departments");
    fireEvent.click(screen.getByText("Role & Permission"));
    expect(navigateSpy).toHaveBeenCalledWith("/roles-permissions");
  });

  it("clicking the User Details parent toggles expansion without navigating", () => {
    renderAt("/roles-permissions");
    // Initially expanded.
    expect(screen.getByText("User Role Detail")).toBeInTheDocument();
    // First click -> collapse.
    fireEvent.click(screen.getByText("User Details"));
    expect(screen.queryByText("User Role Detail")).not.toBeInTheDocument();
    expect(screen.queryByText("Register your User")).not.toBeInTheDocument();
    // Parent-toggle must NOT trigger a navigate.
    expect(navigateSpy).not.toHaveBeenCalled();
    // Second click -> re-expand.
    fireEvent.click(screen.getByText("User Details"));
    expect(screen.getByText("User Role Detail")).toBeInTheDocument();
    expect(screen.getByText("Register your User")).toBeInTheDocument();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("applies the active background class to the leaf matching the pathname", () => {
    renderAt("/locations");
    const locationsRow = screen.getByText("Locations").closest(
      "div.flex.cursor-pointer"
    );
    expect(locationsRow.className).toContain("bg-[#E3F5FF]");
    // Other leaves stay inactive.
    const deptsRow = screen.getByText("Departments").closest(
      "div.flex.cursor-pointer"
    );
    expect(deptsRow.className).not.toContain("bg-[#E3F5FF]");
  });

  it("lifts the active background to the parent when a child route matches the pathname", () => {
    renderAt("/register-users");
    // Parent row picks up the highlight because one of its children's
    // routes matches the pathname.
    const parentRow = screen.getByText("User Details").closest(
      "div.flex.cursor-pointer"
    );
    expect(parentRow.className).toContain("bg-[#E3F5FF]");
    // And the specific child row itself is highlighted via its own
    // isChildActive branch.
    const childRow = screen.getByText("Register your User").closest("div");
    expect(childRow.className).toContain("bg-[#E3F5FF]");
  });

  it("clicking a child item navigates to the child route (not the parent's)", () => {
    renderAt("/roles-permissions");
    fireEvent.click(screen.getByText("User Role Detail"));
    expect(navigateSpy).toHaveBeenCalledTimes(1);
    expect(navigateSpy).toHaveBeenCalledWith("/user-details");
    fireEvent.click(screen.getByText("Register your User"));
    expect(navigateSpy).toHaveBeenCalledTimes(2);
    expect(navigateSpy).toHaveBeenLastCalledWith("/register-users");
  });
});
