import { expect } from "@playwright/test";

// The dev deployment serves the React AdminLoginForm at /admin-login on
// dev-dashboard.videoraiq.com. Form fields are Formik-bound:
//   #login  (name=login)  — username/email
//   #pass   (name=pass)   — password
//   <button type=submit>Sign In</button>
// On success the form sets a token cookie client-side and navigates to
// /dashboard.
const LOGIN_PATH = process.env.LOGIN_PATH || "/admin-login";

export class LoginPage {
  constructor(page) {
    this.page = page;
    this.usernameInput = page.locator("#login");
    this.passwordInput = page.locator("#pass");
    this.submitButton = page.getByRole("button", { name: /sign in/i });
    this.forgotPasswordLink = page.getByRole("link", {
      name: /forgot.*password/i,
    });
    // The form surfaces a sonner toast on failure ("Failed to Login!"); we
    // also broadly look for an error-styled element if a toast is missed.
    this.errorMessage = page.locator(
      "[role='status'], [class*='toast'], .text-red-600, [class*='error']"
    );
  }

  async goto() {
    await this.page.goto(LOGIN_PATH);
    await expect(this.usernameInput).toBeVisible({ timeout: 15_000 });
  }

  async fillCredentials(username, password) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
  }

  async submit() {
    await this.submitButton.click();
  }

  async login(username, password) {
    await this.fillCredentials(username, password);
    await this.submit();
  }

  async expectVisible() {
    await expect(this.usernameInput).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
    await expect(this.submitButton).toBeVisible();
  }

  /** A failed login keeps the user on /admin-login (no redirect to /dashboard). */
  async expectLoginRejected() {
    await expect(this.page).toHaveURL(/\/admin-login/i, { timeout: 15_000 });
    await expect(this.page).not.toHaveURL(/\/dashboard/i);
  }
}
