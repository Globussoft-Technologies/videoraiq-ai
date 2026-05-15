import { test, expect } from "../fixtures/auth.js";

/**
 * Smoke coverage for the workforce + logs routes. Permission-gated; we assert
 * the SPA renders something and doesn't throw.
 */
const routes = [
  { path: "/departments", name: "Departments" },
  { path: "/locations", name: "Locations" },
  { path: "/logs/attendance", name: "Attendance logs" },
  { path: "/logs/access", name: "Access logs" },
  { path: "/logs/productivity", name: "Productivity logs" },
  { path: "/logs/ANPR", name: "ANPR logs" },
];

test.describe("Workforce & logs routes", () => {
  for (const route of routes) {
    test(`${route.name} (${route.path}) loads without a crash`, async ({
      page,
    }) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));

      await page.goto(route.path);
      await page.waitForLoadState("networkidle", { timeout: 20_000 });

      expect(errors, errors.join("\n")).toHaveLength(0);
      const bodyText = await page.locator("body").innerText();
      expect(bodyText.trim().length).toBeGreaterThan(0);
    });
  }

  test("logs index redirects to attendance logs", async ({ page }) => {
    await page.goto("/logs");
    await expect(page).toHaveURL(/\/logs\/attendance/, { timeout: 15_000 });
  });
});
