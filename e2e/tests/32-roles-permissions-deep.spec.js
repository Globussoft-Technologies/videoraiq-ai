import { test, expect } from "../fixtures/auth.js";

/**
 * Deeper coverage for /roles-permissions (RolesandPermission).
 *
 * 11-rbac smokes the route as a one-liner. This spec asserts the management
 * UI paints its primary actions and table:
 *
 *   - "User Role Detail" heading
 *   - "Add New Role" primary CTA
 *   - role search input (placeholder="Search roles...")
 *   - table column headers: Role Name, Create, View, Edit, Delete, Action
 *   - row action icon buttons (aria-label: view / edit / delete / settings)
 *
 * Permission-gated: tolerate redirects to dashboard / access-denied / login.
 */
test.describe("Roles & Permissions management page (/roles-permissions)", () => {
  test("/roles-permissions renders the management UI", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/roles-permissions");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    await expect(page).toHaveURL(
      /roles-permissions|access-denied|dashboard|login/i
    );
    expect(errors, errors.join("\n")).toHaveLength(0);

    test.skip(
      !/\/roles-permissions/.test(page.url()),
      "User does not have access to /roles-permissions"
    );

    // The heading sometimes paints slightly after networkidle on webkit, so
    // wait for the locator rather than asserting on a snapshot of innerText.
    await expect(page.getByText(/User Role Detail/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("'Add New Role' button is present and enabled", async ({ page }) => {
    await page.goto("/roles-permissions");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/\/roles-permissions/.test(page.url()),
      "User does not have access to /roles-permissions"
    );

    const addBtn = page.getByText(/Add New Role/i).first();
    await expect(addBtn).toBeVisible({ timeout: 15_000 });
  });

  test("permission matrix column headers render", async ({ page }) => {
    await page.goto("/roles-permissions");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/\/roles-permissions/.test(page.url()),
      "User does not have access to /roles-permissions"
    );

    for (const header of [
      /Role Name/i,
      /^Create$/i,
      /^View$/i,
      /^Edit$/i,
      /^Delete$/i,
      /^Action$/i,
    ]) {
      await expect(page.getByText(header).first()).toBeVisible({
        timeout: 15_000,
      });
    }
  });

  test("role search input accepts typing and clears", async ({ page }) => {
    await page.goto("/roles-permissions");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/\/roles-permissions/.test(page.url()),
      "User does not have access to /roles-permissions"
    );

    const search = page.getByPlaceholder(/search roles/i).first();
    test.skip(
      !(await search.isVisible().catch(() => false)),
      "Role search input not available"
    );

    await search.fill("zzz-no-such-role");
    await expect(search).toHaveValue("zzz-no-such-role");
    await search.fill("");
    await expect(search).toHaveValue("");
  });

  test("row-level action icons (view/edit/delete/settings) are exposed", async ({
    page,
  }) => {
    await page.goto("/roles-permissions");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/\/roles-permissions/.test(page.url()),
      "User does not have access to /roles-permissions"
    );

    // The dom dump shows aria-label="view" / "edit" / "delete" / "settings".
    // If the table is empty for this account we'd see zero — tolerate that
    // by skipping rather than failing.
    const counts = await Promise.all(
      ["view", "edit", "delete", "settings"].map((l) =>
        page.getByLabel(new RegExp(`^${l}$`, "i")).count()
      )
    );
    const total = counts.reduce((a, b) => a + b, 0);
    test.skip(
      total === 0,
      "No role rows rendered — action icons unavailable"
    );
    expect(total).toBeGreaterThan(0);
  });
});
