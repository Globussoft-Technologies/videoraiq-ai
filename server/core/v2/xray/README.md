# X-Ray mode — Node relay

**The authority for every interface here is
`face_plus_obj_detection_cpp_variant/docs/xray/00_CONTRACT.md`, which is frozen.**
If this README and the contract disagree, the contract is right and this file is
stale. Nothing here may be changed to "fix" a mismatch — raise it instead.

Status: **complete, phases 0-6.** A session can be opened, clicked, streamed to
a browser and closed, with authorisation, licensing, reaping from both ends and
failure behaviour that tells the frontend rather than leaving it spinning.
241 tests. See `docs/xray/status_backend.md` for the phase-by-phase record,
including what is deliberately not done.

---

## What this is

A relay, and nothing more. It owns authorisation, licensing, session
bookkeeping and fan-out. It owns **no video, no GPU and no detection logic** —
those live in the Python `xray_service` on the GPU box.

```
browser ──HTTP──► THIS MODULE ──HTTP──► Python xray_service ──► SAM3 on the GPU
   ▲                   ▲
   └──socket.io────────┘◄──WebSocket (Python dials IN to Node)
      masks out                masks in
```

The browser never receives pixels from us. It plays the same HLS video it always
did; X-ray only draws an outline on top. We ship polygons, never frames.

---

## Turning it on and off

**Everything is behind one flag, and the flag is off by default.** With
`XRAY_ENABLED` unset, `/api/v2/xray/*` returns `404` exactly as it did before
this module existed, no WebSocket port is bound, and no database collection is
created. Proven by `tests/contract/xray.disabled.test.js`.

Each setting can be given as an **environment variable** (easiest — no config
file to edit) or as a key in the `config` directory. The environment always
wins. A missing setting falls back to the default; a nonsense value falls back
too, rather than breaking the boot.

| Environment variable | Config key | Default | What it does |
|---|---|---|---|
| `XRAY_ENABLED` | `xray.enabled` | `false` | **The master switch.** Nothing else in this table matters while it is off. |
| `XRAY_SERVICE_URL` | `xray.serviceUrl` | *(empty)* | Base URL of the Python X-ray service, e.g. `http://gpu-box:8130`. |
| `XRAY_API_KEY` | `xray.apiKey` | *(empty)* | Shared service key, sent as `X-API-Key`. Same convention as `sam3_service`. |
| `XRAY_JWT_SECRET` | `xray.jwtSecret` | *(empty)* | HS256 secret for the service token. Falls back to the `JWT_SECRET_KEY` env var. **See the warning below.** |
| `XRAY_JWT_TTL_SEC` | `xray.jwtTtlSec` | `120` | Service-token lifetime. Clamped to 30–300 s. |
| `XRAY_SERVICE_TIMEOUT_MS` | `xray.serviceTimeoutMs` | `15000` | How long to wait on the Python service. |
| `XRAY_IDLE_TIMEOUT_SEC` | `xray.idleTimeoutSec` | `45` | No heartbeat for this long and the session is closed, freeing its GPU slot. |
| `XRAY_REAP_INTERVAL_SEC` | `xray.reapIntervalSec` | `15` | How often the idle sweep runs. |
| `XRAY_CLOSE_MAX_ATTEMPTS` | `xray.closeMaxAttempts` | `5` | Give up closing a session after this many failures, mark it `ended/internal_error`, and tell the browser. |
| `XRAY_WS_PATH` | `xray.wsPath` | `/internal/xray/ws` | Path the Python service dials into, **on the API's own port**. With the API on 5055 that is `ws://host:5055/internal/xray/ws`. |
| `XRAY_WS_PORT` | `xray.wsPort` | `5055` | Reported in diagnostics only. The WebSocket shares the API server, so this does not bind anything. |
| `XRAY_WS_PING_SEC` | `xray.wsPingSec` | `20` | Keepalive interval; a missed reply drops the connection. |
| `XRAY_LICENSE_CHECK` | `xray.licenseCheck` | `auto` | `auto` follows the platform's own `LICENSING_ENABLED`; `on` always requires a licence; `off` never checks. |
| `XRAY_LICENSE_SETTING_TYPE` | `xray.licenseSettingType` | `xRayMode` | The allocation row the superadmin writes to grant X-ray. |

### Three different secrets, do not mix them up

| Secret | Signs / verifies | Where |
|---|---|---|
| `jwt.secretKey` | browser login tokens | already in this repo's config |
| `Backend.token` | inbound calls from the Python backend | already in this repo's config |
| `XRAY_JWT_SECRET` / `JWT_SECRET_KEY` | **outbound** X-ray service calls | **new — must be set, and must match the Python box** |

The third one is the same value the Python repo already has as `JWT_SECRET_KEY`
(`config/settings.py:1472`). Set the same string on both machines. It is **not**
either of the first two; using one of those would let a browser token act as a
service token.

### Checking what is configured

`xrayConfigSummary()` in `xray.config.js` returns a secret-free summary (keys
report `set` / `(unset)`, never their value), and `xrayConfigProblems()` lists
what is missing while the flag is on. Phase 2 wires both into the boot log.

