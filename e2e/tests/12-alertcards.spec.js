import { test, expect } from "../fixtures/auth.js";

/**
 * Dashboard alert-card deep-link pages — three routes that share the same
 * <CriticalAlert /> component (see client/src/routes/routes.jsx:100-102),
 * each themed by the URL (Critical / Total / Resolved).
 *
 * Coverage goal: each page mounts, paints a heading + filter row, and exposes
 * the primary controls ("Back to Dashboard", Select NVR, Select Camera, Search).
 * Empty data is acceptable — we don't assert on rows.
 */
const ALERT_ROUTES = [
  {
    path: "/critical-incidents",
    name: "Critical incidents",
    headingRe: /critical incidents/i,
    titleRe: /critical-incidents/i,
  },
  {
    path: "/total-incidents",
    name: "Total incidents",
    headingRe: /total incidents/i,
    titleRe: /total-incidents/i,
  },
  {
    path: "/incidents-resolved",
    name: "Incidents resolved",
    headingRe: /incidents resolved/i,
    titleRe: /resolved-incidents/i,
  },
];

test.describe("Dashboard alert-card routes", () => {
  for (const route of ALERT_ROUTES) {
    test(`${route.name} (${route.path}) renders without crash`, async ({
      page,
    }) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));

      await page.goto(route.path);
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

      await expect(page).toHaveURL(new RegExp(route.path.replace("/", "")));
      await expect(page).toHaveTitle(route.titleRe);

      // Page heading is rendered by CriticalAlerts.
      await expect(
        page.getByRole("heading", { name: route.headingRe }).first()
      ).toBeVisible({ timeout: 15_000 });

      expect(errors, errors.join("\n")).toHaveLength(0);
    });

    test(`${route.name} exposes its primary filter controls`, async ({
      page,
    }) => {
      await page.goto(route.path);
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

      // Back link (CriticalAlerts always shows it on these routes).
      await expect(
        page.getByRole("button", { name: /back to dashboard/i }).first()
      ).toBeVisible({ timeout: 10_000 });

      // NVR + Camera filter triggers.
      await expect(page.getByText(/select nvr/i).first()).toBeVisible();
      await expect(page.getByText(/select camera/i).first()).toBeVisible();

      // Search input.
      const search = page.getByPlaceholder(/search/i).first();
      await expect(search).toBeVisible();
      // Typing into it should not throw.
      await search.fill("xyzzy-no-match-please");
      await expect(search).toHaveValue("xyzzy-no-match-please");
    });
  }
});
