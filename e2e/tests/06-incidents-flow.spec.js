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

  test("dashboard tile → incidents deep link", async ({ page }) => {
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
});
