import { test, expect } from "../fixtures/auth.js";

/**
 * Coverage for /settings/inner (Innersettings — the per-camera detection
 * configuration view).  Previously unreached by any spec.
 *
 * The dom dump shows the view exposes:
 *   - "Detection Settings" / "Alert Recipients" section labels
 *   - "Detection Type" + "Select Detection Type" selector
 *   - "Select Recipients" selector
 *   - "Device Detail" / "IP Address" / "Model" device-info block
 *   - "Zone Marking" controls
 *   - "Reset Setting" button
 *
 * Some sub-controls are camera-context dependent; assertions are kept to
 * stable labels and tolerated for RBAC redirects.
 */
test.describe("Inner detection settings (/settings/inner)", () => {
  test("/settings/inner loads without a crash", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/settings/inner");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    await expect(page).toHaveURL(
      /settings\/inner|settings|access-denied|dashboard|login/i
    );
    expect(errors, errors.join("\n")).toHaveLength(0);

    const bodyText = await page.locator("body").innerText();
    expect(bodyText.trim().length).toBeGreaterThan(0);
  });

  test("renders detection-settings core labels", async ({ page }) => {
    await page.goto("/settings/inner");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/settings\/inner/.test(page.url()),
      "User does not have access to /settings/inner"
    );

    // Section + control labels from the dom dump.
    await expect(
      page.getByText(/^Detection Settings$/i).first()
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(/^Detection Type$/i).first()
    ).toBeVisible();
    await expect(
      page.getByText(/^Device Detail$/i).first()
    ).toBeVisible();
    await expect(page.getByText(/^IP Address$/i).first()).toBeVisible();
  });

  test("'Reset Setting' control is present", async ({ page }) => {
    await page.goto("/settings/inner");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/settings\/inner/.test(page.url()),
      "User does not have access to /settings/inner"
    );

    // It may be rendered as a button or as text; assert at least one match
    // is visible.
    const reset = page.getByText(/reset setting/i).first();
    await expect(reset).toBeVisible({ timeout: 15_000 });
  });
});
