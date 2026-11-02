# X-Ray mode — frontend

Click an object in the live view and watch a mask follow it.

**The browser never receives pixels from us.** The `<video>` and hls.js are
untouched; X-ray adds a transparent canvas on top and draws polygons that arrive
over the socket.io connection the app already has. We ship polygons, never
frames.

## Read this first

[`docs/xray/00_CONTRACT.md`](../../../face_plus_obj_detection_cpp_variant/docs/xray/00_CONTRACT.md)
in the `face_plus_obj_detection_cpp_variant` repo — **frozen**. Three codebases
build against it: the Python service, the Node relay, and this. If something here
looks wrong, the contract is the arbiter; if the contract itself is wrong, stop
and ask, do not edit it.

Section numbers quoted throughout this module (`§4`, `§7`, `§8`, `§10`) refer to
that file. The plan this was built to is `docs/xray/03_PLAN_frontend.md`, and the
full build record — including the mistakes and their corrections — is
`docs/xray/status_frontend.md`.

## The flag

| Variable | Default | Off means |
|---|---|---|
| `VITE_XRAY_ENABLED` | **false** | the control is not rendered and the module is never imported |

Read in exactly one place, [`flag.js`](./flag.js), as a strict `=== 'true'`, so
anything missing or malformed is off. `DetectionZoneMarking.jsx` does
`XRAY_ENABLED ? lazy(() => import('@/xray/XrayMode')) : null`, which folds to
`null` at build time — an off build emits no `XrayMode` chunk and contains no
`xray` string anywhere in `dist/`.

Off is **not** quite byte-identical to a tree without X-ray: one chunk carries
11 inert bytes (a `null` constant and its slot in the render tree). Measured, and
written up in `status_frontend.md`.

## What is where

| File | Job |
|---|---|
| `flag.js` | the build-time guard, read nowhere else |
| `XrayMode.jsx` | the only mount point; owns the session and all view state |
| `useXraySession.js` | one session's life: start, heartbeat, close on every exit |
| `session.js` | §7's state machine, as a pure reducer |
| `api.js` | §5's six routes over the app's shared axios instance |
| `buttonState.js` | every user-facing string, and the pill's enabled/disabled logic |
| `endedReason.js` | one card per §7 `ended` reason |
| `useFragTracker.js` · `framePosition.js` | which HLS frame the user is looking at |
| `useMaskStream.js` · `maskBuffer.js` | receive masks, place them on the media timeline |
| `polygon.js` | ring preparation, smoothing, and the teleport-safe blend |
| `XrayMaskOverlay.jsx` | the canvas and the draw loop |
| `XrayClickLayer.jsx` | click → `(xNorm, yNorm, seq, offset)`, plus inline refusals |
| `XrayButton.jsx` · `XrayStateChip.jsx` · `XrayPopover.jsx` · `XrayEndedCard.jsx` | the chrome |

Anything that decides *what state we are in* lives in a pure `.js` module, not in
a component — that is what makes it testable here, since the harness has no DOM.

## Two things about the player that shape everything

Both from `hooks/useHlsPlayer.js`:

1. `liveSyncDurationCount: 3` with 2-second segments ⇒ **the browser is ~6 s
   behind live**. When the user clicks, they are clicking a frame six seconds in
   the past, which is why the click carries `(seq, offset)` — the server has to
   find *that* frame, not the newest one.
2. `backBufferLength: 0` ⇒ **played frames are discarded**. Whatever you need
   about a frame, capture it at click time; you cannot go back for it.

Click coordinates are normalised against `video.videoWidth`/`videoHeight`, never
the CSS size. Mask polygons arrive in source pixels and the canvas backing store
is sized in source pixels, so the draw path does no coordinate conversion at all.

## Running it against a fake backend

You do not need a GPU, and you do not need the real X-ray service.

```
mongod                 :27017
fakeRedis              :6379
fakeXrayService        :8130     the Node session's stand-in for the Python service
relay (videoraiq/server) :5099   XRAY_ENABLED=true
vite                   :5173
```

The X-ray WebSocket rides the **API port** — ignore any `wsPort: 5055` in the
relay's logs, it is a ghost.

1. In `videoraiq/server`, run `seedXrayFixtures.js` for a fresh token plus a
   camera and NVR id. The JWT expires, so re-run it rather than reusing an old
   one.
