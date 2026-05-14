import { expect } from "@playwright/test";

export class DashboardPage {
  static PATH = "/dashboard";

  constructor(page) {
    this.page = page;
    // Heading-ish element on the dashboard — falls back to text matchers since
    // the source doesn't expose an explicit h1.
    this.statCardsRegion = page.locator(".space-y-6").first();
    this.activeCamerasCard = page.getByText(/active cameras/i);
    this.criticalAlertsCard = page.getByText(/critical/i).first();
  }

  async goto() {
    await this.page.goto(DashboardPage.PATH);
    await this.expectLoaded();
  }

  async expectLoaded() {
    await expect(this.page).toHaveURL(/\/dashboard/);
    // At least one of the well-known cards should be visible.
    await Promise.race([
      this.activeCamerasCard.waitFor({ state: "visible", timeout: 15_000 }),
      this.criticalAlertsCard.waitFor({ state: "visible", timeout: 15_000 }),
      this.statCardsRegion.waitFor({ state: "visible", timeout: 15_000 }),
    ]);
  }
}
