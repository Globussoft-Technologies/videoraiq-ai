import { expect } from "@playwright/test";

export class UsersPage {
  static PATH = "/user-details";

  constructor(page) {
    this.page = page;
    this.heading = page
      .getByRole("heading", { name: /users|user details/i })
      .first();
    this.addUserButton = page.getByRole("button", { name: /add user|new user/i });
    this.userRows = page.locator("table tbody tr");
    this.searchInput = page.getByPlaceholder(/search/i);
    this.emptyState = page.getByText(/no users found|nothing here/i);
  }

  async goto() {
    await this.page.goto(UsersPage.PATH);
    await this.expectLoaded();
  }

  async expectLoaded() {
    await expect(this.page).toHaveURL(/\/user-details/);
    await Promise.race([
      this.heading.waitFor({ state: "visible", timeout: 15_000 }),
      this.userRows.first().waitFor({ state: "visible", timeout: 15_000 }),
      this.emptyState.waitFor({ state: "visible", timeout: 15_000 }),
    ]);
  }
}
