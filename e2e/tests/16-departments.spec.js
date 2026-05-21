import { test, expect } from "../fixtures/auth.js";

/**
 * Smoke coverage for the /departments management page (referenced from
 * /roles-permissions tabs and the sidebar). 04-navigation and 09-settings
 * never exercised this route directly. The DOM dump confirmed:
 *   - heading text "Departments"
 *   - primary action button "Add New Department"
 *   - search input with placeholder "Search department..."
 *   - a results table with "Department Name" column header
 */
test.describe("Departments page", () => {
  test("/departments renders without a runtime crash", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/departments");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    // Either we stayed on /departments, or we got rerouted by RBAC — both fine.
    await expect(page).toHaveURL(
      /departments|access-denied|dashboard|login/i
    );
    expect(errors, errors.join("\n")).toHaveLength(0);

    // The body must contain *something* (no blank screen).
    const bodyText = (await page.locator("body").innerText()).trim();
    expect(bodyText.length).toBeGreaterThan(0);
  });

  test("/departments shows primary controls for an admin user", async ({
    page,
  }) => {
    await page.goto("/departments");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    // If RBAC rerouted, skip the deeper assertions.
    test.skip(
      !/\/departments/.test(page.url()),
      "User does not have access to /departments"
    );

    // Heading
    const heading = page.getByText(/^Departments$/i).first();
    await expect(heading).toBeVisible({ timeout: 15_000 });

    // Add button
    const addBtn = page
      .getByRole("button", { name: /add new department/i })
      .first();
    await expect(addBtn).toBeVisible({ timeout: 15_000 });
    await expect(addBtn).toBeEnabled();

    // Search input
    const search = page.getByPlaceholder(/search department/i).first();
    await expect(search).toBeVisible({ timeout: 15_000 });
  });

  test("department search input is interactive", async ({ page }) => {
    await page.goto("/departments");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    const search = page.getByPlaceholder(/search department/i).first();
    test.skip(
      !(await search.isVisible().catch(() => false)),
      "Search input not available for this user"
    );

    await search.fill("non-existent-dept-xyz");
    await expect(search).toHaveValue("non-existent-dept-xyz");
    await search.fill("");
    await expect(search).toHaveValue("");
  });
});
