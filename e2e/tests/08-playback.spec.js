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

  // #45 — playback fetches incidents and gets 401, which then triggers
  // a TypeError in the timeline because the response is undefined. Pinned
  // until that ships; remove the .fixme once both are addressed.
  test.fixme("no severe console errors on the playback page", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    await new PlaybackPage(page).goto();
    await page.waitForTimeout(2_000);

    // Same env-noise as the dashboard spec: ws://localhost:<port>/statusinfo
    // probe + ERR_CONNECTION_REFUSED is absent on a clean Playwright browser.
    const ignorable =
      /hls\.js|dicebear|adblock|google|gtag|sentry|favicon|chunk-error|404|ws:\/\/localhost.*statusinfo|ERR_CONNECTION_REFUSED/i;
    const real = errors.filter((e) => !ignorable.test(e));
    expect(real, real.join("\n")).toHaveLength(0);
  });

  // R15 — non-fixme deeper coverage. PlaybackHeader.jsx (confirmed via
  // source) renders a CCTV Playbacks heading and the following filter
  // controls in this order: Search cameras input, Select Location,
  // Select NVR, Select Camera, Select Department, Select Camera Type
  // (MultiSelect), and a DatePickerComponent. We assert the primary
  // controls are present rather than touching the video element (which
  // remains blocked by #45 401 noise).
  test("playback header renders search + dropdown filters", async ({
    page,
  }) => {
    const playback = new PlaybackPage(page);
    await playback.goto();

    // CCTV Playbacks heading text (h2 in PlaybackHeader.jsx).
    await expect(
      page.getByText(/cctv playbacks/i).first()
    ).toBeVisible({ timeout: 15_000 });

    // Search input. Placeholder = "Search cameras".
    const search = page.getByPlaceholder(/search cameras/i).first();
    await expect(search).toBeVisible({ timeout: 15_000 });

    // Header renders five Radix Select triggers (Location, NVR, Camera,
    // Department, Camera Type) + the date picker. The selects mount as
    // role=combobox. Some may already have a persisted value (e.g. NVR =
    // "nvr1d", Camera = "Main Entrance" on the dev tenant), so we just
    // assert the count rather than the placeholder text.
    const comboCount = await page.getByRole("combobox").count();
    expect(comboCount).toBeGreaterThanOrEqual(4);

    // The Date picker is always present whether or not a date is chosen —
    // it surfaces a button with aria-label="Choose date".
    await expect(
      page.getByRole("button", { name: /choose date/i }).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("playback search input accepts typing and clears", async ({ page }) => {
    const playback = new PlaybackPage(page);
    await playback.goto();

    const search = page.getByPlaceholder(/search cameras/i).first();
    await expect(search).toBeVisible({ timeout: 15_000 });

    await search.fill("zzz-no-such-camera");
    await expect(search).toHaveValue("zzz-no-such-camera");

    // Empty search results dropdown appears whenever input has text and
    // no results. Webkit can lag this animation, so wrap in toPass.
    await expect(async () => {
      const dropdown = page.getByText(/no search results found/i).first();
      // If the API returns no matches, the dropdown should appear; if it
      // returned a real match, we'll see at least one selectable result.
      const noResults = await dropdown.isVisible().catch(() => false);
      const anyResult = await page
        .locator("div.cursor-pointer")
        .first()
        .isVisible()
        .catch(() => false);
      expect(noResults || anyResult).toBeTruthy();
    }).toPass({ timeout: 10_000 });

    // Clear and confirm.
    await search.fill("");
    await expect(search).toHaveValue("");
  });

  test("location dropdown can be opened", async ({ page }) => {
    const playback = new PlaybackPage(page);
    await playback.goto();

    // The Radix Select trigger for Location renders the placeholder text
    // "Select Location" until a value is chosen. Click the trigger and
    // assert the listbox or 'No options available' label appears.
    const locationTrigger = page.getByText(/select location/i).first();
    await expect(locationTrigger).toBeVisible({ timeout: 15_000 });

    await locationTrigger.click();

    await expect(async () => {
      const listbox = page.getByRole("listbox").first();
      const empty = page.getByText(/no options available/i).first();
      const listboxVisible = await listbox.isVisible().catch(() => false);
      const emptyVisible = await empty.isVisible().catch(() => false);
      expect(listboxVisible || emptyVisible).toBeTruthy();
    }).toPass({ timeout: 10_000 });

    // Close the popover so subsequent tests start clean.
    await page.keyboard.press("Escape").catch(() => {});
  });
});
