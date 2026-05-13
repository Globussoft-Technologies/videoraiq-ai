# VideoraIQ — Frontend (Docker build, `docker-client/`)

Container-targeted variant of the React 19 operator console. Mirrors [`../client/`](../client/) but tuned for the production Docker image (env-var injection at runtime, separate build pipeline).

For the canonical frontend documentation see [`client/README.md`](../client/README.md). This file documents what's different about the Docker build.

> **Drift warning.** This directory and `../client/` share most code. When changing routes, contexts, environment variables, or shared components, update **both** — they are not auto-synced.

---

## When To Use Which

| Use this build (`docker-client/`) when... | Use `client/` when... |
|---|---|
| Producing a production / staging container image | Local development (faster install, host Node) |
| Running behind a reverse proxy in a containerized environment | Iterating on UI in the browser with Vite HMR |
| You need runtime config injection (env-templated `index.html`) | You're happy with build-time `VITE_*` baking |

---

## Quick Start (Container)

```bash
cd docker-client
docker build -t videora-client:latest .
docker run -d -p 80:80 \
  -e VITE_BACKEND=https://api.example.com \
  -e VITE_STREAM_URL=https://stream.example.com \
  -e VITE_SOCKET_URL=wss://api.example.com \
  videora-client:latest
```

For local dev without Docker:

```bash
npm install
cp .env.example .env
npm run dev
```

---

## Layout

Identical to [`../client/`](../client/). See [`client/README.md` § Layout](../client/README.md#layout) for the source tree.

The only files that typically diverge from `client/`:

- `Dockerfile` (if present) — production image recipe
- `nginx.conf` (if present) — static SPA serving config
- Environment defaults that suit container deployment

---

## Scripts

Same as `client/`:

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Serve `dist/` |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

---

## Environment Variables

Same surface as `client/` — see [`client/README.md` § Environment Variables](../client/README.md#environment-variables).

**Vite limitation:** `VITE_*` variables are inlined at build time. If you need true runtime injection (i.e. one image, many environments), you must either:

1. Build a separate image per environment (simplest, recommended).
2. Add an entrypoint script that rewrites placeholders in `dist/index.html` and bundled JS using `envsubst` or similar.
3. Migrate to `import.meta.env` reads of a `/config.json` fetched at runtime.

Currently the project follows option (1).

---

## Keeping In Sync With `client/`

Recommended workflow when making frontend changes:

1. Develop and iterate in `client/` (faster feedback loop).
2. Once the change is stable, mirror the diff into `docker-client/`.
3. Build the container image and smoke-test against the staging backend.
4. Open the PR including changes to **both** directories.

A consolidation step (single source + Docker variant in `infra/`) is a known piece of tech debt. Until then, treat the two trees as a single change-set.

---

## Production Deployment

See [docs/deployment.md §3](../docs/deployment.md#3-build--deploy-client-and-docker-client) for the full deployment pipeline (NGINX config, CDN caching, env injection).

---

## See Also

- [`../client/README.md`](../client/README.md) — canonical frontend docs
- [`../docs/development.md`](../docs/development.md) — coding conventions
- [`../docs/deployment.md`](../docs/deployment.md) — release pipeline
- [`../README.md`](../README.md) — repository overview
