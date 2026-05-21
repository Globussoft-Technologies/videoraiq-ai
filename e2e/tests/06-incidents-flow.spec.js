import { test, expect } from "../fixtures/auth.js";
import { IncidentsPage } from "../pages/IncidentsPage.js";

test.describe("Incidents flow", () => {
  test("incidents page renders", async ({ page }) => {
    await new IncidentsPage(page).goto();
  });

  test("date range filter is visible", async ({ page }) => {
    const incidents = new IncidentsPage(page);
    await incidents.goto();
    await expect(incidents.dateRangeButton.first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("incident list either shows rows or empty state", async ({ page }) => {
    const incidents = new IncidentsPage(page);
    await incidents.goto();

    const hasRows = await incidents.firstIncidentRow
      .isVisible()
      .catch(() => false);
    const hasEmpty = await incidents.emptyState.isVisible().catch(() => false);

    expect(hasRows || hasEmpty).toBeTruthy();
  });

  test("clicking an incident opens its detail / modal (if any rows)", async ({
    page,
  }) => {
    const incidents = new IncidentsPage(page);
    await incidents.goto();

    const hasRows = await incidents.firstIncidentRow
      .isVisible()
      .catch(() => false);
    test.skip(!hasRows, "No incidents available to interact with");

    await incidents.firstIncidentRow.click();

    // Detail UX could be a modal, a new page, or an inline expansion.
    // Tolerate all three by checking that *something* changed.
    await Promise.race([
      page.getByRole("dialog").waitFor({ state: "visible", timeout: 8_000 }),
      page.waitForURL(/\/incident/, { timeout: 8_000 }),
      page
        .locator("[data-testid='incident-details']")
        .waitFor({ state: "visible", timeout: 8_000 }),
    ]).catch(() => {
      throw new Error("Incident click did not open any detail UI");
    });
  });

  test("dashboard tile -> incidents deep link", async ({ page }) => {
    await page.goto("/dashboard");
    // Dashboard typically has clickable tiles routing to specific incident
    // filters. If a "View all" / "Total incidents" link exists, follow it.
    const link = page
      .getByRole("link", { name: /view all|total incidents|see more/i })
      .first();
    test.skip(!(await link.isVisible()), "No incidents deep link on dashboard");

    await link.click();
    await expect(page).toHaveURL(/incident/i, { timeout: 15_000 });
  });

  // R15 — deeper assertions on the existing filter UI.
  test("'Select Incident' multi-select trigger is interactive", async ({
    page,
  }) => {
    const incidents = new IncidentsPage(page);
    await incidents.goto();

    // MultiSelect renders a clickable trigger with the placeholder text
    // "Select Incident". It's not a native <select>, so we locate by visible
    // text + nearest interactive ancestor.
    const trigger = page.getByText(/select incident/i).first();
    await expect(trigger).toBeVisible({ timeout: 15_000 });

    // Clicking the trigger opens a search popover with the placeholder
    // "Search incidents...". Wrap in toPass for webkit popover-anim tolerance.
    await trigger.click();
    await expect(async () => {
      const search = page
        .getByPlaceholder(/search incidents/i)
        .first();
      await expect(search).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 10_000 });

    // Close popover cleanly.
    await page.keyboard.press("Escape").catch(() => {});
  });

  test("date range picker opens a range calendar", async ({ page }) => {
    const incidents = new IncidentsPage(page);
    await incidents.goto();

    // DateRangePickerComponent surfaces the button with
    // aria-label="Choose date range" wrapped inside the
    // aria-label="Date range picker" group.
    const dateBtn = page
      .getByRole("button", { name: /choose date range/i })
      .first();
    await expect(dateBtn).toBeVisible({ timeout: 15_000 });

    await dateBtn.click();

    // The popover renders a RangeCalendar with aria-label="Date range calendar"
    // and Previous/Next month navigation buttons. Either should appear.
    await expect(async () => {
      const calendar = page.locator("[aria-label='Date range calendar']").first();
      const prevBtn = page
        .getByRole("button", { name: /previous month/i })
        .first();
      const calendarVisible = await calendar
        .isVisible()
        .catch(() => false);
      const prevVisible = await prevBtn.isVisible().catch(() => false);
      expect(calendarVisible || prevVisible).toBeTruthy();
    }).toPass({ timeout: 10_000 });

    // Dismiss with Escape so the next test doesn't inherit an open popover.
    await page.keyboard.press("Escape").catch(() => {});
  });
});
