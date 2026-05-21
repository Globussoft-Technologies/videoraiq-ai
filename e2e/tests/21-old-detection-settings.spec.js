import { test, expect } from "../fixtures/auth.js";

/**
 * Smoke coverage for /olddetection-settings — the legacy detection-settings
 * page (wired in client/src/routes/routes.jsx as <OldDetectionSetting />).
 *
 * The newer Detection Settings page is at /detection-settings and is covered
 * by 18-detection-settings.spec.js. The legacy page renders the same
 * configure-detection flow but with a different layout. It was previously
 * unexercised by any spec.
 *
 * DOM dump confirmed:
 *   - heading "Configure Detection Settings"
 *   - sub-headings "Add New Configure Settings", "Saved Configurations"
 *   - inline labels: Select Detection Type, Select NVR, Select Camera
 *   - per-config row controls: Edit, Delete
 *   - search input with placeholder "Search"
 */
test.describe("Old detection settings page", () => {
  test("/olddetection-settings renders without a runtime crash", async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/olddetection-settings");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    await expect(page).toHaveURL(
      /olddetection-settings|access-denied|dashboard|login/i
    );
    expect(errors, errors.join("\n")).toHaveLength(0);

    const bodyText = (await page.locator("body").innerText()).trim();
    expect(bodyText.length).toBeGreaterThan(0);
  });

  test("/olddetection-settings exposes the configure-detection headings", async ({
    page,
  }) => {
    await page.goto("/olddetection-settings");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/\/olddetection-settings/.test(page.url()),
      "User does not have access to /olddetection-settings"
    );

    // Main page heading.
    await expect(
      page
        .getByRole("heading", { name: /configure detection settings/i })
        .first()
    ).toBeVisible({ timeout: 15_000 });

    // Two sub-section headings — the "form" panel and the "saved configs"
    // panel both render even when no data is present.
    await expect(
      page
        .getByRole("heading", { name: /add new configure settings/i })
        .first()
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: /saved configurations/i }).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("/olddetection-settings primary selectors are present", async ({
    page,
  }) => {
    await page.goto("/olddetection-settings");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/\/olddetection-settings/.test(page.url()),
      "User does not have access to /olddetection-settings"
    );

    // Three placeholder controls that render before any selection is made.
    // "Select Detection Type" appears twice in the dom (label + dropdown
    // placeholder); we just want at least one visible.
    for (const label of [
      /select detection type/i,
      /select nvr/i,
      /select camera/i,
    ]) {
      await expect(page.getByText(label).first()).toBeVisible({
        timeout: 10_000,
      });
    }
  });
});
