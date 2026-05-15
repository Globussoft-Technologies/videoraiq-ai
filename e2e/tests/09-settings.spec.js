import { test, expect } from "../fixtures/auth.js";

/**
 * Smoke coverage for the settings-family routes. Each is permission-gated,
 * so a page may render OR redirect to an access-denied / dashboard route —
 * both are acceptable. What we assert is: the SPA navigates without a
 * white-screen crash.
 */
const settingsRoutes = [
  { path: "/detection-settings", name: "Detection settings" },
  { path: "/storage-settings", name: "Storage settings" },
  { path: "/notification-recipients", name: "Notification recipients" },
  { path: "/profile", name: "Profile" },
  { path: "/settings", name: "Settings" },
];

test.describe("Settings-family routes", () => {
  for (const route of settingsRoutes) {
    test(`${route.name} (${route.path}) loads without a crash`, async ({
      page,
    }) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));

      await page.goto(route.path);
      await page.waitForLoadState("networkidle", { timeout: 20_000 });

      // The route either stays put or redirects somewhere known — never a
      // blank crash.
      await expect(page).toHaveURL(
        /detection-settings|storage-settings|notification-recipients|profile|settings|access-denied|dashboard|login/i
      );
      expect(errors, errors.join("\n")).toHaveLength(0);

      // Something must be painted.
      const bodyText = await page.locator("body").innerText();
      expect(bodyText.trim().length).toBeGreaterThan(0);
    });
  }
});
