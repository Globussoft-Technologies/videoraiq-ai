import { test, expect } from "../fixtures/auth.js";
import { PlaybackPage } from "../pages/PlaybackPage.js";

test.describe("Playback", () => {
  test("playback page renders for an authenticated user", async ({ page }) => {
    await new PlaybackPage(page).goto();
  });

  test("playback page exposes a camera selector or date picker", async ({
    page,
  }) => {
    const playback = new PlaybackPage(page);
    await playback.goto();
    const hasSelect = await playback.cameraSelect
      .first()
      .isVisible()
      .catch(() => false);
    const hasDate = await playback.dateRangePicker
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasSelect || hasDate).toBeTruthy();
  });

  test("no severe console errors on the playback page", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    await new PlaybackPage(page).goto();
    await page.waitForTimeout(2_000);

    const ignorable =
      /hls\.js|dicebear|adblock|google|gtag|sentry|favicon|chunk-error|404/i;
    const real = errors.filter((e) => !ignorable.test(e));
    expect(real, real.join("\n")).toHaveLength(0);
  });
});
