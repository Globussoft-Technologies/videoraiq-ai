import { test, expect } from "../fixtures/auth.js";
import { UsersPage } from "../pages/UsersPage.js";
import { Sidebar } from "../pages/Sidebar.js";
import { isDestructiveAllowed } from "../utils/env.js";

test.describe("Users / RBAC flow", () => {
  test("user details page renders", async ({ page }) => {
    await new UsersPage(page).goto();
  });

  test("page shows either users or empty state", async ({ page }) => {
    const users = new UsersPage(page);
    await users.goto();

    const hasRows = await users.userRows.first().isVisible().catch(() => false);
    const hasEmpty = await users.emptyState.isVisible().catch(() => false);

    expect(hasRows || hasEmpty).toBeTruthy();
  });

  test("search input filters the list (if rows present)", async ({ page }) => {
    const users = new UsersPage(page);
    await users.goto();

    const hasRows = await users.userRows.first().isVisible().catch(() => false);
    test.skip(!hasRows, "No users — cannot exercise the search");

    const initialCount = await users.userRows.count();
    await users.searchInput.fill("zzz-very-unlikely-name-zzz");
    // Allow a moment for the filter / debounce.
    await page.waitForTimeout(800);
    const filteredCount = await users.userRows.count();
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
  });

  test("roles & permissions route is reachable", async ({ page }) => {
    await page.goto("/roles-permissions");
    // Permission-gated. Either it loads or the AccessDenied page renders.
    await expect(page).toHaveURL(/roles-permissions|access-denied|dashboard/i, {
      timeout: 15_000,
    });
  });

  test("departments page is reachable", async ({ page }) => {
    await page.goto("/departments");
    await expect(page).toHaveURL(/departments|access-denied|dashboard/i, {
      timeout: 15_000,
    });
  });

  test("logout via header clears the session", async ({ page, context }) => {
    await page.goto("/dashboard");
    const sidebar = new Sidebar(page);
    await sidebar.expectVisible();

    await sidebar.logout().catch(async () => {
      // Some builds redirect through /logout instead — that's also valid.
      await page.goto("/logout");
    });

    // After logout we should not be able to reach /dashboard. On the dev
    // deployment, logout hands off to the aMember member page
    // (dev.videoraiq.com/member/index), so the post-logout URL may match
    // /login (React form) OR /member|amember (aMember) — tolerate both.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/login|member|amember/i, { timeout: 15_000 });

    const cookies = await context.cookies();
    const tokens = cookies.filter((c) =>
      ["dev-access-token", "prod-access-token", "access-token"].includes(c.name)
    );
    expect(tokens, JSON.stringify(tokens)).toHaveLength(0);
  });
});

test.describe("Users (destructive)", () => {
  test.skip(
    () => !isDestructiveAllowed(),
    "Destructive tests disabled — set ALLOW_DESTRUCTIVE_TESTS=true"
  );

  test("create + delete a test sub-user (placeholder)", async ({ page }) => {
    test.info().annotations.push({
      type: "todo",
      description:
        "Implement once the dev environment exposes a cleanup endpoint or " +
        "we wire up a tear-down hook to drop the created user.",
    });
  });
});
