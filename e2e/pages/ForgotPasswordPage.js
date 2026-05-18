import { expect } from "@playwright/test";

// aMember's forgot-password form lives on the same /login page, reached via
// the "Forgot password?" link or directly at /login?sendpass:
//   #sendpass  (name=login)  — username/email
//   <input type=submit value="Reset Password">
export class ForgotPasswordPage {
  static PATH = "/login?sendpass";

  constructor(page) {
    this.page = page;
    this.emailInput = page.locator("#sendpass");
    this.submitButton = page.getByRole("button", { name: /reset password/i });
    this.toast = page.locator(
      "[data-sonner-toast], [role='status'], .am-info, [class*='error']"
    );
  }

  async goto() {
    await this.page.goto(ForgotPasswordPage.PATH);
    await expect(this.emailInput).toBeVisible({ timeout: 15_000 });
  }

  async submitEmail(email) {
    await this.emailInput.fill(email);
    await this.submitButton.click();
  }
}
