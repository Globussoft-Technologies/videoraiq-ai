import { test, expect } from "../fixtures/auth.js";

/**
 * Smoke coverage for the live-streaming route (/cameraview).
 *
 * The page is permission + NVR-auth gated (`<NvrAuthCheck>` in routes.jsx),
 * so an unauthorised user gets redirected. The harish admin we run with has
 * access; we just confirm the page mounts and the primary filter controls
 * are present. We do NOT assert on actual video tiles — that would couple
 * the test to network conditions and HLS playback timing.
 */
test.describe("Live streaming page", () => {
  test("/cameraview renders the Live CCTV Streams page", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/cameraview");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    // It may redirect to /dashboard if NvrAuthCheck rejects, or stay put.
    // Either way the SPA should not crash.
    await expect(page).toHaveURL(/\/(cameraview|dashboard|access-denied)/i, {
      timeout: 15_000,
    });

    expect(errors, errors.join("\n")).toHaveLength(0);

    const body = await page.locator("body").innerText();
    expect(body.trim().length).toBeGreaterThan(0);
  });

  test("Live page exposes the grid-view + filter controls", async ({
    page,
  }) => {
    await page.goto("/cameraview");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    // If we got bounced off /cameraview by NvrAuthCheck, skip the rest.
    test.skip(
      !page.url().includes("/cameraview"),
      "User does not have access to /cameraview"
    );

    await expect(
      page.getByRole("heading", { name: /live cctv streams/i }).first()
    ).toBeVisible({ timeout: 15_000 });

    // Grid-size picker button.
    await expect(
      page.getByRole("button", { name: /select view grid/i }).first()
    ).toBeVisible();

    // The camera-search input.
    await expect(
      page.getByPlaceholder(/search cameras/i).first()
    ).toBeVisible();

    // Filter selectors (rendered as plain text / select triggers).
    await expect(page.getByText(/select location/i).first()).toBeVisible();
    await expect(page.getByText(/select nvr/i).first()).toBeVisible();
  });

  test("typing into the camera search updates the input", async ({ page }) => {
    await page.goto("/cameraview");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    test.skip(
      !page.url().includes("/cameraview"),
      "User does not have access to /cameraview"
    );

    const search = page.getByPlaceholder(/search cameras/i).first();
    await expect(search).toBeVisible();
    await search.fill("test-camera");
    await expect(search).toHaveValue("test-camera");
  });

  test("Location MultiSelect opens a searchable popup", async ({ page }) => {
    // Cameraview wires three MultiSelect filter widgets (Location / NVR /
    // Cameras). Clicking the Location trigger should open a popup containing
    // a "Search Locations..." input. We don't assert on actual location rows
    // because the list is data-dependent.
    await page.goto("/cameraview");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});
    test.skip(
      !page.url().includes("/cameraview"),
      "User does not have access to /cameraview"
    );

    const locationTrigger = page.getByText(/^select location$/i).first();
    await expect(locationTrigger).toBeVisible({ timeout: 15_000 });
    await locationTrigger.click();

    // Wrap in toPass for webkit tolerance — popover animation can lag.
    await expect(async () => {
      await expect(
        page.getByPlaceholder(/search locations/i).first()
      ).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 10_000 });
  });
});
