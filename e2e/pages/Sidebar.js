import { expect } from "@playwright/test";

/**
 * Shared navigation bar at the top of every authenticated page.
 * Source: client/src/layout/Header/Header.jsx
 */
export class Sidebar {
  constructor(page) {
    this.page = page;
    this.dashboardLink = page.getByRole("link", { name: /^dashboard$/i });
    this.incidentsLink = page.getByRole("link", { name: /^incidents$/i });
    this.nvrLink = page.getByRole("link", { name: /^nvr$/i });
    this.liveLink = page.getByRole("link", { name: /^live$/i });
    this.playbackLink = page.getByRole("link", { name: /^playback$/i });
    this.settingsLink = page.getByRole("link", { name: /^settings$/i });
    this.logsLink = page.getByRole("link", { name: /^logs$/i });
    this.userDetailsLink = page.getByRole("link", { name: /user details/i });
    this.welcomeText = page.getByText(/^welcome,/i);
    this.logoutButton = page.getByRole("button", { name: /logout/i });
  }

  async expectVisible() {
    await expect(this.dashboardLink).toBeVisible({ timeout: 15_000 });
  }

  async goTo(section) {
    const map = {
      dashboard: this.dashboardLink,
      incidents: this.incidentsLink,
      nvr: this.nvrLink,
      live: this.liveLink,
      playback: this.playbackLink,
      settings: this.settingsLink,
      logs: this.logsLink,
      users: this.userDetailsLink,
    };
    const link = map[section.toLowerCase()];
    if (!link) throw new Error(`Unknown sidebar section: ${section}`);
    await link.click();
  }

  async logout() {
    // Profile dropdown is rendered as a click target; open it first if logout is hidden.
    if (!(await this.logoutButton.isVisible())) {
      // Try opening any profile / avatar trigger.
      const trigger = this.page
        .locator(
          "[role='button'][aria-haspopup], [data-testid='profile-trigger'], button:has-text('Profile')"
        )
        .first();
      if (await trigger.isVisible()) await trigger.click();
    }
    await this.logoutButton.click();
  }
}
