import { expect } from "@playwright/test";

// The React AdminLoginForm (#login / #pass fields) is served at /admin-login.
// /login is a separate aMember/PHP login page — not this app's React form.
const LOGIN_PATH = process.env.LOGIN_PATH || "/admin-login";

export class LoginPage {
  constructor(page) {
    this.page = page;
    // Prefer label/placeholder lookups — they survive class-name churn.
    this.usernameInput = page.locator("#login");
    this.passwordInput = page.locator("#pass");
    this.rememberMe = page.locator("#remember");
    this.submitButton = page.getByRole("button", { name: /sign in/i });
    this.signingInButton = page.getByRole("button", { name: /signing in/i });
    this.forgotPasswordLink = page.getByRole("link", {
      name: /forgot.*password/i,
    });
    this.toast = page.locator("[data-sonner-toast], [role='status']");
  }

  async goto() {
    await this.page.goto(LOGIN_PATH);
    // The login form can render under any of these routes; wait for the field.
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

  async expectErrorToast(messageRegex = /invalid|wrong|incorrect|failed/i) {
    await expect(this.toast.first()).toBeVisible({ timeout: 15_000 });
    await expect(this.toast.first()).toContainText(messageRegex);
  }

  async expectSuccessToast() {
    await expect(this.toast.first()).toBeVisible({ timeout: 15_000 });
    await expect(this.toast.first()).toContainText(/success|welcome/i);
  }
}
