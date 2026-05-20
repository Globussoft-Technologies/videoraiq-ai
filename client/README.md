# VideoraIQ — Frontend (`client/`)

React 19 single-page operator console for VideoraIQ. Built with Vite 6, Tailwind 4, and shadcn/ui.

For the full system picture see the [repository root README](../README.md). For coding conventions see [docs/development.md](../docs/development.md).

> A second build, [`docker-client/`](../docker-client/), mirrors this codebase and produces the container image. Keep both in sync when changing the public surface (routes, contexts, env vars).

---

## At a Glance

| Property | Value |
|---|---|
| Framework | React 19 |
| Router | React Router 7 |
| Build tool | Vite 6 |
| Styling | Tailwind CSS 4 + shadcn/ui (Radix primitives) |
| Charts | ApexCharts, amCharts 5 |
| Forms | Formik + Yup |
| HTTP | Axios |
| Realtime | socket.io-client |
| Video | hls.js, react-webcam |
| Export | jsPDF, jspdf-autotable, xlsx, xlsx-js-style |
| Animations | Framer Motion |
| Icons | lucide-react, react-icons |
| Dev port | 5173 (Vite default) |

---

## Quick Start

```bash
npm install
cp .env.example .env       # fill from docs/development.md §2.3
npm run dev
```

UI runs at `http://localhost:5173`. Hot reload is enabled via Vite + React Fast Refresh.

---

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Serve `dist/` locally |
| `npm run lint` | ESLint check |
| `npm run format` | Prettier write |
| `npm run prepare` | Husky install (auto-run on `npm install`) |

Husky runs Prettier on `pre-commit` — commits that fail formatting are rejected.

---

## Layout

```
src/
├── App.jsx / main.jsx            # Root mount
├── App.css / index.css           # Global Tailwind + base styles
│
├── assets/                       # Images, SVGs, icons, audio
│
├── components/                   # Shared UI
│   ├── Auth/                     # Login, password reset
│   ├── ui/                       # shadcn/ui primitives (edit in place)
│   └── Schedule/                 # Time / schedule pickers
│
├── context/                      # React Context providers
│   ├── AuthContext.jsx
│   ├── PermissionsContext.jsx
│   ├── SocketsContext.jsx
│   └── UserContext.jsx
│
├── data/                         # Static / config data
├── helpers/                      # Pure utility functions
├── hooks/                        # Custom hooks
├── lib/                          # cn() helper, clsx + tailwind-merge
│
├── layout/                       # Header, Sidebar, app shell
│
├── page/
│   ├── admin/                    # Admin-only routes (Login, Api)
│   └── user/                     # Operator routes
│       ├── Dashboard/
│       ├── Streams/
│       ├── Playback/
│       ├── Incidents/
│       ├── Detection/
│       ├── EmployeeLogs/
│       ├── NVR/
│       ├── Users/
│       ├── UserDetails/
│       ├── Profile/
│       ├── Settings/
│       ├── RolePermissions/
│       ├── NotificationRecipients/
│       ├── Departments/
│       ├── Locations/
│       └── index.jsx
│
├── routes/                       # React Router 7 route tables
├── schema/                       # Yup validation schemas
├── styles/                       # Global CSS overrides
└── utils/                        # Axios instance, token storage, formatters
```

Feature folders under `page/user/<Feature>/` typically contain:
- the page component (`index.jsx` / `<Feature>.jsx`)
- sub-components specific to that feature
- a co-located API module (`<feature>.api.js`)

When something becomes reused across features, lift it to `components/`.

---

## State Management

No global cache library — by design. State is split:

| Concern | Where |
|---|---|
| Auth (token, current user) | `AuthContext` |
| Effective permissions | `PermissionsContext` |
| Socket connection + subscriptions | `SocketsContext` |
| Current user profile | `UserContext` |
| Server data | Direct Axios calls in feature folders; cached in component state |
| Form state | Formik (with Yup schemas under `schema/`) |
| Local UI state | `useState` / `useReducer` |

If you need shared cached server state, lift a custom hook into `hooks/`; do not introduce React Query / SWR without alignment.

---

## Real-Time

`SocketsContext` (see `src/context/`) opens the Socket.IO connection on mount with the JWT from `AuthContext`. Feature components subscribe to channels via `useEffect`:

