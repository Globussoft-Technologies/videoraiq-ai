# VideoraIQ

**AI video intelligence that runs on the CCTV a site already owns.**

VideoraIQ ingests existing RTSP camera and NVR feeds, runs detection models against every frame, and
raises evidence-backed incidents — each with a clip, a camera location and a timestamp — to an
operator console and to alert recipients. No camera replacement, and inference can run entirely
inside the customer's own network.

This is a monorepo: control-plane API, operator console, admin console, super-admin service, and an
end-to-end test suite.

---

## Repository layout

| Directory | What it is | Docs |
|---|---|---|
| [`server/`](server/) | Node.js 22 control plane — REST API, Socket.IO, RBAC, notifications, scheduled jobs. 28 API modules, 189 endpoints | [README](server/README.md) · [status](server/PROJECT_STATUS.md) · [monitoring](server/MONITORING.md) |
| [`server-superadmin/`](server-superadmin/) | Super-admin service — tenant and cross-account administration | [README](server-superadmin/README.md) · [monitoring](server-superadmin/MONITORING.md) |
| [`client/`](client/) | React 19 operator console (Vite 6, Tailwind 4, shadcn/ui) | [README](client/README.md) · [status](client/PROJECT_STATUS.md) |
| [`client_v2/`](client_v2/) | Next-generation operator console | — |
| [`docker-client/`](docker-client/) | Container build of the operator console. Mirrors `client/` — keep routes, contexts and env vars in sync | [README](docker-client/README.md) |
| [`react-admin/`](react-admin/) | Lightweight admin console | — |
| [`e2e/`](e2e/) | Playwright end-to-end suite, Chromium / Firefox / WebKit | [README](e2e/README.md) |
| [`.github/`](.github/) | CI/CD workflows, required secrets, caching and artifact policy | [README](.github/README.md) |

---

## Detection capabilities

Detection types are declared in
[`server/constants/detectionTypes.js`](server/constants/detectionTypes.js), which is the source of
truth — the settings model, services, controllers and channel model all key off it.

**Active types:**

| Safety & compliance | Access & perimeter | Counting & flow | Operations |
|---|---|---|---|
| Personal Protective Equipment | Intrusion / Unauthorized Access | Crowd Detection | Desk Absence |
| Food Service PPE | Line Crossing | Count Persons | Guard Absence |
| Water Spillage | Loitering | Count Vehicles | Table Occupancy |
| Conveyor | Door | Vehicle Type | Light |
| Crusher | ANPR (vehicle plate) | Vehicle & Obstruction | Mobile Phone |

Face recognition and access logging run alongside these, feeding the Attendance and Access Log
modules.

**Two things worth knowing before you rely on this list:**

1. Several types are **present in the codebase but commented out** of `DETECTION_TYPES` — fire and
   smoke, weapon, unattended baggage, motion, generic object, and the two authorization-scoped
   loitering variants. Supporting code exists for some of them; they are not active settings types.
   Check the constant before assuming a detector is wired end to end.
2. A detection type being accepted by the API schema does not by itself guarantee a selected
   production pipeline behind it. Verify against the inference layer for the deployment you are
   targeting.

**Incident feed exclusions.** `countPersons`, `lineCrossing` and `countVehicles` never produce a
reviewable snapshot — a count is a running tally, a line cross is a tripwire event. They are still
recorded as incidents and still counted in Analytics, but are filtered out of the Alerts / Incident
Center list and have dedicated log pages instead. This is why an Analytics total can legitimately
exceed what the Alerts view displays.

---

## Architecture

```
RTSP cameras / NVRs
        │
        ▼
  Inference layer  ──────────────┐
  (detection models per channel) │  incidents + evidence
        │                        ▼
        │            ┌──────────────────────┐
        └──────────► │  server/ (Node 22)   │  REST + Socket.IO
                     │  Express · Mongoose  │  RBAC · JWT (HS512)
                     │  BullMQ on ioredis   │  scheduled jobs
                     └──────────┬───────────┘
                                │
              ┌─────────────────┼──────────────────┐
              ▼                 ▼                  ▼
        client/ (React)   react-admin/     server-superadmin/
        operator console  admin console    tenant administration
```

| Layer | Technology |
|---|---|
| Runtime | Node.js 22 LTS, ES modules |
| API | Express 4.21, Swagger UI at `/api-doc` |
| Data | MongoDB via Mongoose 8.13 |
| Queue / cache | BullMQ 5 on ioredis 5 |
| Realtime | Socket.IO 4.8 |
| Auth | JWT (HS512, 24h) |
| Hardening | `express-mongo-sanitize`, `express-xss-sanitizer`, `express-rate-limit`, `helmet`-style middleware |
| Frontend | React 19, React Router 7, Vite 6, Tailwind 4, shadcn/ui (Radix) |
| Charts / media | amCharts 5, ApexCharts, `hls.js` |
| Storage / notifications | AWS S3, SendGrid |
| Tests | Vitest (unit / contract / integration), Playwright (e2e) |

---

## Quick start

Requires **Node.js 22**, a MongoDB instance and a Redis instance.

**Control plane**

```bash
cd server
npm install
mkdir -p config          # write config/localDev.json before first run
NODE_ENV=localDev npm run dev
```

The service listens on port `5000` by default (`config.port`). Confirm with the welcome message at
`http://localhost:5000/`; Swagger UI is at `/api-doc`, behind basic auth.

> `npm start` runs `server.js` and the BullMQ worker sequentially. **In production run the worker as
> a separate sidecar process**, not chained behind the API.

**Operator console**

```bash
cd client
npm install
npm run dev
```

**End-to-end tests**

```bash
cd e2e
npm install
npx playwright install --with-deps
npm test                 # or test:smoke / test:flows / test:chromium
```

E2E specs need `E2E_USERNAME` and `E2E_PASSWORD` for a user provisioned on the target environment.
Without them the authenticated specs are skipped and only the unauthenticated ones (login,
forgot-password, redirect) run. Full secret list in [`.github/README.md`](.github/README.md).

---

## CI/CD

GitHub Actions run on every push and PR to `main`, with tight path filters — editing `e2e/` runs only
the e2e workflow. Vitest for the server, ESLint plus `vite build` for both React variants, a
Playwright matrix across three browsers nightly, and CodeQL static analysis weekly.

Concurrency is grouped per ref with `cancel-in-progress`, so a second push cancels the in-flight run.
See [`.github/README.md`](.github/README.md) for triggers, required secrets, caching and artifact
retention.

---

## Contributing

- Follow the existing module layout in `server/` — `routes → controllers → services → models`.
- Adding a detection type means updating **six** places. The list is at the top of
  [`server/constants/detectionTypes.js`](server/constants/detectionTypes.js): `DETECTION_TYPES`,
  `TYPE_MAP`, example payloads, the detection-settings model, the service
  (`createDetectionSettings`, `getDetectionExamples`), the controller Swagger block, and the channels
  model and service.
- Keep `client/` and `docker-client/` in sync on any public-surface change.
- Use the [pull request template](.github/PULL_REQUEST_TEMPLATE.md).
