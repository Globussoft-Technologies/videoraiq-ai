# VideoraIQ — Backend (`server/`)

Node.js 22 control plane: REST API, Socket.IO, RBAC, notifications, scheduled jobs.

For the full system picture, start at the [repository root README](../README.md). For the complete API surface see [docs/api-reference.md](../docs/api-reference.md).

---

## At a Glance

| Property | Value |
|---|---|
| Runtime | Node.js 22 LTS (`type: module`) |
| HTTP framework | Express 4.21 |
| ODM | Mongoose 8.13 |
| Realtime | Socket.IO 4.8 |
| Queue | BullMQ 5 on ioredis 5 |
| Auth | JWT (HS512, 24h) + aMember |
| API modules | 28 |
| Endpoints | 189 |
| Default port | 5000 (configurable via `config.port`) |

---

## Quick Start (Dev)

```bash
npm install
mkdir -p config
# write config/localDev.json — see docs/development.md §2.2 for template

NODE_ENV=localDev npm run dev
```

Visit `http://localhost:5000/` to confirm the welcome message; Swagger UI is at `/api-doc` (basic auth).

---

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Regenerate Swagger then run nodemon |
| `npm run swagger` | Regenerate Swagger JSON only |
| `npm start` | Sequential: `node server.js && node ./core/v1/jobs/utils/worker.js` (see [docs/deployment.md §2.6](../docs/deployment.md#26-bullmq-worker) — run the worker as a sidecar in prod) |
| `npm run obfuscate` | Copy → obfuscate sources into `dist/` |
| `npm run encrypt` | AES-encrypt `config/*.json` using `$MK` |
| `npm run build` | `obfuscate` + `encrypt` |
| `npm run production` | `node bootstrap.js` — **container-only** |

---

## Layout

```
server/
├── bootstrap.js            # Prod entry: decrypts config, regenerates Swagger, imports server.js
├── server.js               # Express app, middleware stack, route mount, error handler
├── socket.js               # Socket.IO server, JWT middleware, Redis session map
├── core/v1/                # 28 API modules (Auth, NVR, Channels, Incidents, ...)
│   └── <module>/
│       ├── <module>.controller.js
│       ├── <module>.routes.js
│       ├── <module>.service.js
│       ├── <module>.model.js
│       └── <module>.validation.js
├── routes/
│   ├── index.js            # Mounts /api/v1
│   └── v1/v1.js            # Per-module mount table — authoritative
├── middlewares/
│   ├── verifyToken.js
│   ├── decodeToken.js
│   ├── permissionMiddleware.js
│   ├── permissionConfigChecker.js
│   ├── checkActivePlan.js
│   ├── xssSanitizer.js
│   └── errorMiddleware.js
├── services/               # python.service.js, telegram.service.js, delete.service.js
├── utils/                  # database, logger, crypto, helpers, SFTP, RTSP
├── mailService/            # SendGrid templates
├── messagingService/       # Twilio (SMS / WhatsApp)
├── constants/              # detectionTypes.js (single source of truth for AI types)
├── language/               # i18n strings
├── views/                  # Swagger JSON + basic auth
├── scripts/                # build helpers: copy_for_obfuscation, encrypt, decrypt, check
├── obfuscator-strong.json  # javascript-obfuscator config
└── Dockerfile
```

---

## Module Map

The 28 API modules under [`core/v1/`](core/v1/) mount through [`routes/v1/v1.js`](routes/v1/v1.js):

| Module | Mount | Auth |
|---|---|---|
| `Auth` | `/auth` | public |
| `Admin` | `/admin` | per-route |
| `NVR` | `/nvr` | mount-level `verifyToken` |
| `channels` | `/channel` | mount-level `verifyToken` |
| `incidents` | `/incidents` | mount-level `verifyToken` |
| `alerts` | `/alert` | mount-level `verifyToken` |
| `verifyRecipients` | `/recipients` | per-route |
| `dashboard` | `/dashboard` | mount-level `verifyToken` |
| `authorizedUsers` | `/authorizedUsers` | mount-level `verifyToken` |
| `authorizedObjects` | `/authorizedObjects` | mount-level `verifyToken` |
| `cameraRestrictions` | `/authorizedChannels` | per-route |
| `detectionSettings` | `/detection-settings` | mount-level `verifyToken` |
| `detectionObjects` | `/detection-objects` | mount-level `verifyToken` |
| `Uploads` | `/uploads` | public ⚠ |
| `storage` | `/storage` | per-route (mostly public ⚠) |
| `profiles` | `/profiles` | mount-level `verifyToken` |
| `attendance` | `/attendance` | mount-level `verifyToken` |
| `roles` | `/roles` | mount-level `verifyToken` |
| `departments` | `/departments` | mount-level `verifyToken` |
| `accesslogs` | `/accessLogs` | mount-level `verifyToken` |
| `permission` | `/permissions` | mount-level `verifyToken` |
| `users` | `/users` | per-route |
| `domain` | `/domain` | public |
| `shifts` | `/shifts` | mount-level `verifyToken` |
| `autoEmailReport` | `/auto-email-report` | mount-level `verifyToken` |
| `jobs` | `/jobs` | mount-level `verifyToken` |
| `entry` | `/entry` | mount-level `verifyToken` |
| `vehicle` | `/vehicle` | mount-level `verifyToken` |
| `locations` | `/locations` | mount-level `verifyToken` |

⚠ flags surfaces with weakened auth — see [docs/security.md §8](../docs/security.md#8-known-gaps).

---

## Middleware Stack ([server.js](server.js))

In application order:

1. `morgan('dev')` — when `NODE_ENV=localDev`
2. `helmet()` — security headers
3. `express.json({ limit: "50mb" })`
4. `express.urlencoded({ extended: true, limit: "50mb" })`
5. `cookieParser()`
6. `mongoSanitize()` — strip `$`/`.` from keys
7. `xss({ allowedKeys: [password, ...] })` — sanitize HTML in body keys (passes through password fields)
8. `cors({ origin: "*", ... })` ⚠ wildcard — tighten for prod
9. `bodyParser.text({ type: "application/xml" })` — for NVR webhook XML payloads
10. `compression()`
11. `express.static('public')`
12. Routes (`/api/v1/...`)
13. Swagger UI on `/api-doc` (basic auth)
14. Global error handler

`express-rate-limit` is installed but the production limiter is commented out — re-enable before public exposure.

---

## Socket.IO

[`socket.js`](socket.js) initializes Socket.IO on the same HTTP server. Authentication is required on every connection:

```js
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  const decoded = jwt.verify(token, secret);
  socket.user = decoded;
  checkActivePlanSocket(socket, next);
});
```

On connect, the server stores `socket:<userId>` → `<socketId>` in Redis. The exported `sendPayloadToUser(userId, channel, payload)` currently broadcasts via `io.emit` regardless of `userId` — see the commented per-user variant for the original intent.

---

## Database

MongoDB via Mongoose 8.13. 24 collections, multi-tenant by `adminId`. Incidents use Mongoose discriminators for 18+ detection-type variants.

See [docs/database.md](../docs/database.md) for the full schema map.

---

## Authentication & Authorization

| Concern | Implementation |
|---|---|
| Login | `POST /api/v1/users/login` (sub-users), `POST /api/v1/auth/by-login-pass` (aMember) |
| JWT verify | [`middlewares/verifyToken.js`](middlewares/verifyToken.js) — HS512, 24h |
| Plan check | [`middlewares/checkActivePlan.js`](middlewares/checkActivePlan.js) — aMember subscription |
| RBAC | [`middlewares/permissionMiddleware.js`](middlewares/permissionMiddleware.js) — `viewAccessCheck`, `createAccessCheck`, `editAccessCheck`, `deleteAccessCheck` |
| Camera scope | `AuthorizedChannels` collection filters which cameras a user can see |
| Password storage | Salted hash via [`utils/passwordEncoderDecoder.js`](utils/passwordEncoderDecoder.js) |

---

## Notifications

| Channel | Provider | Location |
|---|---|---|
| Email | SendGrid | [`mailService/`](mailService/) |
| SMS / WhatsApp | Twilio | [`messagingService/`](messagingService/) |
| Telegram | Bot API | [`services/telegram.service.js`](services/telegram.service.js) |
| In-app | Socket.IO | [`socket.js`](socket.js) |

The notification fan-out flow is documented in [docs/architecture.md §3.2](../docs/architecture.md#32-incident-detection).

---

## Background Jobs (BullMQ)

Queues under `core/v1/jobs/`. The worker lives in `core/v1/jobs/utils/worker.js`. Active queues:

- `autoEmailReport` — scheduled report generation + email
- `delete` — retention-driven deletion
- Ad-hoc queues per module as needed

In production, run the worker as a sidecar — **don't** rely on the `npm start` chain (`node server.js && node worker.js` runs the worker only after the server exits).

---

## Production Build

Three-stage pipeline:

```bash
npm run obfuscate                          # → dist/
MK=<base64-key> npm run encrypt            # config/*.json → config/*.json.enc
docker build -t videora-server:latest .
```

At runtime in a container:

```bash
NODE_ENV=production MK=<base64-key> T=D npm run production
# bootstrap.js decrypts config, regenerates Swagger, imports dist/server.js
```

`T=D` enables the container guard ([`scripts/check.js`](scripts/check.js)) — boot aborts if the process isn't in a container.

Full deployment guide: [docs/deployment.md](../docs/deployment.md).

---

## Configuration

Dev:
- File: `config/<NODE_ENV>.json` (cleartext, gitignored)
- Read by the [`config`](https://www.npmjs.com/package/config) package

Prod:
- File: `config/<NODE_ENV>.json.enc` (encrypted)
- Decrypted at boot by [`bootstrap.js`](bootstrap.js)
- Injected into `process.env.NODE_CONFIG` before any `import config from "config"`

Required top-level keys (verify in [`config/example.json`](config/example.json) if present, or build from [docs/development.md](../docs/development.md#22-backend-server)):

```
port, mongoURI, redis.{host,port}, jwt.{secretKey,expiresIn},
sendgrid.apiKey, twilio.{accountSid,authToken,from},
amember.{url,apiKey}, swagger.{user,pass},
storage.{s3,googleDrive,sftp}, telegram.botToken
```

---

## Logging

Winston with `winston-daily-rotate-file` ([`utils/logger.js`](utils/logger.js)). Logs land under `logs/` (gitignored). Levels:

- `error` — uncaught exceptions, failed external calls, auth failures
- `warn` — degraded states (Redis miss, retry pending)
- `info` — request lifecycle, queue activity
- `debug` — verbose (disable in prod)

---

## Common Tasks

- **Add a new endpoint:** see [docs/development.md §3.1](../docs/development.md#31-module-structure-server).
- **Add a new detection type:** see [docs/development.md §6](../docs/development.md#6-adding-a-new-detection-type).
- **Investigate failed login:** check `logs/`, then aMember API status, then `users` collection lookup logs.
- **Reset BullMQ queues:** flush Redis or use BullMQ's CLI; remember this also clears Socket.IO session keys.

---

## Known Gaps

See [docs/security.md §8](../docs/security.md#8-known-gaps) for the curated list — wildcard CORS, disabled rate limit, several unauthenticated endpoints, broadcast-only socket fan-out.
