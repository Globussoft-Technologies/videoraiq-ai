import { expect } from "@playwright/test";

export class IncidentsPage {
  static PATH = "/incidents";

  constructor(page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: /incidents/i }).first();
    this.dateRangeButton = page.locator(
      "[data-testid='date-range'], button:has-text('Date Range'), button:has-text('Today')"
    );
    this.firstIncidentRow = page
      .locator("[data-testid='incident-row'], tr, [class*='IncidentCard']")
      .first();
    this.emptyState = page.getByText(/no incidents|nothing here/i);
    this.pagination = page.locator(
      "[data-testid='pagination'], nav[aria-label*='pagination' i]"
    );
  }

  async goto() {
    await this.page.goto(IncidentsPage.PATH);
    await this.expectLoaded();
  }

  async expectLoaded() {
    await expect(this.page).toHaveURL(/\/incidents/);
    // The page is loaded once we see either the heading, an incident row,
    // or the empty state — tolerate all three to avoid flakiness.
    await Promise.race([
      this.heading.waitFor({ state: "visible", timeout: 15_000 }),
      this.firstIncidentRow.waitFor({ state: "visible", timeout: 15_000 }),
      this.emptyState.waitFor({ state: "visible", timeout: 15_000 }),
    ]);
  }
}
