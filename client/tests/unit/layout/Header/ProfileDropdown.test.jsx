/**
 * src/layout/Header/ProfileDropdown.jsx — the avatar button + dropdown panel
 * rendered in the top-right of the header. Pure presentational component
 * driven by props:
 *   - user: { name_f, name_l, user_email, memberId? }
 *   - handleLogout: () => void
 *   - profileDrop: boolean (open/closed state lives in the parent)
 *   - setProfileDrop: (next | (prev) => next) => void
 *
 * Behaviour under test:
 *   1. closed state (profileDrop=false) renders ONLY the avatar button, not
 *      the dropdown panel.
 *   2. open state (profileDrop=true) renders the user's name + email + the
 *      Profile NavLink + the Logout button (memberId absent path).
 *   3. clicking the avatar button calls setProfileDrop with the functional
 *      toggle updater (prev => !prev).
 *   4. clicking the Logout button invokes the handleLogout prop.
 *   5. memberId truthy path SUPPRESSES the Profile NavLink (the "if
 *      (!user.memberId)" branch).
 *   6. avatar src encodes name_f + name_l from the user object (the seed
 *      string is built off user fields via encodeURIComponent).
 *   7. clicking outside the dropdown (mousedown on document) closes it via
 *      setProfileDrop(false) — the click-outside effect path.
 *   8. clicking inside the dropdown panel itself does NOT call
 *      setProfileDrop (the contains() guard).
 *
 * Mocks (0 vi.mock calls): the component uses NavLink which is satisfied by
 * the real react-router MemoryRouter. No need to stub the Avatars constant.
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ProfileDropdown from "../../../../src/layout/Header/ProfileDropdown.jsx";

const baseUser = {
  name_f: "Jane",
  name_l: "Doe",
  user_email: "jane.doe@example.com",
};

function renderWith({ user = baseUser, profileDrop = false, handleLogout = vi.fn(), setProfileDrop = vi.fn() } = {}) {
  const utils = render(
    <MemoryRouter>
      <ProfileDropdown
        user={user}
        profileDrop={profileDrop}
        handleLogout={handleLogout}
        setProfileDrop={setProfileDrop}
      />
    </MemoryRouter>
  );
  return { ...utils, handleLogout, setProfileDrop };
}

describe("layout/Header/ProfileDropdown", () => {
  it("renders only the avatar button when profileDrop=false (panel hidden)", () => {
    renderWith({ profileDrop: false });
    // No NavLink / Logout when closed
    expect(screen.queryByRole("link", { name: /Profile/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Logout/i })).toBeNull();
    // Avatar img is always present
    expect(screen.getAllByAltText("User Avatar").length).toBeGreaterThan(0);
  });

  it("renders user name, email, Profile NavLink, and Logout button when profileDrop=true (no memberId)", () => {
    renderWith({ profileDrop: true });
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("jane.doe@example.com")).toBeInTheDocument();
    const profileLink = screen.getByRole("link", { name: /Profile/i });
    expect(profileLink).toBeInTheDocument();
    // href ends with /profile (VITE_FRONTEND prefix may be empty in test env)
    expect(profileLink.getAttribute("href")).toMatch(/\/profile$/);
    expect(screen.getByRole("button", { name: /Logout/i })).toBeInTheDocument();
  });

  it("clicking the avatar button calls setProfileDrop with the functional toggle updater", () => {
    const setProfileDrop = vi.fn();
    const { container } = renderWith({ profileDrop: false, setProfileDrop });
    // The avatar button is the first div with onClick — find by its image
    const avatarImg = screen.getAllByAltText("User Avatar")[0];
    const avatarBtn = avatarImg.parentElement;
    fireEvent.click(avatarBtn);
    expect(setProfileDrop).toHaveBeenCalledTimes(1);
    // The arg is a function (prev) => !prev. Verify shape and behavior.
    const updater = setProfileDrop.mock.calls[0][0];
    expect(typeof updater).toBe("function");
    expect(updater(false)).toBe(true);
    expect(updater(true)).toBe(false);
  });

  it("clicking the Logout button invokes the handleLogout prop", () => {
    const handleLogout = vi.fn();
    renderWith({ profileDrop: true, handleLogout });
    fireEvent.click(screen.getByRole("button", { name: /Logout/i }));
    expect(handleLogout).toHaveBeenCalledTimes(1);
  });

  it("memberId truthy on user SUPPRESSES the Profile NavLink (the !user.memberId gate)", () => {
    renderWith({
      profileDrop: true,
      user: { ...baseUser, memberId: "m-42" },
    });
    // Logout button still renders
    expect(screen.getByRole("button", { name: /Logout/i })).toBeInTheDocument();
    // But Profile NavLink does NOT render
    expect(screen.queryByRole("link", { name: /Profile/i })).toBeNull();
  });

  it("avatar src encodes name_f+name_l via encodeURIComponent (the dicebear seed)", () => {
    renderWith({
      profileDrop: false,
      user: { name_f: "Sam P", name_l: "O'Neil", user_email: "s@x.io" },
    });
    const avatarImg = screen.getAllByAltText("User Avatar")[0];
    const src = avatarImg.getAttribute("src");
    expect(src).toContain("api.dicebear.com");
    // encodeURIComponent("Sam P" + "O'Neil") => "Sam%20PO'Neil" (apostrophes kept)
    expect(src).toContain(encodeURIComponent("Sam P" + "O'Neil"));
  });

  it("falls back to user_email when name_l is missing (the ?? chain)", () => {
    renderWith({
      profileDrop: false,
      user: { name_f: "X", user_email: "y@z.com" },
    });
    const avatarImg = screen.getAllByAltText("User Avatar")[0];
    const src = avatarImg.getAttribute("src");
    // Seed becomes encodeURIComponent("X" + "y@z.com")
    expect(src).toContain(encodeURIComponent("X" + "y@z.com"));
  });

  it("mousedown OUTSIDE the dropdown closes it via setProfileDrop(false)", () => {
    const setProfileDrop = vi.fn();
    renderWith({ profileDrop: true, setProfileDrop });

    // A truly outside element appended to document.body
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    fireEvent.mouseDown(outside);

    expect(setProfileDrop).toHaveBeenCalledWith(false);

    document.body.removeChild(outside);
  });

  it("mousedown INSIDE the dropdown panel does NOT call setProfileDrop (contains() guard)", () => {
    const setProfileDrop = vi.fn();
    renderWith({ profileDrop: true, setProfileDrop });

    // The Logout button lives inside the dropdownRef container
    const logoutBtn = screen.getByRole("button", { name: /Logout/i });
    fireEvent.mouseDown(logoutBtn);
    expect(setProfileDrop).not.toHaveBeenCalled();
  });
});
