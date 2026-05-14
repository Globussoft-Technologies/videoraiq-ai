import { expect } from "@playwright/test";

export class PlaybackPage {
  static PATH = "/playback";

  constructor(page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: /playback/i }).first();
    this.cameraSelect = page.locator(
      "[data-testid='camera-select'], select, [role='combobox']"
    );
    this.videoPlayer = page.locator("video, [data-testid='hls-player']").first();
    this.dateRangePicker = page.locator(
      "[data-testid='date-range'], button:has-text('Date Range'), button:has-text('Today')"
    );
  }

  async goto() {
    await this.page.goto(PlaybackPage.PATH);
    await this.expectLoaded();
  }

  async expectLoaded() {
    await expect(this.page).toHaveURL(/\/playback/i);
    await Promise.race([
      this.heading.waitFor({ state: "visible", timeout: 15_000 }),
      this.cameraSelect.first().waitFor({ state: "visible", timeout: 15_000 }),
      this.dateRangePicker.first().waitFor({ state: "visible", timeout: 15_000 }),
    ]);
  }
}
