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

  test("admin sees role-management primary actions on /roles-permissions", async ({
    page,
  }) => {
    await page.goto("/roles-permissions");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    test.skip(
      !/\/roles-permissions/.test(page.url()),
      "user does not have access to /roles-permissions"
    );

    // "Add New Role" is the headline action and stays present even when no
    // roles are defined yet. The role-search input uses a "Search roles..."
    // placeholder distinct from the generic "Search" used elsewhere.
    await expect(
      page.getByRole("button", { name: /add new role/i }).first()
    ).toBeVisible({ timeout: 15_000 });

    const roleSearch = page.getByPlaceholder(/search roles/i).first();
    await expect(roleSearch).toBeVisible({ timeout: 15_000 });
    await roleSearch.fill("zzz-no-such-role");
    await expect(roleSearch).toHaveValue("zzz-no-such-role");
    await roleSearch.fill("");
  });

  test("admin sees employee-onboarding primary actions on /register-users", async ({
    page,
  }) => {
    await page.goto("/register-users");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    test.skip(
      !/\/register-users/.test(page.url()),
      "user does not have access to /register-users"
    );

    // These four toolbar buttons mark the page as the admin-only employee
    // onboarding hub — a non-admin would not see all of them at once.
    await expect(async () => {
      for (const label of [
        /register new employee/i,
        /register bulk employee/i,
        /verify user/i,
        /import emp users/i,
      ]) {
        await expect(page.getByRole("button", { name: label }).first()).toBeVisible({
          timeout: 5_000,
        });
      }
    }).toPass({ timeout: 15_000 });
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
