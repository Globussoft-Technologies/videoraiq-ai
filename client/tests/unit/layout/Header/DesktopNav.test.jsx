/**
 * src/layout/Header/DesktopNav.jsx — pure presentational nav strip used in the
 * desktop header. Takes a `navLinks` array of `{ to, label, activePaths? }`
 * and renders one react-router NavLink per entry. The active styling is
 * driven by:
 *   - the NavLink's own `isActive` flag, OR
 *   - if `activePaths` is provided, by `location.pathname.startsWith(path)`
 *     for any path in that array.
 *
 * Behaviour under test (no mocks needed — we use the real react-router
 * MemoryRouter so NavLink and useLocation light up naturally):
 *   1. renders one link per entry, with the supplied label as text and the
 *      `to` value reflected on the href.
 *   2. an empty navLinks array renders the wrapper <nav> but no links.
 *   3. the link matching the current route picks up the active background
 *      classes (`bg-[#07486a]` + `text-[#fff]`).
 *   4. when `activePaths` is supplied, the link is active for ANY pathname
 *      that startsWith one of those prefixes (even when `to` itself does
 *      not match the current pathname exactly).
 *   5. when neither the NavLink isActive flag nor any activePaths prefix
 *      matches, the link gets the inactive (`text-[#333333]`) classes.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DesktopNav from "../../../../src/layout/Header/DesktopNav.jsx";

function renderAt(pathname, navLinks) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <DesktopNav navLinks={navLinks} />
    </MemoryRouter>
  );
}

describe("layout/Header/DesktopNav", () => {
  it("renders one NavLink per entry with the supplied label + href", () => {
    const links = [
      { to: "/dashboard", label: "Dashboard" },
      { to: "/incidents", label: "Incidents" },
      { to: "/streams", label: "Streams" },
    ];
    renderAt("/dashboard", links);

    const dash = screen.getByRole("link", { name: "Dashboard" });
    const incidents = screen.getByRole("link", { name: "Incidents" });
    const streams = screen.getByRole("link", { name: "Streams" });

    expect(dash).toHaveAttribute("href", "/dashboard");
    expect(incidents).toHaveAttribute("href", "/incidents");
    expect(streams).toHaveAttribute("href", "/streams");
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("renders the <nav> wrapper but no links for an empty navLinks array", () => {
    const { container } = renderAt("/", []);
    const nav = container.querySelector("nav");
    expect(nav).not.toBeNull();
    expect(nav.querySelectorAll("a")).toHaveLength(0);
  });

  it("applies the active background classes to the link matching the current route", () => {
    const links = [
      { to: "/dashboard", label: "Dashboard" },
      { to: "/incidents", label: "Incidents" },
    ];
    renderAt("/dashboard", links);

    const dash = screen.getByRole("link", { name: "Dashboard" });
    const incidents = screen.getByRole("link", { name: "Incidents" });

    expect(dash.className).toContain("bg-[#07486a]");
    expect(dash.className).toContain("text-[#fff]");
    expect(incidents.className).not.toContain("bg-[#07486a]");
    expect(incidents.className).toContain("text-[#333333]");
  });

  it("treats the link as active when current pathname startsWith any activePaths prefix", () => {
    // to=/logs/attendance but the current pathname is a deeper sub-route under
    // /logs — activePaths should still light it up.
    const links = [
      {
        to: "/logs/attendance",
        label: "Logs",
        activePaths: ["/logs", "/audit"],
      },
      { to: "/dashboard", label: "Dashboard" },
    ];
    renderAt("/logs/attendance/2025-05-25", links);

    const logs = screen.getByRole("link", { name: "Logs" });
    const dash = screen.getByRole("link", { name: "Dashboard" });

    expect(logs.className).toContain("bg-[#07486a]");
    expect(logs.className).toContain("text-[#fff]");
    expect(dash.className).not.toContain("bg-[#07486a]");
  });

  it("renders inactive classes when neither isActive nor activePaths match", () => {
    const links = [
      {
        to: "/streams",
        label: "Streams",
        activePaths: ["/streams", "/cameraview"],
      },
    ];
    renderAt("/dashboard", links);

    const streams = screen.getByRole("link", { name: "Streams" });
    expect(streams.className).toContain("text-[#333333]");
    expect(streams.className).not.toContain("bg-[#07486a]");
  });
});
