# Server Tests

Vitest-based test suite for the Node.js backend. Three tiers:

| Tier | Folder | What it covers | Speed |
|---|---|---|---|
| **Unit** | `tests/unit/` | Pure functions, validators, middleware in isolation. No I/O. | Fast (ms) |
| **Contract** | `tests/contract/` | Route wiring with Supertest. Models/services mocked. | Medium |
| **Integration** | `tests/integration/` | Real Mongoose against `mongodb-memory-server`. | Slow (seconds) |

---

## Run

```bash
cd server
npm install                     # one-time
npm test                        # everything
npm run test:unit               # unit only
npm run test:contract           # contract only
npm run test:integration        # integration only
npm run test:watch              # rerun on change
npm run test:ui                 # Vitest UI
npm run test:coverage           # with coverage report
```

---

## Layout

```
tests/
├── setup.js                    # populates NODE_CONFIG before any import
├── helpers/
│   ├── factory.js              # makeUser, makeAdmin, makeReqRes, signJwt
│   └── app.js                  # buildApp() — minimal Express, no Mongo / no sockets
│
├── unit/
│   ├── utils/                  # cryptoUtils, response, appError, passwordEncoderDecoder
│   ├── middlewares/            # permissionMiddleware, permissionConfigChecker, checkActivePlan
│   ├── auth/                   # AUTHService.extractSubscriptions, isPlanActive, transformData
│   └── validation/             # Joi schemas: roles, permissions, NVR, users
│
├── contract/
│   ├── auth.routes.test.js     # /api/v1/auth/* with service mocked
│   └── protected.routes.test.js # verifyToken header behavior
│
└── integration/
    ├── dbSetup.js              # connect/disconnect helpers
    └── models/                 # Admin, Role schema constraints
```

---

## Conventions

- **One module per file** — mirrors the source tree under `tests/<tier>/<module>/`.
- **`vi.mock` before import** — modules with `config.get(...)` or model imports at
  scope must be mocked before the source module is imported. `tests/setup.js`
  takes care of `config` globally; per-test mocks live at the top of each spec.
- **Pure helpers in `helpers/factory.js`** — never reach across into application
  state. Tests build the data they need.
- **Pin current behavior, even if surprising** — when a controller / response
  returns an unexpected status code (e.g. `notFoundResp` → 500, `planExpiredResp`
  → 812), the test pins that. A future cleanup will surface as a visible diff.

---

## Adding a New Test

1. Identify the tier (unit / contract / integration).
2. Mirror the source path under `tests/<tier>/`. For `core/v1/roles/roles.service.js`
   the test lives at `tests/unit/services/roles.service.test.js` (unit) or
   `tests/integration/services/roles.service.test.js` (integration).
3. Use the factories in `helpers/factory.js` for fixture data.
4. Use `buildApp` from `helpers/app.js` for contract tests.
5. Use `connectMongo`/`disconnectMongo`/`clearCollections` from `integration/dbSetup.js`
   for any test that touches a model.

---

## Gotchas

### `config.get(...)` at module scope
Many source files call `config.get(...)` at the top level. The test runner
populates `process.env.NODE_CONFIG` via `tests/setup.js` *before* the test
runner imports anything else. If you add a new config key to a source file,
mirror it in `tests/setup.js` or imports will fail with `Configuration property
"X" is not defined`.

### Mongo connection
Unit and contract tests should never connect to Mongo. If you see a test hang
or fail with timeout, double-check that all model imports are mocked.

### Heavy modules
`core/v1/Auth/auth.service.js` imports many Mongoose models. Importing the file
is safe (models register but don't connect), but calling DB-touching methods
from a unit test will fail. Only the pure methods (`extractSubscriptions`,
`isPlanActive`, `transformData`, `transformTopUpData`) are safe to unit-test.

### Coverage threshold
Coverage thresholds are not yet enforced. Once the suite stabilizes, raise the
floor in `vitest.config.js` under `test.coverage.thresholds`.

---

## TODO (next wave)

- Service-level integration tests for NVR registration, channel CRUD, incident creation.
- Snapshot tests for the SwaggerAutogen output to catch unintentional route drift.
- BullMQ worker tests for the autoEmailReport queue.
- Socket.IO connection tests (JWT handshake, plan check, broadcast).
