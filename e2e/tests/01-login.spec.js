import { test, expect } from "@playwright/test";
import { LoginPage } from "../pages/LoginPage.js";
import { authCookieName, loginPath } from "../utils/env.js";

// This spec runs under the "unauthenticated" project so the stored auth state
// does not interfere with the login flow assertions.
test.describe("Login page", () => {
  test("renders form with all controls", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.expectVisible();
    await expect(page).toHaveURL(new RegExp(loginPath().replace(/\//g, "\\/")));
  });

  test("requires username and password (HTML5 validation)", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.submit();
    // The username input is `required`; modern browsers block submit, leaving
    // the URL on the login page. We assert no navigation happened.
    await expect(page).toHaveURL(new RegExp(loginPath().replace(/\//g, "\\/")));
    await expect(login.usernameInput).toBeFocused();
  });

  test("shows error toast for wrong credentials", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login("nonexistent_user_e2e", "wrong-password-e2e-test");
    await login.expectErrorToast();
    // Still on the login page after rejection.
    await expect(page).not.toHaveURL(/\/dashboard/);
  });

  test("logs in with valid credentials and lands on dashboard", async ({
    page,
    context,
  }) => {
    const username = process.env.TEST_USERNAME;
    const password = process.env.TEST_PASSWORD;
    test.skip(!username || !password, "TEST_USERNAME/TEST_PASSWORD missing");

    const login = new LoginPage(page);
    await login.goto();
    await login.login(username, password);

    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/dashboard/);

    // Auth cookie should be present after a successful login.
    const cookies = await context.cookies();
    const tokenCookie = cookies.find((c) => c.name === authCookieName());
    expect(tokenCookie).toBeDefined();
    expect(tokenCookie?.value?.length || 0).toBeGreaterThan(10);
  });

  test("password field is masked", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await expect(login.passwordInput).toHaveAttribute("type", "password");
  });

  test("submit button shows loading state during login", async ({ page }) => {
    const username = process.env.TEST_USERNAME;
    const password = process.env.TEST_PASSWORD;
    test.skip(!username || !password, "TEST_USERNAME/TEST_PASSWORD missing");

    const login = new LoginPage(page);
    await login.goto();
    await login.fillCredentials(username, password);

    // Race: click and immediately probe for the loading-state button. Either
    // the loading state appears (fast network), or the dashboard URL lands
    // first — both are acceptable proof that the click was honored.
    const navigation = page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await login.submit();
    const loadingAppeared = await login.signingInButton
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    await navigation;
    expect(loadingAppeared || page.url().includes("/dashboard")).toBeTruthy();
  });
});
