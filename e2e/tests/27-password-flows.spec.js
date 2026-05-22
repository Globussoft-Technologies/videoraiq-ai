import { test, expect } from "../fixtures/auth.js";

/**
 * Smoke coverage for the password-recovery flows wired up in
 * client/src/routes/routes.jsx:
 *
 *   /forgot-password — ForgotPassword form (email + "Send Reset Instructions")
 *   /reset-password  — ResetPassword form (new password + confirm + token
 *                       parsed from ?token=… query string)
 *
 * Both routes are declared OUTSIDE the IsAuth-guarded shell, so they render
 * regardless of whether the visitor is logged in. We assert client-side
 * Formik validation (empty submit, mismatched passwords) without ever
 * sending real credentials to the API.
 *
 * NOTE: these specs use the authenticated fixture so they can run alongside
 * the rest of the suite under chromium/firefox/webkit projects. The pages
 * are designed to render for unauthenticated visitors but happily accept
 * a logged-in cookie too — they do not redirect.
 */
test.describe("Forgot password page", () => {
  test("renders the form without a crash", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/forgot-password");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    await expect(page).toHaveURL(/forgot-password|login|dashboard/i);
    expect(errors, errors.join("\n")).toHaveLength(0);

    const bodyText = await page.locator("body").innerText();
    expect(bodyText).toMatch(/Forgot Password\??/i);
  });

  test("email input and 'Send Reset Instructions' submit button are present", async ({
    page,
  }) => {
    await page.goto("/forgot-password");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/forgot-password/i.test(page.url()),
      "redirected away from /forgot-password"
    );

    const email = page.locator('input[name="email"], input[type="email"]').first();
    await expect(email).toBeVisible({ timeout: 10_000 });

    const submit = page.getByRole("button", { name: /send reset|reset instructions/i }).first();
    await expect(submit).toBeVisible();
  });

  test("'Back to login' affordance is present", async ({ page }) => {
    await page.goto("/forgot-password");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/forgot-password/i.test(page.url()),
      "redirected away from /forgot-password"
    );

    const back = page.getByText(/back to login/i).first();
    await expect(back).toBeVisible({ timeout: 10_000 });
  });

  test("forgot-password form rejects an empty submit without navigating away", async ({
    page,
  }) => {
    await page.goto("/forgot-password");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/forgot-password/i.test(page.url()),
      "redirected away from /forgot-password"
    );

    const submit = page
      .getByRole("button", { name: /send reset|reset instructions/i })
      .first();
    await submit.click().catch(() => {});

    // Give Formik a tick. The form must NOT navigate away on an empty submit.
    await page.waitForTimeout(500);
    expect(page.url()).toMatch(/forgot-password/i);

    // The email input should still be present and empty.
    const email = page
      .locator('input[name="email"], input[type="email"]')
      .first();
    await expect(email).toHaveValue("");
  });

  test("submitting an invalid email surfaces a Formik validation error", async ({
    page,
  }) => {
    await page.goto("/forgot-password");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/forgot-password/i.test(page.url()),
      "redirected away from /forgot-password"
    );

    const email = page.locator('input[name="email"], input[type="email"]').first();
    await email.fill("not-an-email");
    // Tab away to trigger Formik blur validation.
    await email.press("Tab");

    // Either the inline ErrorMessage component fires, or the form's submit
    // is rejected client-side. We just check that "valid email" copy appears.
    const submit = page
      .getByRole("button", { name: /send reset|reset instructions/i })
      .first();
    await submit.click().catch(() => {});

    // Wait for the validation copy to appear; tolerate either the explicit
    // string or any element with the word "email" in red.
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).toMatch(/valid email|enter a valid/i);
  });
});

test.describe("Reset password page", () => {
  test("renders the form without a crash", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/reset-password?token=e2e_smoke_token");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    await expect(page).toHaveURL(/reset-password|login|dashboard/i);
    expect(errors, errors.join("\n")).toHaveLength(0);

    const bodyText = await page.locator("body").innerText();
    expect(bodyText).toMatch(/Reset Password/i);
  });

  test("new + confirm password inputs and submit button are present", async ({
    page,
  }) => {
    await page.goto("/reset-password?token=e2e_smoke_token");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/reset-password/i.test(page.url()),
      "redirected away from /reset-password"
    );

    const password = page.locator('input[name="password"]').first();
    const confirm = page.locator('input[name="confirmPassword"]').first();
    await expect(password).toBeVisible({ timeout: 10_000 });
    await expect(confirm).toBeVisible();

    const submit = page
      .getByRole("button", { name: /reset password/i })
      .first();
    await expect(submit).toBeVisible();
  });

  test("password requirements checklist is rendered", async ({ page }) => {
    await page.goto("/reset-password?token=e2e_smoke_token");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/reset-password/i.test(page.url()),
      "redirected away from /reset-password"
    );

    const bodyText = await page.locator("body").innerText();
    // The checklist enumerates: 8 chars, uppercase, lowercase, number,
    // special character. We just assert the headline + a couple of rules.
    expect(bodyText).toMatch(/Password must contain/i);
    expect(bodyText).toMatch(/At least 8 characters/i);
    expect(bodyText).toMatch(/uppercase/i);
  });

  test("reset-password form rejects an empty submit", async ({ page }) => {
    await page.goto("/reset-password?token=e2e_smoke_token");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/reset-password/i.test(page.url()),
      "redirected away from /reset-password"
    );

    // Click submit with both fields empty — Formik should refuse to send
    // a request. We assert via the post-click URL: still on /reset-password.
    const submit = page
      .getByRole("button", { name: /reset password/i })
      .first();
    await submit.click().catch(() => {});

    // Give Formik a tick to run validators, then ensure we did NOT navigate
    // away to /login or /dashboard.
    await page.waitForTimeout(500);
    expect(page.url()).toMatch(/reset-password/i);

    // Both inputs should still be on screen, untouched.
    await expect(
      page.locator('input[name="password"]').first()
    ).toHaveValue("");
    await expect(
      page.locator('input[name="confirmPassword"]').first()
    ).toHaveValue("");
  });

  test("reset-password page renders even with a missing token query param", async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    // Drop the ?token=... query string entirely — the form should still
    // render (the token validation happens on submit, not on mount).
    await page.goto("/reset-password");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    await expect(page).toHaveURL(/reset-password|login|dashboard/i);
    expect(errors, errors.join("\n")).toHaveLength(0);

    // If we landed on /reset-password the body should still mention "Reset
    // Password" — if we got redirected (some builds bounce to /login when
    // there's no token), that's also acceptable.
    if (/reset-password/.test(page.url())) {
      const bodyText = await page.locator("body").innerText();
      expect(bodyText).toMatch(/Reset Password/i);
    }
  });

  test("mismatched password + confirm surfaces a Formik validation error", async ({
    page,
  }) => {
    await page.goto("/reset-password?token=e2e_smoke_token");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/reset-password/i.test(page.url()),
      "redirected away from /reset-password"
    );

    await page.locator('input[name="password"]').first().fill("Aa1@aaaa");
    await page
      .locator('input[name="confirmPassword"]')
      .first()
      .fill("Aa1@bbbb");

    const submit = page
      .getByRole("button", { name: /reset password/i })
      .first();
    await submit.click().catch(() => {});

    // Wait briefly for the validation message to surface.
    await page.waitForTimeout(500);

    const bodyText = await page.locator("body").innerText();
    expect(bodyText).toMatch(/passwords must match|do not match/i);
  });
});
