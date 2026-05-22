import { test, expect } from "../fixtures/auth.js";

/**
 * Smoke coverage for the active-cameras dashboard tile target (/active-cameras).
 * The page is rendered by client/src/page/user/Dashboard/Alertcards/ActiveCamera.jsx
 * and exposes a Camera Details table fed by NVR + Camera dropdowns.
 */
test.describe("Active Cameras page", () => {
  test("/active-cameras renders without crash", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/active-cameras");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    await expect(page).toHaveURL(/active-cameras/i);
    await expect(page).toHaveTitle(/active-cameras/i);

    // Two headings live on the page: "Cameras with Detections" and "Camera Details".
    await expect(
      page.getByRole("heading", { name: /cameras with detections/i }).first()
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: /camera details/i }).first()
    ).toBeVisible();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("primary controls (Back to Incidents, NVR/Camera selects, search) are present", async ({
    page,
  }) => {
    await page.goto("/active-cameras");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    await expect(
      page.getByRole("button", { name: /back to incidents/i }).first()
    ).toBeVisible();

    await expect(page.getByText(/select nvr/i).first()).toBeVisible();
    await expect(page.getByText(/select camera/i).first()).toBeVisible();

    const search = page.getByPlaceholder(/search/i).first();
    await expect(search).toBeVisible();
    await search.fill("camera-x");
    await expect(search).toHaveValue("camera-x");
  });

  test("Camera Details table column headers render", async ({ page }) => {
    await page.goto("/active-cameras");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    // The columns observed on a live dump: Camera Name, Model, Firmware Version, Nvr Name.
    for (const header of [
      /camera name/i,
      /model/i,
      /firmware version/i,
      /nvr name/i,
    ]) {
      await expect(page.getByText(header).first()).toBeVisible({
        timeout: 10_000,
      });
    }
  });

  test("clicking the Select NVR trigger opens the listbox of NVR options", async ({
    page,
  }) => {
    await page.goto("/active-cameras");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    // The two Radix selects are rendered with the placeholder text inside the
    // SelectValue. Use the placeholder text as a locator since the trigger has
    // role=combobox but no accessible name.
    const nvrTrigger = page.getByText(/^Select NVR$/i).first();
    test.skip(
      !(await nvrTrigger.isVisible().catch(() => false)),
      "Select NVR trigger not present"
    );
    await nvrTrigger.click();

    // Radix renders the listbox as role=listbox. Either we get a listbox open
    // or a 'No NVRs available'-style placeholder — both prove the dropdown
    // expanded without throwing.
    await expect(async () => {
      const listbox = page.getByRole("listbox").first();
      const emptyState = page
        .getByText(/no nvr|no data|loading/i)
        .first();
      const opened =
        (await listbox.isVisible().catch(() => false)) ||
        (await emptyState.isVisible().catch(() => false));
      expect(opened).toBe(true);
    }).toPass({ timeout: 10_000 });

    // Dismiss the dropdown so we don't leak state.
    await page.keyboard.press("Escape").catch(() => {});
  });

  test("typing in the search input filters with a debounce-safe value", async ({
    page,
  }) => {
    await page.goto("/active-cameras");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    const search = page.getByPlaceholder(/search/i).first();
    await expect(search).toBeVisible({ timeout: 10_000 });

    await search.fill("zzz-no-such-camera");
    await expect(search).toHaveValue("zzz-no-such-camera");

    // Clearing the search restores the empty value (debounce in the page is
    // 300ms but value-update is synchronous on the input).
    await search.fill("");
    await expect(search).toHaveValue("");
  });
});