---

## Endpoints

All under `/api/v2/xray`, all behind the existing `verifyToken`. Full request and
response shapes are contract §5 — this is the index, not the spec.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/sessions` | Open a session on a camera. A `200` is a promise that frames are flowing. |
| `POST` | `/sessions/:sessionId/prompt` | Seed a track from a click. |
| `POST` | `/sessions/:sessionId/heartbeat` | Keep it alive; the frontend calls this every 10 s. |
| `GET` | `/sessions/:sessionId` | Current state. |
| `DELETE` | `/sessions/:sessionId` | Close it and free the GPU slot. **Idempotent.** |
| `DELETE` | `/sessions/:sessionId/objects/:objId` | Stop tracking one object. **Idempotent.** |

Errors use contract §10's body, **not** this codebase's usual
`{ status, message, error }`:

```json
{ "error": "frame_not_buffered", "message": "...", "retryable": false }
```

The `error` string is the contract — the frontend switches on it, and codes from
the Python service are passed through unchanged. `message` is for humans and may
change freely.

---

## The files

| File | Role |
|---|---|
| `xray.config.js` | every flag and tunable; **no side effects**, safe to import anywhere |
| `xray.errors.js` | the contract §10 error vocabulary and the service-layer result shapes |
| `xray.validate.js` | Joi schemas and the two validation middlewares |
| `xray.routes.js` | URLs and middleware; no logic |
| `xray.controller.js` | reads the request, calls the service, shapes the response |
| `xray.service.js` | the relay's own logic; the only file that talks to Mongo |
| `xray.client.js` | the only file that makes an HTTP call to the Python service |
| `xray.translate.js` | the snake_case ⇄ camelCase boundary, in one place |
| `xray.camera.js` | camera authorisation, and turning a camera into a playlist URL |
| `xray.license.js` | the licence gate (see "Licensing" below) |
| `xray.sockets.js` | which browser socket a session's masks belong to |
| `xray.ws.js` | the WebSocket the Python service dials into |
| `xray.fanout.js` | mask in, browser out |
| `xray.reaper.js` | closing sessions nobody is watching |
| `xray.model.js` | the MongoDB session record |

Dev fixtures, under `dev/`. None is imported by anything in the request path:

| File | Role |
|---|---|
| `dev/fakeXrayService.js` | a fake Python service (REST), with fault injection |
| `dev/fakeXrayStreamer.js` | a fake Python service (WebSocket) streaming masks |
| `dev/fakeXrayBrowser.js` | a fake browser: socket.io client + opens a session |
| `dev/fakeRedis.js` | a tiny Redis stand-in, for machines with no Redis |
| `dev/probeXrayClient.js` | drives a whole session and prints every response |
| `dev/seedXrayFixtures.js` | seeds a local database and prints ready-made tokens |
| `dev/run-local.ps1` | boots the real server with every outbound call sandboxed |

### Four deliberate design choices worth knowing

**The controller is imported per request, not at the top of `xray.routes.js`.**
`routes/v2/v2.js` has to import the router synchronously in order to mount it,
and that import runs flag or no flag. Compiling a Mongoose model registers it
and lets Mongoose build indexes against the live database — a visible change to
a deployment that is supposed to be untouched. Deferring the controller keeps
the import graph from `v2.js` down to Express, Joi and two inert files.

**Sessions live in MongoDB, not in memory.** Each one holds a GPU slot on
another machine. If Node tracked them in memory, a restart would forget them and
that GPU state would be orphaned with nothing left to close it. The record is
what makes the idle reaper and the startup sweep possible.

**The service token is minted per request, never cached.** A cached bearer token
sits in process memory for its whole lifetime and is replayable if it leaks.
Minting costs an HMAC over about a hundred bytes — microseconds, against a
15-second network timeout. Its lifetime is clamped to the contract's 5-minute
ceiling whatever `XRAY_JWT_TTL_SEC` says.

**Nothing in the client retries.** A timeout on `POST /sessions` may well have
started a session on the far side with only the reply lost; retrying would
strand a second GPU slot. The reapers on both ends are what clean that up. And
contract §10 forbids auto-retrying `409 frame_not_buffered` outright — the user
clicked at a moment the service had no frame for, and only a fresh human click
fixes it.

---

## Tests

```bash
cd videoraiq/server

# everything X-ray, 142 tests
npx vitest run tests/unit/xray tests/contract/xray.disabled.test.js     tests/contract/xray.enabled.test.js tests/contract/xray.routes.test.js
```

| File | Proves |
|---|---|
| `tests/contract/xray.disabled.test.js` | flag off ⇒ 404, and the database model is never even compiled |
| `tests/contract/xray.enabled.test.js` | flag on ⇒ routed, and still 401 without a token |
| `tests/contract/xray.routes.test.js` | every endpoint's 501, and validation rejecting bad input first |
| `tests/unit/xray/xray.config.test.js` | each flag's default, override and fallback |
| `tests/unit/xray/xray.client.test.js` | credentials, error pass-through, timeouts, no retries |
| `tests/unit/xray/xray.translate.test.js` | no snake_case escapes to the browser, unknown fields dropped |

### Seeing it work for real, with no GPU

Two terminals:

```bash
# 1. the fake Python service
node core/v2/xray/dev/fakeXrayService.js --port 8130 --api-key dev-key --jwt-secret dev-secret

