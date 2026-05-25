/**
 * src/layout/Sidebar/SettingsSidebar.jsx — desktop side rail shown in the
 * Settings / Detection Settings section. The base list is a 4-item nav
 * (Profile, Detection Settings, Alert Recipients, Storage Settings) when
 * VITE_DESK_CLIENT is not set, with each item bound to a sibling route in
 * `sidebarRoutes` by array index.
 *
 * The component also lazily renders <AddNVRForm /> when its internal
 * `showNVRForm` state is true — but nothing in the component itself flips
 * that flag, so on a fresh mount the form must NOT be in the DOM. We pin
 * that here so the (potentially heavy) form module is verified to stay
 * dormant.
 *
 * Behaviour we pin:
 *   1. All four labels render on a fresh mount (Profile, Detection
 *      Settings, Alert Recipients, Storage Settings).
 *   2. The item matching the current pathname picks up the active
 *      background class (`bg-[#E3F5FF]`); other items don't.
 *   3. The Detection Settings entry honours its `activePaths` array — at
 *      pathname `/settings/inner` it is the active item even though the
 *      sibling-index route is `/detection-settings`.
 *   4. Clicking each leaf item invokes navigate(sibling-index route).
 *   5. AddNVRForm stays unmounted on first render (the showNVRForm flag
 *      starts false and there is no in-component trigger to flip it).
 *
 * Mocks (3 — at the budget cap of 8):
 *   - ../../page/user/Streams/Nvrform → stubbed default export so the
 *     module never pulls in the real Formik + Yup + Streams Api graph.
 *     The stub renders a sentinel <div data-testid="nvrform-stub" />
 *     when (ever) it gets mounted, so we can assert it stays absent.
 *   - @/components/ui/button → minimal Button passthrough (the real one
 *     is fine but we keep the test self-contained).
 *   - react-router-dom → useNavigate spy + real useLocation/MemoryRouter
 *     so pathname-driven assertions stay realistic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../../../src/page/user/Streams/Nvrform", () => ({
  default: () => <div data-testid="nvrform-stub" />,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}));

const navigateSpy = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigateSpy };
});

const { default: SettingsSidebar } = await import(
  "../../../../src/layout/Sidebar/SettingsSidebar.jsx"
);

function renderAt(pathname) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <SettingsSidebar />
    </MemoryRouter>
  );
}

describe("layout/Sidebar/SettingsSidebar", () => {
  beforeEach(() => {
    navigateSpy.mockClear();
  });

  it("renders all four sidebar labels on mount", () => {
    renderAt("/profile");
    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("Detection Settings")).toBeInTheDocument();
    expect(screen.getByText("Alert Recipients")).toBeInTheDocument();
    expect(screen.getByText("Storage Settings")).toBeInTheDocument();
  });

  it("applies the active background to the item matching the current pathname", () => {
    renderAt("/profile");
    // The Profile label sits inside the active row, so its enclosing row
    // (two levels up from the <span>) should carry the active bg class.
    const profileLabel = screen.getByText("Profile");
    // Walk to the row wrapper (parent of the icon-box + label span).
    const profileRow = profileLabel.closest("div.cursor-pointer");
    expect(profileRow).not.toBeNull();
    expect(profileRow.className).toContain("bg-[#E3F5FF]");

    // A non-matching row should not.
    const recipientsLabel = screen.getByText("Alert Recipients");
    const recipientsRow = recipientsLabel.closest("div.cursor-pointer");
    expect(recipientsRow).not.toBeNull();
    expect(recipientsRow.className).not.toContain("bg-[#E3F5FF]");
  });

  it("uses Detection Settings' activePaths to mark it active at /settings/inner", () => {
    // Detection Settings has activePaths: ['/detection-settings',
    // '/settings/inner']. Its sibling-index route is /detection-settings,
    // so without activePaths the /settings/inner path would not match.
    renderAt("/settings/inner");
    const detectionLabel = screen.getByText("Detection Settings");
    const detectionRow = detectionLabel.closest("div.cursor-pointer");
    expect(detectionRow).not.toBeNull();
    expect(detectionRow.className).toContain("bg-[#E3F5FF]");
  });

  it("clicking each leaf item navigates to its sibling-index route", () => {
    renderAt("/profile");

    fireEvent.click(screen.getByText("Profile"));
    expect(navigateSpy).toHaveBeenLastCalledWith("/profile");

    fireEvent.click(screen.getByText("Detection Settings"));
    expect(navigateSpy).toHaveBeenLastCalledWith("/detection-settings");

    fireEvent.click(screen.getByText("Alert Recipients"));
    expect(navigateSpy).toHaveBeenLastCalledWith("/notification-recipients");

    fireEvent.click(screen.getByText("Storage Settings"));
    expect(navigateSpy).toHaveBeenLastCalledWith("/storage-settings");
  });

  it("does not mount AddNVRForm on first render (showNVRForm starts false)", () => {
    renderAt("/profile");
    expect(screen.queryByTestId("nvrform-stub")).not.toBeInTheDocument();
  });
});
