import { test, expect } from "../fixtures/auth.js";

/**
 * Deeper coverage for /storage-settings (StorageSettings).
 *
 * 09-settings smokes the route. This spec asserts the management UI:
 *
 *   - "Add Storage" CTA (aria-label="Add Storage")
 *   - table headers: Storage Name, Storage Type, Status, Action
 *   - "Alert Recipients" section heading
 *
 * Permission-gated: tolerate redirects to dashboard / access-denied / login.
 */
test.describe("Storage Settings page (/storage-settings)", () => {
  test("/storage-settings renders the management UI", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/storage-settings");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    await expect(page).toHaveURL(
      /storage-settings|access-denied|dashboard|login/i
    );
    expect(errors, errors.join("\n")).toHaveLength(0);

    test.skip(
      !/\/storage-settings/.test(page.url()),
      "User does not have access to /storage-settings"
    );

    const bodyText = await page.locator("body").innerText();
    expect(bodyText.trim().length).toBeGreaterThan(0);
  });

  test("'Add Storage' button is present and enabled", async ({ page }) => {
    await page.goto("/storage-settings");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/\/storage-settings/.test(page.url()),
      "User does not have access to /storage-settings"
    );

    // The CTA uses aria-label="Add Storage" per the live dom dump.
    const addBtn = page.getByLabel(/add storage/i).first();
    await expect(addBtn).toBeVisible({ timeout: 15_000 });
    await expect(addBtn).toBeEnabled();
  });

  test("storage table column headers render", async ({ page }) => {
    await page.goto("/storage-settings");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/\/storage-settings/.test(page.url()),
      "User does not have access to /storage-settings"
    );

    for (const header of [
      /Storage Name/i,
      /Storage Type/i,
      /^Status$/i,
      /^Action$/i,
    ]) {
      await expect(page.getByText(header).first()).toBeVisible({
        timeout: 15_000,
      });
    }
  });

  test("'Alert Recipients' section is exposed", async ({ page }) => {
    await page.goto("/storage-settings");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/\/storage-settings/.test(page.url()),
      "User does not have access to /storage-settings"
    );

    // The page wires storage alerts into a "Alert Recipients" panel.
    await expect(
      page.getByText(/Alert Recipients/i).first()
    ).toBeVisible({ timeout: 15_000 });
  });
});
