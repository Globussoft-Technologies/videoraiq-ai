import { test, expect } from "../fixtures/auth.js";
import { DashboardPage } from "../pages/DashboardPage.js";

test.describe("Dashboard smoke", () => {
  test("renders dashboard for authenticated user", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.expectLoaded();
  });

  test("displays welcome text in the header", async ({ page, sidebar }) => {
    await page.goto("/dashboard");
    await sidebar.expectVisible();
    await expect(sidebar.welcomeText).toBeVisible({ timeout: 15_000 });
  });

  test("sidebar exposes top-level navigation", async ({ page, sidebar }) => {
    await page.goto("/dashboard");
    await sidebar.expectVisible();

    // At least the core links should be reachable. Some are permission-gated,
    // so we tolerate a missing link by checking each in isolation.
    const links = [
      sidebar.dashboardLink,
      sidebar.incidentsLink,
      sidebar.nvrLink,
    ];
    for (const link of links) {
      await expect(link).toBeVisible({ timeout: 10_000 });
    }
  });

  test("no severe console errors on dashboard", async ({ page }) => {
    const errors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await page.waitForTimeout(2_000);

    // Filter out noise that's well-known to surface from third-party SDKs
    // (HLS.js parse errors when no live stream is available, dicebear avatars,
    // adblocker-blocked analytics, etc.) and from the app's optional
    // local-helper WebSocket (the dashboard probes ws://localhost:<port>/statusinfo,
    // which is absent on a clean Playwright browser). We assert ONLY on
    // errors that suggest a real regression.
    const ignorable =
      /hls\.js|dicebear|adblock|google|gtag|sentry|chunk-error|favicon|ws:\/\/localhost.*statusinfo|ERR_CONNECTION_REFUSED/i;
    const real = errors.filter((e) => !ignorable.test(e));
    expect(real, real.join("\n")).toHaveLength(0);
  });

  test("dashboard loads within performance budget", async ({ page }) => {
    const start = Date.now();
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.expectLoaded();
    expect(Date.now() - start).toBeLessThan(15_000);
  });

  test("renders the headline KPI panels", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    // Four headline cards rendered by the dashboard summary widgets.
    // We assert on heading text rather than aria-labels so a wording tweak
    // surfaces clearly. Each card paints even when counts are zero.
    await expect(async () => {
      for (const label of [
        /today'?s critical incidents/i,
        /today'?s total incidents/i,
        /cameras:?\s*detected\s*\/\s*total/i,
        /incidents resolved/i,
      ]) {
        await expect(page.getByRole("heading", { name: label }).first()).toBeVisible({
          timeout: 5_000,
        });
      }
    }).toPass({ timeout: 15_000 });
  });

  test("renders the live-notifications + authorized-employees side panels", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    // Two right-rail panels that always paint regardless of data state.
    await expect(
      page.getByRole("heading", { name: /live notifications/i }).first()
    ).toBeVisible({ timeout: 15_000 });

    // The authorized-employees heading concatenates the user count (e.g.
    // "Authorized Employees16"); match the prefix loosely.
    await expect(
      page.getByRole("heading", { name: /authorized employees/i }).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("employee-search input on the dashboard accepts typing", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    // Authorized-employees panel renders a "Search Employees" input.
    const search = page.getByPlaceholder(/search employees/i).first();
    await expect(search).toBeVisible({ timeout: 15_000 });
    await search.fill("zzz-no-such-employee");
    await expect(search).toHaveValue("zzz-no-such-employee");
    await search.fill("");
    await expect(search).toHaveValue("");
  });

  test("multi-camera activity review section is present", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    // This section heading is wired up by the comparison widget; wrap in
    // toPass for slow live-tile hydration.
    await expect(async () => {
      await expect(
        page
          .getByRole("heading", { name: /multi-camera activity review/i })
          .first()
      ).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 15_000 });
  });
});
