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
});
