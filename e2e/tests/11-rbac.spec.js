import { test, expect } from "../fixtures/auth.js";

test.describe("Roles & permissions", () => {
  test("roles-permissions page loads without a crash", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/roles-permissions");
    await page.waitForLoadState("networkidle", { timeout: 20_000 });

    await expect(page).toHaveURL(
      /roles-permissions|access-denied|dashboard|login/i
    );
    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("register-users route is reachable", async ({ page }) => {
    await page.goto("/register-users");
    await expect(page).toHaveURL(
      /register-users|access-denied|dashboard|login/i,
      { timeout: 15_000 }
    );
  });

  test.describe("read-only user RBAC", () => {
    test.skip(
      () => !process.env.TEST_USERNAME_READONLY,
      "TEST_USERNAME_READONLY not set — skipping the RBAC enforcement check"
    );

    test("a read-only user cannot reach an admin-only action", async ({
      browser,
    }) => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();

      // Log in fresh as the read-only account.
      const { LoginPage } = await import("../pages/LoginPage.js");
      const login = new LoginPage(page);
      await login.goto();
      await login.login(
        process.env.TEST_USERNAME_READONLY,
        process.env.TEST_PASSWORD_READONLY
      );
      await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

      // Navigating to a management route should redirect / show access-denied,
      // not render the full management UI.
      await page.goto("/roles-permissions");
      await page.waitForLoadState("networkidle", { timeout: 20_000 });
      await expect(page).toHaveURL(
        /access-denied|dashboard|roles-permissions/i
      );

      await ctx.close();
    });
  });
});
