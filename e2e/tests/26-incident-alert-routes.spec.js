import { test, expect } from "../fixtures/auth.js";

/**
 * Smoke coverage for the three alert-card / incident summary routes wired up
 * in client/src/routes/routes.jsx (lines 100-102). All three share the
 * CriticalAlert component but render with different headings depending on
 * the path.
 *
 *   /critical-incidents  → "Critical Incidents"
 *   /total-incidents     → "Total Incidents"
 *   /incidents-resolved  → "Incidents Resolved"
 *
 * The pages are permission-gated; we tolerate redirects to dashboard /
 * access-denied / login.
 */
const alertRoutes = [
  {
    path: "/critical-incidents",
    name: "Critical incidents alert card",
    heading: /Critical Incidents/i,
    urlPattern: /critical-incidents|dashboard|access-denied|login/i,
  },
  {
    path: "/total-incidents",
    name: "Total incidents alert card",
    heading: /Total Incidents/i,
    urlPattern: /total-incidents|dashboard|access-denied|login/i,
  },
  {
    path: "/incidents-resolved",
    name: "Resolved incidents alert card",
    heading: /Incidents Resolved/i,
    urlPattern: /incidents-resolved|dashboard|access-denied|login/i,
  },
];

test.describe("Alert-card / incident-summary routes", () => {
  for (const route of alertRoutes) {
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

      // Heading sanity check — only if the SPA actually stayed on this route.
      if (new RegExp(route.path.replace(/\//g, "\\/"), "i").test(page.url())) {
        expect(bodyText).toMatch(route.heading);
      }
    });
  }

  test("critical-incidents page exposes 'Back to Dashboard' breadcrumb", async ({
    page,
  }) => {
    await page.goto("/critical-incidents");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/critical-incidents/i.test(page.url()),
      "redirected away from /critical-incidents — skipping breadcrumb check"
    );

    // The CriticalAlert component renders a "Back to Dashboard" link.
    const back = page.getByText(/Back to Dashboard/i).first();
    await expect(back).toBeVisible({ timeout: 10_000 });
  });

  test("critical-incidents list view exposes NVR + Camera selectors", async ({
    page,
  }) => {
    await page.goto("/critical-incidents");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/critical-incidents/i.test(page.url()),
      "redirected away from /critical-incidents — skipping selectors check"
    );

    const bodyText = await page.locator("body").innerText();
    expect(bodyText).toMatch(/Select NVR/i);
    expect(bodyText).toMatch(/Select Camera/i);
  });
});
