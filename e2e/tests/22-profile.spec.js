import { test, expect } from "../fixtures/auth.js";

/**
 * Deeper coverage for /profile (Detection Profiles).
 *
 * 04-navigation already smokes the route, and pages/ProfilePage.js exists,
 * but no spec previously asserted the management UI.  The dom dump shows a
 * Detection Profiles management page with:
 *   - an "Add New Profile" button (aria-label="Add New Profile")
 *   - a table with columns: Name, Created By, Created At, Last Modified,
 *     Status, Actions
 *   - a Search input (placeholder="Search")
 *
 * RBAC may redirect lower-privilege users — gracefully skip deeper
 * assertions in that case.
 */
test.describe("Detection Profiles page (/profile)", () => {
  test("/profile renders the profiles management UI", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/profile");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    await expect(page).toHaveURL(
      /profile|access-denied|dashboard|login/i
    );
    expect(errors, errors.join("\n")).toHaveLength(0);

    test.skip(
      !/\/profile/.test(page.url()),
      "User does not have access to /profile"
    );

    // Column headers from the table.
    await expect(page.getByText(/^Name$/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/^Status$/i).first()).toBeVisible();
    await expect(page.getByText(/^Actions$/i).first()).toBeVisible();
  });

  test("'Add New Profile' button is present and enabled", async ({ page }) => {
    await page.goto("/profile");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/\/profile/.test(page.url()),
      "User does not have access to /profile"
    );

    // The button uses aria-label="Add New Profile" in the dom dump.
    const addBtn = page
      .getByRole("button", { name: /add new profile/i })
      .first();
    await expect(addBtn).toBeVisible({ timeout: 15_000 });
    await expect(addBtn).toBeEnabled();
  });

  test("search input accepts input and clears", async ({ page }) => {
    await page.goto("/profile");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/\/profile/.test(page.url()),
      "User does not have access to /profile"
    );

    const search = page.getByPlaceholder(/^search$/i).first();
    test.skip(
      !(await search.isVisible().catch(() => false)),
      "Search input not available"
    );

    await search.fill("zzz-no-such-profile");
    await expect(search).toHaveValue("zzz-no-such-profile");
    await search.fill("");
    await expect(search).toHaveValue("");
  });
});
