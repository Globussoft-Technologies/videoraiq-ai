import { expect } from "@playwright/test";

export class ProfilePage {
  static PATH = "/profile";

  constructor(page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: /profile/i }).first();
    this.addProfileButton = page.getByRole("button", {
      name: /add profile|create profile/i,
    });
    this.profilesTable = page.locator("table, [data-testid='profiles-table']");
  }

  async goto() {
    await this.page.goto(ProfilePage.PATH);
    await this.expectLoaded();
  }

  async expectLoaded() {
    await expect(this.page).toHaveURL(/\/profile/);
    await Promise.race([
      this.heading.waitFor({ state: "visible", timeout: 15_000 }),
      this.profilesTable.first().waitFor({ state: "visible", timeout: 15_000 }),
      this.addProfileButton.waitFor({ state: "visible", timeout: 15_000 }),
    ]);
  }
}
