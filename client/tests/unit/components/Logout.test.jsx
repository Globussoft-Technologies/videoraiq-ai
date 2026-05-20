/**
 * Logout calls the logout() helper, clears the auth user, and redirects.
 * The redirect target depends on VITE_LOCAL_SETUP. Since the test env does
 * NOT set VITE_LOCAL_SETUP to "true", the module-level LOCAL_SETUP is false,
 * meaning the production branch (window.location.href) fires (we don't
 * exercise that here since jsdom's location is not mutable in all envs).
 *
 * We mock the logout() helper and useNavigate, and rely on the real
 * AuthProvider so setUser(null) flows through.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "../../../src/context/AuthContext.jsx";

const logoutMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/hooks/logout", () => ({ logout: logoutMock }));
vi.mock("../../../src/hooks/logout", () => ({ logout: logoutMock }));

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const { default: Logout } = await import(
  "../../../src/components/Auth/Logout.jsx"
);

function UserProbe() {
  const { user } = useAuth();
  return <div data-testid="user">{user === null ? "null" : "set"}</div>;
}

function SeedUser({ initialUser, children }) {
  const { setUser } = useAuth();
  useEffect(() => {
    if (initialUser !== undefined) setUser(initialUser);
  }, []);
  return children;
}

describe("Logout component", () => {
  it("calls the logout helper on mount", async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <Logout />
        </AuthProvider>
      </MemoryRouter>
    );
    await waitFor(() => expect(logoutMock).toHaveBeenCalledTimes(1));
  });

  it("clears the user via setUser(null) after logout resolves", async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <SeedUser initialUser={{ name_f: "Jane" }}>
            <Logout />
            <UserProbe />
          </SeedUser>
        </AuthProvider>
      </MemoryRouter>
    );
    // After Logout effect resolves, the probe should report user = null.
    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("null");
    });
    expect(logoutMock).toHaveBeenCalled();
  });

  it("renders nothing (returns null)", () => {
    const { container } = render(
      <MemoryRouter>
        <AuthProvider>
          <Logout />
        </AuthProvider>
      </MemoryRouter>
    );
    // No DOM nodes inside the AuthProvider — Logout returns null.
    expect(container.querySelector("div")).toBeNull();
  });

  it("does not call navigate in the non-LOCAL_SETUP branch", async () => {
    navigateMock.mockClear();
    render(
      <MemoryRouter>
        <AuthProvider>
          <Logout />
        </AuthProvider>
      </MemoryRouter>
    );
    await waitFor(() => expect(logoutMock).toHaveBeenCalled());
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
