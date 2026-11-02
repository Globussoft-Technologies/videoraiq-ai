# Deploying X-ray mode to dev

Three files here, all shareable as-is: fill in the two `<PLACEHOLDER>` values
and nothing else is a secret.

| File | Goes where |
|---|---|
| `xray.dev.config.json` | merge the `xray` block into `server/config/<NODE_ENV>.json` |
| `xray.dev.env` | or set these on the Node container instead (env wins over the file) |
| `xray.frontend.env` | one line into `client_v2/.env`, then **rebuild** the frontend |

Authority for anything not said here: `docs/xray/00_CONTRACT.md` (frozen) and
`core/v2/xray/README.md`. Where this file disagrees with the contract, the
contract is right.

## The state this is written for: no Python service yet

X-ray's GPU half (`xray_service`) is **not deployed**, so there is no
`XRAY_SERVICE_URL` to point at. That is a supported state, not a broken one —
`XRAY_SERVICE_URL` is deliberately left empty, and the stack was measured in
exactly that configuration:

| Check | Result |
|---|---|
| Node boots | yes — missing config is logged loudly, never fatal |
| `GET /api/v2/health` | `200` |
| `GET /api/v2/channel/all-channels` | `200` |
| `GET /api/v2/client-config/license` | `200` |
| socket.io | unaffected |
| `POST /api/v2/xray/sessions` | `503 service_unavailable`, `"X-ray is not configured"`, `retryable: false`, **in 88 ms** |
| Mongo | no session record written, so nothing to reap |

So: every other page behaves exactly as it does today, the X-Ray button is
visible on the video stage, and pressing it fails immediately with an error
toast instead of hanging. Nothing retries, nothing leaks.

**One rough edge, worth knowing before someone reports it as a bug.**
`src/xray/buttonState.js` has no copy for `service_unavailable`, so the toast
falls back to *"X-Ray stopped unexpectedly — try again"* — which is misleading,
because nothing started and nothing stopped. The fix is one line in
`START_ERROR_COPY` (frontend lane):

```js
service_unavailable: 'X-Ray is not available on this environment yet',
```

If you would rather the button not be pressable at all until the service
exists, ship with `VITE_XRAY_ENABLED=false` instead — then it is not rendered.

## What else has to be true before X-ray actually works

Setting these flags is necessary and not sufficient. The remaining three are
**not** Node's to fix:

1. **`xray_service` deployed on a GPU box**, with `XRAY_BACKEND=real`, the SAM3
   checkpoint, and `XRAY_WS_URL` pointed back at
   `ws://<node-host>:<api-port>/internal/xray/ws`. Node only listens; the
   service dials out.
2. **`XRAY_SHM_COORDS_ENABLED=true` on stream_hub**, or `(seq, offset)` stays
   zero in the shared-memory ring and a click cannot be resolved to a frame.
3. **`XRAY_WS_JWT_SUBJECT=videoraiq-backend` on the service.** The service
   presents `sub: "xray-service"` by default; this relay requires
   `videoraiq-backend`. Contract §8 is ambiguous on which is correct and the
   decision is open. Until it is settled, the service needs that variable set
   explicitly, or **the WebSocket closes 4401 forever and no mask ever
   arrives — while REST looks perfectly healthy.**

And one that is ours but cannot be done from this repo:

4. **The `xRayMode` licence cannot be granted.** `ClientDetectionAllocation`
   constrains `settingType` to `Object.keys(DETECTION_TYPES)`, and `xRayMode`
   is deliberately absent from it (and from server-superadmin's own copy), so
   no UI can create the row. Hence `licenseCheck: "off"` above. The two ways
   out are a superadmin constant or a direct Mongo insert; the exact insert is
   in `core/v2/xray/dev/licenseDetections.js`.

## The service's env, for when it lands

Not needed for this deploy. Recorded here so the shared values stay paired —
`XRAY_API_KEY` and `JWT_SECRET_KEY` must be **the same strings** on both boxes.

```
XRAY_ENABLED=true
XRAY_BACKEND=real
XRAY_PORT=7910
XRAY_API_KEY=<SHARED_SERVICE_KEY>          # == Node's XRAY_API_KEY
JWT_SECRET_KEY=<SHARED_JWT_SECRET>         # == Node's XRAY_JWT_SECRET (unprefixed, by contract §6)
XRAY_WS_URL=ws://<node-host>:<api-port>/internal/xray/ws
XRAY_WS_JWT_SUBJECT=videoraiq-backend      # see blocker 3
XRAY_STREAM_URL_ALLOWLIST=<streaming-host:port>   # fails CLOSED: a non-matching
                                                  # URL is 403 stream_url_not_allowed
XRAY_MAX_SESSIONS=1
XRAY_MODEL_FPS=5.0
SAM3_CHECKPOINT_PATH=<path on the GPU box>
```

`XRAY_STREAM_URL_ALLOWLIST` is the one most likely to be forgotten: without
the dev streaming host in it, every `POST /sessions` is
`403 stream_url_not_allowed`, and that code is **not** in contract §10's
frontend table, so the UI shows a generic message instead of the real reason.

## Order of operations

1. Deploy the code with `xray.enabled` **false**. It is inert: no routes, no
   listener, no Mongoose model. Confirms nothing else moved.
2. Flip `XRAY_ENABLED=true` and set `XRAY_API_KEY` / `XRAY_JWT_SECRET`. Leave
   `XRAY_SERVICE_URL` empty. Restart.
3. Rebuild the frontend with `VITE_XRAY_ENABLED=true`.
4. Expect: the X-Ray pill on the zone-marking stage, and a 503 toast on press.
   That is the correct end state until the GPU half exists.
