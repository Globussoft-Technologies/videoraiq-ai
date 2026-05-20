import { expect } from "@playwright/test";

export class IncidentsPage {
  static PATH = "/incidents";

  constructor(page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: /incidents/i }).first();
    // Deployed page uses a react-aria DateRangePicker, not a plain text
    // button. Selectors below come from the live DOM dump.
    this.dateRangeButton = page.locator(
      "[aria-label='Date range picker'], .react-aria-DateRangePicker, [data-testid='date-range']"
    );
    // Each incident card carries an `aria-label='Incident actions'` button;
    // we anchor row detection on it since there's no semantic <tr> here.
    this.firstIncidentRow = page
      .locator(
        "[aria-label='Incident actions'], [data-testid='incident-row'], [class*='incidentContainer'] [class*='card' i], tr"
      )
      .first();
    this.emptyState = page.getByText(/no incidents|nothing here|no data/i);
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
