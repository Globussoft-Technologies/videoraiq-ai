import { expect } from "@playwright/test";

export class StreamsPage {
  static PATH = "/nvr-settings";

  constructor(page) {
    this.page = page;
    this.heading = page
      .getByRole("heading", { name: /nvr|stream/i })
      .first();
    this.addNvrButton = page.getByRole("button", { name: /add nvr/i });
    this.firstNvrCard = page
      .locator("[data-testid='nvr-card'], [class*='nvr-card']")
      .first();
    this.emptyState = page.getByText(/no nvr|no devices|add your first/i);
  }

  async goto() {
    await this.page.goto(StreamsPage.PATH);
    await this.expectLoaded();
  }

  async expectLoaded() {
    await expect(this.page).toHaveURL(/\/nvr-settings/);
    await Promise.race([
      this.heading.waitFor({ state: "visible", timeout: 15_000 }),
      this.addNvrButton.waitFor({ state: "visible", timeout: 15_000 }),
      this.firstNvrCard.waitFor({ state: "visible", timeout: 15_000 }),
      this.emptyState.waitFor({ state: "visible", timeout: 15_000 }),
    ]);
  }

  async openAddNvrDialog() {
    await this.addNvrButton.click();
  }
}
