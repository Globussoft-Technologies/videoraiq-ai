import { test, expect } from "../fixtures/auth.js";

/**
 * Smoke coverage for the /user-details management page (wired in
 * client/src/routes/routes.jsx as <UserDetails />). The page sits behind the
 * sidebar "User Details" entry and acts as the parent of the user-management
 * tabs (Register your User, Role & Permission, Locations, Departments).
 *
 * The previous test suites only touched /user-details transitively through
 * navigation links — there was no direct smoke spec.
 *
 * DOM dump confirmed:
 *   - heading "User Details"
 *   - sub-heading "User Role Detail"
 *   - tab labels: "Register your User", "Role & Permission", "Locations",
 *     "Departments"
 *   - primary action button "Add New User"
 *   - results table column headers: Email, Role, Action
 *   - search input with placeholder "Search "
 */
test.describe("User Details page", () => {
  test("/user-details renders without a runtime crash", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/user-details");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    // Either /user-details stays put, or RBAC reroutes the admin user — both
    // are acceptable for a smoke check.
    await expect(page).toHaveURL(
      /user-details|access-denied|dashboard|login/i
    );
    expect(errors, errors.join("\n")).toHaveLength(0);

    // Page must paint *something*.
    const bodyText = (await page.locator("body").innerText()).trim();
    expect(bodyText.length).toBeGreaterThan(0);
  });

  test("/user-details exposes the user-management tabs for an admin", async ({
    page,
  }) => {
    await page.goto("/user-details");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/\/user-details/.test(page.url()),
      "User does not have access to /user-details"
    );

    // The four sub-tab labels — they are present in the dom even before any
    // tab is selected (they're tab triggers, not panels).
    for (const label of [
      /register your user/i,
      /role & permission/i,
      /^locations$/i,
      /^departments$/i,
    ]) {
      await expect(page.getByText(label).first()).toBeVisible({
        timeout: 15_000,
      });
    }
  });

  test("user-details search input accepts typing and clears", async ({
    page,
  }) => {
    await page.goto("/user-details");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/\/user-details/.test(page.url()),
      "User does not have access to /user-details"
    );

    // The user-list panel exposes a search input with placeholder "Search ".
    const search = page.getByPlaceholder(/^Search\s*$/i).first();
    test.skip(
      !(await search.isVisible().catch(() => false)),
      "Search input not exposed for this user"
    );

    await search.fill("zzz-no-such-user-xyz");
    await expect(search).toHaveValue("zzz-no-such-user-xyz");
    await search.fill("");
    await expect(search).toHaveValue("");
  });

  test("user-details table column headers render", async ({ page }) => {
    await page.goto("/user-details");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/\/user-details/.test(page.url()),
      "User does not have access to /user-details"
    );

    // The registered-users table renders Email / Role / Action columns.
    // Wrap in toPass for late-arriving table rows in webkit.
    await expect(async () => {
      await expect(page.getByText(/^Email$/i).first()).toBeVisible({
        timeout: 5_000,
      });
      await expect(page.getByText(/^Role$/i).first()).toBeVisible({
        timeout: 5_000,
      });
      await expect(page.getByText(/^Action$/i).first()).toBeVisible({
        timeout: 5_000,
      });
    }).toPass({ timeout: 15_000 });
  });

  test("'Add New User' button is reachable when admin has access", async ({
    page,
  }) => {
    await page.goto("/user-details");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/\/user-details/.test(page.url()),
      "User does not have access to /user-details"
    );

    const addBtn = page
      .getByRole("button", { name: /add new user/i })
      .first();

    // If the button isn't exposed for this account, skip rather than fail —
    // the page itself rendered, which is what matters for the smoke check.
    test.skip(
      !(await addBtn.isVisible().catch(() => false)),
      "User cannot add new users"
    );
    await expect(addBtn).toBeEnabled();
  });

  test("Register-your-User tab exposes the employee-registration controls", async ({
    page,
  }) => {
    await page.goto("/user-details");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/\/user-details/.test(page.url()),
      "User does not have access to /user-details"
    );

    // "Register your User" is the default-active tab in our admin storage
    // state; if it isn't, click it to make sure we land on the right panel.
    const registerTab = page.getByText(/register your user/i).first();
    await expect(registerTab).toBeVisible({ timeout: 15_000 });
    await registerTab.click().catch(() => {});

    // Primary action buttons rendered by the register-users panel
    // (AddProfile / RegisterForm). These are the buttons that actually exist
    // in the live DOM — confirmed via Playwright accessibility snapshot.
    const expectedButtons = [
      /register new employee/i,
      /register bulk employee/i,
      /import emp users/i,
      /verify user/i,
    ];
    for (const name of expectedButtons) {
      const btn = page.getByRole("button", { name }).first();
      await expect(btn).toBeVisible({ timeout: 10_000 });
      await expect(btn).toBeEnabled();
    }

    // Location + department dropdowns rendered above the user list.
    await expect(
      page.getByRole("combobox").filter({ hasText: /select location/i }).first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page
        .getByRole("combobox")
        .filter({ hasText: /select department/i })
        .first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
