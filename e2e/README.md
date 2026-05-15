# VideoraIQ — End-to-End Tests

Playwright suite targeting `https://dev.videoraiq.com` (overridable via `BASE_URL`).

Covers:
- **Login form** — field rendering, validation, wrong creds, successful login, cookie set
- **Dashboard smoke** — page renders, welcome text, sidebar links present, no severe console errors, perf budget
- **Auth edge cases** — unauthenticated redirect, forgot password, session persistence, tampered cookie rejected
- **Navigation** — sidebar routing, deep links, back/forward, unknown route handling, `/logs` redirect
- **Critical flows** — Streams/NVR, Incidents, Users (read-only by default; mutating tests gated by `ALLOW_DESTRUCTIVE_TESTS`)

---

## Quick Start

```bash
cd e2e
npm install
npm run install:browsers     # one-time: downloads Chromium/Firefox/WebKit

cp .env.example .env
# fill in TEST_USERNAME and TEST_PASSWORD with a real dev account

npm test                     # all projects (Chromium + Firefox + WebKit)
npm run test:chromium        # one browser only
npm run test:ui              # interactive UI mode
npm run report               # open the last HTML report
```

If you don't have an account yet, ask the team for a throwaway user on the dev environment, or temporarily run **only** the auth-edge-case tests that don't need credentials.

---

## How It's Organized

```
e2e/
├── package.json              # @playwright/test + dotenv
├── playwright.config.js      # baseURL, projects, traces, reporters
├── global.setup.js           # logs in once, persists storageState
├── .env.example              # copy to .env, fill in creds
│
├── pages/                    # Page Object Models — selectors live here
│   ├── LoginPage.js
│   ├── ForgotPasswordPage.js
│   ├── Sidebar.js
│   ├── DashboardPage.js
│   ├── IncidentsPage.js
│   ├── StreamsPage.js
│   ├── PlaybackPage.js
│   ├── UsersPage.js
│   └── ProfilePage.js
│
├── fixtures/
│   └── auth.js               # extended test object: loginAs, sidebar, clearAuth
│
├── utils/
│   └── env.js                # cookie-name + base-url helpers
│
└── tests/
    ├── 01-login.spec.js
    ├── 02-dashboard-smoke.spec.js
    ├── 03-auth-edge-cases.spec.js
    ├── 04-navigation.spec.js
    ├── 05-nvr-flow.spec.js
    ├── 06-incidents-flow.spec.js
    ├── 07-users-flow.spec.js
    ├── 08-playback.spec.js
    ├── 09-settings.spec.js          # detection / storage / recipients / profile
    ├── 10-workforce-logs.spec.js    # departments / locations / logs routes
    └── 11-rbac.spec.js              # roles-permissions + read-only RBAC check
```

---

## How Authentication Works

1. The `setup` project runs `global.setup.js` first.
2. It opens the login page, signs in with `TEST_USERNAME` / `TEST_PASSWORD`, and saves `playwright/.auth/user.json`.
3. The `chromium` / `firefox` / `webkit` projects load that file as their `storageState`, so spec workers start already logged in.
4. The `unauthenticated` project (covers `01-login.spec.js` and `03-auth-edge-cases.spec.js`) **does not** load the storage state — it deliberately runs from a cold session to exercise the login flow itself.

To force a fresh login for a single test, accept the `clearAuth` fixture:

```js
import { test } from "../fixtures/auth.js";

test("logs in fresh", async ({ page, clearAuth, loginAs }) => {
  await clearAuth();
  await loginAs(process.env.TEST_USERNAME, process.env.TEST_PASSWORD);
});
```

---

## Selectors

Selectors are derived from the React source at [`../client/src/`](../client/src/), not from inspecting the live DOM, so they survive cosmetic / styling churn. If the React source changes, update the matching POM and the rest of the suite picks it up automatically.

