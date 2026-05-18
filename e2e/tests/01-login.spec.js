import { test, expect } from "@playwright/test";
import { LoginPage } from "../pages/LoginPage.js";
import { loginPath } from "../utils/env.js";

// Runs under the "unauthenticated" project (no stored auth state).
// The login form is aMember's /login page (PHP), not the React app.
test.describe("Login page (aMember)", () => {
  test("renders the login form with all controls", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.expectVisible();
  });

  test("password field is masked", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await expect(login.passwordInput).toHaveAttribute("type", "password");
  });

  test("exposes a 'Forgot password?' link", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await expect(login.forgotPasswordLink).toBeVisible();
  });

  test("submitting empty credentials does not log in", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.submit();
    // aMember rejects the empty submit — we never reach the app dashboard.
    await login.expectLoginRejected();
  });

  test("wrong credentials are rejected", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login("nonexistent_user_e2e", "wrong-password-e2e-test");
    await login.expectLoginRejected();
  });

  test("valid credentials log in and reach the app", async ({
    page,
    context,
  }) => {
    const username = process.env.TEST_USERNAME;
    const password = process.env.TEST_PASSWORD;
    test.skip(!username || !password, "TEST_USERNAME/TEST_PASSWORD missing");

    const login = new LoginPage(page);
    await login.goto();
    await login.login(username, password);

    // After a successful aMember login the browser is handed off to the
    // app — it must leave the /login page.
    await page.waitForURL((url) => !/\/login/i.test(url.pathname), {
      timeout: 30_000,
    });
    await expect(page).not.toHaveURL(/\/login/i);

    // The app is reachable once authenticated.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

    // A session cookie was established. Note: on this aMember-fronted
    // deployment the JWT `dev-access-token` cookie is NOT issued — auth
    // rides the aMember session cookie instead.
    const cookies = await context.cookies();
    expect(
      cookies.length,
      "expected a session cookie after login"
    ).toBeGreaterThan(0);
  });

  test("the login route serves the aMember form", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await expect(page).toHaveURL(
      new RegExp(loginPath().replace(/\//g, "\\/"))
    );
  });
});