2. `client_v2/.env`: point `VITE_BACKEND` at `http://127.0.0.1:5099/api/v2` and
   set `VITE_XRAY_ENABLED=true`. **Do not leave it pointed at
   `dev-api.videoraiq.com`** — that is shared infrastructure with no X-ray
   mounted.
3. `npm run dev`, open `http://localhost:5173`, and set two cookies:
   `dev-access-token=<the seeded JWT>` and `vq_session_id=tab-alpha`. (With
   `VITE_ENV=dev` the token cookie is `dev-access-token`, not `access-token`.)
4. Configure → NVR → camera → Detection Zone Marking → **X-Ray**, then click the
   video.
5. Masks come from the Node session's streamer:
   ```
   node core/v2/xray/dev/fakeXrayStreamer.js --session <id> \
        --url ws://127.0.0.1:5099/internal/xray/ws --fps 5
   ```
   `--teleport-every N` makes it jump, which is how the discontinuity handling
   and the lost fade get exercised.

Two behaviours that look like bugs and are not: a session is reaped after **45 s
without a heartbeat**, and a second click earns `409 max_objects_reached` because
v1 tracks **one object** (§13.4).

## The two settings, and the one that is deliberately missing

In the popover behind the chevron:

- **Glow** — Soft / Bold / Max. Purely how the mask is drawn.
- **Mask smoothing** — corner rounding and jitter damping. Cosmetic; it never
  changes what was detected.
- **Lost sensitivity** — how long an object's last outline lingers, fading, after
  the mask stream stops mentioning it. Patient 2 s / normal 1 s / eager 0.35 s.
  **This is client-side only.** It does not change `lostAfterFrames`, the
  service's threshold for giving up on the track.

There is **no confidence slider**, on purpose. A click-seeded SAM3 track reports a
constant score, so there is nothing honest to threshold; a slider over it would
move and change nothing. The popover says so in the UI rather than leaving the
absence unexplained.

## Known limits

- **Desktop browsers only.** Safari's native-HLS path gives no `FRAG_CHANGED`
  event, so there is no way to know which frame is on screen — X-ray is
  technically impossible there, not merely unimplemented. Mobile is out of scope.
- **No keyboard path to pick an object.** Choosing a thing in a video frame is
  inherently a pointer gesture. Everything else is keyboard-reachable: the pill
  stays focusable even when unavailable (so its reason is announced), `Esc` exits,
  and state changes go through a live region.
- **One object per session**, while the rendering is written as a list keyed by
  `objId`. Raising the cap is a config change plus a latency measurement.
- **Appearance is unverified against a real camera.** Whether Bold is too strong,
  whether 5 fps reads as tracking or stepping, and whether the dashed ghost reads
  as "it was here" all need a live camera. A blank fixture stage cannot answer
  them.

## Tests

```bash
cd client_v2
node --experimental-vm-modules --test tests/*.test.js
```

The glob is required — `--test tests/` as a directory fails on Node 24 here.

No test framework and no DOM: `node:test` plus `node:vm`'s `SourceTextModule`,
which loads a real `.js` module with its imports linked by hand. `.jsx` cannot be
loaded, which is why the logic lives in plain modules.

| File | What it pins |
|---|---|
| `xraySessionLeaks.test.js` | the five leak scenarios, driving the **real** hook against a real HTTP stub, with **negative controls** that break the teardown on purpose to prove the audit can see it |
| `xrayResourceDiscipline.test.js` | a source audit: nothing acquired without a release in the same file; decisions that must not silently revert |
| `xrayTwoHopConformance.test.js` | the Node session's **real** translation layer feeding this module's real polygon code |
| `xraySession.test.js` · `xrayEndedReason.test.js` | §7's machine and its eight reasons |
| `xrayMaskBuffer.test.js` · `xrayPolygon.test.js` · `xrayInterpolationQuality.test.js` | the timeline, the rings, and how much error interpolation actually costs |
| `xrayFramePosition.test.js` · `xrayApi.test.js` · `xrayButtonState.test.js` · `xrayFlag.test.js` | frame identity, the six routes, the copy, the guard |

`helpers/xrayStubServer.js` plays Node's part over real HTTP (§5's routes, §10's
error bodies). `helpers/hookHarness.js` is a minimal React-hooks runtime — read
its header before trusting it; it documents what it does not model.