Key sources:
- Login form: [`client/src/page/admin/Login/AdminLoginForm.jsx`](../client/src/page/admin/Login/AdminLoginForm.jsx)
- Routes: [`client/src/routes/routes.jsx`](../client/src/routes/routes.jsx)
- Sidebar: [`client/src/layout/Header/Header.jsx`](../client/src/layout/Header/Header.jsx)
- Forgot password: [`client/src/page/user/Users/ForgotPassword.jsx`](../client/src/page/user/Users/ForgotPassword.jsx)
- Auth cookie: [`client/src/utils/getAccessToken.js`](../client/src/utils/getAccessToken.js)

---

## Environment Variables

| Var | Purpose | Default |
|---|---|---|
| `BASE_URL` | Target deployment | `https://dev.videoraiq.com` |
| `TEST_USERNAME` | Account used by setup + smoke tests | _required_ |
| `TEST_PASSWORD` | Password for that account | _required_ |
| `TEST_USERNAME_READONLY` / `TEST_PASSWORD_READONLY` | Optional second account for RBAC tests | _optional_ |
| `AUTH_COOKIE_NAME` | Cookie name set by the dev frontend | `dev-access-token` |
| `LOGIN_PATH` | Path of the login page | `/login` |
| `ALLOW_DESTRUCTIVE_TESTS` | Set to `true` to run mutating flows (create NVR, add user) | `false` |
| `SLOWMO_MS` | Slow down each action for debugging | `0` |

Never commit a real `.env` — it's listed in `.gitignore`.

---

## Running a Subset

```bash
npm run test:login        # 01-login.spec.js
npm run test:smoke        # dashboard + navigation
npm run test:auth         # auth edge cases
npm run test:flows        # NVR + incidents + users
```

Or filter by name:

```bash
npx playwright test -g "session persists across reload"
```

---

## Debugging Failures

- **HTML report** with traces, screenshots, and videos:

  ```bash
  npm run report
  ```

- **Trace viewer** for a specific run:

  ```bash
  npx playwright show-trace test-results/<file>/trace.zip
  ```

- **Live debugging:**

  ```bash
  npm run test:debug                       # PWDEBUG=1
  npm run test:ui                          # Playwright UI mode
  ```

- **Codegen** (record interactions to discover selectors):

  ```bash
  npm run codegen
  ```

---

## CI Hints

- Use `npm ci` in CI to honor the lockfile.
- Set `TEST_USERNAME` / `TEST_PASSWORD` as encrypted CI secrets.
- The config sets `retries: 2` and `workers: 1` automatically when `CI=true` is in the environment.
- `forbidOnly: true` in CI catches accidentally committed `test.only(...)` calls.

Sample GitHub Actions snippet:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 22
- working-directory: e2e
  run: |
    npm ci
    npx playwright install --with-deps
    npm test
  env:
    BASE_URL: https://dev.videoraiq.com
    TEST_USERNAME: ${{ secrets.E2E_USERNAME }}
    TEST_PASSWORD: ${{ secrets.E2E_PASSWORD }}
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: playwright-report
    path: e2e/playwright-report
```

---

## Known Caveats

- The login page route on this codebase is `/admin-login` / `/user-login`, but the dev deployment exposes `/login` as the entry point. The suite navigates to `/login` first; if the deployment changes, update `LOGIN_PATH` in `.env`.
- The forgot-password link is currently commented out in `AdminLoginForm.jsx`; tests visit `/forgot-password` directly.
- HLS playback and live-stream tests are not included — they require a working NVR upstream of the dev environment. Adding them is a follow-up.
- Sonner toasts are caught by both `[data-sonner-toast]` and `[role='status']`; if you change the toast library, update `LoginPage.toast`.
- Destructive flows (creating NVRs / users) are gated. Plumb a teardown hook before flipping `ALLOW_DESTRUCTIVE_TESTS=true` in CI.

---

## See Also

- [`../docs/development.md`](../docs/development.md) — overall dev setup
- [`../docs/security.md`](../docs/security.md) — auth model these tests exercise
- [Playwright docs](https://playwright.dev/docs/intro)
