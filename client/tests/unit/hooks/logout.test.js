/**
 * `logout()` clears cookies + localStorage + sessionStorage but preserves a
 * specific list of keys (theme, grid, the three auto-refresh pairs).
 * `deleteCookie` is mocked so we don't depend on its implementation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const deleteCookie = vi.hoisted(() => vi.fn());
vi.mock("@/components/Auth/IsAuth", () => ({ deleteCookie }));

const { logout } = await import("../../../src/hooks/logout.js");

beforeEach(() => {
  deleteCookie.mockReset();
  localStorage.clear();
  sessionStorage.clear();
  // wipe cookies from a previous test
  document.cookie.split(";").forEach((c) => {
    const name = c.split("=")[0].trim();
    if (name) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    }
  });
});

describe("logout", () => {
  it("clears arbitrary localStorage keys", () => {
    localStorage.setItem("foo", "bar");
    localStorage.setItem("user", JSON.stringify({ id: 1 }));
    logout();
    expect(localStorage.getItem("foo")).toBeNull();
    expect(localStorage.getItem("user")).toBeNull();
  });

  it("preserves isDarkMode + selectedGrid through clear", () => {
    localStorage.setItem("isDarkMode", "true");
    localStorage.setItem("selectedGrid", "2x2");
    localStorage.setItem("temp", "nope");
    logout();
    expect(localStorage.getItem("isDarkMode")).toBe("true");
    expect(localStorage.getItem("selectedGrid")).toBe("2x2");
    expect(localStorage.getItem("temp")).toBeNull();
  });

  it("preserves the three auto-refresh setting pairs", () => {
    localStorage.setItem("attendance_auto_refresh_enabled", "true");
    localStorage.setItem("attendance_auto_refresh_interval", "30");
    localStorage.setItem("access_auto_refresh_enabled", "false");
    localStorage.setItem("access_auto_refresh_interval", "60");
    localStorage.setItem("incidents_auto_refresh", "true");
    localStorage.setItem("incidents_refresh_interval", "15");
    logout();
    expect(localStorage.getItem("attendance_auto_refresh_enabled")).toBe("true");
    expect(localStorage.getItem("attendance_auto_refresh_interval")).toBe("30");
    expect(localStorage.getItem("access_auto_refresh_enabled")).toBe("false");
    expect(localStorage.getItem("access_auto_refresh_interval")).toBe("60");
    expect(localStorage.getItem("incidents_auto_refresh")).toBe("true");
    expect(localStorage.getItem("incidents_refresh_interval")).toBe("15");
  });

  it("clears sessionStorage", () => {
    sessionStorage.setItem("session-key", "session-value");
    logout();
    expect(sessionStorage.getItem("session-key")).toBeNull();
  });

  it("calls deleteCookie with the env-derived cookie name", () => {
    logout();
    expect(deleteCookie).toHaveBeenCalledTimes(1);
    // VITE_ENV picks one of three names; assert the choice is valid.
    expect([
      "dev-access-token",
      "prod-access-token",
      "access-token",
    ]).toContain(deleteCookie.mock.calls[0][0]);
  });
});
