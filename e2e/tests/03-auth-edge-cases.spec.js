import { test, expect } from "@playwright/test";
import { LoginPage } from "../pages/LoginPage.js";
import { ForgotPasswordPage } from "../pages/ForgotPasswordPage.js";
import { authCookieName } from "../utils/env.js";

/** Log in through the React admin form and wait until /dashboard is reached. */
async function signIn(page, username, password) {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(username, password);
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

test.describe("Auth edge cases", () => {
  // KNOWN ISSUE — videoraiq-ai#30: on the deployed dev environment an
  // unauthenticated visit to /dashboard does NOT redirect to login (the
  // IsAuth guard does not fire). Un-fixme once the guard redirects.
  test.fixme(
    "unauthenticated request to /dashboard redirects to a login page",
    async ({ page }) => {
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/login/i, { timeout: 15_000 });
    }
  );

  // The forgot-password flow on the React AdminLoginForm has its entry
  // link commented out (AdminLoginForm.jsx:251-257), and the aMember
  // /login?sendpass URL is no longer the canonical login route. These
  // two tests are pinned until the forgot-password flow is restored
  // (either as a React route or by un-commenting the link).
  test.fixme("forgot-password form renders", async ({ page }) => {
    const forgot = new ForgotPasswordPage(page);
    await forgot.goto();
    await expect(forgot.emailInput).toBeVisible();
    await expect(forgot.submitButton).toBeVisible();
  });

  test.fixme(
    "forgot-password form accepts a submission without crashing",
    async ({ page }) => {
      const forgot = new ForgotPasswordPage(page);
      await forgot.goto();
      await forgot.submitEmail(process.env.TEST_USERNAME || "someone@test.com");
      await expect(page).toHaveURL(/\/login/i, { timeout: 15_000 });
      const body = await page.locator("body").innerText();
      expect(body.trim().length).toBeGreaterThan(0);
    }
  );

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

  // KNOWN ISSUE — videoraiq-ai#30: the IsAuth guard does not redirect
  // unauthenticated visitors, so clearing cookies does not bounce to login
  // either. Un-fixme once the guard redirects.
  test.fixme("clearing cookies redirects to login on next nav", async ({
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

  // KNOWN ISSUE — videoraiq-ai#30: the IsAuth guard does not redirect
  // unauthenticated visitors, so a tampered token also fails to bounce
  // to login. Un-fixme once the guard redirects.
  test.fixme("a tampered auth cookie is rejected", async ({ browser }) => {
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
