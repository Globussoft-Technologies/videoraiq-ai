import { test, expect } from "../fixtures/auth.js";

/**
 * Smoke coverage for the Streams / Camera live-view family of routes.
 *
 * /cameraview              — Live CCTV multi-camera grid (wrapped in NvrAuthCheck).
 * /streams/nvrsettings     — Nvrsettings (CCTV configuration form).
 * /streams/camera-settings — CameraSettings (per-camera AI task selector).
 *
 * Each of these is permission-gated, so we tolerate redirects to dashboard /
 * access-denied / login. The assertions are deliberately loose: no pageerror,
 * the SPA paints content, and the URL lands in an expected place.
 */
const streamRoutes = [
  {
    path: "/cameraview",
    name: "Live CCTV camera view",
    // The Cameraview page renders a "Live CCTV Streams" heading and the
    // grid / location / NVR / camera selectors. We accept either the page
    // rendered in place, or a redirect to nvr-settings (NvrAuthCheck) /
    // dashboard / login.
    paintHints: /Live CCTV|Select View Grid|Select Location|Select NVR/i,
    urlPattern: /cameraview|nvr-settings|dashboard|access-denied|login/i,
  },
  {
    path: "/streams/nvrsettings",
    name: "NVR settings (streams/nvrsettings)",
    paintHints: /NVR Settings|CCTV Configurations|CCTV stream access/i,
    urlPattern: /streams\/nvrsettings|nvr-settings|dashboard|access-denied|login/i,
  },
  {
    path: "/streams/camera-settings",
    name: "Camera settings (streams/camera-settings)",
    paintHints: /Camera Settings|CCTV AI Monitoring|Go back to NVR settings/i,
    urlPattern:
      /streams\/camera-settings|nvr-settings|dashboard|access-denied|login/i,
  },
];

test.describe("Streams & camera-view routes", () => {
  for (const route of streamRoutes) {
    test(`${route.name} (${route.path}) loads without a crash`, async ({
      page,
    }) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));

      await page.goto(route.path);
      await page
        .waitForLoadState("networkidle", { timeout: 20_000 })
        .catch(() => {});

      await expect(page).toHaveURL(route.urlPattern);
      expect(errors, errors.join("\n")).toHaveLength(0);

      const bodyText = await page.locator("body").innerText();
      expect(bodyText.trim().length).toBeGreaterThan(0);

      // Soft check: if the SPA stayed on the route we expected, the paint
      // hints should be present. If it redirected (e.g. NvrAuthCheck bounce
      // to /nvr-settings), we skip the content check.
      if (new RegExp(route.path.replace(/\//g, "\\/"), "i").test(page.url())) {
        expect(bodyText).toMatch(route.paintHints);
      }
    });
  }

  test("camera-settings page exposes a 'back to NVR settings' affordance when it renders", async ({
    page,
  }) => {
    await page.goto("/streams/camera-settings");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    // Only enforce this when the page actually rendered in place.
    test.skip(
      !/streams\/camera-settings/i.test(page.url()),
      "redirected away from /streams/camera-settings — skipping affordance check"
    );

    const back = page.getByText(/back to NVR settings|Go back to NVR/i).first();
    await expect(back).toBeVisible({ timeout: 10_000 });
  });
});
