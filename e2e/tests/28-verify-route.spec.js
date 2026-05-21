import { test, expect } from "../fixtures/auth.js";

/**
 * Smoke coverage for the public `/verify` route (client/src/routes/routes.jsx
 * line 57). The Verify component reads `?token=` and `?value=` from the URL
 * and immediately POSTs to the verifyOtp API, then renders a VerificationModal.
 *
 * DOM-dump findings (chromium, 2026-05-21):
 *   - No token / value at all   → modal heading "Verification Failed",
 *                                  body "Invalid verification link. Missing
 *                                  token or value."
 *   - Bogus token + bogus value → backend toast "Invalid Token or recipient
 *                                  not found." and modal body "Verification
 *                                  failed. Please try again."
 *
 * The route is declared OUTSIDE the IsAuth guard so it renders for everyone.
 * We use the authenticated fixture (same pattern as 27-password-flows) so the
 * spec can run under chromium/firefox/webkit projects — the page accepts a
 * logged-in cookie but does not redirect.
 */
test.describe("Public /verify route", () => {
  test("/verify without token+value shows the 'invalid link' modal", async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/verify");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    // SPA stayed on /verify (no auth redirect).
    await expect(page).toHaveURL(/\/verify/);

    const bodyText = await page.locator("body").innerText();
    // Modal renders the failure UI when neither token nor value is supplied.
    expect(bodyText).toMatch(/Verification Failed/i);
    expect(bodyText).toMatch(/Invalid verification link/i);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("/verify?token=…&value=… with bogus params surfaces a backend error", async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto(
      "/verify?token=e2e_smoke_token_does_not_exist&value=e2e-not-a-real-recipient@example.com"
    );
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    await expect(page).toHaveURL(/\/verify/);

    const bodyText = await page.locator("body").innerText();
    // Either the modal failure UI, or the toast for an invalid-token API
    // response. We tolerate both because the toast can disappear before we
    // sample bodyText if the test machine is slow.
    expect(bodyText).toMatch(
      /Verification Failed|Verification failed\. Please try again|Invalid Token|recipient not found/i
    );

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("/verify renders the VideoraIQ logo inside the modal", async ({
    page,
  }) => {
    await page.goto("/verify");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    // The modal embeds the VideoraIQ logo. Asserting on it confirms the
    // VerificationModal painted — not just a blank shell.
    const logo = page.getByAltText(/VideoraIQ Logo/i).first();
    await expect(logo).toBeVisible({ timeout: 10_000 });
  });
});
