import { test, expect } from "../fixtures/auth.js";
import { StreamsPage } from "../pages/StreamsPage.js";
import { isDestructiveAllowed } from "../utils/env.js";

test.describe("NVR flow (read-only)", () => {
  test("NVR settings page renders", async ({ page }) => {
    await new StreamsPage(page).goto();
  });

  test("Add NVR button is reachable", async ({ page }) => {
    const streams = new StreamsPage(page);
    await streams.goto();
    // Button may be hidden behind permission gating; if visible, it should be enabled.
    if (await streams.addNvrButton.isVisible()) {
      await expect(streams.addNvrButton).toBeEnabled();
    }
  });

  test("clicking Add NVR opens the dialog", async ({ page }) => {
    const streams = new StreamsPage(page);
    await streams.goto();
    test.skip(
      !(await streams.addNvrButton.isVisible()),
      "User has no Add NVR permission"
    );
    await streams.openAddNvrDialog();

    // The dialog should be presented as a Radix dialog with role=dialog.
    await expect(
      page.getByRole("dialog").or(page.locator("[role='dialog']"))
    ).toBeVisible({ timeout: 10_000 });

    // Close it again — pressing Escape is the conventional dismiss.
    await page.keyboard.press("Escape");
  });
});

test.describe("NVR flow (destructive)", () => {
  test.skip(
    () => !isDestructiveAllowed(),
    "Destructive tests disabled — set ALLOW_DESTRUCTIVE_TESTS=true"
  );

  test("create + delete a test NVR (placeholder)", async ({ page }) => {
    // Intentionally a placeholder. Wiring up a real NVR requires reachable
    // RTSP credentials we cannot ship in a public test. Fill in here once
    // the CI environment has access to a mock NVR / proxy.
    test.info().annotations.push({
      type: "todo",
      description: "Add real NVR creation flow against a mock RTSP source",
    });
  });
});
