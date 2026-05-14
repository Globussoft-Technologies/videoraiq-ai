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

  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login(username, password);

  // Wait for the post-login redirect to land on the dashboard.
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  await expect(page).toHaveURL(/\/dashboard/);

  // Persist storage state so spec workers can skip the login flow.
  await page.context().storageState({ path: AUTH_FILE });
});
