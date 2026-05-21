import { test, expect } from "../fixtures/auth.js";

/**
 * Smoke + structural coverage for /otp-verification (OtpVerification view).
 *
 * Route was previously uncovered.  The dom dump shows the page renders an
 * OTP modal with:
 *   - a "Verify OTP" h2 heading
 *   - "Enter the 6-digit code sent to ..." copy
 *   - six single-character OTP inputs (inputmode="numeric", maxlength="1")
 *   - a "Verify Account" submit button (with a clipboard-check icon)
 *   - a "Resend" button under "Didn't receive code?"
 *
 * RBAC may redirect; deeper assertions are skipped if so.
 */
test.describe("OTP verification page (/otp-verification)", () => {
  test("/otp-verification loads without a crash", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/otp-verification");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    await expect(page).toHaveURL(
      /otp-verification|access-denied|dashboard|login/i
    );
    expect(errors, errors.join("\n")).toHaveLength(0);

    const bodyText = await page.locator("body").innerText();
    expect(bodyText.trim().length).toBeGreaterThan(0);
  });

  test("renders the OTP entry UI (heading + 6 inputs + Verify / Resend)", async ({
    page,
  }) => {
    await page.goto("/otp-verification");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/otp-verification/.test(page.url()),
      "User does not have access to /otp-verification"
    );

    // h2 heading reads "Verify OTP".
    await expect(
      page.getByRole("heading", { name: /verify otp/i }).first()
    ).toBeVisible({ timeout: 15_000 });

    // Six single-character OTP inputs.
    const otpInputs = page.locator('input[inputmode="numeric"][maxlength="1"]');
    await expect(otpInputs).toHaveCount(6, { timeout: 15_000 });

    // Submit and resend controls.
    await expect(
      page.getByRole("button", { name: /verify account/i }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^resend$/i }).first()
    ).toBeVisible();
  });

  test("typing a digit into the first OTP box updates its value", async ({
    page,
  }) => {
    await page.goto("/otp-verification");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    test.skip(
      !/otp-verification/.test(page.url()),
      "User does not have access to /otp-verification"
    );

    const firstBox = page
      .locator('input[inputmode="numeric"][maxlength="1"]')
      .first();
    await expect(firstBox).toBeVisible({ timeout: 15_000 });

    await firstBox.click();
    await firstBox.fill("7");
    await expect(firstBox).toHaveValue("7");
  });
});
