import { test as base, expect } from "@playwright/test";
import { LoginPage } from "../pages/LoginPage.js";
import { Sidebar } from "../pages/Sidebar.js";
import { authCookieName } from "../utils/env.js";

/**
 * `test` exposes:
 *   - loginAs(username, password): perform a full login through the UI
 *   - sidebar: the post-login navigation POM
 *   - clearAuth(): nuke the auth cookie (for expired-token tests)
 *
 * The `setup` project already authenticates and persists storage state for
 * the chromium/firefox/webkit projects, so most specs run logged-in by default.
 */
export const test = base.extend({
  loginAs: async ({ page }, use) => {
    await use(async (username, password) => {
      const login = new LoginPage(page);
      await login.goto();
      await login.login(username, password);
      await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    });
  },

  sidebar: async ({ page }, use) => {
    await use(new Sidebar(page));
  },

  clearAuth: async ({ context }, use) => {
    await use(async () => {
      const cookies = await context.cookies();
      const authCookies = cookies.filter((c) =>
        [
          authCookieName(),
          "dev-access-token",
          "prod-access-token",
          "access-token",
        ].includes(c.name)
      );
      if (authCookies.length) {
        await context.clearCookies();
      }
    });
  },
});

export { expect };
