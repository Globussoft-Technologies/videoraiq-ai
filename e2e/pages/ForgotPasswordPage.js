import { expect } from "@playwright/test";

export class ForgotPasswordPage {
  static PATH = "/forgot-password";

  constructor(page) {
    this.page = page;
    this.emailInput = page.locator("#email");
    this.submitButton = page.getByRole("button", {
      name: /send reset instructions/i,
    });
    this.sendingButton = page.getByRole("button", { name: /sending/i });
    this.backToLoginLink = page.getByRole("link", { name: /back to login/i });
    this.successHeading = page.getByText(/check your email/i);
    this.resendButton = page.getByRole("button", { name: /resend email/i });
    this.toast = page.locator("[data-sonner-toast], [role='status']");
  }

  async goto() {
    await this.page.goto(ForgotPasswordPage.PATH);
    await expect(this.emailInput).toBeVisible({ timeout: 15_000 });
  }

  async submitEmail(email) {
    await this.emailInput.fill(email);
    await this.submitButton.click();
  }

  async expectSuccessState() {
    await expect(this.successHeading).toBeVisible({ timeout: 15_000 });
    await expect(this.resendButton).toBeVisible();
  }
}
