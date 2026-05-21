import { test, expect } from "../fixtures/auth.js";

/**
 * Deeper coverage for /detection-settings. 09-settings only smokes the URL
 * — this spec verifies the camera-detection grid is actually rendered:
 *   - "Detection Settings" / "Alert Recipients" tab labels
 *   - "Filter Camera" search input
 *   - table with Camera Name / Status / Enable Detection / Camera Type
 *     column headers
 */
test.describe("Detection Settings page", () => {
  test("/detection-settings renders the camera detection grid", async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/detection-settings");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    await expect(page).toHaveURL(
      /detection-settings|access-denied|dashboard|login/i
    );
    expect(errors, errors.join("\n")).toHaveLength(0);

    test.skip(
      !/detection-settings/.test(page.url()),
      "User does not have access to /detection-settings"
    );

    await expect(
      page.getByText(/Detection Settings/i).first()
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(/Alert Recipients/i).first()
    ).toBeVisible({ timeout: 15_000 });

    // Table column headers.
    await expect(page.getByText(/Camera Name/i).first()).toBeVisible();
    await expect(page.getByText(/Enable Detection/i).first()).toBeVisible();
    await expect(page.getByText(/Camera Type/i).first()).toBeVisible();
  });

  test("'Filter Camera' input is interactive", async ({ page }) => {
    await page.goto("/detection-settings");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});
    test.skip(
      !/detection-settings/.test(page.url()),
      "User does not have access to /detection-settings"
    );

    const filter = page.getByPlaceholder(/filter camera/i).first();
    await expect(filter).toBeVisible({ timeout: 15_000 });

    await filter.fill("non-existent-camera-zzz");
    await expect(filter).toHaveValue("non-existent-camera-zzz");
    await filter.fill("");
    await expect(filter).toHaveValue("");
  });
});