# 2. drive a whole session through the real client
node core/v2/xray/dev/probeXrayClient.js
```

It opens a session, clicks, reads the status, is refused a second object,
closes, and closes again — printing every response. The fake enforces **both**
credentials and rejects a token whose lifetime exceeds the contract's cap, so a
client that got either wrong fails there rather than in production.

To watch a failure path, restart the fake with a fault flag:

| Flag | Simulates |
|---|---|
| `--fail-create stream_not_ready` | the camera is not streaming |
| `--fail-prompt frame_not_buffered` | the clicked frame has aged out |
| `--hang-ms 20000` | the service wedged; proves the timeout |
| `--garbage` | a reverse proxy returning an HTML 502 |

`tests/helpers/v2RouterConfig.js` exists because importing the *whole* v2 router
needs a few config keys that `tests/setup.js` does not provide — several v2
modules call a bare `config.get` at module scope, which throws when the key is
absent. That is pre-existing; no test had ever imported the complete v2 router
before these.


---

## The mask stream

The Python service **dials into** Node, not the other way round: the GPU box
sits behind a boundary that does not accept inbound connections, so Node holds
the door open and the GPU box knocks. One connection per service process,
multiplexed by session id — never one per session.

It shares the API's HTTP server and port. Two traps in doing that, both handled
in `xray.ws.js` and both worth knowing before touching it:

1. `new WebSocketServer({ server })` would hijack **every** upgrade on that
   server and break socket.io. The X-ray server runs in `noServer` mode and
   checks the path, leaving anything else completely alone.
2. engine.io (socket.io's transport) also listens for upgrades, and for a path
   it does not recognise it waits 1000 ms and then ends the socket — **unless
   bytes have already been written**
   (`node_modules/engine.io/build/server.js:693-711`). So authentication on the
   X-ray upgrade is strictly **synchronous**: verify the token, complete the
   handshake, and only then do async work. A database lookup before the
   handshake would risk engine.io destroying a connection we had accepted.

`tests/integration/xray.ws.test.js` asserts both directions on a real server.

### Closing sessions nobody is watching

Every session holds a GPU slot, and the two ways one is abandoned are both
silent. Three triggers, all in `xray.reaper.js`:

| Trigger | When | End reason |
|---|---|---|
| socket disconnect | the browser tab closed — the fast path | `closed_by_user` |
| stale heartbeat | no heartbeat for `XRAY_IDLE_TIMEOUT_SEC` | `idle_timeout` |
| startup sweep | Node restarted, so no live record has a socket in this process | `session_expired` |
| retries exhausted | closing failed `XRAY_CLOSE_MAX_ATTEMPTS` times | `internal_error` |

**Every one of these tells the browser**, with an `xray:state` carrying the
reason. Marking the record ended satisfies Node's bookkeeping but leaves the
user looking at a frozen outline with no explanation, which is what contract §10
means by "the frontend told, not left spinning".

The notification happens *before* the record is marked terminal, and that order
is load-bearing: the delivery lookup only matches sessions in a live state, so
writing `ended` first removes the session from its own lookup and the
notification silently finds nothing. The same trap exists in `fanOutState` and
both carry a comment saying so.

Plus the WebSocket's own fast path: if a mask arrives for a session whose
browser has gone, Node replies `{"type":"close_session"}` and the service stops
sending. The X-ray service reaps on missing heartbeats too — contract §10 wants
both ends reaping, deliberately.

If the service cannot be reached, the record is left **live** so the next sweep
retries. Marking it ended would make Node forget a slot the GPU is still
holding, which is the exact leak the reaper exists to prevent.

---

## Seeing the whole thing work, with no GPU and no Redis

Four terminals, from `server/`:

```bash
# 1. a Redis stand-in (skip if you have a real one)
node core/v2/xray/dev/fakeRedis.js

# 2. a fake Python service for the REST hop
node core/v2/xray/dev/fakeXrayService.js --port 8130 --api-key dev-key --jwt-secret dev-secret

# 3. the real backend (see dev/run-local.ps1 for the sandboxing it does)
pwsh core/v2/xray/dev/run-local.ps1

# 4. seed a camera and a token, then be a browser
node core/v2/xray/dev/seedXrayFixtures.js
node core/v2/xray/dev/fakeXrayBrowser.js --token <XRAY_TOKEN_A> --camera <XRAY_CAMERA_A> --nvr <XRAY_NVR_A> --tab tab-alpha
```

The browser prints the session id it opened. Feed that to the streamer and
watch masks arrive:

```bash
node core/v2/xray/dev/fakeXrayStreamer.js --session <sessionId>
```

`--bad-token` on the streamer proves Node closes the connection with `4401`;
`--drop-after 8` on the browser proves Node notices the tab leaving and tells
the service to release the GPU slot.
