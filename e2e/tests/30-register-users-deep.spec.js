import { test, expect } from "../fixtures/auth.js";

/**
 * Deeper coverage for /register-users (AddProfile).
 *
 * 11-rbac smokes the route as one-liner; this spec asserts that the User
 * Management dashboard actually paints its primary actions and table:
 *
 *   - heading "Register your User"
 *   - action buttons: Register New Employee, Register Bulk Employee,
 *     Import Emp Users, Verify User
 *   - table column headers: User Role Detail, Username, Email, Dept,
 *     Location
 *
 * Permission-gated: tolerate redirects to dashboard / access-denied / login.
 */
test.describe("Register Users management page (/register-users)", () => {
  test("/register-users renders the user management UI", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/register-users");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    await expect(page).toHaveURL(
      /register-users|access-denied|dashboard|login/i
    );
    expect(errors, errors.join("\n")).toHaveLength(0);

    test.skip(
      !/\/register-users/.test(page.url()),
      "User does not have access to /register-users"
    );

    // The heading sometimes paints slightly after networkidle on webkit, so
    // wait for the locator rather than asserting on a snapshot of innerText.
    await expect(page.getByText(/Register your User/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("primary employee-onboarding actions render", async ({ page }) => {
    await page.goto("/register-users");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/\/register-users/.test(page.url()),
      "User does not have access to /register-users"
    );

    // These four are the headline CTAs on the page per the live dump.
    for (const label of [
      /Register New Employee/i,
      /Register Bulk Employee/i,
      /Import Emp Users/i,
      /Verify User/i,
    ]) {
      await expect(page.getByText(label).first()).toBeVisible({
        timeout: 15_000,
      });
    }
  });

  test("user table column headers are visible", async ({ page }) => {
    await page.goto("/register-users");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/\/register-users/.test(page.url()),
      "User does not have access to /register-users"
    );

    for (const header of [
      /User Role Detail/i,
      /^Username$/i,
      /^Email$/i,
      /^Dept$/i,
      /^Location$/i,
    ]) {
      await expect(page.getByText(header).first()).toBeVisible({
        timeout: 15_000,
      });
    }
  });

  test("search input accepts typing and clears", async ({ page }) => {
    await page.goto("/register-users");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/\/register-users/.test(page.url()),
      "User does not have access to /register-users"
    );

    const search = page.getByPlaceholder(/^search$/i).first();
    test.skip(
      !(await search.isVisible().catch(() => false)),
      "Search input not available"
    );

    await search.fill("zzz-no-such-user");
    await expect(search).toHaveValue("zzz-no-such-user");
    await search.fill("");
    await expect(search).toHaveValue("");
  });
});
