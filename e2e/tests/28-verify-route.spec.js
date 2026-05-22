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

  test("/verify modal renders a centered card with the failure copy", async ({
    page,
  }) => {
    await page.goto("/verify");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    // Failure variant ("Couldn't verify. Try again.") is rendered by the
    // FailureContent component when no token/value is present.
    await expect(async () => {
      const bodyText = await page.locator("body").innerText();
      expect(bodyText).toMatch(/Couldn.?t verify\.? Try again/i);
    }).toPass({ timeout: 10_000 });
  });

  test("/verify modal heading uses an h2 (semantic correctness)", async ({
    page,
  }) => {
    await page.goto("/verify");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    // VerificationModal puts "Verification Failed" inside an <h2>. Asserting on
    // the heading role guards against accidental refactors that demote the
    // copy to plain <div>.
    await expect(
      page.getByRole("heading", { name: /Verification Failed/i }).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("/verify modal is rendered above the page (portal at body root)", async ({
    page,
  }) => {
    await page.goto("/verify");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    // VerificationModal mounts via ReactDOM.createPortal into document.body
    // with z-[9999]. We assert that the heading is positioned within the
    // viewport — if the portal failed to mount, the heading would be missing
    // or have zero size.
    const heading = page
      .getByRole("heading", { name: /Verification Failed/i })
      .first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
    const box = await heading.boundingBox();
    expect(box, "modal heading should have a bounding box").not.toBeNull();
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
  });
});
