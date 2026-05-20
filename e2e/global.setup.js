import { test as setup, expect } from "@playwright/test";
import { LoginPage } from "./pages/LoginPage.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, "playwright/.auth/user.json");

setup("authenticate", async ({ page }) => {
  const username = process.env.TEST_USERNAME;
  const password = process.env.TEST_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "TEST_USERNAME and TEST_PASSWORD must be set in .env — see .env.example"
    );
  }

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  // Log in through the React AdminLoginForm at /admin-login (the form sets
  // the token cookie client-side and navigates to /dashboard on success).
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login(username, password);

  await page.waitForURL(/\/dashboard/i, { timeout: 30_000 });

  // Persist storage state (cookies + localStorage) as soon as we have an
  // authenticated session — BEFORE the dashboard sanity-check below. This
  // guarantees the auth file exists even if the dashboard probe is slow,
  // so the authenticated browser projects always have a state to load.
  await page.context().storageState({ path: AUTH_FILE });

  // Best-effort sanity check that the app itself is reachable. Non-fatal:
  // the storage state is already written above.
  await page.goto("/dashboard").catch(() => {});
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
});
