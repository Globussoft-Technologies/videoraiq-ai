import { expect } from "@playwright/test";

// dev.videoraiq.com fronts login with aMember (a PHP app), not the React
// AdminLoginForm. The real user login form lives at /login:
//   #amember-login  (name=amember_login)  — username/email
//   #amember-pass   (name=amember_pass)   — password
//   <input type=submit value="Login">
const LOGIN_PATH = process.env.LOGIN_PATH || "/login";

export class LoginPage {
  constructor(page) {
    this.page = page;
    this.usernameInput = page.locator("#amember-login");
    this.passwordInput = page.locator("#amember-pass");
    this.submitButton = page.getByRole("button", { name: "Login", exact: true });
    this.forgotPasswordLink = page.getByRole("link", {
      name: /forgot.*password/i,
    });
    // aMember re-renders /login with an inline error block on a failed login.
    this.errorMessage = page.locator(
      ".am-error, .error, [class*='error'], .am-form-error"
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

  /** A failed aMember login stays on the /login page (no redirect to the app). */
  async expectLoginRejected() {
    await expect(this.page).toHaveURL(/\/login/i, { timeout: 15_000 });
    await expect(this.page).not.toHaveURL(/\/dashboard/i);
  }
}
