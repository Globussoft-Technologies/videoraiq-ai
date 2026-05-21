import { test, expect } from "../fixtures/auth.js";

/**
 * Document-title regression checks pinned to issue #67 in videoraiq-ai.
 *
 * Two bugs to catch once #67 is fixed:
 *   1. The brand string in routeTitles is "VideoralQ" (lowercase L), not
 *      "VideoraIQ" (capital I).
 *   2. /locations and /departments are missing from routeTitles, so they
 *      fall back to the bare brand string.
 *
 * Every assertion below is currently `test.fixme(true, ...)` so it neither
 * fails the suite nor counts as a passing test. After #67 lands, flip the
 * fixmes off and these will guard against regression.
 */
test.describe("Document title regressions (issue #67)", () => {
  const routeExpectations = [
    { path: "/dashboard", title: /Dashboard \| VideoraIQ/ },
    { path: "/incidents", title: /Incidents \| VideoraIQ/ },
    { path: "/detection-settings", title: /Detection-Settings \| VideoraIQ/ },
    {
      path: "/notification-recipients",
      title: /Alert-Recipients \| VideoraIQ/,
    },
    { path: "/locations", title: /Locations \| VideoraIQ/ },
    { path: "/departments", title: /Departments \| VideoraIQ/ },
  ];

  for (const { path: routePath, title } of routeExpectations) {
    test(`document.title on ${routePath} matches ${title}`, async ({
      page,
    }) => {
      test.fixme(
        true,
        "Issue #67: routeTitles uses lowercase 'VideoralQ' and is missing /locations + /departments. Unpin once fixed."
      );
      await page.goto(routePath);
      await page
        .waitForLoadState("networkidle", { timeout: 15_000 })
        .catch(() => {});
      await expect(page).toHaveTitle(title);
    });
  }
});
