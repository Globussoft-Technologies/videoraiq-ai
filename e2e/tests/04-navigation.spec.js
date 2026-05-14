import { test, expect } from "../fixtures/auth.js";
import { DashboardPage } from "../pages/DashboardPage.js";
import { IncidentsPage } from "../pages/IncidentsPage.js";
import { StreamsPage } from "../pages/StreamsPage.js";
import { PlaybackPage } from "../pages/PlaybackPage.js";
import { UsersPage } from "../pages/UsersPage.js";
import { ProfilePage } from "../pages/ProfilePage.js";

test.describe("Navigation", () => {
  test("dashboard → incidents via sidebar", async ({ page, sidebar }) => {
    await page.goto("/dashboard");
    await sidebar.expectVisible();
    await sidebar.goTo("incidents");
    await new IncidentsPage(page).expectLoaded();
  });

  test("dashboard → NVR settings via sidebar", async ({ page, sidebar }) => {
    await page.goto("/dashboard");
    await sidebar.expectVisible();
    await sidebar.goTo("nvr");
    await new StreamsPage(page).expectLoaded();
  });

  test("direct navigation to /playback works", async ({ page }) => {
    await new PlaybackPage(page).goto();
  });

  test("direct navigation to /user-details works", async ({ page }) => {
    await new UsersPage(page).goto();
  });

  test("direct navigation to /profile works", async ({ page }) => {
    await new ProfilePage(page).goto();
  });

  test("logs index redirects to /logs/attendance", async ({ page }) => {
    await page.goto("/logs");
    await expect(page).toHaveURL(/\/logs\/attendance/, { timeout: 15_000 });
  });

  test("unknown route does not crash the SPA", async ({ page }) => {
    await page.goto("/this-route-does-not-exist-1234");
    // App should either show a 404 page, redirect to dashboard, or redirect
    // to login — any of those is fine. We just want to ensure no white screen
    // / unhandled error.
    const errors = [];
    page.on("pageerror", (err) => errors.push(err));
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    expect(errors).toHaveLength(0);
  });

  test("back/forward browser navigation works", async ({ page, sidebar }) => {
    await page.goto("/dashboard");
    await sidebar.goTo("incidents");
    await new IncidentsPage(page).expectLoaded();

    await page.goBack();
    await new DashboardPage(page).expectLoaded();

    await page.goForward();
    await new IncidentsPage(page).expectLoaded();
  });

  test("root path / redirects to /dashboard for logged-in user", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });
});
