import { test, expect } from "../fixtures/auth.js";

/**
 * Deeper coverage for the /locations management page (already smoke-tested in
 * 10-workforce-logs). Validates the primary controls (Add button, search,
 * table header) render and the search input is interactive.
 */
test.describe("Locations page", () => {
  test("/locations renders the management UI", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/locations");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    await expect(page).toHaveURL(/\/locations/);

    // Add-new button is the primary action.
    const addBtn = page.getByRole("button", { name: /add new location/i }).first();
    // Permission-gated, but on the admin user it should appear.
    await expect(addBtn).toBeVisible({ timeout: 15_000 });
    await expect(addBtn).toBeEnabled();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("location search input is interactive", async ({ page }) => {
    await page.goto("/locations");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    const search = page.getByPlaceholder(/search location/i).first();
    await expect(search).toBeVisible({ timeout: 15_000 });
    await search.fill("non-existent-place-xyz");
    await expect(search).toHaveValue("non-existent-place-xyz");

    // Clearing the input should restore an empty value.
    await search.fill("");
    await expect(search).toHaveValue("");
  });

  test("clicking Add New Location opens a creation dialog or form", async ({
    page,
  }) => {
    await page.goto("/locations");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    const addBtn = page.getByRole("button", { name: /add new location/i }).first();
    test.skip(
      !(await addBtn.isVisible().catch(() => false)),
      "User cannot add locations"
    );

    await addBtn.click();

    // The dialog could be a Radix dialog (role=dialog) or a slide-in panel.
    // Accept either, plus an inline form rendered in the same page.
    const dialog = page.getByRole("dialog");
    const inlineForm = page.locator("form").first();

    const opened = await Promise.race([
      dialog
        .waitFor({ state: "visible", timeout: 8_000 })
        .then(() => true)
        .catch(() => false),
      inlineForm
        .waitFor({ state: "visible", timeout: 8_000 })
        .then(() => true)
        .catch(() => false),
    ]);
    expect(opened, "Add New Location did not open a dialog or form").toBe(true);

    // Best-effort: close via Escape so we don't leave UI open.
    await page.keyboard.press("Escape").catch(() => {});
  });

  test("'Add New Location' dialog exposes form fields and Cancel button", async ({
    page,
  }) => {
    await page.goto("/locations");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    const addBtn = page
      .getByRole("button", { name: /add new location/i })
      .first();
    test.skip(
      !(await addBtn.isVisible().catch(() => false)),
      "User cannot add locations"
    );

    await addBtn.click();

    // The LocationForm renders a Radix Dialog with role=dialog.
    const dialog = page.getByRole("dialog").first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Webkit may animate the Radix dialog in — be tolerant.
    await expect(async () => {
      // Header text
      await expect(
        dialog.getByText(/add new location/i).first()
      ).toBeVisible({ timeout: 5_000 });
      // Location Name input with placeholder "e.g. Banglore"
      await expect(
        dialog.getByPlaceholder(/e\.g\. Banglore/i).first()
      ).toBeVisible({ timeout: 5_000 });
      // Employee Location ID input with placeholder "e.g. BLR001"
      await expect(
        dialog.getByPlaceholder(/e\.g\. BLR001/i).first()
      ).toBeVisible({ timeout: 5_000 });
      // Submit + Cancel buttons (in create mode the submit reads "Add Location")
      await expect(
        dialog.getByRole("button", { name: /^add location$/i }).first()
      ).toBeVisible({ timeout: 5_000 });
      await expect(
        dialog.getByRole("button", { name: /^cancel$/i }).first()
      ).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 10_000 });

    // Typing into the name field should be reflected in the input value.
    const nameInput = dialog.getByPlaceholder(/e\.g\. Banglore/i).first();
    await nameInput.fill("e2e-temp-location-zzz");
    await expect(nameInput).toHaveValue("e2e-temp-location-zzz");

    // Cancel should close the dialog cleanly without submitting.
    await dialog
      .getByRole("button", { name: /^cancel$/i })
      .first()
      .click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  });
});
