# Client Tests

Vitest + React Testing Library unit tests for the React frontend.

## Run

```bash
cd client
npm install
npm test                 # run once
npm run test:watch       # rerun on change
npm run test:ui          # Vitest UI
npm run test:coverage    # with coverage report
```

## Layout

```
tests/
├── setup.js                       # jest-dom matchers + cleanup
└── unit/
    ├── lib/utils.test.js           # cn() className helper
    ├── utils/formatDateRange.test.js  # date formatters
    ├── utils/getAccessToken.test.js   # env-based cookie resolver
    ├── hooks/useDebounce.test.jsx     # debounce hook (fake timers)
    ├── schema/nvrSchema.test.js       # Yup NVR validation
    └── helpers/decriptNvr.test.js     # SKIPPED — see below
```

## Conventions

- **`.test.js`** for pure-logic tests, **`.test.jsx`** for anything that
  renders React (hooks, components).
- Test files mirror the source path under `tests/unit/`.
- `import.meta.env` defaults (`VITE_ENV`, `VITE_ENCRYPTION_KEY`, `VITE_IV`)
  are set in `vitest.config.js` → `test.env`. To exercise a different env in
  a single test, use `vi.stubEnv(...)` + `vi.resetModules()` + a dynamic
  `import()` (see `getAccessToken.test.js`).
- Mock browser/3rd-party modules (`js-cookie`, `hls.js`, `socket.io-client`)
  with `vi.mock(...)` at the top of the file.

## Skipped tests

- `helpers/decriptNvr.test.js` — `describe.skip` because the source imports
  `crypto-js`, which is missing from `package.json`. Tracked in
  [issue #22](https://github.com/Globussoft-Technologies/videoraiq-ai/issues/22).
  Unskip once the dependency is added.

## Not covered yet (next wave)

- Context providers (`AuthContext`, `SocketContext`, `PermissionContext`) —
  need mocked socket + axios.
- `useHlsPlayer` — needs `hls.js` mocked.
- Shared components (`Pagination`, `DetectionToggle`, `NestedMultiSelect`).
- Page components — better suited to the Playwright e2e suite.
