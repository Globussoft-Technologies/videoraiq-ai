import { test, expect } from "@playwright/test";
import { LoginPage } from "../pages/LoginPage.js";
import { loginPath } from "../utils/env.js";

// Runs under the "unauthenticated" project (no stored auth state).
// The login form is the React AdminLoginForm at /admin-login on
// dev-dashboard.videoraiq.com (the legacy aMember /login flow is no
// longer the canonical entry point).
test.describe("Login page (Admin)", () => {
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

  // The "Forgot password?" link is currently commented out in
  // client/src/page/admin/Login/AdminLoginForm.jsx (lines 251-257).
  // Un-fixme once the link is restored.
  test.fixme(
    "exposes a 'Forgot password?' link",
    async ({ page }) => {
      const login = new LoginPage(page);
      await login.goto();
      await expect(login.forgotPasswordLink).toBeVisible();
    }
  );

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

    // The React form sets the auth cookie client-side and navigates to
    // /dashboard. Note: `/\/login/i` does NOT match `/admin-login` (no
    // `/login` substring), so we wait for /dashboard explicitly.
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/dashboard/);

    // A session cookie (JWT) was issued by the React form.
    const cookies = await context.cookies();
    expect(
      cookies.length,
      "expected a session cookie after login"
    ).toBeGreaterThan(0);
  });

  test("the login route serves the React admin login form", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await expect(page).toHaveURL(
      new RegExp(loginPath().replace(/\//g, "\\/"))
    );
  });
});
