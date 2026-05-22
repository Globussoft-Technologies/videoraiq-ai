import { test, expect } from "../fixtures/auth.js";

/**
 * Smoke + paint coverage for the settings-family routes. Each is
 * permission-gated, so a page may render OR redirect to an access-denied /
 * dashboard / login route — both are acceptable. We assert (a) no white-screen
 * crash, (b) URL lands somewhere known, and (c) when the page DID render in
 * place, a route-specific paint hint is on the page.
 *
 * R17 deepens this from a body-text > 0 smoke to per-route paint assertions.
 * paint hints were chosen against the live DOM dumps; each is forgiving (case-
 * insensitive, accepts redirects).
 */
const settingsRoutes = [
  {
    path: "/detection-settings",
    name: "Detection settings",
    // DetectionSetting.jsx renders the management table. innerText doesn't
    // include input placeholders, so we match against the table column
    // headers / cell content actually visible to the user.
    paintHints:
      /applied types|select nvr|no detections found|access denied|cameras|online|offline/i,
  },
  {
    path: "/storage-settings",
    name: "Storage settings",
    paintHints: /storage settings|add storage|alert recipients|access denied/i,
  },
  {
    path: "/notification-recipients",
    name: "Notification recipients",
    paintHints:
      /notification recipients|alert recipients|detection settings|access denied/i,
  },
  {
    path: "/profile",
    name: "Profile",
    paintHints:
      /detection profiles|add new profile|created by|access denied/i,
  },
  {
    path: "/settings",
    name: "Settings",
    // Settings.jsx renders <AlertPreferences /> which exposes the "Alert
    // Preferences" heading and a "Reports" section.
    paintHints: /alert preferences|reports|fire alert|access denied/i,
  },
];

test.describe("Settings-family routes", () => {
  for (const route of settingsRoutes) {
    test(`${route.name} (${route.path}) loads without a crash`, async ({
      page,
    }) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));

      await page.goto(route.path);
      await page.waitForLoadState("networkidle", { timeout: 20_000 });

      // The route either stays put or redirects somewhere known — never a
      // blank crash.
      await expect(page).toHaveURL(
        /detection-settings|storage-settings|notification-recipients|profile|settings|access-denied|dashboard|login/i
      );
      expect(errors, errors.join("\n")).toHaveLength(0);

      // Something must be painted.
      const bodyText = await page.locator("body").innerText();
      expect(bodyText.trim().length).toBeGreaterThan(0);

      // Soft paint check: if the SPA stayed on the route we expected, the
      // route-specific paint hint should be present. Skip the hint check on
      // redirects (RBAC, login bounce). Wrap in toPass for webkit tolerance
      // — animated content sometimes lands late.
      const onRoute = new RegExp(
        route.path.replace(/\//g, "\\/"),
        "i"
      ).test(page.url());
      if (onRoute) {
        await expect(async () => {
          const txt = await page.locator("body").innerText();
          expect(txt).toMatch(route.paintHints);
        }).toPass({ timeout: 10_000 });
      }
    });
  }

  test("/settings exposes the Alert Preferences toggles", async ({ page }) => {
    await page.goto("/settings");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/\/settings(\?|$|\/)/.test(page.url()) ||
        /settings\/inner/.test(page.url()),
      "redirected away from /settings"
    );

    // The heading + the four alert-card titles rendered by AlertPreferences.
    await expect(
      page.getByText(/^Alert Preferences$/i).first()
    ).toBeVisible({ timeout: 15_000 });

    // Each alert option ("Fire Alert", "Theft Alert", "Traffic Alert",
    // "All Alerts") is rendered with a switch — assert at least the headings.
    for (const label of [
      /fire alert/i,
      /theft alert/i,
      /traffic alert/i,
      /all alerts/i,
    ]) {
      await expect(page.getByText(label).first()).toBeVisible({
        timeout: 10_000,
      });
    }
  });
});
