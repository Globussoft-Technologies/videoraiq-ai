import { describe, it, expect, vi, beforeEach } from "vitest";

// js-cookie is mocked so we control what Cookies.get returns.
vi.mock("js-cookie", () => ({
  default: { get: vi.fn() },
}));

import Cookies from "js-cookie";

/**
 * getAccessToken reads import.meta.env.VITE_ENV at module-load time and picks
 * the cookie name from it. To exercise each branch we stub the env var, reset
 * the module registry, and dynamically re-import.
 */
async function loadWithEnv(envValue) {
  vi.resetModules();
  vi.stubEnv("VITE_ENV", envValue);
  const mod = await import("../../../src/utils/getAccessToken.js");
  return mod.default;
}

beforeEach(() => {
  Cookies.get.mockReset();
  vi.unstubAllEnvs();
});

describe("getAccessToken", () => {
  it("reads 'dev-access-token' when VITE_ENV=dev", async () => {
    Cookies.get.mockReturnValue("dev-token-value");
    const getAccessToken = await loadWithEnv("dev");
    expect(getAccessToken()).toBe("dev-token-value");
    expect(Cookies.get).toHaveBeenCalledWith("dev-access-token");
  });

  it("reads 'prod-access-token' when VITE_ENV=prod", async () => {
    Cookies.get.mockReturnValue("prod-token-value");
    const getAccessToken = await loadWithEnv("prod");
    expect(getAccessToken()).toBe("prod-token-value");
    expect(Cookies.get).toHaveBeenCalledWith("prod-access-token");
  });

  it("falls back to 'access-token' for any other env", async () => {
    Cookies.get.mockReturnValue("local-token-value");
    const getAccessToken = await loadWithEnv("local");
    expect(getAccessToken()).toBe("local-token-value");
    expect(Cookies.get).toHaveBeenCalledWith("access-token");
  });

  it("returns null when the cookie is absent", async () => {
    Cookies.get.mockReturnValue(undefined);
    const getAccessToken = await loadWithEnv("dev");
    expect(getAccessToken()).toBeNull();
  });

  it("returns null when the cookie is an empty string", async () => {
    Cookies.get.mockReturnValue("");
    const getAccessToken = await loadWithEnv("dev");
    expect(getAccessToken()).toBeNull();
  });
});
