import { test, expect } from "@playwright/test";
import { LoginPage } from "../pages/LoginPage.js";
import { ForgotPasswordPage } from "../pages/ForgotPasswordPage.js";
import { authCookieName } from "../utils/env.js";

test.describe("Auth edge cases", () => {
  test("unauthenticated request to /dashboard redirects to login", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    // The IsAuth guard either redirects to /user-login, /admin-login, or /login.
    await expect(page).toHaveURL(/login/i, { timeout: 15_000 });
  });

  test("forgot password page renders form", async ({ page }) => {
    const forgot = new ForgotPasswordPage(page);
    await forgot.goto();
    await expect(forgot.emailInput).toBeVisible();
    await expect(forgot.submitButton).toBeVisible();
  });

  test("forgot password rejects invalid email format", async ({ page }) => {
    const forgot = new ForgotPasswordPage(page);
    await forgot.goto();
    await forgot.submitEmail("not-a-real-email");
    // Browser-level validation or app-level — either prevents navigation
    // to the success state.
    await expect(forgot.successHeading).not.toBeVisible({ timeout: 2_000 });
  });

  test("forgot password accepts a valid email and shows success state", async ({
    page,
  }) => {
    test.skip(
      !process.env.TEST_USERNAME?.includes("@"),
      "TEST_USERNAME is not an email — skipping"
    );

    const forgot = new ForgotPasswordPage(page);
    await forgot.goto();
    await forgot.submitEmail(process.env.TEST_USERNAME);

    // The dev API may or may not actually send mail. Either we get the
    // success heading or a toast — both prove the form posted.
    await Promise.race([
      forgot.successHeading.waitFor({ state: "visible", timeout: 15_000 }),
      forgot.toast.first().waitFor({ state: "visible", timeout: 15_000 }),
    ]);
  });

  test("session persists across reload", async ({ browser }) => {
    const username = process.env.TEST_USERNAME;
    const password = process.env.TEST_PASSWORD;
    test.skip(!username || !password, "TEST_USERNAME/TEST_PASSWORD missing");

    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const login = new LoginPage(page);
    await login.goto();
    await login.login(username, password);
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);

    await ctx.close();
  });

  test("clearing the auth cookie redirects to login on next nav", async ({
    browser,
  }) => {
    const username = process.env.TEST_USERNAME;
    const password = process.env.TEST_PASSWORD;
    test.skip(!username || !password, "TEST_USERNAME/TEST_PASSWORD missing");

    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const login = new LoginPage(page);
    await login.goto();
    await login.login(username, password);
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

    // Wipe every possible auth-cookie name to simulate expiry.
    await ctx.clearCookies();

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/login/i, { timeout: 15_000 });
  });

  test("tampered token cookie is rejected", async ({ browser }) => {
    const username = process.env.TEST_USERNAME;
    const password = process.env.TEST_PASSWORD;
    test.skip(!username || !password, "TEST_USERNAME/TEST_PASSWORD missing");

    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const login = new LoginPage(page);
    await login.goto();
    await login.login(username, password);
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

    // Mutate the token to make it fail signature verification.
    const cookies = await ctx.cookies();
    const token = cookies.find((c) => c.name === authCookieName());
    expect(token).toBeDefined();
    await ctx.addCookies([
      { ...token, value: token.value.slice(0, -3) + "AAA" },
    ]);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/login/i, { timeout: 15_000 });
  });
});