```js
const { socket } = useSockets();
useEffect(() => {
  socket.on("incident", handleIncident);
  return () => socket.off("incident", handleIncident);
}, [socket]);
```

Channels are listed in [docs/api-reference.md §WebSocket Channels](../docs/api-reference.md#websocket-channels).

---

## HLS Playback

Live streams and playback sessions are served by the [streaming engine](../streaming/README.md). The browser plays them via `hls.js`:

- **Live:** `${VITE_STREAM_URL}/master-stream/<camID>/playlist.m3u8` (ABR — 1080p + 360p)
- **Playback:** session URL returned by `POST /api/v1/channel/playback-url`

Safari uses native HLS; `hls.js` is required for Chrome / Firefox.

---

## Environment Variables

Vite reads `.env` at startup; **changes require a restart**.

| Var | Required | Purpose |
|---|---|---|
| `VITE_ENV` | yes | `dev` / `prod` |
| `VITE_LOCAL_SETUP` | yes | toggles dev-only UI |
| `VITE_FRONTEND` | yes | Self URL |
| `VITE_BACKEND` | yes | Node API base |
| `VITE_DS_API` | yes | Face-auth API base |
| `VITE_STREAM_URL` | yes | Streaming engine base |
| `VITE_INCIDENT_URL` | yes | Where uploaded incident media lives |
| `VITE_ENCRYPTION_KEY`, `VITE_IV` | yes | Client-side encryption for local storage |
| `VITE_SOCKET_URL` | yes | WebSocket URL (often same host as backend) |
| `VITE_APP_CURRENT_EXE_VERSION` | yes | Version pin shown in UI / logs |
| `VITE_INITIALS_URL` | yes | DiceBear initials avatar URL prefix |
| `VITE_HIDE_PLAYBACK_FEATURE` | yes | Feature flag |

A template is in [`.env.example`](.env.example). Each environment needs its own build because Vite inlines `VITE_*` at build time.

---

## Styling

- **Tailwind 4** via `@tailwindcss/vite`; utilities are the default styling vocabulary.
- **shadcn/ui** lives in `src/components/ui/` and is **owned**, not imported as a node module — edit components in place, regenerate from the `components.json` recipe only when needed.
- **`cn(...)` helper** at `src/lib/utils.js` merges classes via `clsx` + `tailwind-merge`. Use this for conditional classes:
  ```jsx
  <button className={cn("px-3 py-1", disabled && "opacity-50")} />
  ```
- **Animations** via Framer Motion for transitions; CSS only for static effects.

---

## Forms

Formik + Yup throughout. Schemas live in `src/schema/`. Pattern:

```jsx
const formik = useFormik({
  initialValues,
  validationSchema: featureSchema,
  onSubmit: async (values) => { ... }
});
```

For complex multi-step flows, lift schemas into per-step files under `schema/<feature>/`.

---

## Routing

React Router 7 (`react-router-dom`). Route tables are split across `src/routes/`. Admin and user route trees are kept distinct because their layouts differ.

Authenticated routes are gated by reading `AuthContext`; permission-gated routes additionally consult `PermissionsContext` and redirect to a 403-style page if the user lacks the permission for the module.

---

## Building for Production

```bash
npm run build
```

Output is in `dist/`. Serve via NGINX / CDN / S3-CloudFront with SPA fallback (`try_files $uri /index.html`). See [docs/deployment.md §3](../docs/deployment.md#3-build--deploy-client-and-docker-client).

---

## Common Tasks

- **Add a new page:** create `src/page/user/<Feature>/`, register in `src/routes/`, add a sidebar entry in `src/layout/Sidebar/...`.
- **Add a permission check:** wrap the component with the permission HOC / hook from `PermissionsContext`.
- **Export data:** use `xlsx` for tabular Excel, `jspdf-autotable` for PDFs. Existing patterns are in `page/user/Incidents/` and `page/user/EmployeeLogs/`.
- **Show a toast:** `sonner` — see existing usage in `page/user/Settings/`.

---

## Conventions

- ESM (`type: "module"` in `package.json`).
- Prefer named exports; use default export for top-level page components only.
- Import order: external → context → components → hooks → utils → styles.
- File names: `PascalCase.jsx` for components, `camelCase.js` for utilities, `kebab-case.css` for stylesheets.
- Avoid `class` components — hooks only.
- Don't introduce TypeScript piecemeal — the project is JS-only; convert wholesale or not at all.
