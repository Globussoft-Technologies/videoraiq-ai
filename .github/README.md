# CI / CD

GitHub Actions workflows that run for every push and PR against `main`.

## Workflows

| Workflow | Triggers | What it does |
|---|---|---|
| [`server-tests.yml`](workflows/server-tests.yml) | `server/**` change, manual | Vitest: unit → contract → integration → coverage (parallel jobs; coverage waits) |
| [`client.yml`](workflows/client.yml) | `client/**` or `docker-client/**` change, manual | ESLint + `vite build` for both React variants; Vitest unit tests + coverage for `client/` |
| [`e2e-tests.yml`](workflows/e2e-tests.yml) | push/PR to main, nightly cron (02:00 UTC), manual | Playwright matrix across Chromium / Firefox / WebKit against the dev environment |
| [`codeql.yml`](workflows/codeql.yml) | push/PR to main, weekly cron | GitHub CodeQL static analysis (JavaScript) |

Path filters are tight: editing `e2e/` only runs the e2e workflow, etc. Use `workflow_dispatch` from the Actions tab to run anything manually.

## Required Secrets

Set under **Settings → Secrets and variables → Actions**.

| Secret | Used by | Notes |
|---|---|---|
| `E2E_USERNAME` | `e2e-tests.yml` | A real test user provisioned on the target environment |
| `E2E_PASSWORD` | `e2e-tests.yml` | Password for `E2E_USERNAME` |
| `E2E_BASE_URL` | `e2e-tests.yml` | _Optional._ Defaults to `https://dev.videoraiq.com` |
| `E2E_BACKEND_URL` | `e2e-tests.yml` | _Optional._ Defaults to `https://dev-api.videoraiq.com` |
| `E2E_STREAMING_URL` | `e2e-tests.yml` | _Optional._ Defaults to `https://dev-stream.videoraiq.com` |
| `E2E_AUTH_COOKIE_NAME` | `e2e-tests.yml` | _Optional._ Defaults to `dev-access-token` |
| `E2E_LOGIN_PATH` | `e2e-tests.yml` | _Optional._ Defaults to `/login` |

Without `E2E_USERNAME` + `E2E_PASSWORD` the global setup step throws, which skips the authenticated specs but still runs the unauthenticated ones (login, forgot-password, redirect).

## Workflow Concurrency

Each workflow uses `concurrency.group: <name>-${{ github.ref }}` with `cancel-in-progress: true`. A second push to the same branch cancels the in-flight run — keeps the queue short and feedback fast.

## Caching

| Cache | Key | Purpose |
|---|---|---|
| `npm` (built into `setup-node`) | `package-lock.json` hash | Skip re-download of node_modules |
| `~/.cache/mongodb-binaries` | `runner.os` | Don't re-download the in-memory MongoDB binary on every run |
| `~/.cache/ms-playwright` | `runner.os` + `e2e/package.json` hash | Skip the ~300 MB browser download |

## Artifacts

| Artifact | Workflow | Retention |
|---|---|---|
| `server-coverage-<run_id>` | server-tests / coverage job | 14 days |
| `playwright-report-<project>-<run_id>` | e2e-tests | 14 days |
| `playwright-traces-<project>-<run_id>` | e2e-tests (failures only) | 14 days |
| `client-dist-<run_id>` / `docker-client-dist-<run_id>` | client | 7 days |

Open a failed run → "Artifacts" panel at the bottom right.

## Dependabot

Configured in [`dependabot.yml`](dependabot.yml):

- Weekly npm updates for `server/`, `client/`, `docker-client/`, `e2e/`
- Weekly GitHub Actions updates
- Radix-UI and Tailwind ecosystem updates are grouped to one PR each per repo

## Adding a New Workflow

1. Drop a YAML file in `.github/workflows/`.
2. Add a tight `paths:` filter so it only runs when relevant code changes.
3. Set `concurrency` with `cancel-in-progress: true`.
4. Set `timeout-minutes` (default 6 hours is too generous).
5. Cache anything that takes > 30 seconds to download or build.
6. Update this README with what it does and which secrets it needs.

## Local Reproduction

```bash
# Server tests — same flow as CI
cd server
npm ci
npm test                   # all tiers
npm run test:coverage      # produces coverage/index.html

# E2E — same flow as CI
cd e2e
npm ci
npm run install:browsers
cp .env.example .env       # fill TEST_USERNAME, TEST_PASSWORD
npm test
npm run report             # open HTML report

# Client build — same flow as CI
cd client && npm ci && npm run lint && npm run build
```

## CodeQL Findings

Triggered weekly and on every PR. Findings show up under **Security → Code scanning alerts**. Fix or dismiss with rationale — don't ignore.
