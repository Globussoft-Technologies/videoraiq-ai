import { test, expect } from "../fixtures/auth.js";

/**
 * Smoke coverage for the workforce + logs routes. Permission-gated; we assert
 * the SPA renders something and doesn't throw.
 */
const routes = [
  { path: "/departments", name: "Departments" },
  { path: "/locations", name: "Locations" },
  { path: "/logs/attendance", name: "Attendance logs" },
  { path: "/logs/access", name: "Access logs" },
  { path: "/logs/productivity", name: "Productivity logs" },
  { path: "/logs/ANPR", name: "ANPR logs" },
  // Three additional log routes wired up in client/src/routes/routes.jsx
  // (TrackLog, VisibilityLog, GuardLog). They render under the same Layout
  // shell; we just want to confirm they paint without a runtime crash.
  { path: "/logs/track", name: "Track logs" },
  { path: "/logs/desk", name: "Desk / visibility logs" },
  { path: "/logs/guard", name: "Guard logs" },
];

test.describe("Workforce & logs routes", () => {
  for (const route of routes) {
    test(`${route.name} (${route.path}) loads without a crash`, async ({
      page,
    }) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));

      await page.goto(route.path);
      await page.waitForLoadState("networkidle", { timeout: 20_000 });

      expect(errors, errors.join("\n")).toHaveLength(0);

      // `innerText` excludes still-hydrating subtrees so it can be empty right
      // after networkidle on slow-paint log routes (Guard logs observed flaky).
      // Retry briefly to absorb that race.
      await expect(async () => {
        const txt = await page.locator("body").innerText();
        expect(txt.trim().length).toBeGreaterThan(0);
      }).toPass({ timeout: 10_000 });
    });
  }

  test("logs index redirects to attendance logs", async ({ page }) => {
    await page.goto("/logs");
    await expect(page).toHaveURL(/\/logs\/attendance/, { timeout: 15_000 });
  });

  test("attendance logs page exposes Export + Filters controls and column header buttons", async ({
    page,
  }) => {
    await page.goto("/logs/attendance");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    test.skip(
      !/\/logs\/attendance/.test(page.url()),
      "redirected away from /logs/attendance — skipping export controls check"
    );

    // The attendance log toolbar exposes Export Excel / Export PDF / Filters.
    await expect(
      page.getByRole("button", { name: /export excel/i }).first()
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("button", { name: /export pdf/i }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /filters/i }).first()
    ).toBeVisible();

    // Column-header buttons (sortable) shown by the attendance table.
    await expect(async () => {
      for (const col of [
        /^name$/i,
        /^department$/i,
        /^date$/i,
        /^location$/i,
        /check\s*in/i,
        /check\s*out/i,
      ]) {
        await expect(page.getByRole("button", { name: col }).first()).toBeVisible({
          timeout: 5_000,
        });
      }
    }).toPass({ timeout: 15_000 });
  });

  test("access logs page renders its column header buttons", async ({ page }) => {
    await page.goto("/logs/access");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    test.skip(
      !/\/logs\/access/.test(page.url()),
      "redirected away from /logs/access — skipping column header check"
    );

    await expect(async () => {
      for (const col of [
        /^name$/i,
        /^department$/i,
        /^date$/i,
        /^location$/i,
        /access\s*time/i,
      ]) {
        await expect(page.getByRole("button", { name: col }).first()).toBeVisible({
          timeout: 5_000,
        });
      }
    }).toPass({ timeout: 15_000 });
  });

  test("ANPR logs page renders the vehicle-number filter + table headers", async ({
    page,
  }) => {
    await page.goto("/logs/ANPR");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    test.skip(
      !/\/logs\/ANPR/i.test(page.url()),
      "redirected away from /logs/ANPR — skipping ANPR check"
    );

    // The ANPR toolbar adds a dedicated "Vehicle Number" filter button.
    await expect(
      page.getByRole("button", { name: /vehicle number/i }).first()
    ).toBeVisible({ timeout: 15_000 });

    // Table column headers.
    await expect(async () => {
      for (const col of [
        /incident name/i,
        /nvr name/i,
        /time of incident/i,
      ]) {
        await expect(page.getByRole("button", { name: col }).first()).toBeVisible({
          timeout: 5_000,
        });
      }
    }).toPass({ timeout: 15_000 });
  });

  test("guard logs page exposes Export Logs + search input", async ({ page }) => {
    await page.goto("/logs/guard");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    test.skip(
      !/\/logs\/guard/.test(page.url()),
      "redirected away from /logs/guard — skipping export logs check"
    );

    await expect(
      page.getByRole("button", { name: /export logs/i }).first()
    ).toBeVisible({ timeout: 15_000 });

    const search = page.getByPlaceholder(/^search$/i).first();
    await expect(search).toBeVisible({ timeout: 15_000 });
    await search.fill("zzz-no-such-row");
    await expect(search).toHaveValue("zzz-no-such-row");
    await search.fill("");
  });

  test("track logs page exposes Users + Vehicles toggle pills", async ({ page }) => {
    await page.goto("/logs/track");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    test.skip(
      !/\/logs\/track/.test(page.url()),
      "redirected away from /logs/track — skipping track logs check"
    );

    // TrackLog renders two role-toggle buttons labelled "👤 Users" and "🚗 Vehicles".
    await expect(
      page.getByRole("button", { name: /users/i }).first()
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("button", { name: /vehicles/i }).first()
    ).toBeVisible();
  });
});
