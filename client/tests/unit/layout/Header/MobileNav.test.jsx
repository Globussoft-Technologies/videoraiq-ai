/**
 * src/layout/Header/MobileNav.jsx — slide-in mobile menu shown from the
 * header on small viewports. Renders:
 *   - a close button (X) wired to setIsOpen(false)
 *   - one NavLink per `navLinks` entry; clicking a link also closes the menu
 *   - one DetectionToggle per `detectionItems` entry, with `enabled` driven
 *     by `detectionStates[item.id]` and a `disabled` flag tied to
 *     permissions.dashboard.edit
 *
 * Visibility is gated by `permissions.dashboard.view` — when the viewer
 * cannot view dashboard, the component returns undefined (renders nothing).
 *
 * Behaviour under test:
 *   1. when `dashboard.view` is false, the component renders nothing.
 *   2. with view permission, the close button, every NavLink, and every
 *      DetectionToggle stub render.
 *   3. clicking the close button invokes setIsOpen(false).
 *   4. clicking a NavLink invokes setIsOpen(false) and the anchor href
 *      matches the supplied `to`.
 *   5. the outer wrapper picks up the `translate-x-0` class when isOpen,
 *      and `translate-x-full` when not.
 *   6. each DetectionToggle receives the merged item (enabled mapped from
 *      detectionStates[id]) and `disabled = !canEdit`; flipping a toggle
 *      forwards to handleToggleChange(id, checked).
 *
 * Mocks (2):
 *   - @/context/Permission/PermissionContext → usePermissions (so we can
 *     control dashboard.view / dashboard.edit per-test).
 *   - @/components/DetectionToggle → tiny presentational stub that exposes
 *     the `item`, `disabled`, and a "toggle" button to drive onChange. This
 *     keeps the test isolated to MobileNav's wiring and avoids the real
 *     Radix Switch + asset import.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const permsRef = vi.hoisted(() => ({ permissions: {} }));
vi.mock("@/context/Permission/PermissionContext", () => ({
  usePermissions: () => permsRef,
}));

vi.mock("@/components/DetectionToggle", () => ({
  default: ({ item, onChange, disabled }) => (
    <div
      data-testid={`detection-toggle-${item.id}`}
      data-enabled={String(!!item.enabled)}
      data-disabled={String(!!disabled)}
    >
      <span>{item.label}</span>
      <button
        type="button"
        onClick={() => onChange(item.id, !item.enabled)}
      >
        toggle-{item.id}
      </button>
    </div>
  ),
}));

const { default: MobileNav } = await import(
  "../../../../src/layout/Header/MobileNav.jsx"
);

function setPerms(view, edit) {
  permsRef.permissions = { dashboard: { view, edit } };
}

const baseNavLinks = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/streams", label: "Streams" },
];

const baseDetectionItems = [
  { id: "motion", label: "Motion", src: "" },
  { id: "people", label: "People", src: "" },
];

function renderNav(overrides = {}) {
  const props = {
    isOpen: true,
    setIsOpen: vi.fn(),
    detectionItems: baseDetectionItems,
    detectionStates: { motion: true, people: false },
    handleToggleChange: vi.fn(),
    navLinks: baseNavLinks,
    ...overrides,
  };
  const utils = render(
    <MemoryRouter initialEntries={["/"]}>
      <MobileNav {...props} />
    </MemoryRouter>
  );
  return { ...utils, props };
}

describe("layout/Header/MobileNav", () => {
  beforeEach(() => {
    setPerms(true, true);
  });

  it("renders nothing when the viewer lacks dashboard.view permission", () => {
    setPerms(false, false);
    const { container } = renderNav();
    // No close button, no nav links, no toggles — the entire panel bails.
    expect(screen.queryByRole("button", { name: /close menu/i })).toBeNull();
    expect(screen.queryByRole("link", { name: "Dashboard" })).toBeNull();
    expect(screen.queryByTestId("detection-toggle-motion")).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it("renders the close button, every NavLink, and every DetectionToggle when permitted", () => {
    renderNav();

    expect(
      screen.getByRole("button", { name: /close menu/i })
    ).toBeInTheDocument();

    const dash = screen.getByRole("link", { name: "Dashboard" });
    const streams = screen.getByRole("link", { name: "Streams" });
    expect(dash).toHaveAttribute("href", "/dashboard");
    expect(streams).toHaveAttribute("href", "/streams");
    expect(screen.getAllByRole("link")).toHaveLength(baseNavLinks.length);

    expect(screen.getByTestId("detection-toggle-motion")).toBeInTheDocument();
    expect(screen.getByTestId("detection-toggle-people")).toBeInTheDocument();
  });

  it("clicking the X close button invokes setIsOpen(false)", () => {
    const { props } = renderNav();
    fireEvent.click(screen.getByRole("button", { name: /close menu/i }));
    expect(props.setIsOpen).toHaveBeenCalledTimes(1);
    expect(props.setIsOpen).toHaveBeenCalledWith(false);
  });

  it("clicking a NavLink also closes the menu via setIsOpen(false)", () => {
    const { props } = renderNav();
    fireEvent.click(screen.getByRole("link", { name: "Streams" }));
    expect(props.setIsOpen).toHaveBeenCalledWith(false);
  });

  it("wrapper uses translate-x-0 when open and translate-x-full when closed", () => {
    const { container, rerender } = renderNav({ isOpen: true });
    const panel = container.querySelector("div.fixed.top-0.right-0");
    expect(panel).not.toBeNull();
    expect(panel.className).toContain("translate-x-0");
    expect(panel.className).not.toContain("translate-x-full");

    rerender(
      <MemoryRouter initialEntries={["/"]}>
        <MobileNav
          isOpen={false}
          setIsOpen={vi.fn()}
          detectionItems={baseDetectionItems}
          detectionStates={{ motion: true, people: false }}
          handleToggleChange={vi.fn()}
          navLinks={baseNavLinks}
        />
      </MemoryRouter>
    );
    const panel2 = container.querySelector("div.fixed.top-0.right-0");
    expect(panel2.className).toContain("translate-x-full");
    expect(panel2.className).not.toContain("translate-x-0");
  });

  it("forwards detectionStates into each toggle's enabled flag and disables when !canEdit", () => {
    setPerms(true, false);
    const { props } = renderNav();

    const motion = screen.getByTestId("detection-toggle-motion");
    const people = screen.getByTestId("detection-toggle-people");
    expect(motion.dataset.enabled).toBe("true");
    expect(people.dataset.enabled).toBe("false");
    // canEdit=false -> disabled=true on every toggle
    expect(motion.dataset.disabled).toBe("true");
    expect(people.dataset.disabled).toBe("true");

    // Driving the stub's onChange should bubble straight through to the
    // handleToggleChange prop with (id, nextChecked).
    fireEvent.click(screen.getByRole("button", { name: "toggle-motion" }));
    expect(props.handleToggleChange).toHaveBeenCalledWith("motion", false);

    fireEvent.click(screen.getByRole("button", { name: "toggle-people" }));
    expect(props.handleToggleChange).toHaveBeenCalledWith("people", true);
  });
});
