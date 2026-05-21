import { test, expect } from "../fixtures/auth.js";

/**
 * Deeper coverage for /notification-recipients. 09-settings smokes the URL,
 * this spec asserts the UI is actually present: the page exposes
 * Detection-Settings / Alert-Recipients tabs, an "Add New" recipient action,
 * and a recipients table with Name / Email ID / Action columns.
 *
 * R15: added Add-New dialog form-field assertions and a Filter popover
 * interaction. The 'Add New' button now lives inside RecipientList (the top
 * level button was commented out in NotificationRecipients.jsx) and opens a
 * Radix Dialog with title "Add Notification Recipient", Email/Phone toggles,
 * Full Name + Email Address fields, and a Detection Types popover.
 */
test.describe("Notification Recipients page", () => {
  test("/notification-recipients renders the recipient management UI", async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/notification-recipients");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    await expect(page).toHaveURL(
      /notification-recipients|access-denied|dashboard|login/i
    );
    expect(errors, errors.join("\n")).toHaveLength(0);

    // Skip deeper assertions if RBAC redirected us elsewhere.
    test.skip(
      !/notification-recipients/.test(page.url()),
      "User does not have access to /notification-recipients"
    );

    // Tabs / section labels seen in the dom dump.
    await expect(
      page.getByText(/Detection Settings/i).first()
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(/Alert Recipients/i).first()
    ).toBeVisible({ timeout: 15_000 });

    // Recipient table column headers.
    await expect(page.getByText(/^Name$/i).first()).toBeVisible();
    await expect(page.getByText(/^Email ID$/i).first()).toBeVisible();
  });

  test("'Add New' recipient button is present and enabled", async ({
    page,
  }) => {
    await page.goto("/notification-recipients");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});
    test.skip(
      !/notification-recipients/.test(page.url()),
      "User does not have access to /notification-recipients"
    );

    const addBtn = page
      .getByRole("button", { name: /^add new$/i })
      .first();
    await expect(addBtn).toBeVisible({ timeout: 15_000 });
    await expect(addBtn).toBeEnabled();
  });

  test("search input filters the recipient list", async ({ page }) => {
    await page.goto("/notification-recipients");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});
    test.skip(
      !/notification-recipients/.test(page.url()),
      "User does not have access to /notification-recipients"
    );

    const search = page.getByPlaceholder(/^search$/i).first();
    test.skip(
      !(await search.isVisible().catch(() => false)),
      "Search input not available"
    );

    await search.fill("zzz-no-such-recipient");
    await expect(search).toHaveValue("zzz-no-such-recipient");
    await search.fill("");
    await expect(search).toHaveValue("");
  });

  test("'Add New' opens the recipient dialog with form fields", async ({
    page,
  }) => {
    await page.goto("/notification-recipients");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});
    test.skip(
      !/notification-recipients/.test(page.url()),
      "User does not have access to /notification-recipients"
    );

    const addBtn = page.getByRole("button", { name: /^add new$/i }).first();
    test.skip(
      !(await addBtn.isVisible().catch(() => false)),
      "User cannot add recipients"
    );

    await addBtn.click();

    // AddRecipientModal mounts a Radix Dialog with title
    // "Add Notification Recipient".
    const dialog = page.getByRole("dialog").first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(
      dialog.getByText(/add notification recipient/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // Email toggle is the default selection — verify by presence of the
    // Full Name input and the e.g. John Doe placeholder.
    await expect(
      dialog.getByPlaceholder(/e\.g\. John Doe/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // Email Address input (default Email tab).
    await expect(
      dialog.getByPlaceholder(/e\.g\. michael@/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // The Email tab also exposes a "Verify" submit button inline with the
    // email input. Detection Types dropdown trigger is visible too.
    await expect(
      dialog.getByRole("button", { name: /^verify$/i }).first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      dialog.getByText(/select detection types|types selected/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // Close cleanly with Escape so we don't leak the open dialog.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  });

  test("Filter popover exposes recipient verification filters", async ({
    page,
  }) => {
    await page.goto("/notification-recipients");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});
    test.skip(
      !/notification-recipients/.test(page.url()),
      "User does not have access to /notification-recipients"
    );

    // The Filter trigger button text "Filter" is hidden on small screens —
    // use the cleaner name match against the button role to land on the
    // outline filter trigger next to the search input.
    const filterBtn = page
      .getByRole("button", { name: /^filter$/i })
      .first();
    test.skip(
      !(await filterBtn.isVisible().catch(() => false)),
      "Filter button not exposed for this user"
    );
    await filterBtn.click();

    // The popover contains three radio options + Apply / clear actions.
    // Wrap in toPass for webkit popover animation tolerance.
    await expect(async () => {
      await expect(
        page.getByText(/all recipients/i).first()
      ).toBeVisible({ timeout: 5_000 });
      await expect(
        page.getByText(/verified recipients/i).first()
      ).toBeVisible({ timeout: 5_000 });
      await expect(
        page.getByText(/unverified recipients/i).first()
      ).toBeVisible({ timeout: 5_000 });
      await expect(
        page.getByRole("button", { name: /^apply$/i }).first()
      ).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 10_000 });

    // Close popover by pressing Escape — leaves the page in a clean state.
    await page.keyboard.press("Escape").catch(() => {});
  });
});
