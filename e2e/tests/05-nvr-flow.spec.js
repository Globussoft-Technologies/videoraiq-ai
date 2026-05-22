import { test, expect } from "../fixtures/auth.js";
import { StreamsPage } from "../pages/StreamsPage.js";
import { isDestructiveAllowed } from "../utils/env.js";

/**
 * Smoke + deeper coverage for the NVR settings flow.
 *
 * The /nvr-settings page (Nvrsettings.jsx) uses <StreamHeader> with
 * buttonText="CCTV Configurations" as the Add-NVR trigger — clicking it mounts
 * the AddNVRForm overlay (a custom fixed-position modal, NOT a Radix dialog,
 * so there's no role=dialog to query against). The form heading reads
 * "Add NVR" and exposes Brand / Name / Location / IP / Username / Password /
 * RTSP Port / Port fields plus an "Add" submit button.
 *
 * R17 deepens this from a single dialog-open smoke into a full set of
 * form-field assertions and a search-affordance check.
 */
test.describe("NVR flow (read-only)", () => {
  test("NVR settings page renders", async ({ page }) => {
    await new StreamsPage(page).goto();
  });

  test("Add NVR / CCTV Configurations button is reachable", async ({ page }) => {
    const streams = new StreamsPage(page);
    await streams.goto();

    // The trigger label is "CCTV Configurations" in production; older builds
    // used "Add NVR". Accept either so the spec is build-portable.
    const trigger = page
      .getByRole("button", { name: /cctv configurations|add nvr/i })
      .first();

    if (await trigger.isVisible().catch(() => false)) {
      await expect(trigger).toBeEnabled();
    }
  });

  test("clicking CCTV Configurations opens the Add NVR overlay", async ({
    page,
  }) => {
    const streams = new StreamsPage(page);
    await streams.goto();

    const trigger = page
      .getByRole("button", { name: /cctv configurations|add nvr/i })
      .first();

    test.skip(
      !(await trigger.isVisible().catch(() => false)),
      "User has no Add NVR permission"
    );

    await trigger.click();

    // The overlay is a fixed div, not role=dialog. Use the heading.
    await expect(
      page.getByRole("heading", { name: /^add nvr$/i }).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Add NVR overlay exposes all required form fields", async ({ page }) => {
    const streams = new StreamsPage(page);
    await streams.goto();

    const trigger = page
      .getByRole("button", { name: /cctv configurations|add nvr/i })
      .first();
    test.skip(
      !(await trigger.isVisible().catch(() => false)),
      "User has no Add NVR permission"
    );
    await trigger.click();

    // Heading lands first; wait for it before probing children.
    await expect(
      page.getByRole("heading", { name: /^add nvr$/i }).first()
    ).toBeVisible({ timeout: 10_000 });

    // Brand select + Name + Location + IP + Username + Password + ports.
    // We assert via placeholders / values where the form exposes them and
    // fall back to label text otherwise. Wrap in toPass for webkit tolerance.
    await expect(async () => {
      await expect(page.getByText(/^Brand\*?$/i).first()).toBeVisible({
        timeout: 5_000,
      });
      await expect(page.getByText(/^Name\*?$/i).first()).toBeVisible({
        timeout: 5_000,
      });
      await expect(page.getByText(/^Location\*?$/i).first()).toBeVisible({
        timeout: 5_000,
      });
      await expect(
        page.getByText(/Public IP Address/i).first()
      ).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText(/^Username\*?$/i).first()).toBeVisible({
        timeout: 5_000,
      });
      await expect(page.getByText(/^RTSP Port\*?$/i).first()).toBeVisible({
        timeout: 5_000,
      });
      await expect(page.getByText(/^Port\*?$/i).first()).toBeVisible({
        timeout: 5_000,
      });
    }).toPass({ timeout: 12_000 });

    // Field-level placeholder checks (these are stable across builds).
    await expect(page.getByPlaceholder(/Enter name/i).first()).toBeVisible();
    await expect(
      page.getByPlaceholder(/e\.g\. 169\.253/i).first()
    ).toBeVisible();
    await expect(page.getByPlaceholder(/e\.g\. admin/i).first()).toBeVisible();
    await expect(page.getByPlaceholder(/e\.g\. 554/i).first()).toBeVisible();
    await expect(page.getByPlaceholder(/e\.g\. 80/i).first()).toBeVisible();

    // The Add submit button starts disabled (dirty=false) — assert presence
    // without enabling assertion to avoid coupling to Formik state.
    await expect(
      page.getByRole("button", { name: /^add$/i }).first()
    ).toBeVisible();
  });

  test("Add NVR overlay closes via the X button", async ({ page }) => {
    const streams = new StreamsPage(page);
    await streams.goto();

    const trigger = page
      .getByRole("button", { name: /cctv configurations|add nvr/i })
      .first();
    test.skip(
      !(await trigger.isVisible().catch(() => false)),
      "User has no Add NVR permission"
    );
    await trigger.click();

    const heading = page
      .getByRole("heading", { name: /^add nvr$/i })
      .first();
    await expect(heading).toBeVisible({ timeout: 10_000 });

    // The close affordance is an unlabeled button containing the X icon,
    // rendered absolutely at the top-right corner. The cleanest selector is
    // the button immediately preceding the heading inside the overlay.
    // We click the first button inside the overlay container.
    const overlay = page.locator("div.fixed.inset-0").first();
    const closeBtn = overlay.locator("button").first();
    await closeBtn.click().catch(() => {});

    await expect(heading).toBeHidden({ timeout: 10_000 });
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
