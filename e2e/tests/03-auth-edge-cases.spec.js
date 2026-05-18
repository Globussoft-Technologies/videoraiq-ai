import { test, expect } from "@playwright/test";
import { LoginPage } from "../pages/LoginPage.js";
import { ForgotPasswordPage } from "../pages/ForgotPasswordPage.js";
import { authCookieName } from "../utils/env.js";

/** Log in through the aMember form and wait until the app is reached. */
async function signIn(page, username, password) {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(username, password);
  // aMember hands off to the app — wait until we leave the /login page.
  await page.waitForURL((url) => !/\/login/i.test(url.pathname), {
    timeout: 30_000,
  });
}

test.describe("Auth edge cases", () => {
  test("unauthenticated request to /dashboard redirects to a login page", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    // The guard redirects to one of /login, /user-login, /admin-login.
    await expect(page).toHaveURL(/login/i, { timeout: 15_000 });
  });

  test("forgot-password form renders", async ({ page }) => {
    const forgot = new ForgotPasswordPage(page);
    await forgot.goto();
    await expect(forgot.emailInput).toBeVisible();
    await expect(forgot.submitButton).toBeVisible();
  });

  test("forgot-password form accepts a submission without crashing", async ({
    page,
  }) => {
    const forgot = new ForgotPasswordPage(page);
    await forgot.goto();
    await forgot.submitEmail(process.env.TEST_USERNAME || "someone@test.com");
    // aMember re-renders the /login page with a confirmation / error message.
    // We only assert the SPA/PHP page did not white-screen.
    await expect(page).toHaveURL(/\/login/i, { timeout: 15_000 });
    const body = await page.locator("body").innerText();
    expect(body.trim().length).toBeGreaterThan(0);
  });

  test("session persists across reload", async ({ browser }) => {
    const username = process.env.TEST_USERNAME;
    const password = process.env.TEST_PASSWORD;
    test.skip(!username || !password, "TEST_USERNAME/TEST_PASSWORD missing");

    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await signIn(page, username, password);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);

    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);

    await ctx.close();
  });

  test("clearing cookies redirects to login on next nav", async ({
    browser,
  }) => {
    const username = process.env.TEST_USERNAME;
    const password = process.env.TEST_PASSWORD;
    test.skip(!username || !password, "TEST_USERNAME/TEST_PASSWORD missing");

    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await signIn(page, username, password);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);

    await ctx.clearCookies();

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/login/i, { timeout: 15_000 });

    await ctx.close();
  });

  test("a tampered auth cookie is rejected", async ({ browser }) => {
    const username = process.env.TEST_USERNAME;
    const password = process.env.TEST_PASSWORD;
    test.skip(!username || !password, "TEST_USERNAME/TEST_PASSWORD missing");

    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await signIn(page, username, password);

    const cookies = await ctx.cookies();
    const token = cookies.find((c) => c.name === authCookieName());
    test.skip(!token, `no ${authCookieName()} cookie issued — cannot tamper`);

    await ctx.addCookies([
      { ...token, value: token.value.slice(0, -3) + "AAA" },
    ]);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/login/i, { timeout: 15_000 });

    await ctx.close();
  });
});
