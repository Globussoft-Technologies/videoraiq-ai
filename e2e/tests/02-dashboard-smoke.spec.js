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
    // adblocker-blocked analytics, etc.). We assert ONLY on errors that
    // suggest a real regression.
    const ignorable =
      /hls\.js|dicebear|adblock|google|gtag|sentry|chunk-error|favicon/i;
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
});
