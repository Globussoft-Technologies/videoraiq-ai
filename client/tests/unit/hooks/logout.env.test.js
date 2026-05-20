/**
 * The other logout.test.js exercises the default VITE_ENV=dev path. This
 * companion file uses vi.stubEnv + vi.resetModules to re-import the module
 * under the alternate env values so the "prod" and "else" branches in the
 * cookieName ternary are covered.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const deleteCookie = vi.hoisted(() => vi.fn());
vi.mock("@/components/Auth/IsAuth", () => ({ deleteCookie }));

beforeEach(() => {
  deleteCookie.mockReset();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("logout — env-driven cookie name selection", () => {
  it("uses 'prod-access-token' when VITE_ENV=prod", async () => {
    vi.stubEnv("VITE_ENV", "prod");
    const { logout } = await import("../../../src/hooks/logout.js");
    logout();
    expect(deleteCookie).toHaveBeenCalledWith("prod-access-token");
  });

  it("uses 'access-token' for any other VITE_ENV value", async () => {
    vi.stubEnv("VITE_ENV", "local");
    const { logout } = await import("../../../src/hooks/logout.js");
    logout();
    expect(deleteCookie).toHaveBeenCalledWith("access-token");
  });

  it("uses 'access-token' when VITE_ENV is empty", async () => {
    vi.stubEnv("VITE_ENV", "");
    const { logout } = await import("../../../src/hooks/logout.js");
    logout();
    expect(deleteCookie).toHaveBeenCalledWith("access-token");
  });
});
